/**
 * Template Cache Manager - Handles downloading and caching remote templates
 */

import { join } from 'path';
import type { IFileSystemManager } from '../interfaces.js';
import type { IPlatformDetector } from '../utils/platform.js';
import { getEmbeddedTemplate, hasEmbeddedTemplate } from './embedded/index.js';

export interface TemplateMetadata {
  cached_at: string;
  source_url: string;
  version?: string;
}

export interface CachedTemplate {
  files: Record<string, string>;
  metadata: TemplateMetadata;
}

export class TemplateCacheManager {
  private readonly cacheDir: string;

  constructor(
    private fileSystemManager: IFileSystemManager,
    private platformDetector: IPlatformDetector
  ) {
    const ziggyDir = this.platformDetector.getZiggyDir();
    this.cacheDir = join(ziggyDir, 'templates');
  }

  /**
   * Get template from cache or download if not available/expired
   */
  public async getTemplate(templateName: string, cacheUrl: string): Promise<Record<string, string>> {
    const templateCacheDir = this.getTemplateCacheDir(templateName);
    
    // Check if cache is valid
    if (this.isCacheValid(templateName)) {
      try {
        return await this.loadFromCache(templateName);
      } catch (error) {
        console.warn(`Failed to load template from cache: ${error}`);
        // Continue to download fresh copy
      }
    }

    // Download and cache template
    try {
      const templateFiles = await this.downloadAndCache(templateName, cacheUrl);
      return templateFiles;
    } catch (error) {
      console.warn(`Failed to download template: ${error}`);
      
      // Try to use cached version even if expired as fallback
      if (this.fileSystemManager.fileExists(templateCacheDir)) {
        try {
          return await this.loadFromCache(templateName);
        } catch (cacheError) {
          console.warn(`Failed to load expired cache: ${cacheError}`);
        }
      }
      
      // Final fallback to embedded content
      return this.getEmbeddedFallback(templateName);
    }
  }

  /**
   * Download template from remote URL and cache it
   */
  private async downloadAndCache(templateName: string, baseUrl: string): Promise<Record<string, string>> {
    const templateFiles: Record<string, string> = {};
    
    // Define the files we need to download for barebones template
    const filesToDownload = [
      { path: 'main.zig', url: `${baseUrl}main.zig` },
      { path: 'build.zig', url: `${baseUrl}build.zig` }
    ];

    // Download each file
    for (const file of filesToDownload) {
      try {
        const response = await fetch(file.url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const content = await response.text();
        templateFiles[file.path] = content;
      } catch (error) {
        throw new Error(`Failed to download ${file.path}: ${error}`);
      }
    }

    // Cache the downloaded files
    await this.saveToCache(templateName, templateFiles, baseUrl);
    
    return templateFiles;
  }

  /**
   * Save template files to cache with metadata
   */
  private async saveToCache(
    templateName: string, 
    files: Record<string, string>, 
    sourceUrl: string
  ): Promise<void> {
    const templateCacheDir = this.getTemplateCacheDir(templateName);
    
    // Ensure cache directory exists
    this.fileSystemManager.ensureDirectory(templateCacheDir);

    // Save each file
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = join(templateCacheDir, filePath);
      this.fileSystemManager.writeFile(fullPath, content);
    }

    // Save metadata
    const metadata: TemplateMetadata = {
      cached_at: new Date().toISOString(),
      source_url: sourceUrl
    };
    
    const metadataPath = join(templateCacheDir, '.template-info');
    this.fileSystemManager.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Load template from cache
   */
  private async loadFromCache(templateName: string): Promise<Record<string, string>> {
    const templateCacheDir = this.getTemplateCacheDir(templateName);
    const files: Record<string, string> = {};

    // Read all files in cache directory except metadata
    const cacheFiles = this.fileSystemManager.listDirectory(templateCacheDir);
    
    for (const fileName of cacheFiles) {
      if (fileName === '.template-info') continue;
      
      const filePath = join(templateCacheDir, fileName);
      if (this.fileSystemManager.isFile(filePath)) {
        files[fileName] = this.fileSystemManager.readFile(filePath);
      }
    }

    return files;
  }

  /**
   * Check if cached template is valid (not expired)
   */
  private isCacheValid(templateName: string): boolean {
    const templateCacheDir = this.getTemplateCacheDir(templateName);
    const metadataPath = join(templateCacheDir, '.template-info');

    if (!this.fileSystemManager.fileExists(metadataPath)) {
      return false;
    }

    try {
      const metadataContent = this.fileSystemManager.readFile(metadataPath);
      const metadata: TemplateMetadata = JSON.parse(metadataContent);
      
      const cachedAt = new Date(metadata.cached_at);
      const now = new Date();
      const ageInHours = (now.getTime() - cachedAt.getTime()) / (1000 * 60 * 60);
      
      // Cache is valid for 7 days (168 hours)
      return ageInHours < 168;
    } catch (error) {
      console.warn(`Failed to parse cache metadata: ${error}`);
      return false;
    }
  }

  /**
   * Get embedded fallback content when cache and download fail
   */
  private getEmbeddedFallback(templateName: string): Record<string, string> {
    if (hasEmbeddedTemplate(templateName)) {
      return getEmbeddedTemplate(templateName);
    }
    
    throw new Error(`No embedded fallback available for template: ${templateName}`);
  }

  /**
   * Get cache directory path for a specific template
   */
  private getTemplateCacheDir(templateName: string): string {
    return join(this.cacheDir, templateName);
  }

  /**
   * Clear cache for a specific template
   */
  public clearTemplateCache(templateName: string): void {
    const templateCacheDir = this.getTemplateCacheDir(templateName);
    if (this.fileSystemManager.fileExists(templateCacheDir)) {
      this.fileSystemManager.safeRemove(templateCacheDir, true);
    }
  }

  /**
   * Clear all template caches
   */
  public clearAllCaches(): void {
    if (this.fileSystemManager.fileExists(this.cacheDir)) {
      this.fileSystemManager.safeRemove(this.cacheDir, true);
    }
  }
}
/**
 * Configuration management with smol-toml library
 * Handles loading, saving, and validation of ziggy.toml configuration files
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parse, stringify } from 'smol-toml';
import type { ZiggyConfig, DownloadInfo, DownloadStatus } from '../types';
import type { IConfigManager, IFileSystemManager } from '../interfaces';

export class ConfigManager implements IConfigManager {
  private configPath: string;
  private ziggyDir: string;
  private fileSystemManager: IFileSystemManager;

  constructor(ziggyDir: string, fileSystemManager: IFileSystemManager) {
    this.ziggyDir = ziggyDir;
    this.configPath = join(ziggyDir, 'ziggy.toml');
    this.fileSystemManager = fileSystemManager;
  }

  /**
   * Load configuration from ziggy.toml file
   * Returns default configuration if file doesn't exist or is invalid
   */
  public load(): ZiggyConfig {
    const defaultConfig: ZiggyConfig = {
      downloads: {}
    };

    if (!this.fileSystemManager.fileExists(this.configPath)) {
      // If no config exists, scan for existing installations
      const scannedConfig = this.scanExistingInstallations();
      if (Object.keys(scannedConfig.downloads).length > 0) {
        // Save the scanned config
        this.save(scannedConfig);
        return scannedConfig;
      }
      return defaultConfig;
    }

    try {
      const content = this.fileSystemManager.readFile(this.configPath);
      const parsed = parse(content);
      
      // Validate and transform the parsed TOML into our config structure
      const config = this.validateAndTransformConfig(parsed);
      return config;
    } catch (error) {
      console.warn('⚠ Warning: Could not parse ziggy.toml, attempting migration or using defaults');
      console.warn('Error details:', error);
      
      // Try to migrate from old format
      try {
        const content = this.fileSystemManager.readFile(this.configPath);
        const migratedConfig = this.migrateFromLegacyFormat(content);
        if (migratedConfig) {
          // Save the migrated config in new format
          this.save(migratedConfig);
          return migratedConfig;
        }
      } catch (migrationError) {
        console.warn('Could not migrate legacy config format');
      }
      
      return defaultConfig;
    }
  }

  /**
   * Save configuration to ziggy.toml file using smol-toml
   */
  public save(config: ZiggyConfig): void {
    try {
      // Transform config to TOML-friendly format
      const tomlData = this.transformConfigForToml(config);
      const tomlContent = stringify(tomlData);
      
      // Add header comment
      const finalContent = '# Ziggy Configuration\n\n' + tomlContent;
      
      this.fileSystemManager.writeFile(this.configPath, finalContent);
    } catch (error) {
      throw new Error(`Failed to save configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Scan existing installations and build configuration
   */
  public scanExistingInstallations(): ZiggyConfig {
    const config: ZiggyConfig = { downloads: {} };
    const versionsDir = join(this.ziggyDir, 'versions');

    if (!this.fileSystemManager.isDirectory(versionsDir)) {
      return config;
    }

    console.log('📁 No ziggy.toml found. Scanning existing installations...');

    let versionDirs: string[] = [];
    try {
      versionDirs = this.fileSystemManager.listDirectory(versionsDir).filter(dir => {
        const fullPath = join(versionsDir, dir);
        return this.fileSystemManager.isDirectory(fullPath);
      });
    } catch (error) {
      return config;
    }

    if (versionDirs.length > 0) {
      console.log('Found existing Zig installations:');
      
      for (const version of versionDirs) {
        const versionPath = join(versionsDir, version);
        const zigExecutable = process.platform === 'win32' ? 'zig.exe' : 'zig';
        const zigBinary = join(versionPath, zigExecutable);
        
        if (this.fileSystemManager.fileExists(zigBinary)) {
          config.downloads[version] = {
            version: version,
            path: versionPath,
            downloadedAt: new Date().toISOString(),
            status: 'completed'
          };
          console.log(`  • ${version}`);
        }
      }
      console.log('Rebuilding ziggy.toml configuration...\n');
    } else {
      console.log('No valid Zig installations found in versions directory.\n');
    }

    return config;
  }

  /**
   * Validate and transform parsed TOML data into ZiggyConfig
   */
  private validateAndTransformConfig(parsed: any): ZiggyConfig {
    const config: ZiggyConfig = { downloads: {} };

    // Handle currentVersion
    if (typeof parsed.currentVersion === 'string') {
      config.currentVersion = parsed.currentVersion;
    }

    // Handle downloads section
    if (parsed.downloads && typeof parsed.downloads === 'object') {
      for (const [version, downloadData] of Object.entries(parsed.downloads)) {
        if (downloadData && typeof downloadData === 'object') {
          const data = downloadData as any;
          
          // Validate required fields
          if (typeof data.path === 'string' && typeof data.status === 'string') {
            config.downloads[version] = {
              version: version,
              path: data.path,
              downloadedAt: typeof data.downloadedAt === 'string' ? data.downloadedAt : new Date().toISOString(),
              status: this.validateDownloadStatus(data.status),
              isSystemWide: this.parseBoolean(data.isSystemWide),
              // Security verification fields
              checksum: typeof data.checksum === 'string' ? data.checksum : undefined,
              checksumVerified: typeof data.checksumVerified === 'boolean' ? data.checksumVerified : undefined,
              minisignVerified: typeof data.minisignVerified === 'boolean' ? data.minisignVerified : undefined,
              downloadUrl: typeof data.downloadUrl === 'string' ? data.downloadUrl : undefined
            };
          }
        }
      }
    }

    return config;
  }

  /**
   * Transform ZiggyConfig to TOML-friendly format
   */
  private transformConfigForToml(config: ZiggyConfig): any {
    const tomlData: any = {};

    if (config.currentVersion) {
      tomlData.currentVersion = config.currentVersion;
    }

    if (Object.keys(config.downloads).length > 0) {
      tomlData.downloads = {};
      for (const [version, info] of Object.entries(config.downloads)) {
        tomlData.downloads[version] = {
          path: info.path,
          downloadedAt: info.downloadedAt,
          status: info.status
        };
        
        if (info.isSystemWide) {
          tomlData.downloads[version].isSystemWide = info.isSystemWide;
        }
        
        // Add security verification fields if present
        if (info.checksum) {
          tomlData.downloads[version].checksum = info.checksum;
        }
        if (info.checksumVerified !== undefined) {
          tomlData.downloads[version].checksumVerified = info.checksumVerified;
        }
        if (info.minisignVerified !== undefined) {
          tomlData.downloads[version].minisignVerified = info.minisignVerified;
        }
        if (info.downloadUrl) {
          tomlData.downloads[version].downloadUrl = info.downloadUrl;
        }
      }
    }

    return tomlData;
  }

  /**
   * Validate download status value
   */
  private validateDownloadStatus(status: string): DownloadStatus {
    const validStatuses: DownloadStatus[] = ['downloading', 'completed', 'failed'];
    return validStatuses.includes(status as DownloadStatus) ? status as DownloadStatus : 'completed';
  }

  /**
   * Parse boolean values from various formats (for legacy compatibility)
   */
  private parseBoolean(value: any): boolean | undefined {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (lower === 'true' || lower === '1') return true;
      if (lower === 'false' || lower === '0') return false;
    }
    return undefined;
  }

  /**
   * Migrate configuration from legacy manual parsing format
   */
  private migrateFromLegacyFormat(content: string): ZiggyConfig | null {
    try {
      const config: ZiggyConfig = { downloads: {} };
      const lines = content.split('\n');
      let currentSection = '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          currentSection = trimmed.slice(1, -1);
          continue;
        }

        // Check for currentVersion
        if (trimmed.startsWith('currentVersion = ')) {
          config.currentVersion = trimmed.split('=')[1]?.trim().replace(/"/g, '');
          continue;
        }

        if (currentSection.startsWith('downloads.')) {
          let version = currentSection.substring('downloads.'.length);
          // Remove quotes if present
          if (version.startsWith('"') && version.endsWith('"')) {
            version = version.slice(1, -1);
          }
          if (!version) continue;

          if (!config.downloads[version]) {
            config.downloads[version] = {
              version: version,
              path: '',
              downloadedAt: '',
              status: 'completed'
            };
          }

          const parts = trimmed.split('=');
          if (parts.length < 2) continue;

          const key = parts[0]?.trim();
          const value = parts.slice(1).join('=').trim().replace(/"/g, '');

          if (!key) continue;

          if (key === 'path') config.downloads[version]!.path = value;
          if (key === 'downloadedAt') config.downloads[version]!.downloadedAt = value;
          if (key === 'status') config.downloads[version]!.status = this.validateDownloadStatus(value);
          if (key === 'isSystemWide') config.downloads[version]!.isSystemWide = this.parseBoolean(value);
          if (key === 'checksum') config.downloads[version]!.checksum = value;
          if (key === 'checksumVerified') config.downloads[version]!.checksumVerified = value === 'true';
          if (key === 'minisignVerified') config.downloads[version]!.minisignVerified = value === 'true';
          if (key === 'downloadUrl') config.downloads[version]!.downloadUrl = value;
        }
      }

      // Only return migrated config if it has valid data
      return Object.keys(config.downloads).length > 0 || config.currentVersion ? config : null;
    } catch (error) {
      return null;
    }
  }
}
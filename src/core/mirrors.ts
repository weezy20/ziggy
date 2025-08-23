/**
 * Community Mirrors Manager
 * Handles fetching, caching, and selection of community mirrors for Zig downloads
 */

import type { IMirrorsManager, IConfigManager } from '../interfaces.js';
import type { ZiggyConfig } from '../types.js';
import { shuffleArray } from '../utils/array.js';
import { colors } from '../utils/colors.js';
import { 
  ZIG_COMMUNITY_MIRRORS_URL, 
  MIRRORS_CACHE_DURATION_HOURS, 
  MAX_MIRROR_RETRIES 
} from '../constants.js';

const log = console.log;

export class MirrorsManager implements IMirrorsManager {
  constructor(private configManager: IConfigManager) {}

  /**
   * Get community mirrors, fetching from cache or network as needed
   */
  public async getCommunityMirrors(): Promise<string[]> {
    const config = this.configManager.load();
    
    // Check if we have cached mirrors and they're not expired
    const cachedMirrors = config.communityMirrors;
    const lastUpdated = config.communityMirrorsLastUpdated;
    
    if (cachedMirrors && !this.isMirrorsCacheExpired()) {
      const cacheAge = this.getCacheAge(lastUpdated);
      log(colors.gray(`Using cached community mirrors (${Math.floor(cacheAge)}h old, ${cachedMirrors.length} mirrors)`));
      return cachedMirrors;
    }

    // Fetch fresh mirrors
    await this.updateMirrorsCache();
    const updatedConfig = this.configManager.load();
    return updatedConfig.communityMirrors || [];
  }

  /**
   * Get cached mirrors without network fetch
   */
  public getCachedMirrors(): string[] {
    const config = this.configManager.load();
    return config.communityMirrors || [];
  }

  /**
   * Update the mirrors cache by fetching from the network
   */
  public async updateMirrorsCache(): Promise<void> {
    const config = this.configManager.load();
    const cachedMirrors = config.communityMirrors;
    const cacheAge = this.getCacheAge(config.communityMirrorsLastUpdated);
    
    log(colors.blue(`Cache status: cachedMirrors=${!!cachedMirrors}, cacheAge=${cacheAge}h, limit=${MIRRORS_CACHE_DURATION_HOURS}h`));
    
    try {
      log(colors.blue('Fetching updated community mirrors...'));
      const mirrorsResponse = await fetch(ZIG_COMMUNITY_MIRRORS_URL);
      
      if (mirrorsResponse.ok) {
        const mirrorsText = await mirrorsResponse.text();
        const mirrors = mirrorsText.split('\n').filter(line => line.trim() && line.startsWith('https://'));
        
        // Update cache
        const updatedConfig = { ...config };
        updatedConfig.communityMirrors = mirrors;
        updatedConfig.communityMirrorsLastUpdated = new Date().toISOString();
        this.configManager.save(updatedConfig);
        
        log(colors.green(`✓ Updated community mirrors cache (${mirrors.length} mirrors)`));
      } else {
        throw new Error(`HTTP ${mirrorsResponse.status}`);
      }
    } catch (error) {
      log(colors.yellow(`⚠ Could not fetch community mirrors: ${error}`));
      
      // Use cached mirrors as fallback even if expired
      if (cachedMirrors) {
        log(colors.yellow('Using expired cached mirrors as fallback'));
      }
    }
  }

  /**
   * Select mirrors for download with shuffling and rotation logic
   */
  public selectMirrorForDownload(mirrors: string[]): string[] {
    if (mirrors.length === 0) {
      return [];
    }

    // Shuffle mirrors for load balancing
    const shuffledMirrors = shuffleArray(mirrors);
    
    // Return up to MAX_MIRROR_RETRIES mirrors
    return shuffledMirrors.slice(0, MAX_MIRROR_RETRIES);
  }

  /**
   * Check if the mirrors cache is expired
   */
  public isMirrorsCacheExpired(): boolean {
    const config = this.configManager.load();
    const lastUpdated = config.communityMirrorsLastUpdated;
    
    if (!lastUpdated) {
      return true;
    }

    const cacheAge = this.getCacheAge(lastUpdated);
    return cacheAge >= MIRRORS_CACHE_DURATION_HOURS;
  }

  /**
   * Get mirror URLs for a given original URL
   */
  public async getMirrorUrls(originalUrl: string): Promise<string[]> {
    const mirrorUrls: string[] = [];
    const mirrors = await this.getCommunityMirrors();
    
    // Convert original URL to use mirrors
    const urlParts = originalUrl.replace('https://ziglang.org/download/', '');
    for (const mirror of mirrors) {
      const trimmedMirror = mirror.trim();
      const baseUrl = trimmedMirror.endsWith('/') ? trimmedMirror.slice(0, -1) : trimmedMirror;
      mirrorUrls.push(`${baseUrl}/${urlParts}?source=ziggy`);
    }

    return mirrorUrls;
  }

  /**
   * Calculate cache age in hours
   */
  private getCacheAge(lastUpdated?: string): number {
    if (!lastUpdated) {
      return Infinity;
    }

    const now = new Date();
    return (now.getTime() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60);
  }
}
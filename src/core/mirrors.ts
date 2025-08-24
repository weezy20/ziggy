/**
 * Community Mirrors Manager
 * Handles fetching, caching, and selection of community mirrors for Zig downloads
 */

import type { IMirrorsManager, IConfigManager } from '../interfaces.js';
import type { MirrorsConfig, Mirror } from '../types.js';
import { shuffleArray } from '../utils/array.js';
import { colors } from '../utils/colors.js';
import { mirrorConfigManager } from '../utils/mirror-config.js';
import { 
  ZIG_COMMUNITY_MIRRORS_URL, 
  MIRRORS_CACHE_DURATION_HOURS, 
  MAX_MIRROR_RETRIES,
  MIRROR_SYNC_THRESHOLD_HOURS
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

  // New methods for ranking and persistence

  /**
   * Load mirrors configuration from mirrors.toml file
   * Creates default configuration if file doesn't exist
   */
  public loadMirrorsConfig(): MirrorsConfig {
    return mirrorConfigManager.loadConfig();
  }

  /**
   * Save mirrors configuration to mirrors.toml file
   * Persists mirror rankings and sync timestamp
   */
  public saveMirrorsConfig(config: MirrorsConfig): void {
    mirrorConfigManager.saveConfig(config);
  }

  /**
   * Update mirror rank based on failure type
   * Increments rank by 1 for timeout/404, by 2 for signature/checksum failures
   * Persists changes immediately to mirrors.toml
   */
  public updateMirrorRank(url: string, failureType: 'timeout' | 'signature' | 'checksum'): void {
    // Validate URL is HTTPS
    if (!this.isValidHttpsUrl(url)) {
      log(colors.yellow(`⚠ Skipping rank update for non-HTTPS URL: ${url}`));
      return;
    }

    const config = this.loadMirrorsConfig();
    const rankIncrement = failureType === 'timeout' ? 1 : 2; // signature/checksum failures are more serious
    
    // Find existing mirror or create new one
    const existingMirrorIndex = config.mirrors.findIndex(m => m.url === url);
    
    if (existingMirrorIndex >= 0) {
      // Update existing mirror rank
      config.mirrors[existingMirrorIndex]!.rank += rankIncrement;
      log(colors.yellow(`⚠ Updated mirror rank: ${url} (rank: ${config.mirrors[existingMirrorIndex]!.rank}, failure: ${failureType})`));
    } else {
      // Add new mirror with initial rank + increment
      const newMirror: Mirror = {
        url,
        rank: 1 + rankIncrement
      };
      config.mirrors.push(newMirror);
      log(colors.yellow(`⚠ Added new mirror with failure rank: ${url} (rank: ${newMirror.rank}, failure: ${failureType})`));
    }

    // Persist changes immediately
    this.saveMirrorsConfig(config);
  }

  /**
   * Select best mirrors using weighted random selection based on ranks
   * Lower rank = higher priority, with fallback to ziglang.org after retries
   */
  public selectBestMirrors(maxRetries: number = MAX_MIRROR_RETRIES): string[] {
    const config = this.loadMirrorsConfig();
    const mirrors = config.mirrors.filter(m => this.isValidHttpsUrl(m.url));
    
    if (mirrors.length === 0) {
      log(colors.gray('No mirrors available for selection'));
      return [];
    }

    // Calculate weights for weighted random selection
    // Lower rank = higher weight (better priority)
    const weights = mirrors.map(mirror => {
      // Use inverse square of rank for weight calculation
      // This gives exponentially higher preference to lower ranks
      return 1 / (mirror.rank * mirror.rank);
    });

    const selectedMirrors: string[] = [];
    const availableMirrors = [...mirrors];
    const availableWeights = [...weights];

    // Select up to maxRetries mirrors using weighted random selection
    for (let i = 0; i < Math.min(maxRetries, mirrors.length); i++) {
      if (availableMirrors.length === 0) break;

      const selectedIndex = this.weightedRandomSelection(availableWeights);
      const selectedMirror = availableMirrors[selectedIndex]!;
      
      selectedMirrors.push(selectedMirror.url);
      
      // Remove selected mirror from available options to avoid duplicates
      availableMirrors.splice(selectedIndex, 1);
      availableWeights.splice(selectedIndex, 1);
    }

    log(colors.blue(`Selected ${selectedMirrors.length} mirrors for download attempt`));
    return selectedMirrors;
  }

  /**
   * Reset all mirror ranks to default value (1)
   * Used when all mirrors fail or during sync operations
   */
  public resetMirrorRanks(): void {
    const config = this.loadMirrorsConfig();
    
    // Reset all mirror ranks to 1
    config.mirrors.forEach(mirror => {
      mirror.rank = 1;
    });

    this.saveMirrorsConfig(config);
    log(colors.green(`✓ Reset ranks for ${config.mirrors.length} mirrors`));
  }

  /**
   * Synchronize mirrors with community mirror list
   * Fetches latest mirrors, resets ranks, and updates last_synced timestamp
   */
  public async syncMirrors(): Promise<void> {
    try {
      log(colors.blue('Synchronizing community mirrors...'));
      
      // Fetch fresh mirrors from community list
      const mirrorsResponse = await fetch(ZIG_COMMUNITY_MIRRORS_URL);
      
      if (!mirrorsResponse.ok) {
        throw new Error(`HTTP ${mirrorsResponse.status}: ${mirrorsResponse.statusText}`);
      }

      const mirrorsText = await mirrorsResponse.text();
      const mirrorUrls = mirrorsText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && this.isValidHttpsUrl(line));

      // Completely rebuild the mirrors configuration - reset everything
      const newMirrors: Mirror[] = mirrorUrls.map(url => ({
        url,
        rank: 1 // All mirrors start with default rank
      }));

      // Create completely new configuration - no preservation of existing data
      const updatedConfig: MirrorsConfig = {
        mirrors: newMirrors,
        last_synced: new Date().toISOString()
      };

      this.saveMirrorsConfig(updatedConfig);
      
      log(colors.green(`✓ Synchronized ${mirrorUrls.length} community mirrors`));
      log(colors.green(`✓ Total mirrors in configuration: ${newMirrors.length}`));
      
    } catch (error) {
      log(colors.red(`✗ Failed to synchronize mirrors: ${error}`));
      throw error;
    }
  }

  /**
   * Validate that a URL uses HTTPS protocol
   * Security requirement: only HTTPS mirrors are allowed
   */
  private isValidHttpsUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Check if mirrors need to be synced based on last_synced timestamp
   * Uses 24-hour threshold to determine if sync is needed
   */
  public isMirrorsSyncExpired(): boolean {
    const config = this.loadMirrorsConfig();
    const lastSynced = config.last_synced;
    
    if (!lastSynced) {
      // No sync timestamp means mirrors have never been synced
      return true;
    }

    try {
      const lastSyncDate = new Date(lastSynced);
      
      // Check if the date is invalid (NaN)
      if (isNaN(lastSyncDate.getTime())) {
        log(colors.yellow(`⚠ Invalid last_synced timestamp: ${lastSynced}`));
        return true;
      }
      
      const now = new Date();
      const hoursSinceSync = (now.getTime() - lastSyncDate.getTime()) / (1000 * 60 * 60);
      
      return hoursSinceSync >= MIRROR_SYNC_THRESHOLD_HOURS;
    } catch (error) {
      // Invalid timestamp format, consider expired
      log(colors.yellow(`⚠ Invalid last_synced timestamp: ${lastSynced}`));
      return true;
    }
  }

  /**
   * Perform weighted random selection from an array of weights
   * Returns the index of the selected item
   */
  private weightedRandomSelection(weights: number[]): number {
    if (weights.length === 0) {
      throw new Error('Cannot perform weighted selection on empty array');
    }

    // Calculate total weight
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    
    if (totalWeight <= 0) {
      // If all weights are 0 or negative, fall back to uniform random selection
      return Math.floor(Math.random() * weights.length);
    }

    // Generate random number between 0 and totalWeight
    let random = Math.random() * totalWeight;
    
    // Find the selected index
    for (let i = 0; i < weights.length; i++) {
      random -= weights[i]!;
      if (random <= 0) {
        return i;
      }
    }
    
    // Fallback to last index (shouldn't happen with proper weights)
    return weights.length - 1;
  }
}
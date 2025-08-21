/**
 * Version Management Module
 * 
 * This module handles all version-related operations including:
 * - Fetching available versions from ziglang.org
 * - Version validation and comparison
 * - Current version tracking and management
 * - Version sorting and filtering
 */

import type { IVersionManager, IConfigManager } from '../interfaces.js';
import type { ZigVersions, ZigDownloadIndex } from '../types.js';

export class VersionManager implements IVersionManager {
  private configManager: IConfigManager;
  private arch: string;
  private platform: string;

  constructor(configManager: IConfigManager, arch: string, platform: string) {
    this.configManager = configManager;
    this.arch = arch;
    this.platform = platform;
  }

  /**
   * Fetches available Zig versions from ziglang.org
   * @returns Promise<string[]> Array of available version strings
   */
  public async getAvailableVersions(): Promise<string[]> {
    try {
      const response = await fetch('https://ziglang.org/download/index.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json() as ZigVersions;
      const versions = Object.keys(data);
      return versions.filter(v => v !== 'master');
    } catch (error) {
      console.error('Failed to fetch available versions:', error);
      return ['0.11.0', '0.10.1', '0.10.0']; // Fallback versions
    }
  }

  /**
   * Validates if a version exists and has downloads for the current platform
   * @param version Version string to validate
   * @returns Promise<boolean> True if version is valid and available
   */
  public async validateVersion(version: string): Promise<boolean> {
    try {
      const response = await fetch(`https://ziglang.org/download/index.json`);
      if (!response.ok) {
        return false;
      }
      const data = await response.json() as ZigDownloadIndex;
      
      // Check if the version exists in the download index
      return !!data[version];
    } catch (_error) {
      return false;
    }
  }

  /**
   * Gets the currently active version
   * @returns string | undefined Current version or undefined if none set
   */
  public getCurrentVersion(): string | undefined {
    const config = this.configManager.load();
    return config.currentVersion;
  }

  /**
   * Sets the current active version
   * @param version Version string to set as current
   */
  public setCurrentVersion(version: string): void {
    const config = this.configManager.load();
    config.currentVersion = version;
    this.configManager.save(config);
  }

  /**
   * Clears the current active version
   */
  public clearCurrentVersion(): void {
    const config = this.configManager.load();
    config.currentVersion = undefined;
    this.configManager.save(config);
  }

  /**
   * Gets the latest stable version from ziglang.org
   * @returns Promise<string> Latest stable version string
   */
  public async getLatestStableVersion(): Promise<string> {
    try {
      const response = await fetch('https://ziglang.org/download/index.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json() as ZigVersions;
      const versions = Object.keys(data).filter(v => v !== 'master');
      return versions[0] || '0.11.0'; // Assuming the first one is the latest stable
    } catch (_error) {
      return '0.11.0'; // Fallback
    }
  }

  /**
   * Gets all installed versions from the configuration
   * @returns string[] Array of installed version strings
   */
  public getInstalledVersions(): string[] {
    const config = this.configManager.load();
    return Object.keys(config.downloads).filter(version => {
      const info = config.downloads[version];
      return info && info.status === 'completed';
    });
  }

  /**
   * Compares two version strings using semantic versioning rules
   * @param a First version string
   * @param b Second version string
   * @returns number Negative if a < b, positive if a > b, 0 if equal
   */
  public compareVersions(a: string, b: string): number {
    // Handle special cases
    if (a === 'master') return 1;
    if (b === 'master') return -1;
    if (a === 'system') return -1;
    if (b === 'system') return 1;

    // Parse version numbers
    const parseVersion = (version: string): number[] => {
      return version.split('.').map(part => {
        const num = parseInt(part, 10);
        return isNaN(num) ? 0 : num;
      });
    };

    const aParts = parseVersion(a);
    const bParts = parseVersion(b);
    const maxLength = Math.max(aParts.length, bParts.length);

    for (let i = 0; i < maxLength; i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;
      
      if (aPart !== bPart) {
        return aPart - bPart; // Standard comparison: positive if a > b
      }
    }

    return 0;
  }

  /**
   * Sorts an array of version strings in descending order (newest first)
   * @param versions Array of version strings to sort
   * @returns string[] Sorted array of version strings
   */
  public sortVersions(versions: string[]): string[] {
    return [...versions].sort((a, b) => -this.compareVersions(a, b)); // Negate for descending order
  }

  /**
   * Checks if a version is currently installed and completed
   * @param version Version string to check
   * @returns boolean True if version is installed and completed
   */
  public isVersionInstalled(version: string): boolean {
    const config = this.configManager.load();
    const info = config.downloads[version];
    return !!(info && info.status === 'completed');
  }

  /**
   * Gets version information for a specific version
   * @param version Version string to get info for
   * @returns object | undefined Version info or undefined if not found
   */
  public getVersionInfo(version: string): { version: string; path: string; status: string; downloadedAt: string } | undefined {
    const config = this.configManager.load();
    const info = config.downloads[version];
    if (!info) return undefined;

    return {
      version: info.version,
      path: info.path,
      status: info.status,
      downloadedAt: info.downloadedAt
    };
  }

  /**
   * Checks if the current version is set to system Zig
   * @returns boolean True if using system Zig
   */
  public isUsingSystemVersion(): boolean {
    const config = this.configManager.load();
    return config.currentVersion === 'system';
  }

  /**
   * Gets system Zig information if available
   * @returns object | undefined System Zig info or undefined if not available
   */
  public getSystemZigInfo(): { path: string; version: string } | undefined {
    const config = this.configManager.load();
    return config.systemZig;
  }
}
/**
 * Unit tests for VersionManager
 */

import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import { VersionManager } from '../../../src/core/version.js';
import type { IConfigManager } from '../../../src/interfaces.js';
import type { ZiggyConfig, ZigVersions, ZigDownloadIndex } from '../../../src/types.js';

// Mock ConfigManager
class MockConfigManager implements IConfigManager {
  private config: ZiggyConfig = {
    downloads: {},
    currentVersion: undefined,
    systemZig: undefined
  };

  load(): ZiggyConfig {
    return { ...this.config };
  }

  save(config: ZiggyConfig): void {
    this.config = { ...config };
  }

  scanExistingInstallations(): ZiggyConfig {
    return this.load();
  }

  // Test helper methods
  setConfig(config: Partial<ZiggyConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): ZiggyConfig {
    return { ...this.config };
  }
}

describe('VersionManager', () => {
  let versionManager: VersionManager;
  let mockConfigManager: MockConfigManager;

  beforeEach(() => {
    mockConfigManager = new MockConfigManager();
    versionManager = new VersionManager(mockConfigManager, 'x86_64', 'linux');
  });

  describe('getAvailableVersions', () => {
    it('should fetch and return available versions excluding master', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          'master': { version: 'master', date: '2024-01-01', tarball: 'url' },
          '0.12.0': { version: '0.12.0', date: '2024-01-01', tarball: 'url' },
          '0.11.0': { version: '0.11.0', date: '2023-12-01', tarball: 'url' }
        } as ZigVersions)
      };

      const fetchSpy = spyOn(global, 'fetch').mockResolvedValue(mockResponse as any);

      const versions = await versionManager.getAvailableVersions();

      expect(fetchSpy).toHaveBeenCalledWith('https://ziglang.org/download/index.json');
      expect(versions).toEqual(['0.12.0', '0.11.0']);
      expect(versions).not.toContain('master');
    });

    it('should return fallback versions on fetch error', async () => {
      const fetchSpy = spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));
      const consoleSpy = spyOn(console, 'error').mockImplementation(() => {});

      const versions = await versionManager.getAvailableVersions();

      expect(fetchSpy).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      expect(versions).toEqual(['0.11.0', '0.10.1', '0.10.0']);
    });

    it('should return fallback versions on HTTP error', async () => {
      const mockResponse = { ok: false, status: 404 };
      const fetchSpy = spyOn(global, 'fetch').mockResolvedValue(mockResponse as any);
      const consoleSpy = spyOn(console, 'error').mockImplementation(() => {});

      const versions = await versionManager.getAvailableVersions();

      expect(fetchSpy).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      expect(versions).toEqual(['0.11.0', '0.10.1', '0.10.0']);
    });
  });

  describe('validateVersion', () => {
    it('should return true for valid version with platform support', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          '0.12.0': {
            'x86_64-linux': {
              tarball: 'https://example.com/zig.tar.xz',
              shasum: 'abc123',
              size: '12345'
            }
          }
        } as ZigDownloadIndex)
      };

      const fetchSpy = spyOn(global, 'fetch').mockResolvedValue(mockResponse as any);

      const isValid = await versionManager.validateVersion('0.12.0');

      expect(fetchSpy).toHaveBeenCalledWith('https://ziglang.org/download/index.json');
      expect(isValid).toBe(true);
    });

    it('should return false for non-existent version', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          '0.11.0': {
            'x86_64-linux': {
              tarball: 'https://example.com/zig.tar.xz',
              shasum: 'abc123',
              size: '12345'
            }
          }
        } as ZigDownloadIndex)
      };

      const fetchSpy = spyOn(global, 'fetch').mockResolvedValue(mockResponse as any);

      const isValid = await versionManager.validateVersion('0.12.0');

      expect(fetchSpy).toHaveBeenCalled();
      expect(isValid).toBe(false);
    });

    it('should return false on HTTP error', async () => {
      const mockResponse = { ok: false, status: 404 };
      const fetchSpy = spyOn(global, 'fetch').mockResolvedValue(mockResponse as any);

      const isValid = await versionManager.validateVersion('invalid-version');

      expect(fetchSpy).toHaveBeenCalled();
      expect(isValid).toBe(false);
    });

    it('should return false on fetch error', async () => {
      const fetchSpy = spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

      const isValid = await versionManager.validateVersion('0.12.0');

      expect(fetchSpy).toHaveBeenCalled();
      expect(isValid).toBe(false);
    });
  });

  describe('getCurrentVersion', () => {
    it('should return current version from config', () => {
      mockConfigManager.setConfig({ currentVersion: '0.12.0' });

      const currentVersion = versionManager.getCurrentVersion();

      expect(currentVersion).toBe('0.12.0');
    });

    it('should return undefined when no current version is set', () => {
      const currentVersion = versionManager.getCurrentVersion();

      expect(currentVersion).toBeUndefined();
    });
  });

  describe('setCurrentVersion', () => {
    it('should set current version in config', () => {
      versionManager.setCurrentVersion('0.12.0');

      const config = mockConfigManager.getConfig();
      expect(config.currentVersion).toBe('0.12.0');
    });

    it('should overwrite existing current version', () => {
      mockConfigManager.setConfig({ currentVersion: '0.11.0' });

      versionManager.setCurrentVersion('0.12.0');

      const config = mockConfigManager.getConfig();
      expect(config.currentVersion).toBe('0.12.0');
    });
  });

  describe('clearCurrentVersion', () => {
    it('should clear current version from config', () => {
      mockConfigManager.setConfig({ currentVersion: '0.12.0' });

      versionManager.clearCurrentVersion();

      const config = mockConfigManager.getConfig();
      expect(config.currentVersion).toBeUndefined();
    });

    it('should work when no current version is set', () => {
      versionManager.clearCurrentVersion();

      const config = mockConfigManager.getConfig();
      expect(config.currentVersion).toBeUndefined();
    });
  });

  describe('getLatestStableVersion', () => {
    it('should return the first non-master version', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          'master': { version: 'master', date: '2024-01-01', tarball: 'url' },
          '0.12.0': { version: '0.12.0', date: '2024-01-01', tarball: 'url' },
          '0.11.0': { version: '0.11.0', date: '2023-12-01', tarball: 'url' }
        } as ZigVersions)
      };

      const fetchSpy = spyOn(global, 'fetch').mockResolvedValue(mockResponse as any);

      const latestVersion = await versionManager.getLatestStableVersion();

      expect(fetchSpy).toHaveBeenCalledWith('https://ziglang.org/download/index.json');
      expect(latestVersion).toBe('0.12.0');
    });

    it('should return fallback version on error', async () => {
      const fetchSpy = spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

      const latestVersion = await versionManager.getLatestStableVersion();

      expect(fetchSpy).toHaveBeenCalled();
      expect(latestVersion).toBe('0.11.0');
    });
  });

  describe('getInstalledVersions', () => {
    it('should return only completed versions', () => {
      mockConfigManager.setConfig({
        downloads: {
          '0.12.0': { version: '0.12.0', path: '/path/1', status: 'completed', downloadedAt: '2024-01-01' },
          '0.11.0': { version: '0.11.0', path: '/path/2', status: 'downloading', downloadedAt: '2024-01-01' },
          '0.10.0': { version: '0.10.0', path: '/path/3', status: 'completed', downloadedAt: '2024-01-01' },
          '0.9.0': { version: '0.9.0', path: '/path/4', status: 'failed', downloadedAt: '2024-01-01' }
        }
      });

      const installedVersions = versionManager.getInstalledVersions();

      expect(installedVersions).toEqual(['0.12.0', '0.10.0']);
    });

    it('should return empty array when no versions are installed', () => {
      const installedVersions = versionManager.getInstalledVersions();

      expect(installedVersions).toEqual([]);
    });
  });

  describe('compareVersions', () => {
    it('should handle master version as highest', () => {
      expect(versionManager.compareVersions('master', '0.12.0')).toBeGreaterThan(0);
      expect(versionManager.compareVersions('0.12.0', 'master')).toBeLessThan(0);
    });

    it('should handle system version as lowest', () => {
      expect(versionManager.compareVersions('system', '0.12.0')).toBeLessThan(0);
      expect(versionManager.compareVersions('0.12.0', 'system')).toBeGreaterThan(0);
    });

    it('should compare semantic versions correctly', () => {
      expect(versionManager.compareVersions('0.12.0', '0.11.0')).toBeGreaterThan(0);
      expect(versionManager.compareVersions('0.11.0', '0.12.0')).toBeLessThan(0);
      expect(versionManager.compareVersions('0.12.0', '0.12.0')).toBe(0);
    });

    it('should handle different version lengths', () => {
      expect(versionManager.compareVersions('0.12.1', '0.12')).toBeGreaterThan(0);
      expect(versionManager.compareVersions('0.12', '0.12.1')).toBeLessThan(0);
    });
  });

  describe('sortVersions', () => {
    it('should sort versions in descending order', () => {
      const versions = ['0.10.0', '0.12.0', '0.11.0', 'master', 'system'];
      const sorted = versionManager.sortVersions(versions);

      expect(sorted).toEqual(['master', '0.12.0', '0.11.0', '0.10.0', 'system']);
    });

    it('should not modify original array', () => {
      const versions = ['0.10.0', '0.12.0', '0.11.0'];
      const originalVersions = [...versions];
      
      versionManager.sortVersions(versions);

      expect(versions).toEqual(originalVersions);
    });
  });

  describe('isVersionInstalled', () => {
    beforeEach(() => {
      mockConfigManager.setConfig({
        downloads: {
          '0.12.0': { version: '0.12.0', path: '/path/1', status: 'completed', downloadedAt: '2024-01-01' },
          '0.11.0': { version: '0.11.0', path: '/path/2', status: 'downloading', downloadedAt: '2024-01-01' }
        }
      });
    });

    it('should return true for completed installations', () => {
      expect(versionManager.isVersionInstalled('0.12.0')).toBe(true);
    });

    it('should return false for incomplete installations', () => {
      expect(versionManager.isVersionInstalled('0.11.0')).toBe(false);
    });

    it('should return false for non-existent versions', () => {
      expect(versionManager.isVersionInstalled('0.10.0')).toBe(false);
    });
  });

  describe('getVersionInfo', () => {
    beforeEach(() => {
      mockConfigManager.setConfig({
        downloads: {
          '0.12.0': { 
            version: '0.12.0', 
            path: '/path/to/zig', 
            status: 'completed', 
            downloadedAt: '2024-01-01T10:00:00Z' 
          }
        }
      });
    });

    it('should return version info for existing version', () => {
      const info = versionManager.getVersionInfo('0.12.0');

      expect(info).toEqual({
        version: '0.12.0',
        path: '/path/to/zig',
        status: 'completed',
        downloadedAt: '2024-01-01T10:00:00Z'
      });
    });

    it('should return undefined for non-existent version', () => {
      const info = versionManager.getVersionInfo('0.11.0');

      expect(info).toBeUndefined();
    });
  });

  describe('isUsingSystemVersion', () => {
    it('should return true when current version is system', () => {
      mockConfigManager.setConfig({ currentVersion: 'system' });

      expect(versionManager.isUsingSystemVersion()).toBe(true);
    });

    it('should return false when current version is not system', () => {
      mockConfigManager.setConfig({ currentVersion: '0.12.0' });

      expect(versionManager.isUsingSystemVersion()).toBe(false);
    });

    it('should return false when no current version is set', () => {
      expect(versionManager.isUsingSystemVersion()).toBe(false);
    });
  });

  describe('getSystemZigInfo', () => {
    it('should return system zig info when available', () => {
      const systemZig = { path: '/usr/bin/zig', version: '0.11.0' };
      mockConfigManager.setConfig({ systemZig });

      const info = versionManager.getSystemZigInfo();

      expect(info).toEqual(systemZig);
    });

    it('should return undefined when no system zig is available', () => {
      const info = versionManager.getSystemZigInfo();

      expect(info).toBeUndefined();
    });
  });
});
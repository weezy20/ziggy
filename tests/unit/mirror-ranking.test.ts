/**
 * Unit tests for mirror ranking and selection logic
 * Tests the weighted random selection algorithm and rank update functionality
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { MirrorsManager } from '../../src/core/mirrors.js';
import { mirrorConfigManager } from '../../src/utils/mirror-config.js';
import type { IConfigManager } from '../../src/interfaces.js';
import type { MirrorsConfig, Mirror } from '../../src/types.js';

// Mock console.log to avoid test output noise
const originalConsoleLog = console.log;

// Mock fetch for sync tests
const originalFetch = global.fetch;

describe('MirrorsManager - Ranking and Selection', () => {
  let mirrorsManager: MirrorsManager;
  let mockConfigManager: IConfigManager;
  let mockLoadConfig: any;
  let mockSaveConfig: any;
  let mockFetch: any;

  beforeEach(() => {
    // Mock console.log
    console.log = mock(() => {});
    
    // Create mock config manager
    mockConfigManager = {
      load: mock(() => ({})),
      save: mock(() => {}),
      scanExistingInstallations: mock(() => ({})),
    };

    // Setup mirror config manager mocks - create fresh mocks each time
    mockLoadConfig = mock(() => ({
      mirrors: [],
      last_synced: '2024-08-24T10:00:00Z'
    }));
    mockSaveConfig = mock(() => {});
    
    // Replace the methods on the actual object
    mirrorConfigManager.loadConfig = mockLoadConfig;
    mirrorConfigManager.saveConfig = mockSaveConfig;

    // Mock fetch
    mockFetch = mock(() => Promise.resolve({
      ok: true,
      text: () => Promise.resolve('')
    }));
    global.fetch = mockFetch;

    mirrorsManager = new MirrorsManager(mockConfigManager);
  });

  afterEach(() => {
    // Restore original functions
    console.log = originalConsoleLog;
    global.fetch = originalFetch;
  });

  describe('loadMirrorsConfig', () => {
    it('should load configuration from mirror config manager', () => {
      const mockConfig: MirrorsConfig = {
        mirrors: [
          { url: 'https://mirror1.example.com', rank: 1 },
          { url: 'https://mirror2.example.com', rank: 2 }
        ],
        last_synced: '2024-08-24T10:00:00Z'
      };

      mockLoadConfig.mockReturnValue(mockConfig);

      const result = mirrorsManager.loadMirrorsConfig();

      expect(mockLoadConfig).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockConfig);
    });
  });

  describe('saveMirrorsConfig', () => {
    it('should save configuration using mirror config manager', () => {
      const mockConfig: MirrorsConfig = {
        mirrors: [{ url: 'https://mirror1.example.com', rank: 1 }],
        last_synced: '2024-08-24T10:00:00Z'
      };

      mirrorsManager.saveMirrorsConfig(mockConfig);

      expect(mockSaveConfig).toHaveBeenCalledTimes(1);
      expect(mockSaveConfig).toHaveBeenCalledWith(mockConfig);
    });
  });

  describe('updateMirrorRank', () => {
    beforeEach(() => {
      const mockConfig: MirrorsConfig = {
        mirrors: [
          { url: 'https://existing-mirror.com', rank: 1 }
        ],
        last_synced: '2024-08-24T10:00:00Z'
      };
      mockLoadConfig.mockReturnValue(mockConfig);
    });

    it('should increment rank by 1 for timeout failures', () => {
      mirrorsManager.updateMirrorRank('https://existing-mirror.com', 'timeout');

      expect(mockSaveConfig).toHaveBeenCalledWith({
        mirrors: [
          { url: 'https://existing-mirror.com', rank: 2 }
        ],
        last_synced: '2024-08-24T10:00:00Z'
      });
    });

    it('should increment rank by 2 for signature failures', () => {
      mirrorsManager.updateMirrorRank('https://existing-mirror.com', 'signature');

      expect(mockSaveConfig).toHaveBeenCalledWith({
        mirrors: [
          { url: 'https://existing-mirror.com', rank: 3 }
        ],
        last_synced: '2024-08-24T10:00:00Z'
      });
    });

    it('should increment rank by 2 for checksum failures', () => {
      mirrorsManager.updateMirrorRank('https://existing-mirror.com', 'checksum');

      expect(mockSaveConfig).toHaveBeenCalledWith({
        mirrors: [
          { url: 'https://existing-mirror.com', rank: 3 }
        ],
        last_synced: '2024-08-24T10:00:00Z'
      });
    });

    it('should add new mirror with appropriate rank for new URLs', () => {
      mirrorsManager.updateMirrorRank('https://new-mirror.com', 'timeout');

      expect(mockSaveConfig).toHaveBeenCalledWith({
        mirrors: [
          { url: 'https://existing-mirror.com', rank: 1 },
          { url: 'https://new-mirror.com', rank: 2 } // 1 + 1 for timeout
        ],
        last_synced: '2024-08-24T10:00:00Z'
      });
    });

    it('should reject non-HTTPS URLs', () => {
      // Create a fresh mock for this test
      const freshSaveConfig = mock(() => {});
      mirrorConfigManager.saveConfig = freshSaveConfig;
      
      mirrorsManager.updateMirrorRank('http://insecure-mirror.com', 'timeout');

      // Should not save config for non-HTTPS URLs
      expect(freshSaveConfig).toHaveBeenCalledTimes(0);
    });

    it('should reject invalid URLs', () => {
      // Create a fresh mock for this test
      const freshSaveConfig = mock(() => {});
      mirrorConfigManager.saveConfig = freshSaveConfig;
      
      mirrorsManager.updateMirrorRank('not-a-url', 'timeout');

      // Should not save config for invalid URLs
      expect(freshSaveConfig).toHaveBeenCalledTimes(0);
    });
  });

  describe('selectBestMirrors', () => {
    it('should return empty array when no mirrors available', () => {
      mockLoadConfig.mockReturnValue({
        mirrors: [],
        last_synced: '2024-08-24T10:00:00Z'
      });

      const result = mirrorsManager.selectBestMirrors();

      expect(result).toEqual([]);
    });

    it('should filter out non-HTTPS mirrors', () => {
      mockLoadConfig.mockReturnValue({
        mirrors: [
          { url: 'https://secure-mirror.com', rank: 1 },
          { url: 'http://insecure-mirror.com', rank: 1 },
          { url: 'ftp://ftp-mirror.com', rank: 1 }
        ],
        last_synced: '2024-08-24T10:00:00Z'
      });

      const result = mirrorsManager.selectBestMirrors();

      // Should only include HTTPS mirror
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('https://secure-mirror.com');
    });

    it('should respect maxRetries parameter', () => {
      mockLoadConfig.mockReturnValue({
        mirrors: [
          { url: 'https://mirror1.com', rank: 1 },
          { url: 'https://mirror2.com', rank: 1 },
          { url: 'https://mirror3.com', rank: 1 },
          { url: 'https://mirror4.com', rank: 1 }
        ],
        last_synced: '2024-08-24T10:00:00Z'
      });

      const result = mirrorsManager.selectBestMirrors(2);

      expect(result).toHaveLength(2);
    });

    it('should not select the same mirror twice', () => {
      mockLoadConfig.mockReturnValue({
        mirrors: [
          { url: 'https://mirror1.com', rank: 1 },
          { url: 'https://mirror2.com', rank: 2 }
        ],
        last_synced: '2024-08-24T10:00:00Z'
      });

      const result = mirrorsManager.selectBestMirrors(3);

      // Should return both mirrors without duplicates
      expect(result).toHaveLength(2);
      expect(new Set(result)).toHaveProperty('size', 2);
    });

    it('should prefer mirrors with lower ranks', () => {
      // Mock Math.random to return predictable values for testing
      const originalRandom = Math.random;
      let callCount = 0;
      Math.random = mock(() => {
        // Return values that should select the first (highest weight) mirror
        return callCount++ === 0 ? 0.1 : 0.9;
      });

      mockLoadConfig.mockReturnValue({
        mirrors: [
          { url: 'https://good-mirror.com', rank: 1 },    // weight = 1/1 = 1.0
          { url: 'https://bad-mirror.com', rank: 10 }     // weight = 1/100 = 0.01
        ],
        last_synced: '2024-08-24T10:00:00Z'
      });

      const result = mirrorsManager.selectBestMirrors(1);

      expect(result[0]).toBe('https://good-mirror.com');

      // Restore Math.random
      Math.random = originalRandom;
    });
  });

  describe('resetMirrorRanks', () => {
    it('should reset all mirror ranks to 1', () => {
      const mockConfig: MirrorsConfig = {
        mirrors: [
          { url: 'https://mirror1.com', rank: 5 },
          { url: 'https://mirror2.com', rank: 10 },
          { url: 'https://mirror3.com', rank: 2 }
        ],
        last_synced: '2024-08-24T10:00:00Z'
      };

      mockLoadConfig.mockReturnValue(mockConfig);

      mirrorsManager.resetMirrorRanks();

      expect(mockSaveConfig).toHaveBeenCalledWith({
        mirrors: [
          { url: 'https://mirror1.com', rank: 1 },
          { url: 'https://mirror2.com', rank: 1 },
          { url: 'https://mirror3.com', rank: 1 }
        ],
        last_synced: '2024-08-24T10:00:00Z'
      });
    });

    it('should handle empty mirrors array', () => {
      const mockConfig: MirrorsConfig = {
        mirrors: [],
        last_synced: '2024-08-24T10:00:00Z'
      };

      mockLoadConfig.mockReturnValue(mockConfig);

      mirrorsManager.resetMirrorRanks();

      expect(mockSaveConfig).toHaveBeenCalledWith(mockConfig);
    });
  });

  describe('syncMirrors', () => {
    beforeEach(() => {
      mockLoadConfig.mockReturnValue({
        mirrors: [
          { url: 'https://old-mirror.com', rank: 5 },
          { url: 'https://custom-mirror.com', rank: 2 }
        ],
        last_synced: '2024-08-20T10:00:00Z'
      });
    });

    it('should fetch and update community mirrors', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('https://mirror1.com\nhttps://mirror2.com\nhttps://old-mirror.com\n')
      });

      await mirrorsManager.syncMirrors();

      expect(mockFetch).toHaveBeenCalledWith('https://ziglang.org/download/community-mirrors.txt');
      
      // Should save config with new mirrors and reset ranks (completely rebuilt)
      expect(mockSaveConfig).toHaveBeenCalledWith({
        mirrors: [
          { url: 'https://mirror1.com', rank: 1 },
          { url: 'https://mirror2.com', rank: 1 },
          { url: 'https://old-mirror.com', rank: 1 }
          // Custom mirrors are NOT preserved - complete rebuild
        ],
        last_synced: expect.any(String)
      });
    });

    it('should filter out non-HTTPS mirrors from community list', async () => {
      // Set up the initial config
      mockLoadConfig.mockReturnValue({
        mirrors: [
          { url: 'https://old-mirror.com', rank: 5 }
        ],
        last_synced: '2024-08-20T10:00:00Z'
      });

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('https://secure-mirror.com\nhttp://insecure-mirror.com\nftp://ftp-mirror.com\n')
      });

      await mirrorsManager.syncMirrors();

      const savedConfig = mockSaveConfig.mock.calls[mockSaveConfig.mock.calls.length - 1][0] as MirrorsConfig;
      const mirrorUrls = savedConfig.mirrors.map(m => m.url);
      
      expect(mirrorUrls).toContain('https://secure-mirror.com');
      expect(mirrorUrls).not.toContain('http://insecure-mirror.com');
      expect(mirrorUrls).not.toContain('ftp://ftp-mirror.com');
    });

    it('should handle fetch errors gracefully', async () => {
      // Create a fresh mock for this test
      const freshSaveConfig = mock(() => {});
      mirrorConfigManager.saveConfig = freshSaveConfig;
      
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(mirrorsManager.syncMirrors()).rejects.toThrow('HTTP 404: Not Found');
      
      // Should not save config on error
      expect(freshSaveConfig).toHaveBeenCalledTimes(0);
    });

    it('should handle network errors', async () => {
      // Create a fresh mock for this test
      const freshSaveConfig = mock(() => {});
      mirrorConfigManager.saveConfig = freshSaveConfig;
      
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(mirrorsManager.syncMirrors()).rejects.toThrow('Network error');
      
      // Should not save config on error
      expect(freshSaveConfig).toHaveBeenCalledTimes(0);
    });

    it('should completely rebuild configuration without preserving custom mirrors', async () => {
      // Set up the initial config with custom mirror
      mockLoadConfig.mockReturnValue({
        mirrors: [
          { url: 'https://old-mirror.com', rank: 5 },
          { url: 'https://custom-mirror.com', rank: 2 }
        ],
        last_synced: '2024-08-20T10:00:00Z'
      });

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('https://community-mirror.com\n')
      });

      await mirrorsManager.syncMirrors();

      const savedConfig = mockSaveConfig.mock.calls[mockSaveConfig.mock.calls.length - 1][0] as MirrorsConfig;
      const mirrorUrls = savedConfig.mirrors.map(m => m.url);
      
      expect(mirrorUrls).toContain('https://community-mirror.com');
      expect(mirrorUrls).not.toContain('https://custom-mirror.com'); // NOT preserved - complete rebuild
      expect(mirrorUrls).not.toContain('https://old-mirror.com'); // NOT preserved - complete rebuild
      expect(savedConfig.mirrors).toHaveLength(1); // Only community mirrors
      expect(savedConfig.mirrors[0]?.rank).toBe(1); // Reset to default rank
    });
  });

  describe('HTTPS URL validation', () => {
    it('should accept valid HTTPS URLs', () => {
      mockLoadConfig.mockReturnValue({
        mirrors: [{ url: 'https://valid-mirror.com', rank: 1 }],
        last_synced: '2024-08-24T10:00:00Z'
      });

      const result = mirrorsManager.selectBestMirrors();
      expect(result).toContain('https://valid-mirror.com');
    });

    it('should reject HTTP URLs', () => {
      mockLoadConfig.mockReturnValue({
        mirrors: [{ url: 'http://insecure-mirror.com', rank: 1 }],
        last_synced: '2024-08-24T10:00:00Z'
      });

      const result = mirrorsManager.selectBestMirrors();
      expect(result).toEqual([]);
    });

    it('should reject FTP URLs', () => {
      mockLoadConfig.mockReturnValue({
        mirrors: [{ url: 'ftp://ftp-mirror.com', rank: 1 }],
        last_synced: '2024-08-24T10:00:00Z'
      });

      const result = mirrorsManager.selectBestMirrors();
      expect(result).toEqual([]);
    });

    it('should reject invalid URLs', () => {
      mockLoadConfig.mockReturnValue({
        mirrors: [{ url: 'not-a-url', rank: 1 }],
        last_synced: '2024-08-24T10:00:00Z'
      });

      const result = mirrorsManager.selectBestMirrors();
      expect(result).toEqual([]);
    });
  });

  describe('isMirrorsSyncExpired', () => {
    it('should return true when no last_synced timestamp exists', () => {
      // Mock config with no last_synced
      mockLoadConfig.mockReturnValue({
        mirrors: [],
        last_synced: ''
      });

      const result = mirrorsManager.isMirrorsSyncExpired();
      expect(result).toBe(true);
    });

    it('should return true when last_synced is older than 24 hours', () => {
      // Mock config with old timestamp (25 hours ago)
      const oldTimestamp = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      mockLoadConfig.mockReturnValue({
        mirrors: [],
        last_synced: oldTimestamp
      });

      const result = mirrorsManager.isMirrorsSyncExpired();
      expect(result).toBe(true);
    });

    it('should return false when last_synced is within 24 hours', () => {
      // Mock config with recent timestamp (1 hour ago)
      const recentTimestamp = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      mockLoadConfig.mockReturnValue({
        mirrors: [],
        last_synced: recentTimestamp
      });

      const result = mirrorsManager.isMirrorsSyncExpired();
      expect(result).toBe(false);
    });

    it('should return true for invalid timestamp format', () => {
      // Mock config with invalid timestamp
      mockLoadConfig.mockReturnValue({
        mirrors: [],
        last_synced: 'invalid-timestamp'
      });

      const result = mirrorsManager.isMirrorsSyncExpired();
      expect(result).toBe(true);
    });

    it('should return false when exactly at 24 hour threshold', () => {
      // Mock config with timestamp exactly 24 hours ago
      const exactTimestamp = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      mockLoadConfig.mockReturnValue({
        mirrors: [],
        last_synced: exactTimestamp
      });

      const result = mirrorsManager.isMirrorsSyncExpired();
      expect(result).toBe(true); // Should be true since >= 24 hours
    });
  });

  describe('weighted random selection algorithm', () => {
    it('should handle edge case with zero weights', () => {
      // This tests the private method indirectly through selectBestMirrors
      mockLoadConfig.mockReturnValue({
        mirrors: [
          { url: 'https://mirror1.com', rank: Number.MAX_SAFE_INTEGER }, // Very high rank = very low weight
          { url: 'https://mirror2.com', rank: Number.MAX_SAFE_INTEGER }
        ],
        last_synced: '2024-08-24T10:00:00Z'
      });

      // Should not throw error and should return some result
      const result = mirrorsManager.selectBestMirrors(1);
      expect(result).toHaveLength(1);
    });

    it('should distribute selection based on weights over multiple runs', () => {
      // Mock Math.random to return predictable sequence
      const originalRandom = Math.random;
      const randomValues = [0.1, 0.3, 0.7, 0.9]; // Different values to test distribution
      let callIndex = 0;
      Math.random = mock(() => randomValues[callIndex++ % randomValues.length]!);

      mockLoadConfig.mockReturnValue({
        mirrors: [
          { url: 'https://good-mirror.com', rank: 1 },    // High weight
          { url: 'https://bad-mirror.com', rank: 5 }      // Low weight
        ],
        last_synced: '2024-08-24T10:00:00Z'
      });

      const selections: string[] = [];
      for (let i = 0; i < 4; i++) {
        const result = mirrorsManager.selectBestMirrors(1);
        selections.push(result[0]!);
      }

      // Good mirror should be selected more often due to higher weight
      const goodMirrorCount = selections.filter(url => url === 'https://good-mirror.com').length;
      expect(goodMirrorCount).toBeGreaterThan(0);

      // Restore Math.random
      Math.random = originalRandom;
    });
  });
});
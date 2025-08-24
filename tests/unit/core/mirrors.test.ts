/**
 * Unit tests for MirrorsManager
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { MirrorsManager } from '../../../src/core/mirrors.js';
import type { IMirrorsManager, IConfigManager } from '../../../src/interfaces.js';
import type { ZiggyConfig } from '../../../src/types.js';

// Mock console.log
const mockLog = mock(() => {});
const _originalConsole = console.log;

// Mock fetch
const mockFetch = mock(() => Promise.resolve({
  ok: true,
  text: () => Promise.resolve('')
}));

describe('MirrorsManager', () => {
  let mirrorsManager: IMirrorsManager;
  let mockConfigManager: IConfigManager;
  let mockConfig: ZiggyConfig;

  beforeEach(() => {
    // Reset mocks
    mockLog.mockClear();
    mockFetch.mockClear();
    
    // Mock global fetch
    globalThis.fetch = mockFetch;
    
    mockConfig = {
      downloads: {},
      communityMirrors: undefined,
      communityMirrorsLastUpdated: undefined
    };

    mockConfigManager = {
      load: mock(() => mockConfig),
      save: mock(() => {}),
      scanExistingInstallations: mock(() => mockConfig)
    };

    mirrorsManager = new MirrorsManager(mockConfigManager);
  });

  describe('getCachedMirrors', () => {
    it('should return empty array when no cached mirrors exist', () => {
      const result = mirrorsManager.getCachedMirrors();
      expect(result).toEqual([]);
    });

    it('should return cached mirrors when they exist', () => {
      const cachedMirrors = ['https://mirror1.example.com', 'https://mirror2.example.com'];
      mockConfig.communityMirrors = cachedMirrors;

      const result = mirrorsManager.getCachedMirrors();
      expect(result).toEqual(cachedMirrors);
    });
  });

  describe('isMirrorsCacheExpired', () => {
    it('should return true when no lastUpdated timestamp exists', () => {
      const result = mirrorsManager.isMirrorsCacheExpired();
      expect(result).toBe(true);
    });

    it('should return false when cache is fresh', () => {
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      mockConfig.communityMirrorsLastUpdated = oneHourAgo;

      const result = mirrorsManager.isMirrorsCacheExpired();
      expect(result).toBe(false);
    });

    it('should return true when cache is expired', () => {
      const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      mockConfig.communityMirrorsLastUpdated = twentyFiveHoursAgo;

      const result = mirrorsManager.isMirrorsCacheExpired();
      expect(result).toBe(true);
    });
  });

  describe('selectMirrorForDownload', () => {
    it('should return empty array for empty input', () => {
      const result = mirrorsManager.selectMirrorForDownload([]);
      expect(result).toEqual([]);
    });

    it('should return up to MAX_MIRROR_RETRIES mirrors', () => {
      const mirrors = [
        'https://mirror1.example.com',
        'https://mirror2.example.com',
        'https://mirror3.example.com',
        'https://mirror4.example.com'
      ];

      const result = mirrorsManager.selectMirrorForDownload(mirrors);
      expect(result.length).toBe(3); // MAX_MIRROR_RETRIES = 3
      expect(mirrors).toContain(result[0]);
      expect(mirrors).toContain(result[1]);
    });

    it('should return all mirrors if less than MAX_MIRROR_RETRIES', () => {
      const mirrors = ['https://mirror1.example.com'];

      const result = mirrorsManager.selectMirrorForDownload(mirrors);
      expect(result).toEqual(mirrors);
    });

    it('should shuffle mirrors for load balancing', () => {
      const mirrors = [
        'https://mirror1.example.com',
        'https://mirror2.example.com',
        'https://mirror3.example.com',
        'https://mirror4.example.com'
      ];

      // Run multiple times to check for randomness
      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(mirrorsManager.selectMirrorForDownload(mirrors));
      }

      // Check that we get different orderings (not always the same first two)
      const firstMirrors = results.map(r => r[0]);
      const uniqueFirstMirrors = new Set(firstMirrors);
      expect(uniqueFirstMirrors.size).toBeGreaterThan(1);
    });
  });

  describe('updateMirrorsCache', () => {
    it('should fetch and cache mirrors successfully', async () => {
      const mockMirrorsText = 'https://mirror1.example.com\nhttps://mirror2.example.com\n';
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(mockMirrorsText)
      }));

      await mirrorsManager.updateMirrorsCache();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockConfigManager.save).toHaveBeenCalledTimes(1);
      
      // Check that save was called with the expected structure
      const saveCall = mockConfigManager.save.mock.calls[0];
      expect(saveCall[0]).toMatchObject({
        communityMirrors: ['https://mirror1.example.com', 'https://mirror2.example.com']
      });
      expect(saveCall[0].communityMirrorsLastUpdated).toBeDefined();
    });

    it('should filter out invalid lines', async () => {
      const mockMirrorsText = 'https://mirror1.example.com\n\nhttp://insecure.com\nhttps://mirror2.example.com\n# comment\n';
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(mockMirrorsText)
      }));

      await mirrorsManager.updateMirrorsCache();

      const saveCall = mockConfigManager.save.mock.calls[0];
      expect(saveCall[0].communityMirrors).toEqual(['https://mirror1.example.com', 'https://mirror2.example.com']);
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockImplementation(() => Promise.reject(new Error('Network error')));
      mockConfig.communityMirrors = ['https://cached-mirror.example.com'];

      // Should not throw an error
      await expect(mirrorsManager.updateMirrorsCache()).resolves.toBeUndefined();
      
      // Should still have cached mirrors available
      expect(mirrorsManager.getCachedMirrors()).toEqual(['https://cached-mirror.example.com']);
    });

    it('should handle HTTP errors', async () => {
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: false,
        status: 404
      }));

      // Should not throw an error
      await expect(mirrorsManager.updateMirrorsCache()).resolves.toBeUndefined();
    });
  });

  describe('getCommunityMirrors', () => {
    it('should return cached mirrors when cache is fresh', async () => {
      const cachedMirrors = ['https://cached-mirror.example.com'];
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
      mockConfig.communityMirrors = cachedMirrors;
      mockConfig.communityMirrorsLastUpdated = oneHourAgo;

      const result = await mirrorsManager.getCommunityMirrors();

      expect(result).toEqual(cachedMirrors);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch fresh mirrors when cache is expired', async () => {
      const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      mockConfig.communityMirrorsLastUpdated = twentyFiveHoursAgo;

      const mockMirrorsText = 'https://fresh-mirror.example.com\n';
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(mockMirrorsText)
      }));

      // Create a fresh config manager that returns updated config after save
      let callCount = 0;
      mockConfigManager.load = mock(() => {
        if (callCount === 0) {
          callCount++;
          return mockConfig;
        } else {
          return {
            ...mockConfig,
            communityMirrors: ['https://fresh-mirror.example.com'],
            communityMirrorsLastUpdated: new Date().toISOString()
          };
        }
      });

      const result = await mirrorsManager.getCommunityMirrors();

      expect(result).toEqual(['https://fresh-mirror.example.com']);
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should fetch fresh mirrors when no cache exists', async () => {
      const mockMirrorsText = 'https://new-mirror.example.com\n';
      mockFetch.mockImplementation(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(mockMirrorsText)
      }));

      // Create a fresh config manager that returns updated config after save
      let callCount = 0;
      mockConfigManager.load = mock(() => {
        if (callCount === 0) {
          callCount++;
          return mockConfig;
        } else {
          return {
            ...mockConfig,
            communityMirrors: ['https://new-mirror.example.com'],
            communityMirrorsLastUpdated: new Date().toISOString()
          };
        }
      });

      const result = await mirrorsManager.getCommunityMirrors();

      expect(result).toEqual(['https://new-mirror.example.com']);
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('getMirrorUrls', () => {
    it('should convert original URL to mirror URLs', async () => {
      const mirrors = ['https://mirror1.example.com', 'https://mirror2.example.com'];
      mockConfig.communityMirrors = mirrors;
      mockConfig.communityMirrorsLastUpdated = new Date().toISOString();

      const originalUrl = 'https://ziglang.org/download/0.11.0/zig-x86_64-linux-0.11.0.tar.xz';
      const result = await mirrorsManager.getMirrorUrls(originalUrl);

      expect(result).toEqual([
        'https://mirror1.example.com/0.11.0/zig-x86_64-linux-0.11.0.tar.xz?source=ziggy',
        'https://mirror2.example.com/0.11.0/zig-x86_64-linux-0.11.0.tar.xz?source=ziggy'
      ]);
    });

    it('should handle URLs with trailing slashes in mirrors', async () => {
      const mirrors = ['https://mirror1.example.com/', 'https://mirror2.example.com/'];
      mockConfig.communityMirrors = mirrors;
      mockConfig.communityMirrorsLastUpdated = new Date().toISOString();

      const originalUrl = 'https://ziglang.org/download/0.11.0/zig-x86_64-linux-0.11.0.tar.xz';
      const result = await mirrorsManager.getMirrorUrls(originalUrl);

      expect(result).toEqual([
        'https://mirror1.example.com/0.11.0/zig-x86_64-linux-0.11.0.tar.xz?source=ziggy',
        'https://mirror2.example.com/0.11.0/zig-x86_64-linux-0.11.0.tar.xz?source=ziggy'
      ]);
    });

    it('should return empty array when no mirrors are available', async () => {
      const originalUrl = 'https://ziglang.org/download/0.11.0/zig-x86_64-linux-0.11.0.tar.xz';
      const result = await mirrorsManager.getMirrorUrls(originalUrl);

      expect(result).toEqual([]);
    });
  });
});
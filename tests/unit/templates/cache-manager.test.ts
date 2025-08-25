/**
 * Tests for TemplateCacheManager
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { TemplateCacheManager } from '../../../src/templates/cache-manager.js';
import type { IFileSystemManager, IPlatformDetector } from '../../../src/interfaces.js';

describe('TemplateCacheManager', () => {
  let cacheManager: TemplateCacheManager;
  let mockFileSystem: IFileSystemManager;
  let mockPlatformDetector: IPlatformDetector;

  beforeEach(() => {
    // Mock file system
    mockFileSystem = {
      ensureDirectory: mock(() => {}),
      writeFile: mock(() => {}),
      readFile: mock(() => ''),
      fileExists: mock(() => false),
      listDirectory: mock(() => []),
      isFile: mock(() => true),
      safeRemove: mock(() => {}),
    } as any;

    // Mock platform detector
    mockPlatformDetector = {
      getZiggyDir: mock(() => '/home/user/.ziggy'),
    } as any;

    cacheManager = new TemplateCacheManager(mockFileSystem, mockPlatformDetector);
  });

  describe('getTemplate', () => {
    test('should return embedded fallback when cache and download fail', async () => {
      // Mock fetch to fail
      global.fetch = mock(() => Promise.reject(new Error('Network error')));
      
      const result = await cacheManager.getTemplate('barebones', 'https://example.com/');
      
      expect(result).toEqual({
        'main.zig': 'pub fn main() !void {}',
        'build.zig': expect.stringContaining('pub fn build(b: *std.Build) void {')
      });
    });

    test('should download and cache template when cache is invalid', async () => {
      // Mock successful fetch
      global.fetch = mock((url: string) => {
        if (url.includes('main.zig')) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve('pub fn main() !void {\n    // Downloaded content\n}')
          });
        }
        if (url.includes('build.zig')) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve('// Downloaded build.zig content')
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const result = await cacheManager.getTemplate('barebones', 'https://example.com/');
      
      expect(result['main.zig']).toContain('Downloaded content');
      expect(result['build.zig']).toContain('Downloaded build.zig content');
      expect(mockFileSystem.writeFile).toHaveBeenCalled();
    });

    test('should load from cache when cache is valid', async () => {
      // Mock cache exists and is valid
      mockFileSystem.fileExists = mock((path: string) => {
        return path.includes('.template-info');
      });
      
      mockFileSystem.readFile = mock((path: string) => {
        if (path.includes('.template-info')) {
          return JSON.stringify({
            cached_at: new Date().toISOString(),
            source_url: 'https://example.com/'
          });
        }
        return 'cached content';
      });

      mockFileSystem.listDirectory = mock(() => ['main.zig', 'build.zig', '.template-info']);

      const result = await cacheManager.getTemplate('barebones', 'https://example.com/');
      
      expect(result['main.zig']).toBe('cached content');
      expect(result['build.zig']).toBe('cached content');
    });
  });

  describe('clearTemplateCache', () => {
    test('should remove template cache directory', () => {
      mockFileSystem.fileExists = mock(() => true);
      
      cacheManager.clearTemplateCache('barebones');
      
      expect(mockFileSystem.safeRemove).toHaveBeenCalledWith(
        expect.stringContaining('templates'),
        true
      );
    });
  });

  describe('clearAllCaches', () => {
    test('should remove entire templates cache directory', () => {
      mockFileSystem.fileExists = mock(() => true);
      
      cacheManager.clearAllCaches();
      
      expect(mockFileSystem.safeRemove).toHaveBeenCalledWith(
        expect.stringContaining('templates'),
        true
      );
    });
  });
});
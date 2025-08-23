/**
 * Unit tests for ProjectCreator
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { ProjectCreator } from '../../../src/templates/creator.js';
import { TemplateManager } from '../../../src/templates/manager.js';
import type { IFileSystemManager } from '../../../src/interfaces.js';

// Mock FileSystemManager
const createMockFileSystemManager = (): IFileSystemManager => ({
  createDirectory: mock(() => {}),
  removeDirectory: mock(() => {}),
  createSymlink: mock(() => {}),
  copyFile: mock(() => {}),
  fileExists: mock(() => false),
  removeFile: mock(() => {}),
  writeFile: mock(() => {}),
  readFile: mock(() => 'mock file content'),
  appendFile: mock(() => {}),
  createWriteStream: mock(() => ({
    write: mock(() => {}),
    end: mock(() => {}),
    on: mock((event: string, callback: () => void) => {
      if (event === 'finish') {
        setTimeout(callback, 0);
      }
    })
  })),
  createReadStream: mock(() => ({})),
  getStats: mock(() => ({})),
  listDirectory: mock(() => ['file1.txt', 'file2.txt']),
  isDirectory: mock(() => false),
  isFile: mock(() => true),
  ensureDirectory: mock(() => {}),
  safeRemove: mock(() => {})
});

// Mock fetch globally
globalThis.fetch = mock(() => Promise.resolve({
  ok: true,
  status: 200,
  body: {
    getReader: () => ({
      read: mock(() => Promise.resolve({ done: true, value: new Uint8Array() })),
      releaseLock: mock(() => {})
    })
  }
})) as Response;

// Mock zip-lib
mock.module('zip-lib', () => ({
  extract: mock(async () => {})
}));

describe('ProjectCreator', () => {
  let projectCreator: ProjectCreator;
  let templateManager: TemplateManager;
  let mockFileSystem: IFileSystemManager;

  beforeEach(() => {
    templateManager = new TemplateManager();
    mockFileSystem = createMockFileSystemManager();
    projectCreator = new ProjectCreator(templateManager, mockFileSystem);
  });

  describe('createFromTemplate', () => {
    it('should throw error if target directory exists', async () => {
      mockFileSystem.fileExists = mock(() => true);

      await expect(
        projectCreator.createFromTemplate('standard', 'test-project', '/tmp/test')
      ).rejects.toThrow('Directory /tmp/test already exists');
    });

    it('should throw error for invalid template', async () => {
      await expect(
        projectCreator.createFromTemplate('invalid', 'test-project', '/tmp/test')
      ).rejects.toThrow("Template 'invalid' not found");
    });

    it('should create lean project successfully', async () => {
      const onProgress = mock(() => {});
      
      await projectCreator.createFromTemplate('lean', 'test-project', '/tmp/test', onProgress);

      // Verify directory creation
      expect(mockFileSystem.createDirectory).toHaveBeenCalledTimes(2);
      
      // Verify file creation
      expect(mockFileSystem.writeFile).toHaveBeenCalledTimes(3); // build.zig, main.zig, README.md

      // Verify file creation
      expect(mockFileSystem.writeFile).toHaveBeenCalledTimes(3); // build.zig, main.zig, README.md
      
      // Verify progress callbacks
      expect(onProgress).toHaveBeenCalledWith('Creating lean project structure...');
      expect(onProgress).toHaveBeenCalledWith('Lean project created successfully!');
    });

    it('should create standard project from remote template', async () => {
      const onProgress = mock(() => {});
      
      // Mock successful extraction
      mockFileSystem.listDirectory = mock((path: string) => {
        if (path.includes('zig-app-template-master')) {
          return ['build.zig', 'src', 'README.md'];
        }
        return [];
      });
      
      // Mock fileExists to return true for extracted directory
      mockFileSystem.fileExists = mock((path: string) => {
        return path.includes('zig-app-template-master') || path.includes('.tmp');
      });

      await projectCreator.createFromTemplate('standard', 'test-project', '/tmp/test', onProgress);

      // Verify fetch was called
      expect(globalThis.fetch).toHaveBeenCalled();
      
      // Verify progress callbacks
      expect(onProgress).toHaveBeenCalledWith('Downloading template...');
      expect(onProgress).toHaveBeenCalledWith('Extracting template...');
      expect(onProgress).toHaveBeenCalledWith('Setting up project...');
    });
  });

  describe('lean project creation', () => {
    it('should create proper build.zig content', async () => {
      await projectCreator.createFromTemplate('lean', 'my-app', '/tmp/test');

      const writeFileCalls = (mockFileSystem.writeFile as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const buildZigCall = writeFileCalls.find((call: unknown[]) => (call[0] as string).endsWith('build.zig'));
      
      expect(buildZigCall).toBeDefined();
      expect(buildZigCall[1]).toContain('my-app');
      expect(buildZigCall[1]).toContain('src/main.zig');
      expect(buildZigCall[1]).toContain('pub fn build');
    });

    it('should create proper main.zig content', async () => {
      await projectCreator.createFromTemplate('lean', 'my-app', '/tmp/test');

      const writeFileCalls = (mockFileSystem.writeFile as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const mainZigCall = writeFileCalls.find((call: unknown[]) => (call[0] as string).endsWith('main.zig'));
      
      expect(mainZigCall).toBeDefined();
      expect(mainZigCall[1]).toContain('Hello, {s}!\\n", .{"my-app"}');
      expect(mainZigCall[1]).toContain('pub fn main');
      expect(mainZigCall[1]).toContain('test "simple test"');
    });

    it('should create proper README.md content', async () => {
      await projectCreator.createFromTemplate('lean', 'my-app', '/tmp/test');

      const writeFileCalls = (mockFileSystem.writeFile as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const readmeCall = writeFileCalls.find((call: unknown[]) => (call[0] as string).endsWith('README.md'));
      
      expect(readmeCall).toBeDefined();
      expect(readmeCall[1]).toContain('# my-app');
      expect(readmeCall[1]).toContain('zig build');
      expect(readmeCall[1]).toContain('zig build run');
      expect(readmeCall[1]).toContain('zig build test');
    });
  });

  describe('error handling', () => {
    it('should clean up on download failure', async () => {
      globalThis.fetch = mock(() => Promise.resolve({
        ok: false,
        status: 404
      })) as Response;

      mockFileSystem.fileExists = mock((path: string) => {
        // Simulate directory was created but extracted dir not found
        return path === '/tmp/test' || path.includes('.tmp');
      });

      await expect(
        projectCreator.createFromTemplate('standard', 'test-project', '/tmp/test')
      ).rejects.toThrow('Failed to download template');

      // Verify cleanup was attempted
      expect(mockFileSystem.safeRemove).toHaveBeenCalled();
    });

    it('should handle fetch stream errors gracefully', async () => {
      globalThis.fetch = mock(() => Promise.resolve({
        ok: true,
        status: 200,
        body: null // No body
      })) as Response;

      await expect(
        projectCreator.createFromTemplate('standard', 'test-project', '/tmp/test')
      ).rejects.toThrow('Failed to get response stream');
    });
  });

  describe('initializeProject', () => {
    it('should complete without errors', async () => {
      await expect(
        projectCreator.initializeProject('/tmp/test')
      ).resolves.toBeUndefined();
    });
  });
});
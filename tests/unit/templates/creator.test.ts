/**
 * Unit tests for ProjectCreator
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { ProjectCreator } from '../../../src/templates/creator.js';
import { TemplateManager } from '../../../src/templates/manager.js';
import type { IFileSystemManager, IPlatformDetector } from '../../../src/interfaces.js';

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

// Mock PlatformDetector
const createMockPlatformDetector = (): IPlatformDetector => ({
  getPlatform: mock(() => 'linux'),
  getArch: mock(() => 'x64'),
  getZiggyDir: mock(() => '/home/user/.ziggy'),
  getShell: mock(() => 'bash'),
  getShellConfigFile: mock(() => '/home/user/.bashrc'),
  getPathSeparator: mock(() => ':'),
  getExecutableExtension: mock(() => ''),
  getTempDir: mock(() => '/tmp'),
  getHomeDir: mock(() => '/home/user'),
  isWindows: mock(() => false),
  isMacOS: mock(() => false),
  isLinux: mock(() => true)
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
  let mockPlatformDetector: IPlatformDetector;

  beforeEach(() => {
    templateManager = new TemplateManager();
    mockFileSystem = createMockFileSystemManager();
    mockPlatformDetector = createMockPlatformDetector();
    projectCreator = new ProjectCreator(templateManager, mockFileSystem, mockPlatformDetector);
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

    it('should create minimal project successfully', async () => {
      const onProgress = mock(() => {});
      
      await projectCreator.createFromTemplate('minimal', 'test-project', '/tmp/test', onProgress);

      // Verify directory creation
      expect(mockFileSystem.createDirectory).toHaveBeenCalledTimes(2);
      
      // Verify file creation (build.zig, main.zig, README.md, .gitignore, potentially build.zig.zon)
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.gitignore'),
        expect.any(String)
      );
      
      // Verify progress callbacks
      expect(onProgress).toHaveBeenCalledWith('Creating minimal project structure...');
      expect(onProgress).toHaveBeenCalledWith('Minimal project created successfully!');
    });

    it('should create barebones project from cached template', async () => {
      const onProgress = mock(() => {});
      
      // Mock cache manager to return embedded template
      mockFileSystem.fileExists = mock((path: string) => {
        // Return false for cache to trigger embedded fallback
        return false;
      });

      await projectCreator.createFromTemplate('barebones', 'test-project', '/tmp/test', onProgress);

      // Verify directory creation (use expect.stringContaining for cross-platform paths)
      expect(mockFileSystem.createDirectory).toHaveBeenCalledWith(expect.stringContaining('test'), true);
      
      // Verify progress callbacks
      expect(onProgress).toHaveBeenCalledWith('Setting up cached template project...');
      expect(onProgress).toHaveBeenCalledWith('Cached project created successfully!');
    });
  });

  describe('minimal project creation', () => {
    it('should create proper build.zig content', async () => {
      await projectCreator.createFromTemplate('minimal', 'my-app', '/tmp/test');

      const writeFileCalls = (mockFileSystem.writeFile as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const buildZigCall = writeFileCalls.find((call: unknown[]) => (call[0] as string).endsWith('build.zig'));
      
      expect(buildZigCall).toBeDefined();
      expect(buildZigCall[1]).toContain('my-app');
      expect(buildZigCall[1]).toContain('src/main.zig');
      expect(buildZigCall[1]).toContain('pub fn build');
    });

    it('should create proper main.zig content', async () => {
      await projectCreator.createFromTemplate('minimal', 'my-app', '/tmp/test');

      const writeFileCalls = (mockFileSystem.writeFile as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      const mainZigCall = writeFileCalls.find((call: unknown[]) => (call[0] as string).endsWith('main.zig'));
      
      expect(mainZigCall).toBeDefined();
      expect(mainZigCall[1]).toContain('Hello, {s}!\\n", .{"my-app"}');
      expect(mainZigCall[1]).toContain('pub fn main');
      expect(mainZigCall[1]).toContain('test "simple test"');
    });

    it('should create proper README.md content', async () => {
      await projectCreator.createFromTemplate('minimal', 'my-app', '/tmp/test');

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
    it('should clean up on cached project creation failure', async () => {
      // Mock cache manager to throw error and no embedded fallback
      mockFileSystem.fileExists = mock((path: string) => {
        if (path.includes('/tmp/test')) {
          return true; // Directory exists, should trigger cleanup
        }
        return false;
      });

      // Mock template manager to return invalid template
      const invalidTemplate = {
        name: 'invalid-cached',
        displayName: 'Invalid Cached',
        description: 'Invalid template',
        type: 'cached' as const,
        cacheUrl: undefined // No cache URL should cause error
      };
      
      templateManager.getTemplateInfo = mock(() => invalidTemplate);

      await expect(
        projectCreator.createFromTemplate('invalid-cached', 'test-project', '/tmp/test')
      ).rejects.toThrow('No cache URL configured');
    });

    it('should handle invalid template type', async () => {
      const invalidTemplate = {
        name: 'invalid-type',
        displayName: 'Invalid Type',
        description: 'Invalid template type',
        type: 'unknown' as any
      };
      
      templateManager.getTemplateInfo = mock(() => invalidTemplate);

      await expect(
        projectCreator.createFromTemplate('invalid-type', 'test-project', '/tmp/test')
      ).rejects.toThrow('Unsupported template type: unknown');
    });
  });

  describe('initializeProject', () => {
    it('should complete without errors', async () => {
      await expect(
        projectCreator.initializeProject('/tmp/test')
      ).resolves.toBeUndefined();
    });
  });

  describe('.gitignore generation', () => {
    it('should create .gitignore file for minimal template', async () => {
      await projectCreator.createFromTemplate('minimal', 'test-project', '/tmp/test');

      // Verify .gitignore file is created
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.gitignore'),
        expect.stringContaining('.zig-cache/')
      );
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.gitignore'),
        expect.stringContaining('zig-out/')
      );
    });

    it('should create .gitignore file for barebones template', async () => {
      await projectCreator.createFromTemplate('barebones', 'test-project', '/tmp/test');

      // Verify .gitignore file is created with correct content
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.gitignore'),
        expect.stringContaining('.zig-cache/')
      );
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.gitignore'),
        expect.stringContaining('zig-out/')
      );
    });

    it('should not overwrite existing .gitignore file', async () => {
      // Mock existing .gitignore file
      mockFileSystem.fileExists = mock((path: string) => {
        return path.includes('.gitignore');
      });

      await projectCreator.createFromTemplate('minimal', 'test-project', '/tmp/test');

      // Verify .gitignore is not written when it already exists
      const gitignoreWrites = (mockFileSystem.writeFile as any).mock.calls.filter(
        (call: any[]) => call[0].includes('.gitignore')
      );
      expect(gitignoreWrites).toHaveLength(0);
    });
  });
});
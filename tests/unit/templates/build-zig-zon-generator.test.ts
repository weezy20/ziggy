/**
 * Unit tests for BuildZigZonGenerator
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { BuildZigZonGenerator } from '../../../src/templates/build-zig-zon-generator.js';
import type { IFileSystemManager, IPlatformDetector } from '../../../src/interfaces.js';

// Mock FileSystemManager
const createMockFileSystemManager = (): IFileSystemManager => ({
  createDirectory: mock(() => {}),
  removeDirectory: mock(() => {}),
  createSymlink: mock(() => {}),
  copyFile: mock(() => {}),
  fileExists: mock(() => true),
  removeFile: mock(() => {}),
  writeFile: mock(() => {}),
  readFile: mock(() => '{"activeVersion": "0.13.0"}'),
  appendFile: mock(() => {}),
  createWriteStream: mock(() => ({})),
  createReadStream: mock(() => ({})),
  getStats: mock(() => ({})),
  listDirectory: mock(() => []),
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

describe('BuildZigZonGenerator', () => {
  let generator: BuildZigZonGenerator;
  let mockFileSystem: IFileSystemManager;
  let mockPlatformDetector: IPlatformDetector;

  beforeEach(() => {
    mockFileSystem = createMockFileSystemManager();
    mockPlatformDetector = createMockPlatformDetector();
    generator = new BuildZigZonGenerator(mockFileSystem, mockPlatformDetector);
  });

  describe('generateForProject', () => {
    it('should generate build.zig.zon with active Zig version', async () => {
      await generator.generateForProject('/tmp/test-project', 'test-project');

      // Verify file was written
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('build.zig.zon'),
        expect.stringContaining('.name = "test-project"')
      );

      // Verify content includes version and fingerprint
      const writeCall = (mockFileSystem.writeFile as any).mock.calls[0];
      const content = writeCall[1];
      expect(content).toContain('.version = "0.0.1"');
      expect(content).toContain('.minimum_zig_version = "0.13.0"');
      expect(content).toContain('.fingerprint = 0x');
    });

    it('should skip generation when no active Zig version', async () => {
      mockFileSystem.fileExists = mock(() => false); // No config file

      await generator.generateForProject('/tmp/test-project', 'test-project');

      // Verify no file was written
      expect(mockFileSystem.writeFile).not.toHaveBeenCalled();
    });

    it('should generate different fingerprints for different project names', async () => {
      const generator1 = new BuildZigZonGenerator(mockFileSystem, mockPlatformDetector);
      const generator2 = new BuildZigZonGenerator(mockFileSystem, mockPlatformDetector);

      await generator1.generateForProject('/tmp/project1', 'project1');
      await generator2.generateForProject('/tmp/project2', 'project2');

      const calls = (mockFileSystem.writeFile as any).mock.calls;
      expect(calls).toHaveLength(2);

      const content1 = calls[0][1];
      const content2 = calls[1][1];

      // Extract fingerprints
      const fingerprint1 = content1.match(/\.fingerprint = (0x[a-f0-9]+)/)?.[1];
      const fingerprint2 = content2.match(/\.fingerprint = (0x[a-f0-9]+)/)?.[1];

      expect(fingerprint1).toBeDefined();
      expect(fingerprint2).toBeDefined();
      expect(fingerprint1).not.toBe(fingerprint2);
    });
  });
});
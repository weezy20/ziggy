/**
 * Unit tests for ZigInitHandler
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { ZigInitHandler } from '../../../src/templates/zig-init-handler.js';
import type { IPlatformDetector, IFileSystemManager } from '../../../src/interfaces.js';

describe('ZigInitHandler', () => {
  let zigInitHandler: ZigInitHandler;
  let mockPlatformDetector: IPlatformDetector;
  let mockFileSystemManager: IFileSystemManager;

  beforeEach(() => {
    mockPlatformDetector = {
      getOS: mock(() => 'linux'),
      getZiggyDir: mock(() => '/home/user/.ziggy'),
      getPlatform: mock(() => 'linux'),
      getArch: mock(() => 'x64'),
      isWindows: mock(() => false),
      isMacOS: mock(() => false),
      isLinux: mock(() => true)
    };

    mockFileSystemManager = {
      fileExists: mock(() => true),
      ensureDirectory: mock(() => {}),
      readFile: mock(() => ''),
      writeFile: mock(() => {}),
      copyFile: mock(() => {}),
      deleteFile: mock(() => {}),
      createSymlink: mock(() => {}),
      readDirectory: mock(() => []),
      isDirectory: mock(() => false),
      getFileStats: mock(() => ({ size: 0, mtime: new Date() }))
    };

    zigInitHandler = new ZigInitHandler(mockPlatformDetector, mockFileSystemManager);
  });

  describe('findZigExecutable', () => {
    test('should find zig executable in PATH on Linux', () => {
      // Mock Bun.spawnSync to simulate successful 'which zig' command
      const originalSpawnSync = Bun.spawnSync;
      Bun.spawnSync = mock(() => ({
        exitCode: 0,
        stdout: Buffer.from('/usr/bin/zig\n'),
        stderr: Buffer.from('')
      })) as any;

      const result = zigInitHandler.findZigExecutable();
      expect(result).toBe('/usr/bin/zig');

      // Restore original function
      Bun.spawnSync = originalSpawnSync;
    });

    test('should find zig.exe executable on Windows', () => {
      mockPlatformDetector.getOS = mock(() => 'win32');
      
      // Mock Bun.spawnSync to simulate successful 'where zig' command
      const originalSpawnSync = Bun.spawnSync;
      Bun.spawnSync = mock(() => ({
        exitCode: 0,
        stdout: Buffer.from('C:\\Users\\user\\.ziggy\\bin\\zig.exe\n'),
        stderr: Buffer.from('')
      })) as any;

      const result = zigInitHandler.findZigExecutable();
      expect(result).toBe('C:\\Users\\user\\.ziggy\\bin\\zig.exe');

      // Restore original function
      Bun.spawnSync = originalSpawnSync;
    });

    test('should return null when zig is not found', () => {
      // Mock Bun.spawnSync to simulate failed command
      const originalSpawnSync = Bun.spawnSync;
      Bun.spawnSync = mock(() => ({
        exitCode: 1,
        stdout: Buffer.from(''),
        stderr: Buffer.from('zig not found')
      })) as any;

      mockFileSystemManager.fileExists = mock(() => false);

      const result = zigInitHandler.findZigExecutable();
      expect(result).toBe(null);

      // Restore original function
      Bun.spawnSync = originalSpawnSync;
    });
  });

  describe('validateZigInstallation', () => {
    test('should return true for valid zig installation', async () => {
      // Mock findZigExecutable to return a path
      zigInitHandler.findZigExecutable = mock(() => '/usr/bin/zig');

      // Mock Bun.spawnSync to simulate successful 'zig version' command
      const originalSpawnSync = Bun.spawnSync;
      Bun.spawnSync = mock(() => ({
        exitCode: 0,
        stdout: Buffer.from('0.11.0\n'),
        stderr: Buffer.from('')
      })) as any;

      const result = await zigInitHandler.validateZigInstallation();
      expect(result).toBe(true);

      // Restore original function
      Bun.spawnSync = originalSpawnSync;
    });

    test('should return false when zig is not found', async () => {
      zigInitHandler.findZigExecutable = mock(() => null);

      const result = await zigInitHandler.validateZigInstallation();
      expect(result).toBe(false);
    });
  });

  describe('executeZigInit', () => {
    test('should return error when zig is not found', async () => {
      zigInitHandler.findZigExecutable = mock(() => null);

      const result = await zigInitHandler.executeZigInit({
        targetPath: '/tmp/test-project'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Zig executable not found');
    });

    test('should return error when zig installation is invalid', async () => {
      zigInitHandler.findZigExecutable = mock(() => '/usr/bin/zig');
      zigInitHandler.validateZigInstallation = mock(async () => false);

      const result = await zigInitHandler.executeZigInit({
        targetPath: '/tmp/test-project'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Zig installation appears to be corrupted');
    });

    test('should call progress callback during execution', async () => {
      zigInitHandler.findZigExecutable = mock(() => '/usr/bin/zig');
      zigInitHandler.validateZigInstallation = mock(async () => true);

      const progressMessages: string[] = [];
      const onProgress = (message: string) => {
        progressMessages.push(message);
      };

      // Mock the private executeCommand method to return success
      (zigInitHandler as any).executeCommand = mock(async () => ({
        success: true,
        output: 'Project initialized successfully'
      }));

      await zigInitHandler.executeZigInit({
        targetPath: '/tmp/test-project',
        flags: ['-m']
      }, onProgress);

      expect(progressMessages.length).toBeGreaterThan(0);
      expect(progressMessages).toContain('Locating Zig executable...');
      expect(progressMessages).toContain('Validating Zig installation...');
      expect(progressMessages).toContain('Preparing project directory...');
    });
  });

  describe('getErrorSuggestion', () => {
    test('should provide helpful suggestion for "not found" errors', () => {
      const error = 'zig: command not found';
      const suggestion = zigInitHandler.getErrorSuggestion(error);
      
      expect(suggestion).toContain('Zig executable not found');
      expect(suggestion).toContain('ziggy use <version>');
      expect(suggestion).toContain('ziggy list');
    });

    test('should provide helpful suggestion for permission errors', () => {
      const error = 'Permission denied';
      const suggestion = zigInitHandler.getErrorSuggestion(error);
      
      expect(suggestion).toContain('Permission denied');
      expect(suggestion).toContain('Check directory permissions');
    });

    test('should provide generic suggestion for unknown errors', () => {
      const error = 'Some unknown error occurred';
      const suggestion = zigInitHandler.getErrorSuggestion(error);
      
      expect(suggestion).toContain('Zig init failed');
      expect(suggestion).toContain('zig version');
    });
  });
});
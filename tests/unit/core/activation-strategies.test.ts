/**
 * Unit tests for Activation Strategies
 * 
 * Tests the platform-specific activation strategy pattern including
 * symlink strategy for Unix systems and Windows extraction strategy.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import {
  SymlinkActivationStrategy,
  WindowsActivationStrategy,
  ActivationStrategyFactory,
  type IActivationStrategy
} from '../../../src/core/activation-strategies.js';
import type { IFileSystemManager } from '../../../src/interfaces.js';
import type { IWindowsActivationManager } from '../../../src/core/windows-activation.js';

// Mock implementations
class MockFileSystemManager implements IFileSystemManager {
  private files = new Map<string, string>();
  private directories = new Set<string>();
  public createSymlinkCalled = false;
  public symlinkTarget = '';
  public symlinkLink = '';

  // Core interface methods
  createDirectory(path: string, recursive?: boolean): void {
    const normalizedPath = path.replace(/\\/g, '/');
    this.directories.add(normalizedPath);
  }

  removeDirectory(path: string, force?: boolean): void {
    this.directories.delete(path);
  }

  createSymlink(target: string, link: string, platform?: string): void {
    this.createSymlinkCalled = true;
    this.symlinkTarget = target.replace(/\\/g, '/');
    this.symlinkLink = link.replace(/\\/g, '/');
    const normalizedLink = link.replace(/\\/g, '/');
    this.files.set(normalizedLink, `symlink:${target}`);
  }

  copyFile(source: string, destination: string): void {
    const content = this.files.get(source);
    if (!content) throw new Error(`Source file does not exist: ${source}`);
    this.files.set(destination, content);
  }

  fileExists(path: string): boolean {
    const normalizedPath = path.replace(/\\/g, '/');
    return this.files.has(normalizedPath) || this.directories.has(normalizedPath);
  }

  removeFile(path: string): void {
    this.files.delete(path);
  }

  writeFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  readFile(path: string): string {
    const content = this.files.get(path);
    if (!content) throw new Error(`File does not exist: ${path}`);
    return content;
  }

  appendFile(path: string, content: string): void {
    const existing = this.files.get(path) || '';
    this.files.set(path, existing + content);
  }

  createWriteStream(path: string): any {
    return { write: () => {}, end: () => {} };
  }

  createReadStream(path: string): any {
    return { on: () => {} };
  }

  getStats(path: string): { size: number; isFile(): boolean; isDirectory(): boolean } {
    return {
      size: 1024,
      isFile: () => this.files.has(path),
      isDirectory: () => this.directories.has(path)
    };
  }

  listDirectory(path: string): string[] {
    const items: string[] = [];
    const normalizedPath = path.replace(/\\/g, '/');
    
    // Add direct child directories
    for (const dir of this.directories) {
      const normalizedDir = dir.replace(/\\/g, '/');
      if (normalizedDir.startsWith(normalizedPath + '/') && !normalizedDir.substring(normalizedPath.length + 1).includes('/')) {
        items.push(normalizedDir.substring(normalizedPath.length + 1));
      }
    }
    
    // Add direct child files
    for (const [filePath] of this.files) {
      const normalizedFilePath = filePath.replace(/\\/g, '/');
      if (normalizedFilePath.startsWith(normalizedPath + '/') && !normalizedFilePath.substring(normalizedPath.length + 1).includes('/')) {
        items.push(normalizedFilePath.substring(normalizedPath.length + 1));
      }
    }
    
    return items;
  }

  isDirectory(path: string): boolean {
    const normalizedPath = path.replace(/\\/g, '/');
    return this.directories.has(normalizedPath);
  }

  isFile(path: string): boolean {
    const normalizedPath = path.replace(/\\/g, '/');
    return this.files.has(normalizedPath);
  }

  ensureDirectory(path: string): void {
    const normalizedPath = path.replace(/\\/g, '/');
    if (!this.directories.has(normalizedPath)) {
      this.createDirectory(path);
    }
  }

  safeRemove(path: string, recursive?: boolean): void {
    if (this.directories.has(path)) {
      this.removeDirectory(path, true);
    } else if (this.files.has(path)) {
      this.removeFile(path);
    }
  }

  // Additional methods for Windows operations
  async copyDirectoryRecursive(source: string, destination: string): Promise<void> {
    // Mock implementation
  }

  createTempDirectory(prefix?: string): string {
    const tempPath = `/temp/${prefix || 'temp'}-${Date.now()}`;
    this.createDirectory(tempPath);
    return tempPath;
  }

  moveDirectory(source: string, destination: string): void {
    // Mock implementation
  }

  // Test helper methods
  addFile(path: string, content: string = 'test content'): void {
    const normalizedPath = path.replace(/\\/g, '/');
    this.files.set(normalizedPath, content);
  }

  addDirectory(path: string): void {
    const normalizedPath = path.replace(/\\/g, '/');
    this.directories.add(normalizedPath);
  }

  clear(): void {
    this.files.clear();
    this.directories.clear();
    this.createSymlinkCalled = false;
    this.symlinkTarget = '';
    this.symlinkLink = '';
  }
}

class MockWindowsActivationManager implements IWindowsActivationManager {
  public activateVersionCalled = false;
  public activatedVersion = '';
  public activatedInstallPath = '';
  public activatedBinDir = '';
  public shouldThrow = false;

  async activateVersion(version: string, installPath: string, binDir: string): Promise<void> {
    this.activateVersionCalled = true;
    this.activatedVersion = version;
    this.activatedInstallPath = installPath;
    this.activatedBinDir = binDir;

    if (this.shouldThrow) {
      throw new Error('Mock activation failed');
    }
  }

  async createBackup(binDir: string): Promise<string> {
    return '/mock/backup/path';
  }

  async restoreBackup(backupPath: string, binDir: string): Promise<void> {
    // Mock implementation
  }

  async extractInstallation(installPath: string, binDir: string): Promise<void> {
    // Mock implementation
  }

  cleanupBackup(backupPath: string): void {
    // Mock implementation
  }

  clear(): void {
    this.activateVersionCalled = false;
    this.activatedVersion = '';
    this.activatedInstallPath = '';
    this.activatedBinDir = '';
    this.shouldThrow = false;
  }
}

describe('SymlinkActivationStrategy', () => {
  let mockFileSystemManager: MockFileSystemManager;
  let symlinkStrategy: IActivationStrategy;
  let binDir: string;

  beforeEach(() => {
    mockFileSystemManager = new MockFileSystemManager();
    symlinkStrategy = new SymlinkActivationStrategy(mockFileSystemManager, 'linux');
    binDir = '/test/ziggy/bin';
  });

  afterEach(() => {
    mockFileSystemManager.clear();
  });

  describe('activate', () => {
    it('should create symlink for system Zig version', async () => {
      const systemZigPath = '/usr/bin/zig';
      mockFileSystemManager.addFile(systemZigPath, 'system zig');

      await symlinkStrategy.activate(systemZigPath, 'system', binDir);

      expect(mockFileSystemManager.createSymlinkCalled).toBe(true);
      expect(mockFileSystemManager.symlinkTarget).toBe(systemZigPath);
      expect(mockFileSystemManager.symlinkLink).toBe(join(binDir, 'zig').replace(/\\/g, '/'));
    });

    it('should create symlink for direct zig binary in installation', async () => {
      const installPath = '/test/ziggy/versions/0.11.0';
      const zigBinary = join(installPath, 'zig');
      mockFileSystemManager.addDirectory(installPath);
      mockFileSystemManager.addFile(zigBinary, 'zig binary');

      await symlinkStrategy.activate(installPath, '0.11.0', binDir);

      expect(mockFileSystemManager.createSymlinkCalled).toBe(true);
      expect(mockFileSystemManager.symlinkTarget).toBe(zigBinary.replace(/\\/g, '/'));
      expect(mockFileSystemManager.symlinkLink).toBe(join(binDir, 'zig').replace(/\\/g, '/'));
    });

    it('should create symlink for zig binary in extracted subdirectory', async () => {
      const installPath = '/test/ziggy/versions/0.11.0';
      const extractedDir = 'zig-linux-x86_64-0.11.0';
      const zigBinary = join(installPath, extractedDir, 'zig');
      
      mockFileSystemManager.addDirectory(installPath);
      mockFileSystemManager.addDirectory(join(installPath, extractedDir));
      mockFileSystemManager.addFile(zigBinary, 'zig binary');

      await symlinkStrategy.activate(installPath, '0.11.0', binDir);

      expect(mockFileSystemManager.createSymlinkCalled).toBe(true);
      expect(mockFileSystemManager.symlinkTarget).toBe(zigBinary.replace(/\\/g, '/'));
      expect(mockFileSystemManager.symlinkLink).toBe(join(binDir, 'zig').replace(/\\/g, '/'));
    });

    it('should throw error if zig binary not found', async () => {
      const installPath = '/test/ziggy/versions/0.11.0';
      mockFileSystemManager.addDirectory(installPath);

      await expect(symlinkStrategy.activate(installPath, '0.11.0', binDir))
        .rejects.toThrow('Zig binary not found');
    });

    it('should ensure bin directory exists before creating symlink', async () => {
      const systemZigPath = '/usr/bin/zig';
      mockFileSystemManager.addFile(systemZigPath, 'system zig');

      await symlinkStrategy.activate(systemZigPath, 'system', binDir);

      expect(mockFileSystemManager.fileExists(binDir)).toBe(true);
      expect(mockFileSystemManager.createSymlinkCalled).toBe(true);
    });

    it('should handle symlink creation failure', async () => {
      const systemZigPath = '/usr/bin/zig';
      mockFileSystemManager.addFile(systemZigPath, 'system zig');

      // Mock createSymlink to throw error
      const originalCreateSymlink = mockFileSystemManager.createSymlink;
      mockFileSystemManager.createSymlink = () => {
        throw new Error('Symlink creation failed');
      };

      await expect(symlinkStrategy.activate(systemZigPath, 'system', binDir))
        .rejects.toThrow('Failed to create symlink for Zig system');

      // Restore original method
      mockFileSystemManager.createSymlink = originalCreateSymlink;
    });
  });
});

describe('WindowsActivationStrategy', () => {
  let mockWindowsActivationManager: MockWindowsActivationManager;
  let windowsStrategy: IActivationStrategy;
  let binDir: string;
  let installPath: string;

  beforeEach(() => {
    mockWindowsActivationManager = new MockWindowsActivationManager();
    windowsStrategy = new WindowsActivationStrategy(mockWindowsActivationManager);
    binDir = '/test/ziggy/bin';
    installPath = '/test/ziggy/versions/0.11.0';
  });

  afterEach(() => {
    mockWindowsActivationManager.clear();
  });

  describe('activate', () => {
    it('should delegate to WindowsActivationManager for regular versions', async () => {
      await windowsStrategy.activate(installPath, '0.11.0', binDir);

      expect(mockWindowsActivationManager.activateVersionCalled).toBe(true);
      expect(mockWindowsActivationManager.activatedVersion).toBe('0.11.0');
      expect(mockWindowsActivationManager.activatedInstallPath).toBe(installPath);
      expect(mockWindowsActivationManager.activatedBinDir).toBe(binDir);
    });

    it('should throw error for system version', async () => {
      await expect(windowsStrategy.activate('/usr/bin/zig', 'system', binDir))
        .rejects.toThrow('System Zig activation not supported with Windows extraction strategy');
    });

    it('should propagate errors from WindowsActivationManager', async () => {
      mockWindowsActivationManager.shouldThrow = true;

      await expect(windowsStrategy.activate(installPath, '0.11.0', binDir))
        .rejects.toThrow('Mock activation failed');
    });
  });
});

describe('ActivationStrategyFactory', () => {
  let mockFileSystemManager: MockFileSystemManager;
  let mockWindowsActivationManager: MockWindowsActivationManager;

  beforeEach(() => {
    mockFileSystemManager = new MockFileSystemManager();
    mockWindowsActivationManager = new MockWindowsActivationManager();
  });

  afterEach(() => {
    mockFileSystemManager.clear();
    mockWindowsActivationManager.clear();
  });

  describe('createStrategy', () => {
    it('should create WindowsActivationStrategy for Windows platform', () => {
      const strategy = ActivationStrategyFactory.createStrategy(
        'windows',
        mockFileSystemManager,
        mockWindowsActivationManager
      );

      expect(strategy).toBeInstanceOf(WindowsActivationStrategy);
    });

    it('should create SymlinkActivationStrategy for Linux platform', () => {
      const strategy = ActivationStrategyFactory.createStrategy(
        'linux',
        mockFileSystemManager
      );

      expect(strategy).toBeInstanceOf(SymlinkActivationStrategy);
    });

    it('should create SymlinkActivationStrategy for macOS platform', () => {
      const strategy = ActivationStrategyFactory.createStrategy(
        'macos',
        mockFileSystemManager
      );

      expect(strategy).toBeInstanceOf(SymlinkActivationStrategy);
    });

    it('should create SymlinkActivationStrategy for unknown platform', () => {
      const strategy = ActivationStrategyFactory.createStrategy(
        'unknown',
        mockFileSystemManager
      );

      expect(strategy).toBeInstanceOf(SymlinkActivationStrategy);
    });

    it('should throw error if WindowsActivationManager not provided for Windows', () => {
      expect(() => ActivationStrategyFactory.createStrategy('windows', mockFileSystemManager))
        .toThrow('WindowsActivationManager is required for Windows platform');
    });
  });
});
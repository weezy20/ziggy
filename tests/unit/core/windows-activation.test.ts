/**
 * Unit tests for Windows Activation Manager
 * 
 * Tests the Windows-specific activation logic including backup, extraction,
 * and rollback capabilities.
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { join } from 'path';
import { WindowsActivationManager, WindowsActivationError, type IWindowsActivationManager } from '../../../src/core/windows-activation.js';
import type { IFileSystemManager, IArchiveExtractor } from '../../../src/interfaces.js';

// Mock implementations
class MockFileSystemManager implements IFileSystemManager {
  private files = new Map<string, string>();
  private directories = new Set<string>();

  // Core interface methods
  createDirectory(path: string, recursive?: boolean): void {
    const normalizedPath = path.replace(/\\/g, '/');
    this.directories.add(normalizedPath);
  }

  removeDirectory(path: string, force?: boolean): void {
    const normalizedPath = path.replace(/\\/g, '/');
    this.directories.delete(normalizedPath);
    // Remove all files in directory
    for (const [filePath] of this.files) {
      const normalizedFilePath = filePath.replace(/\\/g, '/');
      if (normalizedFilePath.startsWith(normalizedPath)) {
        this.files.delete(filePath);
      }
    }
  }

  createSymlink(target: string, link: string, platform?: string): void {
    this.files.set(link, `symlink:${target}`);
  }

  copyFile(source: string, destination: string): void {
    const normalizedSource = source.replace(/\\/g, '/');
    const normalizedDest = destination.replace(/\\/g, '/');
    const content = this.files.get(normalizedSource);
    if (!content) throw new Error(`Source file does not exist: ${source}`);
    this.files.set(normalizedDest, content);
  }

  fileExists(path: string): boolean {
    const normalizedPath = path.replace(/\\/g, '/');
    return this.files.has(normalizedPath) || this.directories.has(normalizedPath);
  }

  removeFile(path: string): void {
    const normalizedPath = path.replace(/\\/g, '/');
    this.files.delete(normalizedPath);
  }

  writeFile(path: string, content: string): void {
    const normalizedPath = path.replace(/\\/g, '/');
    this.files.set(normalizedPath, content);
  }

  readFile(path: string): string {
    const normalizedPath = path.replace(/\\/g, '/');
    const content = this.files.get(normalizedPath);
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
    if (!this.directories.has(path)) {
      this.createDirectory(path);
    }
  }

  safeRemove(path: string, recursive?: boolean): void {
    const normalizedPath = path.replace(/\\/g, '/');
    if (this.directories.has(normalizedPath)) {
      this.removeDirectory(path, true);
    } else if (this.files.has(normalizedPath)) {
      this.removeFile(path);
    }
  }

  // Additional methods for Windows operations
  async copyDirectoryRecursive(source: string, destination: string): Promise<void> {
    const normalizedSource = source.replace(/\\/g, '/');
    const normalizedDest = destination.replace(/\\/g, '/');
    
    if (!this.directories.has(normalizedSource)) {
      throw new Error(`Source directory does not exist: ${source}`);
    }
    
    this.createDirectory(normalizedDest);
    
    // Copy all files and subdirectories
    for (const [filePath, content] of this.files) {
      const normalizedFilePath = filePath.replace(/\\/g, '/');
      if (normalizedFilePath.startsWith(normalizedSource + '/')) {
        const relativePath = normalizedFilePath.substring(normalizedSource.length + 1);
        const destPath = join(normalizedDest, relativePath).replace(/\\/g, '/');
        this.files.set(destPath, content);
      }
    }
    
    for (const dir of this.directories) {
      const normalizedDir = dir.replace(/\\/g, '/');
      if (normalizedDir.startsWith(normalizedSource + '/')) {
        const relativePath = normalizedDir.substring(normalizedSource.length + 1);
        const destPath = join(normalizedDest, relativePath).replace(/\\/g, '/');
        this.directories.add(destPath);
      }
    }
  }

  createTempDirectory(prefix?: string): string {
    const tempPath = `/temp/${prefix || 'temp'}-${Date.now()}`;
    this.createDirectory(tempPath);
    return tempPath;
  }

  moveDirectory(source: string, destination: string): void {
    if (!this.directories.has(source)) {
      throw new Error(`Source directory does not exist: ${source}`);
    }
    
    // Move directory
    this.directories.delete(source);
    this.directories.add(destination);
    
    // Move all files
    const filesToMove = new Map<string, string>();
    for (const [filePath, content] of this.files) {
      if (filePath.startsWith(source + '/')) {
        const relativePath = filePath.substring(source.length + 1);
        const destPath = join(destination, relativePath);
        filesToMove.set(destPath, content);
        this.files.delete(filePath);
      }
    }
    
    for (const [destPath, content] of filesToMove) {
      this.files.set(destPath, content);
    }
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
  }
}

class MockArchiveExtractor implements IArchiveExtractor {
  public extractTarXzCalled = false;
  public extractZipCalled = false;
  public shouldThrow = false;

  async extractTarXz(filePath: string, outputPath: string): Promise<void> {
    this.extractTarXzCalled = true;
    if (this.shouldThrow) {
      throw new Error('Mock extraction failed');
    }
  }

  async extractZip(filePath: string, outputPath: string): Promise<void> {
    this.extractZipCalled = true;
    if (this.shouldThrow) {
      throw new Error('Mock extraction failed');
    }
  }
}

describe('WindowsActivationManager', () => {
  let mockFileSystemManager: MockFileSystemManager;
  let mockArchiveExtractor: MockArchiveExtractor;
  let windowsActivationManager: IWindowsActivationManager;
  let ziggyDir: string;
  let binDir: string;
  let installPath: string;

  beforeEach(() => {
    mockFileSystemManager = new MockFileSystemManager();
    mockArchiveExtractor = new MockArchiveExtractor();
    ziggyDir = '/test/ziggy';
    binDir = join(ziggyDir, 'bin');
    installPath = join(ziggyDir, 'versions', '0.11.0');
    
    windowsActivationManager = new WindowsActivationManager(
      mockFileSystemManager,
      mockArchiveExtractor,
      ziggyDir
    );
  });

  afterEach(() => {
    mockFileSystemManager.clear();
  });

  describe('createBackup', () => {
    it('should create backup of existing bin directory', async () => {
      // Setup: Create bin directory with content
      mockFileSystemManager.addDirectory(binDir);
      mockFileSystemManager.addFile(join(binDir, 'zig.exe'), 'zig executable');
      mockFileSystemManager.addFile(join(binDir, 'lib/std.zig'), 'standard library');

      const backupPath = await windowsActivationManager.createBackup(binDir);

      expect(backupPath).toContain('backup-');
      expect(mockFileSystemManager.fileExists(backupPath)).toBe(true);
      expect(mockFileSystemManager.fileExists(join(backupPath, '.backup-metadata.json'))).toBe(true);
    });

    it('should create backup directory even if bin directory is empty', async () => {
      // Setup: Create empty bin directory
      mockFileSystemManager.addDirectory(binDir);

      const backupPath = await windowsActivationManager.createBackup(binDir);

      expect(backupPath).toContain('backup-');
      expect(mockFileSystemManager.fileExists(backupPath)).toBe(true);
    });

    it('should handle non-existent bin directory gracefully', async () => {
      const backupPath = await windowsActivationManager.createBackup(binDir);

      expect(backupPath).toContain('backup-');
      expect(mockFileSystemManager.fileExists(backupPath)).toBe(true);
    });

    it('should throw WindowsActivationError on backup failure', async () => {
      // Mock file system to throw error during directory creation
      const originalCreateDirectory = mockFileSystemManager.createDirectory;
      mockFileSystemManager.createDirectory = () => {
        throw new Error('Backup failed');
      };

      mockFileSystemManager.addDirectory(binDir);
      mockFileSystemManager.addFile(join(binDir, 'zig.exe'), 'content');

      await expect(windowsActivationManager.createBackup(binDir))
        .rejects.toThrow(WindowsActivationError);

      // Restore original method
      mockFileSystemManager.createDirectory = originalCreateDirectory;
    });
  });

  describe('restoreBackup', () => {
    it('should restore backup to bin directory', async () => {
      // Setup: Create backup directory with content
      const backupPath = '/test/backup-123';
      mockFileSystemManager.addDirectory(backupPath);
      mockFileSystemManager.addFile(join(backupPath, 'zig.exe'), 'old zig executable');
      mockFileSystemManager.addFile(join(backupPath, '.backup-metadata.json'), '{"timestamp":"2023-01-01"}');

      // Setup: Create current bin directory
      mockFileSystemManager.addDirectory(binDir);
      mockFileSystemManager.addFile(join(binDir, 'new-zig.exe'), 'new zig executable');

      await windowsActivationManager.restoreBackup(backupPath, binDir);

      const normalizedBinZig = join(binDir, 'zig.exe').replace(/\\/g, '/');
      const normalizedBinNewZig = join(binDir, 'new-zig.exe').replace(/\\/g, '/');
      const normalizedBackupPath = backupPath.replace(/\\/g, '/');

      expect(mockFileSystemManager.fileExists(normalizedBinZig)).toBe(true);
      expect(mockFileSystemManager.fileExists(normalizedBinNewZig)).toBe(false);
      expect(mockFileSystemManager.fileExists(normalizedBackupPath)).toBe(false); // Backup should be cleaned up
    });

    it('should throw error if backup directory does not exist', async () => {
      const nonExistentBackup = '/test/nonexistent-backup';

      await expect(windowsActivationManager.restoreBackup(nonExistentBackup, binDir))
        .rejects.toThrow(WindowsActivationError);
    });

    it('should handle restore failure and throw WindowsActivationError', async () => {
      const backupPath = '/test/backup-123';
      mockFileSystemManager.addDirectory(backupPath);
      mockFileSystemManager.addFile(join(backupPath, 'test.txt'), 'content');

      // Mock copyFile to throw error during restore
      const originalCopyFile = mockFileSystemManager.copyFile;
      mockFileSystemManager.copyFile = () => {
        throw new Error('Copy failed during restore');
      };

      await expect(windowsActivationManager.restoreBackup(backupPath, binDir))
        .rejects.toThrow(WindowsActivationError);

      // Restore original method
      mockFileSystemManager.copyFile = originalCopyFile;
    });
  });

  describe('extractInstallation', () => {
    it('should extract from zip file in installation directory', async () => {
      // Setup: Create installation directory with zip file
      mockFileSystemManager.addDirectory(installPath);
      mockFileSystemManager.addFile(join(installPath, 'zig-windows-x86_64-0.11.0.zip'), 'zip content');

      // Mock successful extraction that creates zig.exe
      const originalExtractZip = mockArchiveExtractor.extractZip;
      mockArchiveExtractor.extractZip = async (filePath: string, outputPath: string) => {
        mockArchiveExtractor.extractZipCalled = true;
        mockFileSystemManager.addFile(join(outputPath, 'zig.exe'), 'extracted zig');
      };

      await windowsActivationManager.extractInstallation(installPath, binDir);

      expect(mockArchiveExtractor.extractZipCalled).toBe(true);
      expect(mockFileSystemManager.fileExists(binDir)).toBe(true);
      expect(mockFileSystemManager.fileExists(join(binDir, 'zig.exe'))).toBe(true);

      // Restore original method
      mockArchiveExtractor.extractZip = originalExtractZip;
    });

    it('should copy from extracted directory if present', async () => {
      // Setup: Create installation directory with extracted Zig directory
      const extractedDir = join(installPath, 'zig-windows-x86_64-0.11.0');
      mockFileSystemManager.addDirectory(installPath);
      mockFileSystemManager.addDirectory(extractedDir);
      mockFileSystemManager.addFile(join(extractedDir, 'zig.exe'), 'zig executable');

      await windowsActivationManager.extractInstallation(installPath, binDir);

      const normalizedBinZig = join(binDir, 'zig.exe').replace(/\\/g, '/');
      expect(mockFileSystemManager.fileExists(normalizedBinZig)).toBe(true);
    });

    it('should throw error if zig.exe not found after extraction', async () => {
      // Setup: Create installation directory with zip but no zig.exe after extraction
      mockFileSystemManager.addDirectory(installPath);
      mockFileSystemManager.addFile(join(installPath, 'zig-windows-x86_64-0.11.0.zip'), 'zip content');

      await expect(windowsActivationManager.extractInstallation(installPath, binDir))
        .rejects.toThrow(WindowsActivationError);
    });

    it('should throw error if installation path does not exist', async () => {
      const nonExistentPath = '/test/nonexistent';

      await expect(windowsActivationManager.extractInstallation(nonExistentPath, binDir))
        .rejects.toThrow(WindowsActivationError);
    });

    it('should handle extraction failure', async () => {
      // Setup: Create installation directory with zip file
      mockFileSystemManager.addDirectory(installPath);
      mockFileSystemManager.addFile(join(installPath, 'zig-windows-x86_64-0.11.0.zip'), 'zip content');

      // Make extractor throw error
      mockArchiveExtractor.shouldThrow = true;

      await expect(windowsActivationManager.extractInstallation(installPath, binDir))
        .rejects.toThrow(WindowsActivationError);
    });
  });

  describe('cleanupBackup', () => {
    it('should remove backup directory', () => {
      const backupPath = '/test/backup-123';
      mockFileSystemManager.addDirectory(backupPath);
      mockFileSystemManager.addFile(join(backupPath, 'test.txt'), 'content');

      windowsActivationManager.cleanupBackup(backupPath);

      expect(mockFileSystemManager.fileExists(backupPath)).toBe(false);
    });

    it('should not throw error if backup directory does not exist', () => {
      const nonExistentBackup = '/test/nonexistent-backup';

      expect(() => windowsActivationManager.cleanupBackup(nonExistentBackup)).not.toThrow();
    });

    it('should not throw error if cleanup fails', () => {
      const backupPath = '/test/backup-123';
      mockFileSystemManager.addDirectory(backupPath);

      // Mock safeRemove to throw error
      const originalSafeRemove = mockFileSystemManager.safeRemove;
      mockFileSystemManager.safeRemove = () => {
        throw new Error('Cleanup failed');
      };

      expect(() => windowsActivationManager.cleanupBackup(backupPath)).not.toThrow();

      // Restore original method
      mockFileSystemManager.safeRemove = originalSafeRemove;
    });
  });

  describe('activateVersion', () => {
    it('should successfully activate version with backup and extraction', async () => {
      // Setup: Create existing bin directory with content
      mockFileSystemManager.addDirectory(binDir);
      mockFileSystemManager.addFile(join(binDir, 'old-zig.exe'), 'old zig');

      // Setup: Create installation directory with extracted Zig
      const extractedDir = join(installPath, 'zig-windows-x86_64-0.11.0');
      mockFileSystemManager.addDirectory(installPath);
      mockFileSystemManager.addDirectory(extractedDir);
      mockFileSystemManager.addFile(join(extractedDir, 'zig.exe'), 'new zig executable');

      await windowsActivationManager.activateVersion('0.11.0', installPath, binDir);

      const normalizedBinZig = join(binDir, 'zig.exe').replace(/\\/g, '/');
      expect(mockFileSystemManager.fileExists(normalizedBinZig)).toBe(true);
      expect(mockFileSystemManager.readFile(normalizedBinZig)).toBe('new zig executable');
    });

    it('should activate version without backup if bin directory is empty', async () => {
      // Setup: Create empty bin directory
      mockFileSystemManager.addDirectory(binDir);

      // Setup: Create installation directory with zip file
      mockFileSystemManager.addDirectory(installPath);
      mockFileSystemManager.addFile(join(installPath, 'zig-windows-x86_64-0.11.0.zip'), 'zip content');

      // Mock successful extraction that creates zig.exe
      const originalExtractZip = mockArchiveExtractor.extractZip;
      mockArchiveExtractor.extractZip = async (filePath: string, outputPath: string) => {
        mockFileSystemManager.addFile(join(outputPath, 'zig.exe'), 'extracted zig');
      };

      await windowsActivationManager.activateVersion('0.11.0', installPath, binDir);

      expect(mockFileSystemManager.fileExists(join(binDir, 'zig.exe'))).toBe(true);

      // Restore original method
      mockArchiveExtractor.extractZip = originalExtractZip;
    });

    it('should rollback on extraction failure', async () => {
      // Setup: Create existing bin directory with content
      mockFileSystemManager.addDirectory(binDir);
      mockFileSystemManager.addFile(join(binDir, 'old-zig.exe'), 'old zig');

      // Setup: Create installation directory with zip file
      mockFileSystemManager.addDirectory(installPath);
      mockFileSystemManager.addFile(join(installPath, 'zig-windows-x86_64-0.11.0.zip'), 'zip content');

      // Make extraction fail by not creating zig.exe
      const originalExtractZip = mockArchiveExtractor.extractZip;
      mockArchiveExtractor.extractZip = async (filePath: string, outputPath: string) => {
        // Don't create zig.exe, which will cause the verification to fail
      };

      await expect(windowsActivationManager.activateVersion('0.11.0', installPath, binDir))
        .rejects.toThrow(WindowsActivationError);

      // Verify rollback occurred - old file should be restored
      const normalizedOldZig = join(binDir, 'old-zig.exe').replace(/\\/g, '/');
      expect(mockFileSystemManager.fileExists(normalizedOldZig)).toBe(true);

      // Restore original method
      mockArchiveExtractor.extractZip = originalExtractZip;
    });

    it('should throw error with backup path if rollback also fails', async () => {
      // Setup: Create existing bin directory with content
      mockFileSystemManager.addDirectory(binDir);
      mockFileSystemManager.addFile(join(binDir, 'old-zig.exe'), 'old zig');

      // Setup: Create installation directory with zip file
      mockFileSystemManager.addDirectory(installPath);
      mockFileSystemManager.addFile(join(installPath, 'zig-windows-x86_64-0.11.0.zip'), 'zip content');

      // Make extraction fail by not creating zig.exe
      const originalExtractZip = mockArchiveExtractor.extractZip;
      mockArchiveExtractor.extractZip = async (filePath: string, outputPath: string) => {
        // Don't create zig.exe, which will cause the verification to fail
      };

      // Make rollback fail by breaking directory creation during restore
      let createDirCallCount = 0;
      const originalCreateDirectory = mockFileSystemManager.createDirectory;
      mockFileSystemManager.createDirectory = (path: string) => {
        createDirCallCount++;
        if (createDirCallCount > 3) { // Allow backup creation but fail on restore
          throw new Error('Rollback directory creation failed');
        }
        originalCreateDirectory.call(mockFileSystemManager, path);
      };

      const error = await windowsActivationManager.activateVersion('0.11.0', installPath, binDir)
        .catch(e => e);

      expect(error).toBeInstanceOf(WindowsActivationError);
      expect(error.message).toContain('rollback also failed');
      expect(error.backupPath).toBeDefined();

      // Restore original methods
      mockArchiveExtractor.extractZip = originalExtractZip;
      mockFileSystemManager.createDirectory = originalCreateDirectory;
    });
  });
});
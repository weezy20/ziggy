/**
 * Unit tests for FileSystemManager
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { join } from 'path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { FileSystemManager, FileSystemError, DirectoryError, FileError, SymlinkError } from '../../../src/utils/filesystem';

describe('FileSystemManager', () => {
  let fsManager: FileSystemManager;
  let testDir: string;

  beforeEach(() => {
    fsManager = new FileSystemManager();
    testDir = join(process.cwd(), 'test-temp-fs');
    
    // Clean up any existing test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('createDirectory', () => {
    it('should create a directory successfully', () => {
      const dirPath = join(testDir, 'new-dir');
      
      fsManager.createDirectory(dirPath);
      
      expect(existsSync(dirPath)).toBe(true);
      expect(fsManager.isDirectory(dirPath)).toBe(true);
    });

    it('should create nested directories when recursive is true', () => {
      const nestedPath = join(testDir, 'level1', 'level2', 'level3');
      
      fsManager.createDirectory(nestedPath, true);
      
      expect(existsSync(nestedPath)).toBe(true);
      expect(fsManager.isDirectory(nestedPath)).toBe(true);
    });

    it('should not throw error if directory already exists', () => {
      const dirPath = join(testDir, 'existing-dir');
      mkdirSync(dirPath, { recursive: true });
      
      expect(() => fsManager.createDirectory(dirPath)).not.toThrow();
    });

    it('should throw DirectoryError on failure', () => {
      // Try to create directory with invalid path
      const invalidPath = '\0invalid';
      
      expect(() => fsManager.createDirectory(invalidPath)).toThrow(DirectoryError);
    });
  });

  describe('removeDirectory', () => {
    it('should remove a directory successfully', () => {
      const dirPath = join(testDir, 'to-remove');
      mkdirSync(dirPath, { recursive: true });
      
      fsManager.removeDirectory(dirPath);
      
      expect(existsSync(dirPath)).toBe(false);
    });

    it('should remove directory with contents', () => {
      const dirPath = join(testDir, 'with-contents');
      const filePath = join(dirPath, 'file.txt');
      mkdirSync(dirPath, { recursive: true });
      writeFileSync(filePath, 'test content');
      
      fsManager.removeDirectory(dirPath);
      
      expect(existsSync(dirPath)).toBe(false);
    });

    it('should not throw error if directory does not exist', () => {
      const nonExistentPath = join(testDir, 'non-existent');
      
      expect(() => fsManager.removeDirectory(nonExistentPath)).not.toThrow();
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', () => {
      const filePath = join(testDir, 'test-file.txt');
      mkdirSync(testDir, { recursive: true });
      writeFileSync(filePath, 'test');
      
      expect(fsManager.fileExists(filePath)).toBe(true);
    });

    it('should return true for existing directory', () => {
      mkdirSync(testDir, { recursive: true });
      
      expect(fsManager.fileExists(testDir)).toBe(true);
    });

    it('should return false for non-existent path', () => {
      const nonExistentPath = join(testDir, 'non-existent');
      
      expect(fsManager.fileExists(nonExistentPath)).toBe(false);
    });
  });

  describe('copyFile', () => {
    it('should copy file successfully', () => {
      const sourceDir = join(testDir, 'source');
      const destDir = join(testDir, 'dest');
      const sourcePath = join(sourceDir, 'source.txt');
      const destPath = join(destDir, 'dest.txt');
      
      mkdirSync(sourceDir, { recursive: true });
      writeFileSync(sourcePath, 'test content');
      
      fsManager.copyFile(sourcePath, destPath);
      
      expect(existsSync(destPath)).toBe(true);
      expect(fsManager.readFile(destPath)).toBe('test content');
    });

    it('should create destination directory if it does not exist', () => {
      const sourceDir = join(testDir, 'source');
      const destDir = join(testDir, 'nested', 'dest');
      const sourcePath = join(sourceDir, 'source.txt');
      const destPath = join(destDir, 'dest.txt');
      
      mkdirSync(sourceDir, { recursive: true });
      writeFileSync(sourcePath, 'test content');
      
      fsManager.copyFile(sourcePath, destPath);
      
      expect(existsSync(destPath)).toBe(true);
      expect(existsSync(destDir)).toBe(true);
    });

    it('should throw FileError if source does not exist', () => {
      const sourcePath = join(testDir, 'non-existent.txt');
      const destPath = join(testDir, 'dest.txt');
      
      expect(() => fsManager.copyFile(sourcePath, destPath)).toThrow(FileError);
    });
  });

  describe('writeFile and readFile', () => {
    it('should write and read file successfully', () => {
      const filePath = join(testDir, 'test.txt');
      const content = 'Hello, World!';
      
      fsManager.writeFile(filePath, content);
      
      expect(existsSync(filePath)).toBe(true);
      expect(fsManager.readFile(filePath)).toBe(content);
    });

    it('should create directory structure when writing file', () => {
      const filePath = join(testDir, 'nested', 'deep', 'file.txt');
      const content = 'nested content';
      
      fsManager.writeFile(filePath, content);
      
      expect(existsSync(filePath)).toBe(true);
      expect(fsManager.readFile(filePath)).toBe(content);
    });

    it('should throw FileError when reading non-existent file', () => {
      const filePath = join(testDir, 'non-existent.txt');
      
      expect(() => fsManager.readFile(filePath)).toThrow(FileError);
    });
  });

  describe('appendFile', () => {
    it('should append content to existing file', () => {
      const filePath = join(testDir, 'append-test.txt');
      
      fsManager.writeFile(filePath, 'Initial content\n');
      fsManager.appendFile(filePath, 'Appended content');
      
      const result = fsManager.readFile(filePath);
      expect(result).toBe('Initial content\nAppended content');
    });

    it('should create file if it does not exist', () => {
      const filePath = join(testDir, 'new-append.txt');
      
      fsManager.appendFile(filePath, 'New content');
      
      expect(existsSync(filePath)).toBe(true);
      expect(fsManager.readFile(filePath)).toBe('New content');
    });
  });

  describe('removeFile', () => {
    it('should remove file successfully', () => {
      const filePath = join(testDir, 'to-remove.txt');
      mkdirSync(testDir, { recursive: true });
      writeFileSync(filePath, 'test');
      
      fsManager.removeFile(filePath);
      
      expect(existsSync(filePath)).toBe(false);
    });

    it('should not throw error if file does not exist', () => {
      const filePath = join(testDir, 'non-existent.txt');
      
      expect(() => fsManager.removeFile(filePath)).not.toThrow();
    });
  });

  describe('listDirectory', () => {
    it('should list directory contents', () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'file1.txt'), 'content1');
      writeFileSync(join(testDir, 'file2.txt'), 'content2');
      mkdirSync(join(testDir, 'subdir'));
      
      const contents = fsManager.listDirectory(testDir);
      
      expect(contents).toContain('file1.txt');
      expect(contents).toContain('file2.txt');
      expect(contents).toContain('subdir');
      expect(contents.length).toBe(3);
    });

    it('should throw DirectoryError for non-existent directory', () => {
      const nonExistentDir = join(testDir, 'non-existent');
      
      expect(() => fsManager.listDirectory(nonExistentDir)).toThrow(DirectoryError);
    });

    it('should throw DirectoryError when path is not a directory', () => {
      const filePath = join(testDir, 'file.txt');
      mkdirSync(testDir, { recursive: true });
      writeFileSync(filePath, 'content');
      
      expect(() => fsManager.listDirectory(filePath)).toThrow(DirectoryError);
    });
  });

  describe('isDirectory and isFile', () => {
    it('should correctly identify directories', () => {
      mkdirSync(testDir, { recursive: true });
      
      expect(fsManager.isDirectory(testDir)).toBe(true);
      expect(fsManager.isFile(testDir)).toBe(false);
    });

    it('should correctly identify files', () => {
      const filePath = join(testDir, 'test.txt');
      mkdirSync(testDir, { recursive: true });
      writeFileSync(filePath, 'content');
      
      expect(fsManager.isFile(filePath)).toBe(true);
      expect(fsManager.isDirectory(filePath)).toBe(false);
    });

    it('should return false for non-existent paths', () => {
      const nonExistentPath = join(testDir, 'non-existent');
      
      expect(fsManager.isDirectory(nonExistentPath)).toBe(false);
      expect(fsManager.isFile(nonExistentPath)).toBe(false);
    });
  });

  describe('ensureDirectory', () => {
    it('should create directory if it does not exist', () => {
      const dirPath = join(testDir, 'ensure-test');
      
      fsManager.ensureDirectory(dirPath);
      
      expect(existsSync(dirPath)).toBe(true);
      expect(fsManager.isDirectory(dirPath)).toBe(true);
    });

    it('should not throw error if directory already exists', () => {
      mkdirSync(testDir, { recursive: true });
      
      expect(() => fsManager.ensureDirectory(testDir)).not.toThrow();
    });
  });

  describe('safeRemove', () => {
    it('should remove file safely', () => {
      const filePath = join(testDir, 'safe-remove.txt');
      mkdirSync(testDir, { recursive: true });
      writeFileSync(filePath, 'content');
      
      fsManager.safeRemove(filePath);
      
      expect(existsSync(filePath)).toBe(false);
    });

    it('should remove directory safely', () => {
      const dirPath = join(testDir, 'safe-remove-dir');
      mkdirSync(dirPath, { recursive: true });
      
      fsManager.safeRemove(dirPath);
      
      expect(existsSync(dirPath)).toBe(false);
    });

    it('should not throw error for non-existent paths', () => {
      const nonExistentPath = join(testDir, 'non-existent');
      
      expect(() => fsManager.safeRemove(nonExistentPath)).not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return stats for existing file', () => {
      const filePath = join(testDir, 'stats-test.txt');
      mkdirSync(testDir, { recursive: true });
      writeFileSync(filePath, 'content');
      
      const stats = fsManager.getStats(filePath);
      
      expect(stats.isFile()).toBe(true);
      expect(stats.isDirectory()).toBe(false);
    });

    it('should return stats for existing directory', () => {
      mkdirSync(testDir, { recursive: true });
      
      const stats = fsManager.getStats(testDir);
      
      expect(stats.isDirectory()).toBe(true);
      expect(stats.isFile()).toBe(false);
    });

    it('should throw FileError for non-existent path', () => {
      const nonExistentPath = join(testDir, 'non-existent');
      
      expect(() => fsManager.getStats(nonExistentPath)).toThrow(FileError);
    });
  });

  describe('createWriteStream and createReadStream', () => {
    it('should create write stream successfully', () => {
      const filePath = join(testDir, 'stream-test.txt');
      
      const writeStream = fsManager.createWriteStream(filePath);
      
      expect(writeStream).toBeDefined();
      writeStream.end();
    });

    it('should create read stream for existing file', () => {
      const filePath = join(testDir, 'read-stream-test.txt');
      mkdirSync(testDir, { recursive: true });
      writeFileSync(filePath, 'stream content');
      
      const readStream = fsManager.createReadStream(filePath);
      
      expect(readStream).toBeDefined();
      readStream.destroy();
    });

    it('should throw FileError when creating read stream for non-existent file', () => {
      const filePath = join(testDir, 'non-existent.txt');
      
      expect(() => fsManager.createReadStream(filePath)).toThrow(FileError);
    });
  });

  describe('Error Types', () => {
    it('should create FileSystemError with correct properties', () => {
      const error = new FileSystemError('Test message', 'test-op', '/test/path');
      
      expect(error.message).toBe('Test message');
      expect(error.operation).toBe('test-op');
      expect(error.path).toBe('/test/path');
      expect(error.name).toBe('FileSystemError');
    });

    it('should create DirectoryError with correct properties', () => {
      const error = new DirectoryError('Directory error', '/test/dir');
      
      expect(error.message).toBe('Directory error');
      expect(error.operation).toBe('directory');
      expect(error.path).toBe('/test/dir');
      expect(error.name).toBe('FileSystemError');
    });

    it('should create FileError with correct properties', () => {
      const error = new FileError('File error', '/test/file.txt');
      
      expect(error.message).toBe('File error');
      expect(error.operation).toBe('file');
      expect(error.path).toBe('/test/file.txt');
      expect(error.name).toBe('FileSystemError');
    });

    it('should create SymlinkError with correct properties', () => {
      const error = new SymlinkError('Symlink error', '/test/link');
      
      expect(error.message).toBe('Symlink error');
      expect(error.operation).toBe('symlink');
      expect(error.path).toBe('/test/link');
      expect(error.name).toBe('FileSystemError');
    });
  });
});
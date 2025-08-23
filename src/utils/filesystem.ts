/**
 * File System Manager
 * 
 * Handles all file system operations for Ziggy including directory creation,
 * file operations, symlinks, and proper error handling.
 */

import { existsSync, mkdirSync, rmSync, copyFileSync, statSync, readdirSync, createWriteStream, createReadStream, writeFileSync, readFileSync, appendFileSync } from 'fs';
import { dirname } from 'path';
import type { IFileSystemManager } from '../interfaces.js';

/**
 * Custom error types for file system operations
 */
export class FileSystemError extends Error {
  public operation: string;
  public path: string;
  public override cause?: Error;

  constructor(message: string, operation: string, path: string, cause?: Error) {
    super(message);
    this.name = 'FileSystemError';
    this.operation = operation;
    this.path = path;
    this.cause = cause;
  }
}

export class DirectoryError extends FileSystemError {
  constructor(message: string, path: string, cause?: Error) {
    super(message, 'directory', path, cause);
  }
}

export class FileError extends FileSystemError {
  constructor(message: string, path: string, cause?: Error) {
    super(message, 'file', path, cause);
  }
}

export class SymlinkError extends FileSystemError {
  constructor(message: string, path: string, cause?: Error) {
    super(message, 'symlink', path, cause);
  }
}

/**
 * FileSystemManager implementation
 * 
 * Provides a clean interface for all file system operations with proper error handling
 */
export class FileSystemManager implements IFileSystemManager {
  
  /**
   * Creates a directory at the specified path
   * @param path - The directory path to create
   * @param recursive - Whether to create parent directories (default: true)
   */
  createDirectory(path: string, recursive: boolean = true): void {
    try {
      if (!existsSync(path)) {
        mkdirSync(path, { recursive });
      }
    } catch (error) {
      throw new DirectoryError(
        `Failed to create directory: ${path}`,
        path,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Removes a directory and all its contents
   * @param path - The directory path to remove
   * @param force - Whether to force removal (default: true)
   */
  removeDirectory(path: string, force: boolean = true): void {
    try {
      if (existsSync(path)) {
        rmSync(path, { recursive: true, force });
      }
    } catch (error) {
      throw new DirectoryError(
        `Failed to remove directory: ${path}`,
        path,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Creates a symlink from target to link path
   * @param target - The target path to link to
   * @param link - The symlink path to create
   * @param platform - The platform type for platform-specific handling
   */
  createSymlink(target: string, link: string, platform?: string): void {
    try {
      // Remove existing symlink if it exists
      if (existsSync(link)) {
        rmSync(link);
      }

      // Verify target exists
      if (!existsSync(target)) {
        throw new Error(`Target does not exist: ${target}`);
      }

      if (platform === 'windows') {
        // On Windows, copy the executable instead of creating a symlink
        copyFileSync(target, link);
      } else {
        // On Unix-like systems, create a symbolic link
        Bun.spawnSync(['ln', '-sf', target, link]);
      }
    } catch (error) {
      throw new SymlinkError(
        `Failed to create symlink from ${target} to ${link}`,
        link,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Copies a file from source to destination
   * @param source - The source file path
   * @param destination - The destination file path
   */
  copyFile(source: string, destination: string): void {
    try {
      if (!existsSync(source)) {
        throw new Error(`Source file does not exist: ${source}`);
      }

      // Ensure destination directory exists
      const destDir = dirname(destination);
      this.createDirectory(destDir);

      copyFileSync(source, destination);
    } catch (error) {
      throw new FileError(
        `Failed to copy file from ${source} to ${destination}`,
        destination,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Checks if a file or directory exists
   * @param path - The path to check
   * @returns true if the path exists, false otherwise
   */
  fileExists(path: string): boolean {
    return existsSync(path);
  }

  /**
   * Removes a file
   * @param path - The file path to remove
   */
  removeFile(path: string): void {
    try {
      if (existsSync(path)) {
        rmSync(path);
      }
    } catch (error) {
      throw new FileError(
        `Failed to remove file: ${path}`,
        path,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Writes content to a file
   * @param path - The file path to write to
   * @param content - The content to write
   */
  writeFile(path: string, content: string): void {
    try {
      // Ensure directory exists
      const dir = dirname(path);
      this.createDirectory(dir);

      writeFileSync(path, content);
    } catch (error) {
      throw new FileError(
        `Failed to write file: ${path}`,
        path,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Reads content from a file
   * @param path - The file path to read from
   * @returns The file content as a string
   */
  readFile(path: string): string {
    try {
      if (!existsSync(path)) {
        throw new Error(`File does not exist: ${path}`);
      }
      return readFileSync(path, 'utf-8');
    } catch (error) {
      throw new FileError(
        `Failed to read file: ${path}`,
        path,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Appends content to a file
   * @param path - The file path to append to
   * @param content - The content to append
   */
  appendFile(path: string, content: string): void {
    try {
      // Ensure directory exists
      const dir = dirname(path);
      this.createDirectory(dir);

      appendFileSync(path, content);
    } catch (error) {
      throw new FileError(
        `Failed to append to file: ${path}`,
        path,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Creates a write stream for a file
   * @param path - The file path to create a stream for
   * @returns A write stream
   */
  createWriteStream(path: string) {
    try {
      // Ensure directory exists
      const dir = dirname(path);
      this.createDirectory(dir);

      return createWriteStream(path);
    } catch (error) {
      throw new FileError(
        `Failed to create write stream for: ${path}`,
        path,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Creates a read stream for a file
   * @param path - The file path to create a stream for
   * @returns A read stream
   */
  createReadStream(path: string) {
    try {
      if (!existsSync(path)) {
        throw new Error(`File does not exist: ${path}`);
      }
      return createReadStream(path);
    } catch (error) {
      throw new FileError(
        `Failed to create read stream for: ${path}`,
        path,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Gets file or directory statistics
   * @param path - The path to get stats for
   * @returns File stats object
   */
  getStats(path: string) {
    try {
      if (!existsSync(path)) {
        throw new Error(`Path does not exist: ${path}`);
      }
      return statSync(path);
    } catch (error) {
      throw new FileError(
        `Failed to get stats for: ${path}`,
        path,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Lists directory contents
   * @param path - The directory path to list
   * @returns Array of file/directory names
   */
  listDirectory(path: string): string[] {
    try {
      if (!existsSync(path)) {
        throw new Error(`Directory does not exist: ${path}`);
      }
      
      const stats = statSync(path);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${path}`);
      }

      return readdirSync(path);
    } catch (error) {
      throw new DirectoryError(
        `Failed to list directory: ${path}`,
        path,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Checks if a path is a directory
   * @param path - The path to check
   * @returns true if the path is a directory, false otherwise
   */
  isDirectory(path: string): boolean {
    try {
      if (!existsSync(path)) {
        return false;
      }
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Checks if a path is a file
   * @param path - The path to check
   * @returns true if the path is a file, false otherwise
   */
  isFile(path: string): boolean {
    try {
      if (!existsSync(path)) {
        return false;
      }
      return statSync(path).isFile();
    } catch {
      return false;
    }
  }

  /**
   * Ensures a directory exists, creating it if necessary
   * @param path - The directory path to ensure exists
   */
  ensureDirectory(path: string): void {
    if (!existsSync(path)) {
      this.createDirectory(path);
    }
  }

  /**
   * Safely removes a file or directory with error handling
   * @param path - The path to remove
   * @param recursive - Whether to remove directories recursively (default: true)
   */
  safeRemove(path: string, _recursive: boolean = true): void {
    try {
      if (existsSync(path)) {
        const stats = statSync(path);
        if (stats.isDirectory()) {
          this.removeDirectory(path, true);
        } else {
          this.removeFile(path);
        }
      }
    } catch (error) {
      // Log the error but don't throw - this is for cleanup operations
      console.warn(`Warning: Failed to remove ${path}:`, error);
    }
  }
}
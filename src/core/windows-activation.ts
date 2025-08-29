/**
 * Windows Activation Manager
 * 
 * Handles Windows-specific Zig version activation using direct file extraction
 * instead of symlinks. Provides backup, extraction, and rollback capabilities
 * to ensure safe version switching on Windows systems.
 */

import { join, basename } from 'path';
import { randomUUID } from 'crypto';
import type { IFileSystemManager, IArchiveExtractor } from '../interfaces.js';
import { colors } from '../utils/colors.js';

/**
 * Custom error for Windows activation failures
 */
export class WindowsActivationError extends Error {
  public version: string;
  public backupPath?: string;
  public override cause?: Error;

  constructor(
    message: string,
    version: string,
    backupPath?: string,
    cause?: Error
  ) {
    super(message);
    this.name = 'WindowsActivationError';
    this.version = version;
    this.backupPath = backupPath;
    this.cause = cause;
  }
}

/**
 * Interface for Windows activation operations
 */
export interface IWindowsActivationManager {
  activateVersion(version: string, installPath: string, binDir: string): Promise<void>;
  createBackup(binDir: string): Promise<string>;
  restoreBackup(backupPath: string, binDir: string): Promise<void>;
  extractInstallation(installPath: string, binDir: string): Promise<void>;
  cleanupBackup(backupPath: string): void;
}

/**
 * Metadata for backup operations
 */
interface BackupMetadata {
  timestamp: string;
  originalVersion?: string;
  backupPath: string;
  binContents: string[];
}

/**
 * Context for activation operations
 */
interface ActivationContext {
  version: string;
  installPath: string;
  binDir: string;
  currentVersion?: string;
}

/**
 * Windows Activation Manager implementation
 * 
 * Provides safe Windows-specific Zig version activation using file extraction
 * with comprehensive backup and rollback capabilities.
 */
export class WindowsActivationManager implements IWindowsActivationManager {
  private fileSystemManager: IFileSystemManager;
  private archiveExtractor: IArchiveExtractor;
  private tempDir: string;

  constructor(
    fileSystemManager: IFileSystemManager,
    archiveExtractor: IArchiveExtractor,
    ziggyDir: string
  ) {
    this.fileSystemManager = fileSystemManager;
    this.archiveExtractor = archiveExtractor;
    this.tempDir = join(ziggyDir, 'temp');
  }

  /**
   * Activate a Zig version on Windows using extraction-based approach
   * 
   * @param version - The Zig version to activate
   * @param installPath - Path to the Zig installation directory
   * @param binDir - Path to the ziggy bin directory
   */
  public async activateVersion(version: string, installPath: string, binDir: string): Promise<void> {
    const context: ActivationContext = {
      version,
      installPath,
      binDir
    };

    console.log(colors.blue(`🔄 Activating Zig ${version} for Windows...`));

    let backupPath: string | undefined;

    try {
      // Step 1: Create backup of current bin directory if it exists and has content
      if (this.fileSystemManager.fileExists(binDir) && this.hasContent(binDir)) {
        console.log(colors.gray('Creating backup of current installation...'));
        backupPath = await this.createBackup(binDir);
        console.log(colors.green(`✓ Backup created at: ${backupPath}`));
      }

      // Step 2: Extract the new Zig installation to bin directory
      console.log(colors.gray('Extracting Zig installation...'));
      await this.extractInstallation(installPath, binDir);
      console.log(colors.green('✓ Zig installation extracted successfully'));

      // Step 3: Cleanup backup on successful activation
      if (backupPath) {
        this.cleanupBackup(backupPath);
        console.log(colors.gray('✓ Backup cleaned up'));
      }

      console.log(colors.green(`✅ Successfully activated Zig ${version} for Windows`));

    } catch (error) {
      console.error(colors.red(`❌ Failed to activate Zig ${version}:`), error);

      // Step 4: Rollback on failure
      if (backupPath) {
        try {
          console.log(colors.yellow('🔄 Rolling back to previous installation...'));
          await this.restoreBackup(backupPath, binDir);
          console.log(colors.green('✓ Successfully rolled back to previous installation'));
        } catch (rollbackError) {
          console.error(colors.red('❌ Rollback failed:'), rollbackError);
          throw new WindowsActivationError(
            `Activation failed and rollback also failed: ${error.message}. Rollback error: ${rollbackError.message}`,
            version,
            backupPath,
            error instanceof Error ? error : new Error(String(error))
          );
        }
      }

      throw new WindowsActivationError(
        `Failed to activate Zig ${version}: ${error.message}`,
        version,
        backupPath,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Create a backup of the current bin directory contents
   * 
   * @param binDir - Path to the bin directory to backup
   * @returns Promise resolving to the backup directory path
   */
  public async createBackup(binDir: string): Promise<string> {
    try {
      // Ensure temp directory exists
      this.fileSystemManager.ensureDirectory(this.tempDir);

      // Create unique backup directory
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupId = randomUUID().substring(0, 8);
      const backupPath = join(this.tempDir, `backup-${timestamp}-${backupId}`);

      // Create backup directory
      this.fileSystemManager.createDirectory(backupPath);

      // Copy all contents from bin directory to backup
      if (this.fileSystemManager.fileExists(binDir)) {
        await this.copyDirectoryContents(binDir, backupPath);

        // Create backup metadata
        const binContents = this.fileSystemManager.listDirectory(binDir);
        const metadata: BackupMetadata = {
          timestamp: new Date().toISOString(),
          backupPath,
          binContents
        };

        // Save metadata file
        const metadataPath = join(backupPath, '.backup-metadata.json');
        this.fileSystemManager.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
      }

      return backupPath;
    } catch (error) {
      throw new WindowsActivationError(
        `Failed to create backup: ${error.message}`,
        'unknown',
        undefined,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Restore a previous installation from backup
   * 
   * @param backupPath - Path to the backup directory
   * @param binDir - Path to the bin directory to restore to
   */
  public async restoreBackup(backupPath: string, binDir: string): Promise<void> {
    try {
      if (!this.fileSystemManager.fileExists(backupPath)) {
        throw new Error(`Backup directory does not exist: ${backupPath}`);
      }

      // Clear current bin directory
      if (this.fileSystemManager.fileExists(binDir)) {
        this.fileSystemManager.safeRemove(binDir, true);
      }

      // Create bin directory
      this.fileSystemManager.createDirectory(binDir);

      // Copy backup contents to bin directory (excluding metadata)
      const backupContents = this.fileSystemManager.listDirectory(backupPath);
      for (const item of backupContents) {
        if (item === '.backup-metadata.json') {
          continue; // Skip metadata file
        }

        const sourcePath = join(backupPath, item);
        const destPath = join(binDir, item);

        if (this.fileSystemManager.isDirectory(sourcePath)) {
          await this.copyDirectoryContents(sourcePath, destPath);
        } else {
          this.fileSystemManager.copyFile(sourcePath, destPath);
        }
      }

      // Cleanup the backup after successful restore
      this.cleanupBackup(backupPath);

    } catch (error) {
      throw new WindowsActivationError(
        `Failed to restore backup: ${error.message}`,
        'unknown',
        backupPath,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Extract Zig installation to the bin directory
   * 
   * @param installPath - Path to the Zig installation directory
   * @param binDir - Path to the bin directory to extract to
   */
  public async extractInstallation(installPath: string, binDir: string): Promise<void> {
    try {
      if (!this.fileSystemManager.fileExists(installPath)) {
        throw new Error(`Installation path does not exist: ${installPath}`);
      }

      // Clear existing bin directory
      if (this.fileSystemManager.fileExists(binDir)) {
        this.fileSystemManager.safeRemove(binDir, true);
      }

      // Create bin directory
      this.fileSystemManager.createDirectory(binDir);

      // Find the Zig installation contents
      const installContents = this.fileSystemManager.listDirectory(installPath);
      
      // Look for extracted Zig directory (format: zig-windows-x86_64-version)
      const zigDir = installContents.find(item => 
        item.startsWith('zig-') && this.fileSystemManager.isDirectory(join(installPath, item))
      );

      if (zigDir) {
        // Copy from extracted directory
        const zigInstallPath = join(installPath, zigDir);
        await this.copyDirectoryContents(zigInstallPath, binDir);
      } else {
        // Look for zip file to extract
        const zipFile = installContents.find(item => item.endsWith('.zip'));
        if (zipFile) {
          const zipPath = join(installPath, zipFile);
          
          // Extract zip directly to bin directory
          await this.archiveExtractor.extractZip(zipPath, binDir);
          
          // Check if extraction created a subdirectory and flatten if needed
          const extractedContents = this.fileSystemManager.listDirectory(binDir);
          if (extractedContents.length === 1 && this.fileSystemManager.isDirectory(join(binDir, extractedContents[0]))) {
            const subDir = extractedContents[0];
            const subDirPath = join(binDir, subDir);
            
            // Move contents up one level
            const tempDir = join(this.tempDir, `extract-temp-${randomUUID().substring(0, 8)}`);
            this.fileSystemManager.createDirectory(tempDir);
            
            await this.copyDirectoryContents(subDirPath, tempDir);
            this.fileSystemManager.safeRemove(binDir, true);
            this.fileSystemManager.createDirectory(binDir);
            await this.copyDirectoryContents(tempDir, binDir);
            
            // Cleanup temp directory
            this.fileSystemManager.safeRemove(tempDir, true);
          }
        } else {
          // Direct copy from install path if no zip or extracted directory
          await this.copyDirectoryContents(installPath, binDir);
        }
      }

      // Verify that zig.exe exists in the bin directory
      const zigExe = join(binDir, 'zig.exe');
      if (!this.fileSystemManager.fileExists(zigExe)) {
        throw new Error(`zig.exe not found in extracted installation at ${zigExe}`);
      }

    } catch (error) {
      throw new WindowsActivationError(
        `Failed to extract installation: ${error.message}`,
        'unknown',
        undefined,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Clean up a backup directory
   * 
   * @param backupPath - Path to the backup directory to remove
   */
  public cleanupBackup(backupPath: string): void {
    try {
      if (this.fileSystemManager.fileExists(backupPath)) {
        this.fileSystemManager.safeRemove(backupPath, true);
      }
    } catch (error) {
      // Log warning but don't throw - cleanup failures shouldn't break the main operation
      console.warn(colors.yellow(`⚠ Warning: Failed to cleanup backup at ${backupPath}:`), error);
    }
  }

  /**
   * Copy all contents from source directory to destination directory recursively
   * 
   * @private
   * @param sourceDir - Source directory path
   * @param destDir - Destination directory path
   */
  private async copyDirectoryContents(sourceDir: string, destDir: string): Promise<void> {
    // Use the file system manager's recursive copy method
    await this.fileSystemManager.copyDirectoryRecursive(sourceDir, destDir);
  }

  /**
   * Check if a directory has any content
   * 
   * @private
   * @param dirPath - Directory path to check
   * @returns true if directory exists and has content, false otherwise
   */
  private hasContent(dirPath: string): boolean {
    try {
      if (!this.fileSystemManager.fileExists(dirPath) || !this.fileSystemManager.isDirectory(dirPath)) {
        return false;
      }

      const contents = this.fileSystemManager.listDirectory(dirPath);
      return contents.length > 0;
    } catch {
      return false;
    }
  }
}
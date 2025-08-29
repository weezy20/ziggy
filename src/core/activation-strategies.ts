/**
 * Activation Strategy Pattern
 * 
 * Provides platform-specific activation strategies for Zig version management.
 * Windows uses extraction-based activation while Unix-like systems use symlinks.
 */

import { join } from 'path';
import type { IFileSystemManager } from '../interfaces.js';
import type { IWindowsActivationManager } from './windows-activation.js';
import { colors } from '../utils/colors.js';

/**
 * Interface for platform-specific activation strategies
 */
export interface IActivationStrategy {
  activate(targetPath: string, version: string, binDir: string): Promise<void>;
}

/**
 * Symlink-based activation strategy for Unix-like systems
 * 
 * Uses the existing symlink approach for compatibility with Unix systems
 */
export class SymlinkActivationStrategy implements IActivationStrategy {
  private fileSystemManager: IFileSystemManager;
  private platform: string;

  constructor(fileSystemManager: IFileSystemManager, platform: string) {
    this.fileSystemManager = fileSystemManager;
    this.platform = platform;
  }

  /**
   * Activate a Zig version using symlink approach
   * 
   * @param targetPath - Path to the Zig installation or binary
   * @param version - The Zig version being activated
   * @param binDir - Path to the ziggy bin directory
   */
  public async activate(targetPath: string, version: string, binDir: string): Promise<void> {
    console.log(colors.blue(`🔗 Creating symlink for Zig ${version}...`));

    try {
      // Determine the actual zig binary path
      let symlinkTarget: string;
      const executableName = 'zig';

      if (version === 'system') {
        // For system installations, targetPath is the direct path to zig binary
        symlinkTarget = targetPath;
      } else {
        // For ziggy managed installations, find the zig binary in the installation
        let zigBinary = join(targetPath, executableName);
        
        if (this.fileSystemManager.fileExists(zigBinary)) {
          symlinkTarget = zigBinary;
        } else {
          // Look for extracted installations (subdirectory format)
          const contents = this.fileSystemManager.listDirectory(targetPath);
          const zigExtraction = contents.find(item =>
            item.startsWith('zig-') && this.fileSystemManager.isDirectory(join(targetPath, item))
          );

          if (zigExtraction) {
            symlinkTarget = join(targetPath, zigExtraction, executableName);
          } else {
            throw new Error(`Zig binary not found in ${targetPath}`);
          }
        }
      }

      // Ensure bin directory exists
      this.fileSystemManager.ensureDirectory(binDir);

      // Create symlink
      const zigBinaryLink = join(binDir, executableName);
      
      // Remove existing symlink if it exists
      this.fileSystemManager.safeRemove(zigBinaryLink);

      // Create new symlink
      this.fileSystemManager.createSymlink(symlinkTarget, zigBinaryLink, this.platform);
      
      console.log(colors.green(`✓ Symlink created: ${zigBinaryLink} -> ${symlinkTarget}`));

    } catch (error) {
      throw new Error(`Failed to create symlink for Zig ${version}: ${error.message}`);
    }
  }
}

/**
 * Windows-specific activation strategy using file extraction
 * 
 * Uses the WindowsActivationManager for safe extraction-based activation
 */
export class WindowsActivationStrategy implements IActivationStrategy {
  private windowsActivationManager: IWindowsActivationManager;

  constructor(windowsActivationManager: IWindowsActivationManager) {
    this.windowsActivationManager = windowsActivationManager;
  }

  /**
   * Activate a Zig version using Windows extraction approach
   * 
   * @param targetPath - Path to the Zig installation directory
   * @param version - The Zig version being activated
   * @param binDir - Path to the ziggy bin directory
   */
  public async activate(targetPath: string, version: string, binDir: string): Promise<void> {
    if (version === 'system') {
      throw new Error('System Zig activation not supported with Windows extraction strategy');
    }

    // Delegate to Windows Activation Manager
    await this.windowsActivationManager.activateVersion(version, targetPath, binDir);
  }
}

/**
 * Factory for creating appropriate activation strategy based on platform
 */
export class ActivationStrategyFactory {
  /**
   * Create the appropriate activation strategy for the given platform
   * 
   * @param platform - The platform string ('windows', 'linux', 'macos', etc.)
   * @param fileSystemManager - File system manager instance
   * @param windowsActivationManager - Windows activation manager instance (optional)
   * @returns The appropriate activation strategy
   */
  public static createStrategy(
    platform: string,
    fileSystemManager: IFileSystemManager,
    windowsActivationManager?: IWindowsActivationManager
  ): IActivationStrategy {
    if (platform === 'windows') {
      if (!windowsActivationManager) {
        throw new Error('WindowsActivationManager is required for Windows platform');
      }
      return new WindowsActivationStrategy(windowsActivationManager);
    } else {
      // Unix-like systems (linux, macos, etc.)
      return new SymlinkActivationStrategy(fileSystemManager, platform);
    }
  }
}
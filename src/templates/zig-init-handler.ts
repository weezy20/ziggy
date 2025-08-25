/**
 * Zig Init Handler - Manages zig init command execution
 * Handles Windows-specific path resolution and proper error handling
 */

import { join } from 'path';
import { spawn } from 'child_process';
import type { IFileSystemManager } from '../interfaces.js';
import type { IPlatformDetector } from '../utils/platform.js';
import { colors } from '../utils/colors.js';

export interface ZigInitOptions {
  flags?: string[];
  projectName?: string;
  targetPath: string;
}

export interface ZigInitResult {
  success: boolean;
  output?: string;
  error?: string;
}

export class ZigInitHandler {
  constructor(
    private platformDetector: IPlatformDetector,
    private fileSystemManager: IFileSystemManager
  ) {}

  /**
   * Find the Zig executable path with Windows-specific handling
   * @returns The path to the zig executable or null if not found
   */
  public findZigExecutable(): string | null {
    const isWindows = this.platformDetector.getOS() === 'win32';
    const executableName = isWindows ? 'zig.exe' : 'zig';
    
    // First, try to find zig in PATH using 'which' or 'where'
    try {
      const whichCommand = isWindows ? 'where' : 'which';
      const result = Bun.spawnSync([whichCommand, isWindows ? 'zig' : 'zig'], {
        stdout: 'pipe',
        stderr: 'pipe'
      });

      if (result.exitCode === 0 && result.stdout) {
        const zigPath = result.stdout.toString().trim().split('\n')[0];
        if (zigPath && this.fileSystemManager.fileExists(zigPath)) {
          return zigPath;
        }
      }
    } catch (error) {
      // Continue to other methods if which/where fails
    }

    // Second, check common Ziggy installation paths
    const ziggyDir = this.platformDetector.getZiggyDir();
    const ziggyBinPath = join(ziggyDir, 'bin', executableName);
    
    if (this.fileSystemManager.fileExists(ziggyBinPath)) {
      return ziggyBinPath;
    }

    // Third, check if there's a current version symlink
    const currentVersionPath = join(ziggyDir, 'current', executableName);
    if (this.fileSystemManager.fileExists(currentVersionPath)) {
      return currentVersionPath;
    }

    return null;
  }

  /**
   * Validate that Zig is available and working
   * @returns true if Zig is available and responds to version command
   */
  public async validateZigInstallation(): Promise<boolean> {
    const zigPath = this.findZigExecutable();
    if (!zigPath) {
      return false;
    }

    try {
      const result = Bun.spawnSync([zigPath, 'version'], {
        stdout: 'pipe',
        stderr: 'pipe'
      });

      return result.exitCode === 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Execute zig init command with proper error handling and progress reporting
   * @param options - Configuration options for zig init
   * @param onProgress - Optional progress callback for reporting status
   * @returns Promise resolving to the result of the operation
   */
  public async executeZigInit(
    options: ZigInitOptions, 
    onProgress?: (message: string) => void
  ): Promise<ZigInitResult> {
    onProgress?.('Locating Zig executable...');
    
    const zigPath = this.findZigExecutable();
    
    if (!zigPath) {
      return {
        success: false,
        error: 'Zig executable not found. Please ensure Zig is installed and available in PATH.'
      };
    }

    onProgress?.('Validating Zig installation...');
    
    // Validate Zig installation first
    const isValid = await this.validateZigInstallation();
    if (!isValid) {
      return {
        success: false,
        error: 'Zig installation appears to be corrupted or incompatible. Please reinstall Zig.'
      };
    }

    onProgress?.('Preparing project directory...');
    
    // Ensure target directory exists
    this.fileSystemManager.ensureDirectory(options.targetPath);

    // Build command arguments
    const args = ['init'];
    if (options.flags && options.flags.length > 0) {
      args.push(...options.flags);
    }

    onProgress?.(`Executing: zig ${args.join(' ')}...`);

    try {
      // Execute zig init in the target directory
      const result = await this.executeCommand(zigPath, args, options.targetPath, onProgress);
      
      if (result.success) {
        onProgress?.('Zig init completed successfully!');
        return {
          success: true,
          output: result.output
        };
      } else {
        return {
          success: false,
          error: result.error || 'Unknown error occurred during zig init execution'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to execute zig init: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Execute a command with proper error handling and progress reporting
   * @param command - The command to execute
   * @param args - Command arguments
   * @param cwd - Working directory for the command
   * @param onProgress - Optional progress callback for real-time updates
   * @returns Promise resolving to command result
   */
  private executeCommand(
    command: string, 
    args: string[], 
    cwd: string, 
    onProgress?: (message: string) => void
  ): Promise<ZigInitResult> {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        
        // Report progress for any meaningful output
        const lines = output.trim().split('\n').filter((line: string) => line.trim());
        if (lines.length > 0) {
          onProgress?.(`Zig: ${lines[lines.length - 1]}`);
        }
      });

      child.stderr?.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        
        // Report stderr as progress (zig sometimes uses stderr for info)
        const lines = output.trim().split('\n').filter((line: string) => line.trim());
        if (lines.length > 0) {
          onProgress?.(`Zig: ${lines[lines.length - 1]}`);
        }
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            output: stdout
          });
        } else {
          resolve({
            success: false,
            error: stderr || `Command exited with code ${code}`
          });
        }
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          error: `Failed to start command: ${error.message}`
        });
      });

      // Set a reasonable timeout for zig init (30 seconds)
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({
          success: false,
          error: 'Zig init command timed out after 30 seconds'
        });
      }, 30000);

      child.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Get user-friendly error message for common Zig init failures
   * @param error - The error message from zig init
   * @returns A user-friendly error message with suggestions
   */
  public getErrorSuggestion(error: string): string {
    const lowerError = error.toLowerCase();

    if (lowerError.includes('not found') || lowerError.includes('no such file')) {
      return `${colors.red('Zig executable not found.')}\n` +
             `${colors.yellow('Suggestions:')}\n` +
             `  • Install Zig using: ${colors.cyan('ziggy use <version>')}\n` +
             `  • Check if Zig is in your PATH\n` +
             `  • Run: ${colors.cyan('ziggy list')} to see available versions`;
    }

    if (lowerError.includes('permission') || lowerError.includes('access') || lowerError.includes('denied')) {
      return `${colors.red('Permission denied.')}\n` +
             `${colors.yellow('Suggestions:')}\n` +
             `  • Check directory permissions\n` +
             `  • Try running with appropriate permissions\n` +
             `  • Ensure the target directory is writable`;
    }

    if (lowerError.includes('already exists') || lowerError.includes('file exists')) {
      return `${colors.red('Project files already exist.')}\n` +
             `${colors.yellow('Suggestions:')}\n` +
             `  • Choose a different project name\n` +
             `  • Remove existing files first\n` +
             `  • Use a different directory`;
    }

    if (lowerError.includes('timeout') || lowerError.includes('timed out')) {
      return `${colors.red('Zig init command timed out.')}\n` +
             `${colors.yellow('Suggestions:')}\n` +
             `  • Check your system resources\n` +
             `  • Try again with a simpler project structure\n` +
             `  • Ensure Zig installation is not corrupted`;
    }

    if (lowerError.includes('invalid') || lowerError.includes('syntax')) {
      return `${colors.red('Invalid command or syntax error.')}\n` +
             `${colors.yellow('Suggestions:')}\n` +
             `  • Update to a newer version of Zig\n` +
             `  • Check Zig documentation for supported flags\n` +
             `  • Try using the standard template instead`;
    }

    if (lowerError.includes('corrupted') || lowerError.includes('incompatible')) {
      return `${colors.red('Zig installation appears corrupted.')}\n` +
             `${colors.yellow('Suggestions:')}\n` +
             `  • Reinstall Zig using: ${colors.cyan('ziggy use <version>')}\n` +
             `  • Clear Ziggy cache and try again\n` +
             `  • Check available versions: ${colors.cyan('ziggy list')}`;
    }

    // Generic error with basic suggestions
    return `${colors.red('Zig init failed.')}\n` +
           `${colors.yellow('Suggestions:')}\n` +
           `  • Ensure Zig is properly installed: ${colors.cyan('zig version')}\n` +
           `  • Check that the target directory is writable\n` +
           `  • Try using a different template\n` +
           `  • Run: ${colors.cyan('ziggy list')} to see available Zig versions`;
  }
}
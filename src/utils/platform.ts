/**
 * Platform detection utilities for Ziggy
 * Handles OS, architecture, and shell detection across different platforms
 */

import { resolve, join } from 'path';
import { existsSync } from 'fs';
import type { ShellInfo } from '../types.js';

export interface IPlatformDetector {
  getArch(): string;
  getPlatform(): string;
  getOS(): string;
  getShellInfo(): ShellInfo;
  isZiggyConfigured(binDir: string): boolean;
  hasEnvFileConfigured(envPath: string): boolean;
  getZiggyDir(): string;
  expandHomePath(path: string): string;
  getShellSourceLine(envPath: string): string;
  getPathExportLine(shell: string, zigBinPath: string): string;
  getArchiveExtension(): string;
}

export class PlatformDetector implements IPlatformDetector {
  private arch: string;
  private platform: string;
  private os: string;

  constructor() {
    this.arch = this.detectArch();
    this.platform = this.detectPlatform();
    this.os = this.detectOS();
  }

  /**
   * Get the normalized architecture string for Zig downloads
   */
  public getArch(): string {
    return this.arch;
  }

  /**
   * Get the normalized platform string for Zig downloads
   */
  public getPlatform(): string {
    return this.platform;
  }

  /**
   * Get the raw OS string from Node.js
   */
  public getOS(): string {
    return this.os;
  }

  /**
   * Detect and return shell information for the current environment
   */
  public getShellInfo(): ShellInfo {
    return this.detectShell();
  }

  /**
   * Check if ziggy is already properly configured in the user's environment
   * Returns true if ziggy/bin directory is already in PATH and working
   */
  public isZiggyConfigured(binDir: string): boolean {
    const pathEnv = process.env.PATH || '';
    const pathSeparator = this.platform === 'win32' ? ';' : ':';
    const pathDirs = pathEnv.split(pathSeparator);
    
    // Check if ziggy bin directory is already in PATH
    const ziggyBinNormalized = resolve(binDir);
    let inPath = false;
    
    for (const dir of pathDirs) {
      if (!dir.trim()) continue; // Skip empty entries
      
      try {
        const normalizedDir = resolve(dir.trim());
        if (normalizedDir === ziggyBinNormalized) {
          inPath = true;
          break;
        }
      } catch (_error) {
        // Skip invalid paths
        continue;
      }
    }
    
    // If not in PATH, definitely not configured
    if (!inPath) {
      return false;
    }
    
    // Additional verification: check if zig command is accessible and from ziggy
    try {
      const which = this.platform === 'win32' ? 'where' : 'which';
      const result = Bun.spawnSync([which, 'zig'], { 
        stdout: 'pipe',
        stderr: 'pipe'
      });
      
      if (result.exitCode === 0) {
        const zigPath = result.stdout.toString().trim();
        // Handle multiple paths returned by which/where
        const firstZigPath = zigPath.split('\n')[0]?.trim() || zigPath;
        
        // Check if the found zig is from ziggy's bin directory
        const ziggyZigPath = join(binDir, this.platform === 'win32' ? 'zig.exe' : 'zig');
        
        try {
          const resolvedZigPath = resolve(firstZigPath);
          const resolvedZiggyPath = resolve(ziggyZigPath);
          return resolvedZigPath === resolvedZiggyPath;
        } catch (_error) {
          // If path resolution fails, fall back to string comparison
          return firstZigPath.includes(binDir) || firstZigPath.startsWith(ziggyBinNormalized);
        }
      }
    } catch (_error) {
      // If we can't run which/where, assume it's configured if in PATH
      return inPath;
    }
    
    // If we get here, ziggy/bin is in PATH but zig command is not accessible
    // This might happen if the symlink is missing or broken
    return false;
  }

  /**
   * Check if env file exists and might be configured
   * Returns true if env file exists (user might need to source it)
   */
  public hasEnvFileConfigured(envPath: string): boolean {
    return existsSync(envPath);
  }

  /**
   * Get the ziggy directory path, checking environment variable first
   */
  public getZiggyDir(): string {
    // Check environment variable first
    const envDir = process.env.ZIGGY_DIR;
    if (envDir) {
      return resolve(envDir);
    }

    // Default to ~/.ziggy
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (!homeDir) {
      throw new Error('Unable to determine home directory');
    }

    return join(homeDir, '.ziggy');
  }

  /**
   * Expand tilde (~) in file paths to the home directory
   */
  public expandHomePath(path: string): string {
    if (path.startsWith('~')) {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      return path.replace('~', homeDir);
    }
    return path;
  }

  /**
   * Get the appropriate shell source line for the current platform
   */
  public getShellSourceLine(envPath: string): string {
    if (this.os === 'win32') {
      return `. "${envPath}"`;
    } else {
      return `source "${envPath}"`;
    }
  }

  /**
   * Get the appropriate PATH export line for the given shell
   */
  public getPathExportLine(shell: string, zigBinPath: string): string {
    switch (shell.toLowerCase()) {
      case 'fish':
        return `set -x PATH $PATH ${zigBinPath}`;
      case 'c shell':
      case 'tcsh':
      case 'csh':
        return `setenv PATH $PATH:${zigBinPath}`;
      default:
        // Bash, Zsh, Korn Shell, etc.
        return `export PATH="$PATH:${zigBinPath}"`;
    }
  }

  /**
   * Get the appropriate file extension for Zig downloads based on platform
   */
  public getArchiveExtension(): string {
    return this.platform === 'windows' ? 'zip' : 'tar.xz';
  }

  /**
   * Detect the system architecture and normalize it for Zig downloads
   */
  private detectArch(): string {
    const arch = process.arch;
    switch (arch) {
      case 'x64': return 'x86_64';
      case 'arm64': return 'aarch64';
      case 'ia32': return 'i386';
      default: return arch;
    }
  }

  /**
   * Detect the platform and normalize it for Zig downloads
   */
  private detectPlatform(): string {
    switch (this.detectOS()) {
      case 'linux': return 'linux';
      case 'darwin': return 'macos';
      case 'win32': return 'windows';
      default: return 'unknown';
    }
  }

  /**
   * Detect the operating system
   */
  private detectOS(): string {
    return process.platform;
  }

  /**
   * Detect the current shell and return configuration information
   */
  private detectShell(): ShellInfo {
    const shell = process.env.SHELL || '';
    const platform = process.platform;

    if (platform === 'win32') {
      // Windows detection
      if (process.env.PSModulePath) {
        return {
          shell: 'PowerShell',
          profileFile: '$PROFILE',
          command: `echo '$env:PATH += ";__ZIG_BIN_PATH__"' >> $PROFILE`
        };
      } else {
        return {
          shell: 'Command Prompt',
          profileFile: 'System Environment Variables',
          command: `setx PATH "%PATH%;__ZIG_BIN_PATH__"`
        };
      }
    }

    // Unix-like systems
    if (shell.includes('zsh')) {
      return {
        shell: 'Zsh',
        profileFile: '~/.zshrc',
        command: `echo 'export PATH="$PATH:__ZIG_BIN_PATH__"' >> ~/.zshrc`
      };
    } else if (shell.includes('fish')) {
      return {
        shell: 'Fish',
        profileFile: '~/.config/fish/config.fish',
        command: `echo 'set -x PATH $PATH __ZIG_BIN_PATH__' >> ~/.config/fish/config.fish`
      };
    } else if (shell.includes('ksh')) {
      return {
        shell: 'Korn Shell',
        profileFile: '~/.kshrc',
        command: `echo 'export PATH="$PATH:__ZIG_BIN_PATH__"' >> ~/.kshrc`
      };
    } else if (shell.includes('tcsh') || shell.includes('csh')) {
      return {
        shell: 'C Shell',
        profileFile: '~/.cshrc',
        command: `echo 'setenv PATH $PATH:__ZIG_BIN_PATH__' >> ~/.cshrc`
      };
    } else {
      // Default to bash
      return {
        shell: 'Bash',
        profileFile: '~/.bashrc',
        command: `echo 'export PATH="$PATH:__ZIG_BIN_PATH__"' >> ~/.bashrc`
      };
    }
  }
}
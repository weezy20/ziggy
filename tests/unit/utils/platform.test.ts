/**
 * Unit tests for platform detection utilities
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { PlatformDetector } from '../../../src/utils/platform.js';
import type { ShellInfo } from '../../../src/types.js';

describe('PlatformDetector', () => {
  let platformDetector: PlatformDetector;
  let originalPlatform: string;
  let originalArch: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Store original values
    originalPlatform = process.platform;
    originalArch = process.arch;
    originalEnv = { ...process.env };
    
    // Create fresh instance
    platformDetector = new PlatformDetector();
  });

  afterEach(() => {
    // Restore original values
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    Object.defineProperty(process, 'arch', { value: originalArch });
    process.env = originalEnv;
  });

  describe('Architecture Detection', () => {
    it('should detect x64 architecture correctly', () => {
      Object.defineProperty(process, 'arch', { value: 'x64' });
      const detector = new PlatformDetector();
      expect(detector.getArch()).toBe('x86_64');
    });

    it('should detect arm64 architecture correctly', () => {
      Object.defineProperty(process, 'arch', { value: 'arm64' });
      const detector = new PlatformDetector();
      expect(detector.getArch()).toBe('aarch64');
    });

    it('should detect ia32 architecture correctly', () => {
      Object.defineProperty(process, 'arch', { value: 'ia32' });
      const detector = new PlatformDetector();
      expect(detector.getArch()).toBe('i386');
    });

    it('should return unknown architecture as-is', () => {
      Object.defineProperty(process, 'arch', { value: 'unknown' });
      const detector = new PlatformDetector();
      expect(detector.getArch()).toBe('unknown');
    });
  });

  describe('Platform Detection', () => {
    it('should detect Linux platform correctly', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      const detector = new PlatformDetector();
      expect(detector.getPlatform()).toBe('linux');
    });

    it('should detect macOS platform correctly', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const detector = new PlatformDetector();
      expect(detector.getPlatform()).toBe('macos');
    });

    it('should detect Windows platform correctly', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      const detector = new PlatformDetector();
      expect(detector.getPlatform()).toBe('windows');
    });

    it('should return unknown for unrecognized platforms', () => {
      Object.defineProperty(process, 'platform', { value: 'unknown' });
      const detector = new PlatformDetector();
      expect(detector.getPlatform()).toBe('unknown');
    });
  });

  describe('OS Detection', () => {
    it('should return the raw process.platform value', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      const detector = new PlatformDetector();
      expect(detector.getOS()).toBe('linux');
    });
  });

  describe('Shell Detection', () => {
    it('should detect PowerShell on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.PSModulePath = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules';
      
      const detector = new PlatformDetector();
      const shellInfo = detector.getShellInfo();
      
      expect(shellInfo.shell).toBe('PowerShell');
      expect(shellInfo.profileFile).toBe('$PROFILE');
      expect(shellInfo.command).toContain('$env:PATH');
    });

    it('should detect Command Prompt on Windows without PowerShell', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      delete process.env.PSModulePath;
      
      const detector = new PlatformDetector();
      const shellInfo = detector.getShellInfo();
      
      expect(shellInfo.shell).toBe('Command Prompt');
      expect(shellInfo.profileFile).toBe('System Environment Variables');
      expect(shellInfo.command).toContain('setx PATH');
    });

    it('should detect Zsh on Unix systems', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.SHELL = '/bin/zsh';
      
      const detector = new PlatformDetector();
      const shellInfo = detector.getShellInfo();
      
      expect(shellInfo.shell).toBe('Zsh');
      expect(shellInfo.profileFile).toBe('~/.zshrc');
      expect(shellInfo.command).toContain('export PATH');
    });

    it('should detect Fish shell on Unix systems', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.SHELL = '/usr/bin/fish';
      
      const detector = new PlatformDetector();
      const shellInfo = detector.getShellInfo();
      
      expect(shellInfo.shell).toBe('Fish');
      expect(shellInfo.profileFile).toBe('~/.config/fish/config.fish');
      expect(shellInfo.command).toContain('set -x PATH');
    });

    it('should detect Korn Shell on Unix systems', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.SHELL = '/bin/ksh';
      
      const detector = new PlatformDetector();
      const shellInfo = detector.getShellInfo();
      
      expect(shellInfo.shell).toBe('Korn Shell');
      expect(shellInfo.profileFile).toBe('~/.kshrc');
      expect(shellInfo.command).toContain('export PATH');
    });

    it('should detect C Shell on Unix systems', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.SHELL = '/bin/tcsh';
      
      const detector = new PlatformDetector();
      const shellInfo = detector.getShellInfo();
      
      expect(shellInfo.shell).toBe('C Shell');
      expect(shellInfo.profileFile).toBe('~/.cshrc');
      expect(shellInfo.command).toContain('setenv PATH');
    });

    it('should default to Bash on Unix systems', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.SHELL = '/bin/bash';
      
      const detector = new PlatformDetector();
      const shellInfo = detector.getShellInfo();
      
      expect(shellInfo.shell).toBe('Bash');
      expect(shellInfo.profileFile).toBe('~/.bashrc');
      expect(shellInfo.command).toContain('export PATH');
    });
  });

  describe('Ziggy Directory Detection', () => {
    it('should use ZIGGY_DIR environment variable when set', () => {
      process.env.ZIGGY_DIR = '/custom/ziggy/path';
      
      const detector = new PlatformDetector();
      const ziggyDir = detector.getZiggyDir();
      
      // Normalize path separators for cross-platform testing
      const normalizedPath = ziggyDir.replace(/\\/g, '/');
      expect(normalizedPath).toContain('/custom/ziggy/path');
    });

    it('should use HOME directory on Unix systems', () => {
      delete process.env.ZIGGY_DIR;
      process.env.HOME = '/home/user';
      delete process.env.USERPROFILE;
      
      const detector = new PlatformDetector();
      const ziggyDir = detector.getZiggyDir();
      
      // Normalize path separators for cross-platform testing
      const normalizedPath = ziggyDir.replace(/\\/g, '/');
      expect(normalizedPath).toContain('/home/user/.ziggy');
    });

    it('should use USERPROFILE directory on Windows', () => {
      delete process.env.ZIGGY_DIR;
      delete process.env.HOME;
      process.env.USERPROFILE = 'C:\\Users\\user';
      
      const detector = new PlatformDetector();
      const ziggyDir = detector.getZiggyDir();
      
      expect(ziggyDir).toContain('C:\\Users\\user\\.ziggy');
    });

    it('should throw error when no home directory is found', () => {
      delete process.env.ZIGGY_DIR;
      delete process.env.HOME;
      delete process.env.USERPROFILE;
      
      const detector = new PlatformDetector();
      
      expect(() => detector.getZiggyDir()).toThrow('Unable to determine home directory');
    });
  });

  describe('Path Utilities', () => {
    it('should expand tilde paths correctly', () => {
      process.env.HOME = '/home/user';
      
      const detector = new PlatformDetector();
      const expanded = detector.expandHomePath('~/test/path');
      
      expect(expanded).toBe('/home/user/test/path');
    });

    it('should not modify paths without tilde', () => {
      const detector = new PlatformDetector();
      const path = '/absolute/path';
      const expanded = detector.expandHomePath(path);
      
      expect(expanded).toBe(path);
    });

    it('should generate correct shell source line for Unix', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      
      const detector = new PlatformDetector();
      const sourceLine = detector.getShellSourceLine('/path/to/env');
      
      expect(sourceLine).toBe('source "/path/to/env"');
    });

    it('should generate correct shell source line for Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      
      const detector = new PlatformDetector();
      const sourceLine = detector.getShellSourceLine('C:\\path\\to\\env.ps1');
      
      expect(sourceLine).toBe('. "C:\\path\\to\\env.ps1"');
    });
  });

  describe('PATH Export Lines', () => {
    it('should generate correct export line for Fish shell', () => {
      const detector = new PlatformDetector();
      const exportLine = detector.getPathExportLine('fish', '/path/to/bin');
      
      expect(exportLine).toBe('set -x PATH $PATH /path/to/bin');
    });

    it('should generate correct export line for C Shell', () => {
      const detector = new PlatformDetector();
      const exportLine = detector.getPathExportLine('csh', '/path/to/bin');
      
      expect(exportLine).toBe('setenv PATH $PATH:/path/to/bin');
    });

    it('should generate correct export line for Bash/Zsh', () => {
      const detector = new PlatformDetector();
      const exportLine = detector.getPathExportLine('bash', '/path/to/bin');
      
      expect(exportLine).toBe('export PATH="$PATH:/path/to/bin"');
    });

    it('should default to Bash format for unknown shells', () => {
      const detector = new PlatformDetector();
      const exportLine = detector.getPathExportLine('unknown', '/path/to/bin');
      
      expect(exportLine).toBe('export PATH="$PATH:/path/to/bin"');
    });
  });

  describe('Archive Extension Detection', () => {
    it('should return zip extension for Windows platform', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      const detector = new PlatformDetector();
      
      expect(detector.getArchiveExtension()).toBe('zip');
    });

    it('should return tar.xz extension for Linux platform', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      const detector = new PlatformDetector();
      
      expect(detector.getArchiveExtension()).toBe('tar.xz');
    });

    it('should return tar.xz extension for macOS platform', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const detector = new PlatformDetector();
      
      expect(detector.getArchiveExtension()).toBe('tar.xz');
    });

    it('should return tar.xz extension for unknown platforms', () => {
      Object.defineProperty(process, 'platform', { value: 'unknown' });
      const detector = new PlatformDetector();
      
      expect(detector.getArchiveExtension()).toBe('tar.xz');
    });
  });

  describe('Configuration Detection', () => {
    it('should detect when ziggy is configured in PATH', () => {
      // Mock Bun.spawnSync for which/where command
      const originalSpawn = Bun.spawnSync;
      Bun.spawnSync = mock((cmd: string[]) => {
        if (cmd[0] === 'which' || cmd[0] === 'where') {
          return {
            exitCode: 0,
            stdout: Buffer.from('/test/bin/zig'),
            stderr: Buffer.from('')
          };
        }
        return { exitCode: 1, stdout: Buffer.from(''), stderr: Buffer.from('') };
      });

      // Mock PATH environment
      process.env.PATH = '/test/bin:/usr/bin:/bin';
      
      const detector = new PlatformDetector();
      const isConfigured = detector.isZiggyConfigured('/test/bin');
      
      expect(isConfigured).toBe(true);
      
      // Restore original spawn
      Bun.spawnSync = originalSpawn;
    });

    it('should detect when ziggy is not in PATH', () => {
      process.env.PATH = '/usr/bin:/bin';
      
      const detector = new PlatformDetector();
      const isConfigured = detector.isZiggyConfigured('/test/bin');
      
      expect(isConfigured).toBe(false);
    });
  });
});
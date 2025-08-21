/**
 * Unit tests for ConfigManager
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { join } from 'path';
import { ConfigManager } from '../../../src/core/config';
import type { ZiggyConfig, DownloadStatus } from '../../../src/types';
import type { IFileSystemManager } from '../../../src/interfaces';

// Mock FileSystemManager
class MockFileSystemManager implements IFileSystemManager {
  private files = new Map<string, string>();
  private directories = new Set<string>();

  fileExists(path: string): boolean {
    return this.files.has(path);
  }

  directoryExists(path: string): boolean {
    return this.directories.has(path);
  }

  isDirectory(path: string): boolean {
    return this.directories.has(path);
  }

  readFile(path: string): string {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`File not found: ${path}`);
    }
    return content;
  }

  writeFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  listDirectory(path: string): string[] {
    if (!this.directories.has(path)) {
      throw new Error(`Directory not found: ${path}`);
    }
    // Return mock version directories
    return ['0.11.0', '0.12.0', 'master'];
  }

  ensureDirectory(path: string): void {
    this.directories.add(path);
  }

  removeDirectory(path: string): void {
    this.directories.delete(path);
  }

  createSymlink(target: string, link: string, platform: string): void {
    // Mock implementation
  }

  copyFile(source: string, destination: string): void {
    const content = this.files.get(source);
    if (content !== undefined) {
      this.files.set(destination, content);
    }
  }

  // Helper methods for testing
  setFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  setDirectory(path: string): void {
    this.directories.add(path);
  }

  clear(): void {
    this.files.clear();
    this.directories.clear();
  }
}

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let mockFileSystem: MockFileSystemManager;
  const ziggyDir = '/home/user/.ziggy';
  const configPath = join(ziggyDir, 'ziggy.toml');

  beforeEach(() => {
    mockFileSystem = new MockFileSystemManager();
    configManager = new ConfigManager(ziggyDir, mockFileSystem);
  });

  describe('load()', () => {
    it('should return default config when no file exists', () => {
      const config = configManager.load();
      
      expect(config).toEqual({
        downloads: {}
      });
    });

    it('should load valid TOML configuration', () => {
      const tomlContent = `# Ziggy Configuration

currentVersion = "0.11.0"

[downloads."0.11.0"]
path = "/home/user/.ziggy/versions/0.11.0"
downloadedAt = "2024-01-15T10:30:00Z"
status = "completed"

[downloads.master]
path = "/home/user/.ziggy/versions/master"
downloadedAt = "2024-01-16T14:20:00Z"
status = "completed"
isSystemWide = false
`;

      mockFileSystem.setFile(configPath, tomlContent);

      const config = configManager.load();

      expect(config.currentVersion).toBe('0.11.0');
      expect(config.downloads['0.11.0']).toEqual({
        version: '0.11.0',
        path: '/home/user/.ziggy/versions/0.11.0',
        downloadedAt: '2024-01-15T10:30:00Z',
        status: 'completed'
      });
      expect(config.downloads.master).toEqual({
        version: 'master',
        path: '/home/user/.ziggy/versions/master',
        downloadedAt: '2024-01-16T14:20:00Z',
        status: 'completed',
        isSystemWide: false
      });
    });

    it('should handle invalid TOML and attempt migration', () => {
      const legacyContent = `# Ziggy Configuration

currentVersion = "0.11.0"

[downloads."0.11.0"]
path = "/home/user/.ziggy/versions/0.11.0"
downloadedAt = "2024-01-15T10:30:00Z"
status = "completed"
`;

      mockFileSystem.setFile(configPath, legacyContent);

      const config = configManager.load();

      expect(config.currentVersion).toBe('0.11.0');
      expect(config.downloads['0.11.0']).toBeDefined();
    });

    it('should scan existing installations when no config exists', () => {
      const versionsDir = join(ziggyDir, 'versions');
      mockFileSystem.setDirectory(versionsDir);
      mockFileSystem.setDirectory(join(versionsDir, '0.11.0'));
      mockFileSystem.setDirectory(join(versionsDir, '0.12.0'));
      mockFileSystem.setDirectory(join(versionsDir, 'master'));
      mockFileSystem.setFile(join(versionsDir, '0.11.0', 'zig'), '');
      mockFileSystem.setFile(join(versionsDir, '0.12.0', 'zig'), '');
      mockFileSystem.setFile(join(versionsDir, 'master', 'zig'), '');

      const config = configManager.load();

      expect(Object.keys(config.downloads)).toContain('0.11.0');
      expect(Object.keys(config.downloads)).toContain('0.12.0');
      expect(Object.keys(config.downloads)).toContain('master');
    });

    it('should validate download status values', () => {
      const tomlContent = `# Ziggy Configuration

[downloads."0.11.0"]
path = "/home/user/.ziggy/versions/0.11.0"
downloadedAt = "2024-01-15T10:30:00Z"
status = "invalid_status"
`;

      mockFileSystem.setFile(configPath, tomlContent);

      const config = configManager.load();

      expect(config.downloads['0.11.0']?.status).toBe('completed');
    });
  });

  describe('save()', () => {
    it('should save configuration as valid TOML', () => {
      const config: ZiggyConfig = {
        currentVersion: '0.11.0',
        downloads: {
          '0.11.0': {
            version: '0.11.0',
            path: '/home/user/.ziggy/versions/0.11.0',
            downloadedAt: '2024-01-15T10:30:00Z',
            status: 'completed'
          },
          'master': {
            version: 'master',
            path: '/home/user/.ziggy/versions/master',
            downloadedAt: '2024-01-16T14:20:00Z',
            status: 'downloading',
            isSystemWide: true
          }
        }
      };

      configManager.save(config);

      const savedContent = mockFileSystem.readFile(configPath);
      expect(savedContent).toContain('# Ziggy Configuration');
      expect(savedContent).toContain('currentVersion = "0.11.0"');
      expect(savedContent).toContain('[downloads."0.11.0"]');
      expect(savedContent).toContain('path = "/home/user/.ziggy/versions/0.11.0"');
      expect(savedContent).toContain('status = "completed"');
      expect(savedContent).toContain('[downloads.master]');
      expect(savedContent).toContain('status = "downloading"');
      expect(savedContent).toContain('isSystemWide = true');
    });

    it('should save minimal configuration', () => {
      const config: ZiggyConfig = {
        downloads: {}
      };

      configManager.save(config);

      const savedContent = mockFileSystem.readFile(configPath);
      expect(savedContent).toContain('# Ziggy Configuration');
      expect(savedContent).not.toContain('currentVersion');
    });

    it('should handle save errors gracefully', () => {
      const config: ZiggyConfig = { downloads: {} };
      
      // Mock writeFile to throw an error
      const originalWriteFile = mockFileSystem.writeFile;
      mockFileSystem.writeFile = () => {
        throw new Error('Write failed');
      };

      expect(() => configManager.save(config)).toThrow('Failed to save configuration: Write failed');
      
      // Restore original method
      mockFileSystem.writeFile = originalWriteFile;
    });
  });

  describe('scanExistingInstallations()', () => {
    it('should return empty config when versions directory does not exist', () => {
      const config = configManager.scanExistingInstallations();
      
      expect(config).toEqual({
        downloads: {}
      });
    });

    it('should scan and find existing installations', () => {
      const versionsDir = join(ziggyDir, 'versions');
      mockFileSystem.setDirectory(versionsDir);
      mockFileSystem.setDirectory(join(versionsDir, '0.11.0'));
      mockFileSystem.setDirectory(join(versionsDir, '0.12.0'));
      mockFileSystem.setFile(join(versionsDir, '0.11.0', 'zig'), '');
      mockFileSystem.setFile(join(versionsDir, '0.12.0', 'zig'), '');

      const config = configManager.scanExistingInstallations();

      expect(config.downloads['0.11.0']).toBeDefined();
      expect(config.downloads['0.11.0']?.version).toBe('0.11.0');
      expect(config.downloads['0.11.0']?.status).toBe('completed');
      expect(config.downloads['0.12.0']).toBeDefined();
    });

    it('should handle Windows executable names', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const versionsDir = join(ziggyDir, 'versions');
      mockFileSystem.setDirectory(versionsDir);
      mockFileSystem.setDirectory(join(versionsDir, '0.11.0'));
      mockFileSystem.setFile(join(versionsDir, '0.11.0', 'zig.exe'), '');

      const config = configManager.scanExistingInstallations();

      expect(config.downloads['0.11.0']).toBeDefined();

      // Restore original platform
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe('migration from legacy format', () => {
    it('should migrate legacy manual parsing format', () => {
      const legacyContent = `# Ziggy Configuration

currentVersion = "0.11.0"

[downloads."0.11.0"]
path = "/home/user/.ziggy/versions/0.11.0"
downloadedAt = "2024-01-15T10:30:00Z"
status = "completed"
isSystemWide = "true"
`;

      mockFileSystem.setFile(configPath, legacyContent);

      const config = configManager.load();

      expect(config.currentVersion).toBe('0.11.0');
      expect(config.downloads['0.11.0']).toBeDefined();
      expect(config.downloads['0.11.0']?.isSystemWide).toBe(true);
    });

    it('should handle malformed legacy content gracefully', () => {
      const malformedContent = `# Ziggy Configuration
currentVersion = 
[downloads."0.11.0"
path = 
`;

      mockFileSystem.setFile(configPath, malformedContent);

      const config = configManager.load();

      expect(config).toEqual({
        downloads: {}
      });
    });
  });

  describe('validation', () => {
    it('should validate and sanitize download status', () => {
      const tomlContent = `# Ziggy Configuration

[downloads."0.11.0"]
path = "/home/user/.ziggy/versions/0.11.0"
downloadedAt = "2024-01-15T10:30:00Z"
status = "unknown_status"
`;

      mockFileSystem.setFile(configPath, tomlContent);

      const config = configManager.load();

      expect(config.downloads['0.11.0']?.status).toBe('completed');
    });

    it('should handle missing required fields', () => {
      const tomlContent = `# Ziggy Configuration

[downloads."0.11.0"]
downloadedAt = "2024-01-15T10:30:00Z"
`;

      mockFileSystem.setFile(configPath, tomlContent);

      const config = configManager.load();

      expect(config.downloads['0.11.0']).toBeUndefined();
    });

    it('should provide default downloadedAt when missing', () => {
      const tomlContent = `# Ziggy Configuration

[downloads."0.11.0"]
path = "/home/user/.ziggy/versions/0.11.0"
status = "completed"
`;

      mockFileSystem.setFile(configPath, tomlContent);

      const config = configManager.load();

      expect(config.downloads['0.11.0']?.downloadedAt).toBeDefined();
      expect(new Date(config.downloads['0.11.0']!.downloadedAt)).toBeInstanceOf(Date);
    });
  });
});
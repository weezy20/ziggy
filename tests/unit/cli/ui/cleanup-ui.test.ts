import { describe, it, expect, beforeEach } from 'bun:test';
import { CleanupUI } from '../../../../src/cli/ui/cleanup-ui';
import type { FileSystemManager } from '../../../../src/utils/filesystem';
import type { VersionManager } from '../../../../src/core/version';
import type { ConfigManager } from '../../../../src/core/config';
import type { ZiggyConfig } from '../../../../src/types';

describe('CleanupUI', () => {
  let cleanupUI: CleanupUI;
  let mockFileSystemManager: FileSystemManager;
  let mockVersionManager: VersionManager;
  let mockConfigManager: ConfigManager;
  let mockConfig: ZiggyConfig;
  let mockCreateSymlink: (targetPath: string, version: string) => void;
  let mockShowPostActionOptions: () => Promise<string>;
  let mockReloadConfig: () => void;

  beforeEach(() => {
    mockConfig = {
      downloads: {
        '0.11.0': {
          version: '0.11.0',
          path: '/home/user/.ziggy/versions/0.11.0',
          status: 'completed',
          downloadedAt: '2024-01-01T00:00:00Z'
        }
      }
    };

    mockFileSystemManager = {
      fileExists: () => true,
      removeDirectory: () => {},
      safeRemove: () => {}
    } as FileSystemManager;

    mockVersionManager = {
      getCurrentVersion: () => '0.11.0',
      setCurrentVersion: () => {},
      clearCurrentVersion: () => {}
    } as VersionManager;

    mockConfigManager = {
      save: () => {}
    } as ConfigManager;

    mockCreateSymlink = () => {};
    mockShowPostActionOptions = () => Promise.resolve('main-menu');
    mockReloadConfig = () => {};

    cleanupUI = new CleanupUI(
      mockFileSystemManager,
      mockVersionManager,
      mockConfigManager,
      mockConfig,
      '/home/user/.ziggy',
      mockCreateSymlink,
      mockShowPostActionOptions,
      mockReloadConfig
    );
  });

  it('should initialize correctly', () => {
    expect(cleanupUI).toBeDefined();
    expect(typeof cleanupUI.handleCleanTUI).toBe('function');
    expect(typeof cleanupUI.cleanAllVersions).toBe('function');
    expect(typeof cleanupUI.cleanExceptCurrent).toBe('function');
    expect(typeof cleanupUI.selectVersionToKeep).toBe('function');
  });

  it('should have handleCleanTUI method', () => {
    expect(typeof cleanupUI.handleCleanTUI).toBe('function');
  });

  it('should have cleanAllVersions method', () => {
    expect(typeof cleanupUI.cleanAllVersions).toBe('function');
  });

  it('should have cleanExceptCurrent method', () => {
    expect(typeof cleanupUI.cleanExceptCurrent).toBe('function');
  });

  it('should have selectVersionToKeep method', () => {
    expect(typeof cleanupUI.selectVersionToKeep).toBe('function');
  });
});
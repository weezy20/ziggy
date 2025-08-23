import { describe, it, expect, beforeEach } from 'bun:test';
import { MainMenuUI } from '../../../../src/cli/ui/main-menu';
import type { PlatformDetector } from '../../../../src/utils/platform';
import type { FileSystemManager } from '../../../../src/utils/filesystem';
import type { VersionManager } from '../../../../src/core/version';
import type { ConfigManager } from '../../../../src/core/config';
import type { ZiggyConfig } from '../../../../src/types';

describe('MainMenuUI', () => {
  let mainMenuUI: MainMenuUI;
  let mockPlatformDetector: PlatformDetector;
  let mockFileSystemManager: FileSystemManager;
  let mockVersionManager: VersionManager;
  let mockConfigManager: ConfigManager;
  let mockConfig: ZiggyConfig;
  let mockCallbacks: {
    onCreateProject: () => Promise<void>;
    onDownloadLatest: () => Promise<void>;
    onDownloadSpecific: () => Promise<void>;
    onListVersions: () => Promise<void>;
    onUseVersion: () => Promise<void>;
    onClean: () => Promise<void>;
  };

  beforeEach(() => {
    mockConfig = {
      downloads: {},
      currentVersion: undefined
    };

    mockPlatformDetector = {
      getArch: () => 'x64',
      getPlatform: () => 'linux',
      getOS: () => 'linux',
      getShellInfo: () => ({ shell: 'bash', profileFile: '~/.bashrc' })
    } as PlatformDetector;

    mockFileSystemManager = {
      fileExists: () => true
    } as FileSystemManager;

    mockVersionManager = {
      getCurrentVersion: () => undefined
    } as VersionManager;

    mockConfigManager = {} as ConfigManager;

    mockCallbacks = {
      onCreateProject: async () => {},
      onDownloadLatest: async () => {},
      onDownloadSpecific: async () => {},
      onListVersions: async () => {},
      onUseVersion: async () => {},
      onClean: async () => {}
    };

    mainMenuUI = new MainMenuUI(
      mockPlatformDetector,
      mockFileSystemManager,
      mockVersionManager,
      mockConfigManager,
      '/home/user/.ziggy',
      '/home/user/.ziggy/bin',
      '/home/user/.ziggy/env',
      mockConfig,
      mockCallbacks.onCreateProject,
      mockCallbacks.onDownloadLatest,
      mockCallbacks.onDownloadSpecific,
      mockCallbacks.onListVersions,
      mockCallbacks.onUseVersion,
      mockCallbacks.onClean
    );
  });

  it('should initialize correctly', () => {
    expect(mainMenuUI).toBeDefined();
    expect(typeof mainMenuUI.displayHeaderWithInfo).toBe('function');
    expect(typeof mainMenuUI.showPostActionOptions).toBe('function');
  });

  it('should have displayHeaderWithInfo method', () => {
    // Just verify the method exists and can be called without throwing
    expect(() => mainMenuUI.displayHeaderWithInfo()).not.toThrow();
  });

  it('should have showPostActionOptions method', () => {
    // This test would require mocking clack.select, which is complex
    // For now, just verify the method exists
    expect(typeof mainMenuUI.showPostActionOptions).toBe('function');
  });
});
import { describe, it, expect, beforeEach } from 'bun:test';
import { DownloadUI } from '../../../../src/cli/ui/download-ui';
import type { PlatformDetector } from '../../../../src/utils/platform';
import type { FileSystemManager } from '../../../../src/utils/filesystem';
import type { VersionManager } from '../../../../src/core/version';
import type { ZiggyConfig } from '../../../../src/types';

describe('DownloadUI', () => {
  let downloadUI: DownloadUI;
  let mockPlatformDetector: PlatformDetector;
  let mockFileSystemManager: FileSystemManager;
  let mockVersionManager: VersionManager;
  let mockConfig: ZiggyConfig;
  let mockCoreDownloadVersion: (version: string) => Promise<void>;
  let mockCoreRemoveVersion: (version: string) => Promise<void>;
  let mockReloadConfig: () => void;
  let mockCreateEnvFile: () => void;

  beforeEach(() => {
    mockConfig = {
      downloads: {}
    };

    mockPlatformDetector = {
      getPlatform: () => 'linux',
      isZiggyInPath: () => false,
      isZiggyConfigured: () => false,
      hasEnvFileConfigured: () => false,
      getShellInfo: () => ({ shell: 'bash', profileFile: '~/.bashrc' })
    } as PlatformDetector;

    mockFileSystemManager = {
      fileExists: () => false
    } as FileSystemManager;

    mockVersionManager = {
      getCurrentVersion: () => undefined
    } as VersionManager;

    mockCoreDownloadVersion = async () => {};
    mockCoreRemoveVersion = async () => {};
    mockReloadConfig = () => {};
    mockCreateEnvFile = () => {};

    downloadUI = new DownloadUI(
      mockPlatformDetector,
      mockFileSystemManager,
      mockVersionManager,
      mockConfig,
      '/home/user/.ziggy/env',
      '/home/user/.ziggy/bin',
      mockCoreDownloadVersion,
      mockCoreRemoveVersion,
      mockReloadConfig,
      mockCreateEnvFile
    );
  });

  it('should initialize correctly', () => {
    expect(downloadUI).toBeDefined();
    expect(typeof downloadUI.downloadWithVersion).toBe('function');
    expect(typeof downloadUI.showPostInstallOptions).toBe('function');
    expect(typeof downloadUI.showSetupInstructions).toBe('function');
    expect(typeof downloadUI.setupPowerShellProfile).toBe('function');
  });

  it('should have downloadWithVersion method', () => {
    expect(typeof downloadUI.downloadWithVersion).toBe('function');
  });

  it('should have showPostInstallOptions method', () => {
    expect(typeof downloadUI.showPostInstallOptions).toBe('function');
  });

  it('should have showSetupInstructions method', () => {
    expect(typeof downloadUI.showSetupInstructions).toBe('function');
  });

  it('should have setupPowerShellProfile method', () => {
    expect(typeof downloadUI.setupPowerShellProfile).toBe('function');
  });
});
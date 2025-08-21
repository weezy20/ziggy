/**
 * Tests for ZigInstaller interrupt handling functionality
 * Verifies that the interrupt handling and cleanup functionality has been properly restored
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';
import type { 
  IConfigManager, 
  IVersionManager, 
  IPlatformDetector,
  IFileSystemManager,
  IArchiveExtractor 
} from '../../../src/interfaces.js';
import { ZigInstaller } from '../../../src/core/installer.js';

describe('ZigInstaller Interrupt Handling', () => {
  let installer: ZigInstaller;
  let mockConfigManager: IConfigManager;
  let mockVersionManager: IVersionManager;
  let mockPlatformDetector: IPlatformDetector;
  let mockFileSystemManager: IFileSystemManager;
  let mockArchiveExtractor: IArchiveExtractor;

  beforeEach(() => {
    // Mock all dependencies
    mockConfigManager = {
      load: mock(() => ({
        ziggyDir: '/mock/ziggy',
        downloads: {},
        systemZig: undefined
      })),
      save: mock(() => {}),
      scanExistingInstallations: mock(() => ({
        ziggyDir: '/mock/ziggy',
        downloads: {},
        systemZig: undefined
      }))
    };

    mockVersionManager = {
      getAvailableVersions: mock(async () => ['0.11.0', '0.12.0']),
      validateVersion: mock(async () => true),
      getCurrentVersion: mock(() => undefined),
      setCurrentVersion: mock(() => {}),
      clearCurrentVersion: mock(() => {})
    };

    mockPlatformDetector = {
      getArch: mock(() => 'x86_64'),
      getPlatform: mock(() => 'linux'),
      getOS: mock(() => 'linux'),
      getShellInfo: mock(() => ({ shell: 'bash', configFile: '~/.bashrc' })),
      isZiggyConfigured: mock(() => false),
      hasEnvFileConfigured: mock(() => false),
      getZiggyDir: mock(() => '/mock/ziggy'),
      expandHomePath: mock((path) => path.replace('~', '/home/user')),
      getShellSourceLine: mock(() => 'source ~/.ziggy/env'),
      getPathExportLine: mock(() => 'export PATH="$HOME/.ziggy/bin:$PATH"'),
      getArchiveExtension: mock(() => '.tar.xz')
    };

    mockFileSystemManager = {
      createDirectory: mock(() => {}),
      fileExists: mock(() => false),
      directoryExists: mock(() => false),
      writeFile: mock(() => {}),
      readFile: mock(() => ''),
      safeRemove: mock(() => {}),
      createSymlink: mock(() => {}),
      resolveSymlink: mock(() => '/mock/path'),
      isSymlink: mock(() => false),
      makeExecutable: mock(() => {}),
      copyFile: mock(() => {}),
      moveFile: mock(() => {}),
      listDirectory: mock(() => [])
    };

    mockArchiveExtractor = {
      extract: mock(async () => {}),
      validateArchive: mock(async () => true)
    };

    installer = new ZigInstaller(
      mockConfigManager,
      mockVersionManager,
      mockPlatformDetector,
      mockFileSystemManager,
      mockArchiveExtractor,
      '/mock/ziggy'
    );
  });

  test('should have getCurrentDownload method', () => {
    expect(installer).toHaveProperty('getCurrentDownload');
    expect(typeof installer.getCurrentDownload).toBe('function');
  });

  test('should return null currentDownload initially', () => {
    const currentDownload = installer.getCurrentDownload();
    expect(currentDownload).toBeNull();
  });

  test('should set currentDownload during download process', async () => {
    // Mock successful download scenario
    mockFileSystemManager.fileExists = mock(() => false);
    mockFileSystemManager.directoryExists = mock(() => true);
    
    // Start download in background
    const downloadPromise = installer.downloadVersion('0.11.0');
    
    // Check that currentDownload is set
    const currentDownload = installer.getCurrentDownload();
    expect(currentDownload).not.toBeNull();
    expect(currentDownload).toHaveProperty('cleanup');
    expect(typeof currentDownload?.cleanup).toBe('function');

    // Wait for download to complete
    try {
      await downloadPromise;
    } catch (error) {
      // Expected to fail due to mocking, but that's okay for this test
    }
  });

  test('should clear currentDownload after download completion', async () => {
    // Mock successful download scenario
    mockFileSystemManager.fileExists = mock(() => false);
    mockFileSystemManager.directoryExists = mock(() => true);
    
    try {
      await installer.downloadVersion('0.11.0');
    } catch (error) {
      // Expected to fail due to mocking, but that's okay for this test
    }

    // Check that currentDownload is cleared
    const currentDownload = installer.getCurrentDownload();
    expect(currentDownload).toBeNull();
  });

  test('should have cleanup functionality in currentDownload', async () => {
    // Mock scenario where download is interrupted
    mockFileSystemManager.fileExists = mock(() => false);
    mockFileSystemManager.directoryExists = mock(() => true);
    
    // Start download
    const downloadPromise = installer.downloadVersion('0.11.0');
    
    // Get the current download object
    const currentDownload = installer.getCurrentDownload();
    expect(currentDownload).not.toBeNull();
    expect(currentDownload?.cleanup).toBeDefined();
    
    // Test cleanup functionality
    if (currentDownload?.cleanup) {
      currentDownload.cleanup();
      
      // Verify that cleanup operations were called
      expect(mockConfigManager.save).toHaveBeenCalled();
      expect(mockFileSystemManager.safeRemove).toHaveBeenCalled();
    }

    // Clean up the promise
    try {
      await downloadPromise;
    } catch (error) {
      // Expected to fail due to mocking
    }
  });

  test('should properly handle interrupt scenario', async () => {
    // Mock download interruption scenario
    mockFileSystemManager.fileExists = mock(() => false);
    mockFileSystemManager.directoryExists = mock(() => true);
    
    // Start download
    const downloadPromise = installer.downloadVersion('0.11.0');
    
    // Simulate interrupt by calling cleanup
    const currentDownload = installer.getCurrentDownload();
    if (currentDownload?.cleanup) {
      currentDownload.cleanup();
    }
    
    // Verify cleanup was performed
    expect(mockFileSystemManager.safeRemove).toHaveBeenCalled();
    expect(mockConfigManager.save).toHaveBeenCalled();

    // Clean up
    try {
      await downloadPromise;
    } catch (error) {
      // Expected
    }
  });
});

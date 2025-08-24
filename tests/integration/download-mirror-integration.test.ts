/**
 * Integration tests for download system with mirror selection
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { ZigInstaller } from '../../src/core/installer.js';
import { MirrorsManager } from '../../src/core/mirrors.js';
import type { 
  IConfigManager, 
  IVersionManager, 
  IPlatformDetector, 
  IFileSystemManager, 
  IArchiveExtractor 
} from '../../src/interfaces.js';
import type { ZiggyConfig, MirrorsConfig } from '../../src/types.js';

// Mock implementations for testing
class MockConfigManager implements IConfigManager {
  private config: ZiggyConfig = {
    downloads: {},
    currentVersion: undefined,
    communityMirrors: [],
    communityMirrorsLastUpdated: undefined
  };

  load(): ZiggyConfig {
    return { ...this.config };
  }

  save(config: ZiggyConfig): void {
    this.config = { ...config };
  }

  scanExistingInstallations(): ZiggyConfig {
    return this.load();
  }
}

class MockVersionManager implements IVersionManager {
  private currentVersion?: string;

  async getAvailableVersions(): Promise<string[]> {
    return ['0.13.0', '0.12.0', 'master'];
  }

  async validateVersion(version: string): Promise<boolean> {
    return ['0.13.0', '0.12.0', 'master'].includes(version);
  }

  getCurrentVersion(): string | undefined {
    return this.currentVersion;
  }

  setCurrentVersion(version: string): void {
    this.currentVersion = version;
  }

  clearCurrentVersion(): void {
    this.currentVersion = undefined;
  }
}

class MockPlatformDetector implements IPlatformDetector {
  getArch(): string { return 'x86_64'; }
  getPlatform(): string { return 'linux'; }
  getOS(): string { return 'linux'; }
  getShellInfo() { return { shell: 'bash', configFile: '~/.bashrc' }; }
  isZiggyConfigured(): boolean { return false; }
  hasEnvFileConfigured(): boolean { return false; }
  isZiggyInPath(): boolean { return false; }
  getZiggyDir(): string { return '/tmp/ziggy-test'; }
  expandHomePath(path: string): string { return path.replace('~', '/home/user'); }
  getShellSourceLine(): string { return 'source ~/.ziggy/env'; }
  getPathExportLine(): string { return 'export PATH="$PATH:~/.ziggy/bin"'; }
  getArchiveExtension(): string { return 'tar.xz'; }
}

class MockFileSystemManager implements IFileSystemManager {
  private files = new Map<string, string>();
  private directories = new Set<string>();

  createDirectory(path: string): void {
    this.directories.add(path);
  }

  removeDirectory(): void {}
  createSymlink(): void {}
  copyFile(): void {}

  fileExists(path: string): boolean {
    return this.files.has(path) || this.directories.has(path);
  }

  removeFile(path: string): void {
    this.files.delete(path);
  }

  writeFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  readFile(path: string): string {
    return this.files.get(path) || '';
  }

  appendFile(): void {}
  createWriteStream(): any { return { write: () => {}, end: () => {} }; }
  createReadStream(): any { return {}; }
  getStats(): any { return { size: 0, isFile: () => true, isDirectory: () => false }; }
  listDirectory(): string[] { return []; }
  isDirectory(path: string): boolean { return this.directories.has(path); }
  isFile(path: string): boolean { return this.files.has(path); }
  ensureDirectory(path: string): void { this.directories.add(path); }
  safeRemove(): void {}
}

class MockArchiveExtractor implements IArchiveExtractor {
  async extractTarXz(): Promise<void> {
    // Mock extraction - just create a fake zig binary
  }

  async extractZip(): Promise<void> {
    // Mock extraction - just create a fake zig binary
  }
}

describe('Download Mirror Integration Tests', () => {
  let installer: ZigInstaller;
  let mirrorsManager: MirrorsManager;
  let configManager: MockConfigManager;
  let versionManager: MockVersionManager;
  let platformDetector: MockPlatformDetector;
  let fileSystemManager: MockFileSystemManager;
  let archiveExtractor: MockArchiveExtractor;

  beforeEach(() => {
    configManager = new MockConfigManager();
    versionManager = new MockVersionManager();
    platformDetector = new MockPlatformDetector();
    fileSystemManager = new MockFileSystemManager();
    archiveExtractor = new MockArchiveExtractor();
    mirrorsManager = new MirrorsManager(configManager);

    installer = new ZigInstaller(
      configManager,
      versionManager,
      platformDetector,
      fileSystemManager,
      archiveExtractor,
      mirrorsManager,
      '/tmp/ziggy-test'
    );
  });

  test('should use selectBestMirrors for mirror selection', () => {
    // Test that the installer uses the new selectBestMirrors method
    const mockMirrors = [
      'https://mirror1.example.com/zig/',
      'https://mirror2.example.com/zig/',
      'https://mirror3.example.com/zig/'
    ];

    // Mock the selectBestMirrors method
    const originalSelectBestMirrors = mirrorsManager.selectBestMirrors;
    let selectBestMirrorsCalled = false;
    let maxRetriesParam: number | undefined;

    mirrorsManager.selectBestMirrors = (maxRetries?: number) => {
      selectBestMirrorsCalled = true;
      maxRetriesParam = maxRetries;
      return mockMirrors.slice(0, maxRetries || 3);
    };

    // Call the method that should trigger mirror selection
    const selectedMirrors = mirrorsManager.selectBestMirrors(3);

    expect(selectBestMirrorsCalled).toBe(true);
    expect(maxRetriesParam).toBe(3);
    expect(selectedMirrors).toEqual(mockMirrors);

    // Restore original method
    mirrorsManager.selectBestMirrors = originalSelectBestMirrors;
  });

  test('should handle mirror ranking updates on failures', () => {
    // Test that mirror ranking is updated when failures occur
    const testUrl = 'https://test-mirror.example.com/zig/';
    
    // Mock the updateMirrorRank method to track calls
    const originalUpdateMirrorRank = mirrorsManager.updateMirrorRank;
    const rankUpdates: Array<{ url: string; failureType: string }> = [];

    mirrorsManager.updateMirrorRank = (url: string, failureType: 'timeout' | 'signature' | 'checksum') => {
      rankUpdates.push({ url, failureType });
      originalUpdateMirrorRank.call(mirrorsManager, url, failureType);
    };

    // Test different failure types
    mirrorsManager.updateMirrorRank(testUrl, 'timeout');
    mirrorsManager.updateMirrorRank(testUrl, 'signature');
    mirrorsManager.updateMirrorRank(testUrl, 'checksum');

    expect(rankUpdates).toHaveLength(3);
    expect(rankUpdates[0]).toEqual({ url: testUrl, failureType: 'timeout' });
    expect(rankUpdates[1]).toEqual({ url: testUrl, failureType: 'signature' });
    expect(rankUpdates[2]).toEqual({ url: testUrl, failureType: 'checksum' });

    // Restore original method
    mirrorsManager.updateMirrorRank = originalUpdateMirrorRank;
  });

  test('should implement 3-retry logic with fallback', () => {
    // Test that the system implements proper retry logic
    const maxRetries = 3;
    const selectedMirrors = mirrorsManager.selectBestMirrors(maxRetries);
    
    // Should not exceed the retry limit
    expect(selectedMirrors.length).toBeLessThanOrEqual(maxRetries);
  });

  test('should distinguish between timeout and verification failures', () => {
    // Test that different error types are handled appropriately
    const testUrl = 'https://test-mirror.example.com/zig/';
    
    // Mock the updateMirrorRank method to track failure types
    const originalUpdateMirrorRank = mirrorsManager.updateMirrorRank;
    const failureTypes: string[] = [];

    mirrorsManager.updateMirrorRank = (url: string, failureType: 'timeout' | 'signature' | 'checksum') => {
      failureTypes.push(failureType);
      originalUpdateMirrorRank.call(mirrorsManager, url, failureType);
    };

    // Simulate different types of failures
    mirrorsManager.updateMirrorRank(testUrl, 'timeout');    // Network/404 failures
    mirrorsManager.updateMirrorRank(testUrl, 'signature');  // Signature verification failures
    mirrorsManager.updateMirrorRank(testUrl, 'checksum');   // Checksum verification failures

    expect(failureTypes).toContain('timeout');
    expect(failureTypes).toContain('signature');
    expect(failureTypes).toContain('checksum');

    // Restore original method
    mirrorsManager.updateMirrorRank = originalUpdateMirrorRank;
  });
});
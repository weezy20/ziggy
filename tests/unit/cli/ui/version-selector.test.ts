import { describe, it, expect, beforeEach } from 'bun:test';
import { VersionSelectorUI } from '../../../../src/cli/ui/version-selector';
import type { VersionManager } from '../../../../src/core/version';
import type { ZiggyConfig } from '../../../../src/types';

describe('VersionSelectorUI', () => {
  let versionSelectorUI: VersionSelectorUI;
  let mockVersionManager: VersionManager;
  let mockConfig: ZiggyConfig;
  let mockGetAvailableVersions: () => Promise<string[]>;
  let mockShowPostActionOptions: () => Promise<string>;

  beforeEach(() => {
    mockConfig = {
      downloads: {
        '0.11.0': {
          version: '0.11.0',
          path: '/home/user/.ziggy/versions/0.11.0',
          status: 'completed',
          downloadedAt: '2024-01-01T00:00:00Z'
        }
      },
      systemZig: {
        path: '/usr/bin/zig',
        version: '0.10.0'
      }
    };

    mockVersionManager = {
      getCurrentVersion: () => '0.11.0'
    } as VersionManager;

    mockGetAvailableVersions = () => Promise.resolve(['0.12.0', '0.11.0', '0.10.0']);
    mockShowPostActionOptions = () => Promise.resolve('main-menu');

    versionSelectorUI = new VersionSelectorUI(
      mockVersionManager,
      mockConfig,
      mockGetAvailableVersions,
      mockShowPostActionOptions
    );
  });

  it('should initialize correctly', () => {
    expect(versionSelectorUI).toBeDefined();
    expect(typeof versionSelectorUI.listVersionsTUI).toBe('function');
    expect(typeof versionSelectorUI.handleDownloadSpecificTUI).toBe('function');
  });

  it('should have listVersionsTUI method', () => {
    expect(typeof versionSelectorUI.listVersionsTUI).toBe('function');
  });

  it('should have handleDownloadSpecificTUI method', () => {
    expect(typeof versionSelectorUI.handleDownloadSpecificTUI).toBe('function');
  });
});
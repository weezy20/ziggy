// Type definitions for Ziggy

// API Response Types
export interface ZigDownloadIndex {
  [version: string]: {
    [platform: string]: {
      tarball: string;
      shasum: string;
      size: string;
    };
  };
}

// Shell detection and configuration types
export interface ShellInfo {
  shell: string;
  profileFile: string;
  command: string;
}

// Status and configuration types
export type DownloadStatus = 'downloading' | 'completed' | 'failed';

// Existing interfaces that are already defined in index.ts
// These are kept here for reference and consistency
export interface ZigVersion {
  version: string;
  date: string;
  tarball: string;
}

export interface ZigVersions {
  master: ZigVersion;
  [key: string]: ZigVersion;
}

export interface ZiggyConfig {
  downloads: Record<string, {
    version: string;
    path: string;
    status: DownloadStatus;
    downloadedAt: string;
    isSystemWide?: boolean;
  }>;
  currentVersion?: string;
  systemZig?: {
    path: string;
    version: string;
  };
}

export interface ZigVersionInfo {
  version: string;
  date: string;
  'min-zig-version'?: string;
}
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

export interface DownloadInfo {
  version: string;
  path: string;
  status: DownloadStatus;
  downloadedAt: string;
  isSystemWide?: boolean;
  // Security verification data
  checksum?: string;
  checksumVerified?: boolean;
  minisignVerified?: boolean;
  downloadUrl?: string;
}

export interface ZiggyConfig {
  configVersion?: number;
  downloads: Record<string, DownloadInfo>;
  currentVersion?: string;
  systemZig?: {
    path: string;
    version: string;
  };
}

export interface DownloadProgress {
  version: string;
  bytesDownloaded: number;
  totalBytes: number;
  percentage: number;
  status: 'downloading' | 'extracting' | 'completed' | 'failed';
}

export interface ZigVersionInfo {
  version: string;
  date: string;
  'min-zig-version'?: string;
}
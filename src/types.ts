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
  signature?: string;
  verificationStatus?: 'pending' | 'verified' | 'failed';
}

export interface DownloadStats {
  totalDownloads: number;
  successfulDownloads: number;
  failedDownloads: number;
  totalDownloadTime: number; // in milliseconds
  mirrorUsage: Record<string, number>;
  checksumVerifications: number;
  checksumFailures: number;
  lastUpdated: string;
}

export interface MirrorHealthStats {
  url: string;
  responseTime: number;
  status: 'healthy' | 'slow' | 'unreachable';
  lastChecked: string;
}

export interface ZiggyConfig {
  configVersion?: number;
  downloads: Record<string, DownloadInfo>;
  currentVersion?: string;
  systemZig?: {
    path: string;
    version: string;
  };
  communityMirrors?: string[];
  communityMirrorsLastUpdated?: string;
  downloadStats?: DownloadStats;
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

// Mirror Management Types

/**
 * Represents a community mirror for Zig downloads
 * Matches the Rust Mirror structure for configuration persistence
 */
export interface Mirror {
  /** Community Mirror URL - must be HTTPS */
  url: string;
  /** 
   * Consecutive fails - Can be due to 404, timeout, signature or shasum verification failure
   * Lower rank = higher priority (better reliability)
   * New mirrors start at rank 1
   * 404/timeout failures: +1 to rank
   * Signature/checksum failures: +2 to rank
   */
  rank: number;
}

/**
 * Configuration structure for mirrors.toml file
 * Matches the Rust MirrorsConfig structure for TOML serialization
 */
export interface MirrorsConfig {
  /** List of download mirrors with their reliability rankings */
  mirrors: Mirror[];
  /** Last synced timestamp in ISO 8601 format */
  last_synced: string;
}
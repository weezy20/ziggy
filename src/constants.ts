/**
 * Constants for Ziggy configuration and security verification
 */

// Configuration versioning
import process from "node:process";
export const CONFIG_VERSION = 1;

// Zig download and verification URLs
export const ZIG_DOWNLOAD_BASE_URL = 'https://ziglang.org/download';
export const ZIG_DOWNLOAD_INDEX_URL = 'https://ziglang.org/download/index.json';
export const ZIG_COMMUNITY_MIRRORS_URL = 'https://ziglang.org/download/community-mirrors.txt';

// Community mirrors cache settings
export const MIRRORS_CACHE_DURATION_HOURS = 24;
export const MAX_MIRROR_RETRIES = 3;

// Minisign verification
export const ZIG_MINISIGN_PUBLIC_KEY = 'RWSGOq2NVecA2UPNdBUZykf1CCb147pkmdtYxgb3Ti+JO/wCYvhbAb/U';

// File extensions and patterns
export const SUPPORTED_ARCHIVE_EXTENSIONS = ['.tar.xz', '.zip'];
export const ZIG_EXECUTABLE_NAME = process.platform === 'win32' ? 'zig.exe' : 'zig';

// Download verification file extensions
export const MINISIG_EXTENSION = '.minisig';
export const SHASUM_EXTENSION = '.shasum';

/**
 * Generate minisign signature URL for a given download URL
 * @param downloadUrl The original download URL
 * @returns The corresponding minisign signature URL
 */
export function getMinisignUrl(downloadUrl: string): string {
    return `${downloadUrl}${MINISIG_EXTENSION}`;
}

/**
 * Generate shasum URL for a given download URL
 * @param downloadUrl The original download URL
 * @returns The corresponding shasum URL
 */
export function getShasumUrl(downloadUrl: string): string {
    return `${downloadUrl}${SHASUM_EXTENSION}`;
}

/**
 * Generate the official Zig download URL for verification
 * Even when using community mirrors, we should verify against official signatures
 * @param version Zig version
 * @param platform Platform identifier (e.g., 'x86_64-windows', 'x86_64-linux')
 * @param extension File extension (.tar.xz or .zip)
 * @returns Official Zig download URL
 */
export function getOfficialZigDownloadUrl(version: string, platform: string, extension: string): string {
    return `${ZIG_DOWNLOAD_BASE_URL}/${version}/zig-${platform}-${version}${extension}`;
}
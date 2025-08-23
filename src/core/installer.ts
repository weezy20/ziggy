/**
 * Core installer implementation for Zig installations
 * This module contains the core installation logic extracted from ZigInstaller
 */

import { join } from 'path';
import { colors } from '../utils/colors.js';
import { verifyChecksum, verifyMinisignature } from '../utils/crypto.js';
import { MAX_MIRROR_RETRIES, ZIG_MINISIGN_PUBLIC_KEY } from '../constants.js';

// Simple log function
const log = console.log;
import type { 
  IZigInstaller, 
  IConfigManager, 
  IVersionManager, 
  IPlatformDetector,
  IFileSystemManager,
  IArchiveExtractor,
  IMirrorsManager
} from '../interfaces.js';
import type { ZigDownloadIndex, DownloadInfo } from '../types.js';
import { Buffer } from "node:buffer";
import process from "node:process";

export class ZigInstaller implements IZigInstaller {
  private configManager: IConfigManager;
  private versionManager: IVersionManager;
  private platformDetector: IPlatformDetector;
  private fileSystemManager: IFileSystemManager;
  private archiveExtractor: IArchiveExtractor;
  private mirrorsManager: IMirrorsManager;
  private ziggyDir: string;
  private binDir: string;
  private arch: string;
  private platform: string;
  private currentDownload: { cleanup?: () => void } | null = null;

  constructor(
    configManager: IConfigManager,
    versionManager: IVersionManager,
    platformDetector: IPlatformDetector,
    fileSystemManager: IFileSystemManager,
    archiveExtractor: IArchiveExtractor,
    mirrorsManager: IMirrorsManager,
    ziggyDir: string
  ) {
    this.configManager = configManager;
    this.versionManager = versionManager;
    this.platformDetector = platformDetector;
    this.fileSystemManager = fileSystemManager;
    this.archiveExtractor = archiveExtractor;
    this.mirrorsManager = mirrorsManager;
    this.ziggyDir = ziggyDir;
    this.binDir = join(ziggyDir, 'bin');
    this.arch = platformDetector.getArch();
    this.platform = platformDetector.getPlatform();
  }

  /**
   * Get the config manager instance
   */
  public getConfigManager(): IConfigManager {
    return this.configManager;
  }

  /**
   * Download and install a specific Zig version
   */
  public async downloadVersion(version: string): Promise<void> {
    const installPath = join(this.ziggyDir, 'versions', version);
    
    // Check if already installed
    const config = this.configManager.load();
    const existing = config.downloads[version];
    
    if (existing && existing.status === 'completed') {
      throw new Error(`Zig ${version} is already installed at ${existing.path}`);
    }

    log(colors.green(`\n🚀 Installing Zig ${version}...`));

    // Update config to show download in progress
    config.downloads[version] = {
      version: version,
      path: installPath,
      downloadedAt: new Date().toISOString(),
      status: 'downloading'
    };
    this.configManager.save(config);

    // Set up interruption handling
    this.currentDownload = {
      cleanup: () => {
        log(colors.yellow('\n🔄 Cleaning up interrupted download...'));
        const failedConfig = this.configManager.load();
        if (failedConfig.downloads[version]) {
          delete failedConfig.downloads[version];
          this.configManager.save(failedConfig);
        }
        this.fileSystemManager.safeRemove(installPath);
      }
    };

    try {
      const verificationInfo = await this.downloadZig(version, installPath);

      // Mark as completed and save verification metadata
      const updatedConfig = this.configManager.load();
      const downloadInfo = updatedConfig.downloads[version]!;
      downloadInfo.status = 'completed';
      downloadInfo.checksum = verificationInfo.checksum;
      downloadInfo.checksumVerified = verificationInfo.checksumVerified;
      downloadInfo.minisignVerified = verificationInfo.minisignVerified;
      downloadInfo.signature = verificationInfo.signature;
      downloadInfo.verificationStatus = verificationInfo.verificationStatus;
      downloadInfo.downloadUrl = verificationInfo.downloadUrl;
      this.configManager.save(updatedConfig);

      log(colors.green(`\n✅ Zig ${version} successfully installed!`));

      // Auto-activate this version if no current version is set
      if (!this.versionManager.getCurrentVersion()) {
        this.createSymlink(installPath, version);
        this.versionManager.setCurrentVersion(version);
        log(colors.green(`✓ Automatically activated Zig ${version} (first installation)`));
      }

    } catch (error) {
      // Mark as failed and cleanup
      const failedConfig = this.configManager.load();
      if (failedConfig.downloads[version]) {
        delete failedConfig.downloads[version];
        this.configManager.save(failedConfig);
      }
      this.fileSystemManager.safeRemove(installPath);
      throw error;
    } finally {
      // Clear current download state
      this.currentDownload = null;
    }
  }

  /**
   * Switch to use a specific Zig version
   */
  public useVersion(version: string): void {
    const config = this.configManager.load();

    if (version === 'system') {
      // Use system zig - validate it's still available
      if (config.systemZig) {
        // Check if the system Zig path is still valid
        if (!this.fileSystemManager.fileExists(config.systemZig.path)) {
          log(colors.yellow('⚠ System Zig is no longer available at the configured path.'));
          log(colors.gray(`Previous path: ${config.systemZig.path}`));
          
          // Remove invalid system Zig from config
          const updatedConfig = { ...config };
          delete updatedConfig.systemZig;
          // Also clear currentVersion if it was set to system
          if (updatedConfig.currentVersion === 'system') {
            delete updatedConfig.currentVersion;
          }
          this.configManager.save(updatedConfig);
          
          // Try to re-detect system Zig
          log(colors.cyan('🔍 Re-scanning for system Zig installations...'));
          const redetectedSystemZig = this.detectSystemZig();
          
          if (redetectedSystemZig) {
            const finalConfig = this.configManager.load();
            finalConfig.systemZig = redetectedSystemZig;
            this.configManager.save(finalConfig);
            
            log(colors.green(`✓ Found system Zig at: ${redetectedSystemZig.path}`));
            this.createSymlink(redetectedSystemZig.path, 'system');
            this.versionManager.setCurrentVersion('system');
            log(colors.green(`Now using system Zig ${redetectedSystemZig.version}`));
          } else {
            log(colors.red('❌ No system Zig installation found.'));
            this.showAvailableVersions(config);
          }
        } else {
          // System Zig path is still valid
          this.createSymlink(config.systemZig.path, 'system');
          this.versionManager.setCurrentVersion('system');
          log(colors.green(`Now using system Zig ${config.systemZig.version}`));
        }
      } else {
        // No system Zig in config, try to detect
        log(colors.cyan('🔍 Scanning for system Zig installations...'));
        const detectedSystemZig = this.detectSystemZig();
        
        if (detectedSystemZig) {
          const updatedConfig = { ...config };
          updatedConfig.systemZig = detectedSystemZig;
          this.configManager.save(updatedConfig);
          
          log(colors.green(`✓ Found system Zig at: ${detectedSystemZig.path}`));
          this.createSymlink(detectedSystemZig.path, 'system');
          this.versionManager.setCurrentVersion('system');
          log(colors.green(`Now using system Zig ${detectedSystemZig.version}`));
        } else {
          log(colors.red('❌ No system Zig installation found.'));
          this.showAvailableVersions(config);
        }
      }
    } else {
      // Use ziggy managed version
      const info = config.downloads[version];
      if (!info || info.status !== 'completed') {
        throw new Error(`Zig ${version} is not installed`);
      }
      
      this.createSymlink(info.path, version);
      this.versionManager.setCurrentVersion(version);
      log(colors.green(`Now using Zig ${version}`));
    }
  }

  /**
   * Get list of installed Zig versions
   */
  public getInstalledVersions(): string[] {
    const config = this.configManager.load();
    const installedVersions = Object.keys(config.downloads).filter(version => {
      const info = config.downloads[version];
      return info?.status === 'completed';
    });

    // Add system version if available
    if (config.systemZig) {
      installedVersions.unshift('system');
    }

    return installedVersions;
  }

  /**
   * Validate if a version exists and is available for download
   */
  public validateVersion(version: string): Promise<boolean> {
    return this.versionManager.validateVersion(version);
  }

  /**
   * Clean up resources and temporary files
   */
  public cleanup(): Promise<void> {
    // Clean up incomplete downloads
    const config = this.configManager.load();
    const incompleteVersions = Object.keys(config.downloads).filter(version => {
      const info = config.downloads[version];
      return info?.status === 'downloading' || info?.status === 'failed';
    });

    for (const version of incompleteVersions) {
      const info = config.downloads[version];
      if (info) {
        log(colors.yellow(`Cleaning up incomplete download: ${version}`));
        this.fileSystemManager.safeRemove(info.path);
        delete config.downloads[version];
      }
    }

    if (incompleteVersions.length > 0) {
      this.configManager.save(config);
    }
  }

  /**
   * Get current download state for interrupt handling
   */
  public getCurrentDownload(): { cleanup?: () => void } | null {
    return this.currentDownload;
  }

  /**
   * Remove a specific Zig version
   */
  public removeVersion(version: string): Promise<void> {
    if (version === 'system') {
      throw new Error('Cannot remove system Zig installation');
    }

    const config = this.configManager.load();
    const info = config.downloads[version];
    
    if (!info) {
      throw new Error(`Zig ${version} is not installed`);
    }

    // Check if this is the current version
    const currentVersion = this.versionManager.getCurrentVersion();
    if (currentVersion === version) {
      // Clear the symlink
      const symlink = join(this.binDir, 'zig');
      this.fileSystemManager.safeRemove(symlink);
      this.versionManager.clearCurrentVersion();
    }

    // Remove the installation directory
    this.fileSystemManager.safeRemove(info.path);
    delete config.downloads[version];
    this.configManager.save(config);

    log(colors.green(`✓ Removed Zig ${version}`));
  }

  /**
   * Remove all installed versions except the current one
   */
  public cleanExceptCurrent(): Promise<void> {
    const currentVersion = this.versionManager.getCurrentVersion();
    if (!currentVersion || currentVersion === 'system') {
      throw new Error('No current version set or using system version');
    }

    const config = this.configManager.load();
    const versionsToDelete = Object.keys(config.downloads).filter(v => v !== currentVersion);

    if (versionsToDelete.length === 0) {
      log(colors.yellow('No other versions to clean'));
      return;
    }

    let cleaned = 0;
    for (const version of versionsToDelete) {
      const info = config.downloads[version];
      if (info && this.fileSystemManager.fileExists(info.path)) {
        try {
          this.fileSystemManager.safeRemove(info.path);
          delete config.downloads[version];
          cleaned++;
        } catch (error) {
          log(colors.red(`Failed to remove ${version}: ${error}`));
        }
      }
    }

    this.configManager.save(config);
    log(colors.green(`Cleaned up ${cleaned} old installations`));
    log(colors.green(`Kept ${currentVersion} as active version`));
  }

  /**
   * Remove all installed versions
   */
  public cleanAllVersions(): Promise<void> {
    const config = this.configManager.load();
    const versionsToDelete = Object.keys(config.downloads);

    if (versionsToDelete.length === 0) {
      log(colors.yellow('No versions to clean'));
      return;
    }

    let cleaned = 0;
    for (const version of versionsToDelete) {
      const info = config.downloads[version];
      if (info && this.fileSystemManager.fileExists(info.path)) {
        try {
          this.fileSystemManager.safeRemove(info.path);
          cleaned++;
        } catch (error) {
          log(colors.red(`Failed to remove ${version}: ${error}`));
        }
      }
    }

    // Clear downloads config
    config.downloads = {};
    if (config.systemZig) {
      this.versionManager.setCurrentVersion('system');
    } else {
      this.versionManager.clearCurrentVersion();
    }
    this.configManager.save(config);

    // Remove symlink if it exists
    const symlink = join(this.binDir, 'zig');
    this.fileSystemManager.safeRemove(symlink);

    log(colors.green(`Cleaned up ${cleaned} Zig installations`));

    if (config.systemZig) {
      log(colors.yellow(`Using system Zig: ${config.systemZig.version}`));
    } else {
      log(colors.yellow('No Zig version is currently active'));
    }
  }

  /**
   * Download Zig from the official repository
   * @private
   */
  private async downloadZig(version: string, installPath: string): Promise<{
    checksum?: string;
    checksumVerified?: boolean;
    minisignVerified?: boolean;
    signature?: string;
    verificationStatus?: 'pending' | 'verified' | 'failed';
    downloadUrl?: string;
  }> {
    log(colors.blue(`Getting download info for Zig ${version}...`));

    try {
      const response = await fetch(`https://ziglang.org/download/index.json`);
      if (!response.ok) {
        throw new Error(`Failed to fetch download info: ${response.status}`);
      }

      const downloadData = await response.json() as ZigDownloadIndex;
      const archKey = `${this.arch}-${this.platform}`;

      if (!downloadData[version]) {
        throw new Error(`Version ${version} not found`);
      }

      const versionData = downloadData[version];
      if (!versionData[archKey]) {
        throw new Error(`No download available for ${archKey} architecture`);
      }

      const downloadInfo = versionData[archKey];
      const originalUrl = downloadInfo.tarball;
      const ext = this.platformDetector.getArchiveExtension();
      const zigTar = `zig-${this.platform}-${this.arch}-${version}.${ext}`;
      const tarPath = join(installPath, zigTar);

      // Create directory if it doesn't exist
      this.fileSystemManager.ensureDirectory(installPath);

      // Try download with mirror rotation
      const downloadInfoWithChecksum: DownloadInfo = {
        version,
        path: installPath,
        status: 'downloading' as const,
        downloadedAt: new Date().toISOString(),
        checksum: downloadInfo.shasum, // Get checksum from the download index
        checksumVerified: false,
        minisignVerified: false,
        verificationStatus: 'pending'
      };
      await this.downloadWithMirrors(originalUrl, tarPath, downloadInfoWithChecksum);

      log(colors.blue('Extracting archive...'));

      // Extract the archive
      if (ext === 'tar.xz') {
        await this.archiveExtractor.extractTarXz(tarPath, installPath);
      } else if (ext === 'zip') {
        await this.archiveExtractor.extractZip(tarPath, installPath);
      } else {
        throw new Error(`Unsupported archive format: ${ext}`);
      }

      log(colors.blue('Cleaning up downloaded archive...'));
      this.fileSystemManager.safeRemove(tarPath);
      log(colors.green('✓ Installation completed!'));

      // Return verification information
      return {
        checksum: downloadInfoWithChecksum.checksum,
        checksumVerified: downloadInfoWithChecksum.checksumVerified,
        minisignVerified: downloadInfoWithChecksum.minisignVerified,
        signature: downloadInfoWithChecksum.signature,
        verificationStatus: downloadInfoWithChecksum.verificationStatus,
        downloadUrl: downloadInfoWithChecksum.downloadUrl
      };

    } catch (error) {
      throw new Error(`Failed to download Zig: ${error}`);
    }
  }

  /**
   * Create symlink for the Zig binary
   * @private
   */
  private createSymlink(targetPath: string, version: string): void {
    // Determine the actual zig binary path
    let zigBinary: string;
    let symlinkTarget: string;
    const executableName = this.platform === 'windows' ? 'zig.exe' : 'zig';

    if (version === 'system') {
      // For system installations, targetPath is the direct path to zig binary
      symlinkTarget = targetPath;
    } else {
      // For ziggy managed installations, find the zig binary in the installation
      zigBinary = join(targetPath, executableName);
      
      if (this.fileSystemManager.fileExists(zigBinary)) {
        symlinkTarget = zigBinary;
      } else {
        // Look for extracted installations (subdirectory format)
        const contents = this.fileSystemManager.listDirectory(targetPath);
        const zigExtraction = contents.find(item =>
          item.startsWith('zig-') && this.fileSystemManager.isDirectory(join(targetPath, item))
        );

        if (zigExtraction) {
          symlinkTarget = join(targetPath, zigExtraction, executableName);
        } else {
          throw new Error(`Zig binary not found in ${targetPath}`);
        }
      }
    }

    // Create symlink
    const zigBinaryLink = join(this.binDir, executableName);
    
    // Remove existing symlink if it exists
    this.fileSystemManager.safeRemove(zigBinaryLink);

    // Create new symlink
    try {
      this.fileSystemManager.createSymlink(symlinkTarget, zigBinaryLink, this.platform);
    } catch (error) {
      throw new Error(`Failed to create symlink: ${error}`);
    }
  }

  /**
   * Detect system Zig installation
   * @private
   */
  private detectSystemZig(): { path: string; version: string } | null {
    try {
      const which = this.platform === 'windows' ? 'where' : 'which';
      const result = Bun.spawnSync([which, 'zig'], { 
        stdout: 'pipe',
        stderr: 'pipe'
      });
      
      if (result.exitCode === 0) {
        const zigPath = result.stdout.toString().trim();
        // Handle multiple paths returned by which/where
        const firstZigPath = zigPath.split('\n')[0]?.trim() || zigPath;
        
        // Make sure it's not from ziggy directory
        if (!firstZigPath.includes(this.ziggyDir)) {
          // Get version
          const versionResult = Bun.spawnSync([firstZigPath, 'version'], { stdout: 'pipe' });
          if (versionResult.exitCode === 0) {
            const version = versionResult.stdout.toString().trim();
            return { path: firstZigPath, version };
          }
        }
      }
    } catch (_error) {
      // System zig not found or not accessible
    }
    
    return null;
  }

  /**
   * Show available versions when system Zig is not found
   * @private
   */
  private showAvailableVersions(config: ZigDownloadIndex): void {
    const installedVersions = Object.keys(config.downloads).filter(v => 
      config.downloads[v].status === 'completed'
    );
    
    if (installedVersions.length > 0) {
      log(colors.cyan('\n📦 Available Zig versions:'));
      installedVersions.forEach(version => {
        const isCurrent = config.currentVersion === version;
        const indicator = isCurrent ? colors.green(' ← current') : '';
        log(colors.gray(`  • ${version}${indicator}`));
      });
      log(colors.yellow('\nUse `ziggy use <version>` to switch to an installed version.'));
    } else {
      log(colors.yellow('\n📭 No Zig versions installed yet.'));
      log(colors.cyan('Use `ziggy` to install a Zig version.'));
    }
  }

  /**
   * Download file with mirror rotation and verification
   */
  private async downloadWithMirrors(originalUrl: string, targetPath: string, downloadInfo: DownloadInfo): Promise<void> {
    const mirrorUrls = await this.getMirrorUrls(originalUrl);
    
    // Try community mirrors first (shuffled for load balancing)
    const selectedMirrors = this.mirrorsManager.selectMirrorForDownload(mirrorUrls);
    const urlsToTry = [...selectedMirrors, originalUrl];

    let lastError: Error | null = null;
    let downloadSuccess = false;

    for (let i = 0; i < urlsToTry.length; i++) {
      const url = urlsToTry[i];
      if (!url) continue;
      
      const isMirror = i < MAX_MIRROR_RETRIES;
      const isOriginal = !isMirror;

      try {
        const hostname = new URL(url).hostname;
        if (isOriginal) {
          log(colors.blue(`Attempting download from: ${hostname} (official fallback)`));
        } else {
          log(colors.blue(`Attempting download from: ${hostname} (mirror ${i + 1}/${MAX_MIRROR_RETRIES})`));
        }
        
        await this.downloadFile(url, targetPath);
        
        // NEVER SKIP signature verification - as per requirements
        log(colors.blue('Downloading and verifying signature...'));
        // Remove ?source=ziggy from tarball URL, add .minisig, then add ?source=ziggy back
        const baseUrl = url.replace('?source=ziggy', '');
        const signatureUrl = `${baseUrl}.minisig?source=ziggy`;
        const signatureBuffer = await this.downloadSignature(signatureUrl);
        
        if (!signatureBuffer) {
          log(colors.yellow(`⚠ Could not download signature from ${hostname}, trying next mirror...`));
          this.fileSystemManager.safeRemove(targetPath);
          continue;
        }

        // Verify minisign signature - REQUIRED step
        log(colors.blue('Verifying minisign signature...'));
        const signatureValid = verifyMinisignature(targetPath, signatureBuffer, ZIG_MINISIGN_PUBLIC_KEY);
        if (!signatureValid) {
          log(colors.yellow(`⚠ Signature verification failed for ${hostname}, trying next mirror...`));
          this.fileSystemManager.safeRemove(targetPath);
          continue;
        }
        log(colors.green('✓ Signature verified'));

        // Verify checksum if available
        if (downloadInfo.checksum) {
          log(colors.blue('Verifying download checksum...'));
          const checksumValid = verifyChecksum(targetPath, downloadInfo.checksum);
          if (!checksumValid) {
            log(colors.yellow(`⚠ Checksum verification failed for ${hostname}, trying next mirror...`));
            this.fileSystemManager.safeRemove(targetPath);
            continue;
          }
          log(colors.green('✓ Checksum verified'));
        }

        // Update download info with verification status
        downloadInfo.signature = signatureBuffer.toString('base64');
        downloadInfo.checksumVerified = !!downloadInfo.checksum;
        downloadInfo.minisignVerified = true;
        downloadInfo.verificationStatus = 'verified';
        downloadInfo.downloadUrl = url;

        log(colors.green(`Successfully fetched and verified Zig from ${hostname}!`));
        downloadSuccess = true;
        break;
      } catch (error) {
        lastError = error as Error;
        const hostname = new URL(url).hostname;
        log(colors.yellow(`⚠ Download failed from ${hostname}: ${error}`));
        this.fileSystemManager.safeRemove(targetPath);
        continue;
      }
    }

    if (!downloadSuccess) {
      throw new Error(`Failed to download from all mirrors. Last error: ${lastError?.message}`);
    }
  }

  /**
   * Get community mirror URLs for a given original URL
   */
  private getMirrorUrls(originalUrl: string): Promise<string[]> {
    return this.mirrorsManager.getMirrorUrls(originalUrl);
  }

  /**
   * Download a file from a URL with progress display
   */
  private async downloadFile(url: string, targetPath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const contentLength = parseInt(response.headers.get('content-length') || '0');
    const writer = this.fileSystemManager.createWriteStream(targetPath);
    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error('Failed to get response stream');
    }

    let downloadedBytes = 0;
    const progressWidth = 30;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      writer.write(value);
      downloadedBytes += value.length;

      if (contentLength > 0) {
        const progress = downloadedBytes / contentLength;
        const filled = Math.floor(progress * progressWidth);
        const bar = '█'.repeat(filled) + '░'.repeat(progressWidth - filled);
        const percentage = Math.floor(progress * 100);
        const mb = (downloadedBytes / 1024 / 1024).toFixed(1);
        const totalMb = (contentLength / 1024 / 1024).toFixed(1);

        process.stdout.write(`\r${colors.cyan('Downloading:')} [${bar}] ${percentage}% (${mb}/${totalMb} MB)`);
      }
    }

    writer.end();
    process.stdout.write('\n');
  }

  /**
   * Download signature file
   */
  private async downloadSignature(signatureUrl: string): Promise<Buffer | null> {
    try {
      const response = await fetch(signatureUrl);
      if (!response.ok) {
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (_error) {
      return null;
    }
  }
}

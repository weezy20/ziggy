/**
 * Core installer implementation for Zig installations
 * This module contains the core installation logic extracted from ZigInstaller
 */

import { join } from 'path';
import { colors } from '../utils/colors.js';
import { verifyChecksum, verifyMinisignature } from '../utils/crypto.js';
import { ZIG_MINISIGN_PUBLIC_KEY } from '../constants.js';

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
import { ActivationStrategyFactory, type IActivationStrategy } from './activation-strategies.js';
import { WindowsActivationManager, type IWindowsActivationManager } from './windows-activation.js';
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
  private activationStrategy: IActivationStrategy;
  private windowsActivationManager?: IWindowsActivationManager;

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
    
    // Initialize activation strategy based on platform
    this.initializeActivationStrategy();
  }

  /**
   * Initialize the appropriate activation strategy based on platform
   * @private
   */
  private initializeActivationStrategy(): void {
    if (this.platform === 'windows') {
      // Create Windows activation manager for Windows platform
      this.windowsActivationManager = new WindowsActivationManager(
        this.fileSystemManager,
        this.archiveExtractor,
        this.ziggyDir
      );
    }

    // Create the appropriate activation strategy
    this.activationStrategy = ActivationStrategyFactory.createStrategy(
      this.platform,
      this.fileSystemManager,
      this.windowsActivationManager
    );
  }

  /**
   * Get the config manager instance
   */
  public getConfigManager(): IConfigManager {
    return this.configManager;
  }

  /**
   * Get the mirrors manager instance
   */
  public getMirrorsManager(): IMirrorsManager {
    return this.mirrorsManager;
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
        await this.createSymlink(installPath, version);
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
  public async useVersion(version: string): Promise<void> {
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
            await this.createSymlink(redetectedSystemZig.path, 'system');
            this.versionManager.setCurrentVersion('system');
            log(colors.green(`Now using system Zig ${redetectedSystemZig.version}`));
          } else {
            log(colors.red('❌ No system Zig installation found.'));
            this.showAvailableVersions(config);
          }
        } else {
          // System Zig path is still valid
          await this.createSymlink(config.systemZig.path, 'system');
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
          await this.createSymlink(detectedSystemZig.path, 'system');
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
      
      await this.createSymlink(info.path, version);
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
   * Allow user to select which version to keep and remove all others
   */
  public async selectVersionToKeep(): Promise<void> {
    const config = this.configManager.load();
    const downloadedVersions = Object.keys(config.downloads).filter(v => {
      const info = config.downloads[v];
      return info?.status === 'completed' && v !== 'system';
    });

    if (downloadedVersions.length === 0) {
      log(colors.yellow('No versions to clean'));
      return;
    }

    if (downloadedVersions.length === 1) {
      log(colors.yellow('Only one version installed, nothing to clean'));
      return;
    }

    // For CLI usage, we'll keep the current version by default
    // This method is primarily used by the TUI, but we provide a fallback
    const currentVersion = this.versionManager.getCurrentVersion();
    const versionToKeep = currentVersion && downloadedVersions.includes(currentVersion) 
      ? currentVersion 
      : downloadedVersions[0];

    const versionsToDelete = downloadedVersions.filter(v => v !== versionToKeep);

    log(colors.cyan(`Keeping version: ${versionToKeep}`));
    log(colors.yellow(`Removing ${versionsToDelete.length} other versions: ${versionsToDelete.join(', ')}`));

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

    // Set the kept version as current if it wasn't already
    if (this.versionManager.getCurrentVersion() !== versionToKeep) {
      await this.createSymlink(config.downloads[versionToKeep]!.path, versionToKeep);
      this.versionManager.setCurrentVersion(versionToKeep);
    }

    this.configManager.save(config);
    log(colors.green(`Cleaned up ${cleaned} installations`));
    log(colors.green(`Kept ${versionToKeep} as active version`));
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
   * Activate a Zig version using platform-specific activation strategy
   * @private
   */
  private async createSymlink(targetPath: string, version: string): Promise<void> {
    try {
      await this.activationStrategy.activate(targetPath, version, this.binDir);
    } catch (error) {
      throw new Error(`Failed to activate Zig ${version}: ${error.message}`);
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
    // Check if mirrors need syncing and automatically sync if stale (24-hour threshold)
    if (this.mirrorsManager.isMirrorsSyncExpired()) {
      try {
        log(colors.blue('🔄 Mirrors are stale, automatically syncing...'));
        await this.mirrorsManager.syncMirrors();
        log(colors.green('✓ Mirrors synchronized automatically'));
      } catch (error) {
        log(colors.yellow(`⚠ Failed to auto-sync mirrors: ${error}`));
        log(colors.yellow('Continuing with existing mirrors...'));
      }
    }
    
    // Use selectBestMirrors for intelligent mirror selection based on rankings
    const selectedMirrorBases = this.mirrorsManager.selectBestMirrors(3); // 3-retry logic as per requirements
    
    // Convert mirror URLs to actual download URLs for this specific file
    const selectedMirrors: string[] = [];
    
    // Extract just the filename from the original URL
    // Original: https://ziglang.org/download/0.11.0/zig-linux-x86_64-0.11.0.tar.xz
    // Extract: zig-linux-x86_64-0.11.0.tar.xz
    const filename = originalUrl.split('/').pop() || '';
    
    for (const mirrorUrl of selectedMirrorBases) {
      const trimmedMirror = mirrorUrl.trim();
      if (!trimmedMirror) continue;
      
      // Per official algorithm: GET "mirror/filename" where mirror is the base URL
      // Mirror URLs from community list are base URLs (e.g., https://zig.linus.dev/zig)
      const baseUrl = trimmedMirror.endsWith('/') ? trimmedMirror.slice(0, -1) : trimmedMirror;
      selectedMirrors.push(`${baseUrl}/${filename}?source=ziggy`);
    }
    
    // Try mirrors first, then fallback to ziglang.org as final option
    const urlsToTry = [...selectedMirrors, originalUrl];

    let lastError: Error | null = null;
    let downloadSuccess = false;
    let attemptCount = 0;

    for (let i = 0; i < urlsToTry.length; i++) {
      const url = urlsToTry[i];
      if (!url) continue;
      
      const isOriginal = url === originalUrl;
      attemptCount++;

      try {
        const hostname = new URL(url).hostname;
        if (isOriginal) {
          log(colors.blue(`Downloading from official source: ${hostname}`));
        } else {
          log(colors.blue(`Trying mirror ${i + 1}/${selectedMirrors.length}: ${hostname}`));
        }
        
        await this.downloadFile(url, targetPath);
        
        // NEVER SKIP signature verification - as per requirements
        log(colors.blue('Verifying download authenticity...'));
        
        // Download signature from the SAME mirror as per official algorithm
        // The signature must come from the same source as the tarball
        const signatureUrl = `${url.replace('?source=ziggy', '')}.minisig?source=ziggy`;
        const signatureBuffer = await this.downloadSignature(signatureUrl);
        
        if (!signatureBuffer) {
          // Signature download failure - treat as verification failure
          if (!isOriginal) {
            const baseMirrorUrl = this.getBaseMirrorUrl(url);
            this.mirrorsManager.updateMirrorRank(baseMirrorUrl, 'signature');
          }
          log(colors.yellow(`⚠ Could not download signature from ${hostname}, trying next mirror...`));
          this.fileSystemManager.safeRemove(targetPath);
          continue;
        }

        // Verify minisign signature - REQUIRED step
        const signatureValid = verifyMinisignature(targetPath, signatureBuffer, ZIG_MINISIGN_PUBLIC_KEY);
        if (!signatureValid) {
          // Signature verification failure - increment rank by 2
          if (!isOriginal) {
            const baseMirrorUrl = this.getBaseMirrorUrl(url);
            this.mirrorsManager.updateMirrorRank(baseMirrorUrl, 'signature');
          }
          log(colors.yellow(`⚠ Signature verification failed for ${hostname}, trying next mirror...`));
          this.fileSystemManager.safeRemove(targetPath);
          continue;
        }
        log(colors.green('✓ Signature verified'));

        // Verify checksum if available
        if (downloadInfo.checksum) {
          const checksumValid = verifyChecksum(targetPath, downloadInfo.checksum);
          if (!checksumValid) {
            // Checksum verification failure - increment rank by 2
            if (!isOriginal) {
              const baseMirrorUrl = this.getBaseMirrorUrl(url);
              this.mirrorsManager.updateMirrorRank(baseMirrorUrl, 'checksum');
            }
            log(colors.yellow(`⚠ Checksum verification failed for ${hostname}, trying next mirror...`));
            this.fileSystemManager.safeRemove(targetPath);
            continue;
          }
          // Checksum verified - no need to log for every download
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
        
        // Handle specific HTTP status codes as per official algorithm
        const errorMessage = error.message.toLowerCase();
        const isTimeoutError = errorMessage.includes('timeout') || 
                              errorMessage.includes('network') || 
                              errorMessage.includes('fetch');
        
        // Handle specific HTTP status codes
        const is503Error = errorMessage.includes('503'); // Scheduled downtime
        const is429Error = errorMessage.includes('429'); // Rate limiting
        const is404Error = errorMessage.includes('404'); // Not found (acceptable for old versions)
        
        const isHttpError = is503Error || is429Error || is404Error;
        
        if (!isOriginal && (isTimeoutError || isHttpError)) {
          // Network/timeout/HTTP errors - increment rank by 1
          const baseMirrorUrl = this.getBaseMirrorUrl(url);
          this.mirrorsManager.updateMirrorRank(baseMirrorUrl, 'timeout');
        }
        
        // Provide specific error messages for different HTTP status codes
        let errorMsg = error.message;
        if (is503Error) {
          errorMsg = 'Mirror temporarily unavailable (503)';
        } else if (is429Error) {
          errorMsg = 'Rate limited by mirror (429)';
        } else if (is404Error) {
          errorMsg = 'File not found on mirror (404)';
        }
        
        log(colors.yellow(`⚠ Download failed from ${hostname}: ${errorMsg}`));
        this.fileSystemManager.safeRemove(targetPath);
        continue;
      }
    }

    if (!downloadSuccess) {
      // If all mirrors failed after 3 retries, reset ranks and throw error
      if (attemptCount >= 3) {
        log(colors.yellow('All mirrors failed after 3 attempts, resetting mirror ranks...'));
        this.mirrorsManager.resetMirrorRanks();
      }
      throw new Error(`Failed to download from all mirrors after ${attemptCount} attempts. Last error: ${lastError?.message}`);
    }
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

  /**
   * Extract base mirror URL from full download URL
   * Converts "https://mirror.example.com/zig/0.13.0/zig-linux-x86_64-0.13.0.tar.xz?source=ziggy"
   * to "https://mirror.example.com/zig/"
   */
  private getBaseMirrorUrl(fullUrl: string): string {
    try {
      const url = new URL(fullUrl);
      // Remove query parameters
      url.search = '';
      
      // Extract the base path by removing the version-specific parts
      // Pattern: /zig/VERSION/zig-platform-arch-VERSION.ext
      const pathParts = url.pathname.split('/');
      
      // Find the base mirror path (everything before the version directory)
      // Look for pattern like /zig/VERSION/ or similar
      let basePath = '';
      for (let i = 0; i < pathParts.length - 1; i++) {
        basePath += pathParts[i] + '/';
        // Stop before the version directory (contains zig-platform-arch pattern)
        if (i < pathParts.length - 2 && pathParts[i + 2]?.startsWith('zig-')) {
          break;
        }
      }
      
      return `${url.protocol}//${url.host}${basePath}`;
    } catch (error) {
      // Fallback: return the URL without path if parsing fails
      const url = new URL(fullUrl);
      return `${url.protocol}//${url.host}/`;
    }
  }
}

#!/usr/bin/env bun

import { ZIG_ASCII_ART } from './ascii-art';
import { join, resolve, dirname } from 'path';
// File system operations are now handled by FileSystemManager

import * as clack from '@clack/prompts';
import which from 'which';
import { cloneTemplateRepository } from './utils/template';
import { colors } from './utils/colors';
import { setupCLI } from './cli';
import { useCommand } from './commands/use';
import { PlatformDetector } from './utils/platform';
import { FileSystemManager } from './utils/filesystem';
import { ArchiveExtractor } from './utils/archive';
import { SpinnerProgressReporter } from './utils/progress';
import { ConfigManager } from './core/config';
import { VersionManager } from './core/version';
import { ZigInstaller as CoreZigInstaller } from './core/installer';
import type { ZigDownloadIndex, DownloadStatus, ZiggyConfig } from './types';
export const log = console.log;

// Handle Ctrl+C gracefully
let currentDownload: { cleanup?: () => void } | null = null;

function setupSignalHandlers() {
  const gracefulExit = () => {
    log(colors.yellow('\n\n🛑 Interrupt: Shutting down ...'));

    // Clean up any ongoing downloads
    if (currentDownload?.cleanup) {
      try {
        currentDownload.cleanup();
        log(colors.yellow('✓ Download cleanup completed'));
      } catch (_error) {
        log(colors.red('⚠ Download cleanup failed'));
      }
    }

    log(colors.yellow('👋 Goodbye!'));
    process.exit(0);
  };

  process.on('SIGINT', gracefulExit);
  process.on('SIGTERM', gracefulExit);
}



// Console colors using ANSI escape codes

// Simple progress bar utility
function createProgressBar(current: number, total: number, width: number = 40): string {
  const percentage = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const empty = width - filled;

  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${percentage}% (${formatBytes(current)}/${formatBytes(total)})`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Simple prompt utility using Bun's stdin


export class ZigInstaller {
  private platformDetector: PlatformDetector;
  private fileSystemManager: FileSystemManager;
  private archiveExtractor: ArchiveExtractor;
  private configManager: ConfigManager;
  private versionManager: VersionManager;
  private coreInstaller: CoreZigInstaller;
  private arch: string;
  public platform: string;
  private os: string;
  private cwd: string;
  private ziggyDir: string;
  private binDir: string;
  public envPath: string;
  public config: ZiggyConfig;

  constructor() {
    this.platformDetector = new PlatformDetector();
    this.fileSystemManager = new FileSystemManager();
    const progressReporter = new SpinnerProgressReporter();
    this.archiveExtractor = new ArchiveExtractor(this.fileSystemManager, progressReporter);
    this.arch = this.platformDetector.getArch();
    this.platform = this.platformDetector.getPlatform();
    this.os = this.platformDetector.getOS();
    this.cwd = process.cwd();
    this.ziggyDir = this.platformDetector.getZiggyDir();
    this.binDir = join(this.ziggyDir, 'bin');

    // Platform-specific env file names
    if (this.platform === 'windows') {
      this.envPath = join(this.ziggyDir, 'env.ps1'); // PowerShell script
    } else {
      this.envPath = join(this.ziggyDir, 'env'); // Bash/Zsh script
    }

    // Ensure directories exist
    this.fileSystemManager.ensureDirectory(this.ziggyDir);
    this.fileSystemManager.ensureDirectory(this.binDir);

    // Initialize ConfigManager
    this.configManager = new ConfigManager(this.ziggyDir, this.fileSystemManager);
    this.config = this.configManager.load();
    
    // Initialize VersionManager
    this.versionManager = new VersionManager(this.configManager, this.arch, this.platform);
    
    // Detect system Zig before creating core installer
    this.detectSystemZig();
    
    // Initialize Core Installer with dependency injection
    this.coreInstaller = new CoreZigInstaller(
      this.configManager,
      this.versionManager,
      this.platformDetector,
      this.fileSystemManager,
      this.archiveExtractor,
      this.ziggyDir
    );
    
    this.cleanupIncompleteDownloads();
  }

  private detectSystemZig() {
    try {
      const zigPath = which.sync('zig', { nothrow: true });
      if (zigPath && !zigPath.includes(this.ziggyDir)) {
        // Get version
        const versionResult = Bun.spawnSync([zigPath, 'version'], { stdout: 'pipe' });
        if (versionResult.exitCode === 0) {
          const version = versionResult.stdout.toString().trim();
          this.config.systemZig = { path: zigPath, version };
          // Save the config so other components can access system Zig info
          this.configManager.save(this.config);
        }
      }
    } catch (_error) {
      // System zig not found or not accessible
    }
  }

  private cleanupIncompleteDownloads() {
    let hasIncompleteDownloads = false;
    const versionsToCleanup: string[] = [];

    // Find downloads that are stuck in 'downloading' state
    for (const [version, info] of Object.entries(this.config.downloads)) {
      if (info.status === 'downloading') {
        versionsToCleanup.push(version);
        hasIncompleteDownloads = true;
      }
    }

    if (hasIncompleteDownloads) {
      log(colors.yellow('🧹 Cleaning up incomplete downloads from previous session...'));

      for (const version of versionsToCleanup) {
        const info = this.config.downloads[version];
        if (info) {
          // Remove the incomplete download entry
          delete this.config.downloads[version];

          // Remove any partial files
          if (this.fileSystemManager.fileExists(info.path)) {
            this.fileSystemManager.safeRemove(info.path);
          }
        }
      }

      this.configManager.save(this.config);
      log(colors.green(`✓ Cleaned up ${versionsToCleanup.length} incomplete download(s)`));
    }
  }

  private createSymlink(targetPath: string, version: string) {
    const zigBinaryName = this.platform === 'windows' ? 'zig.exe' : 'zig';
    const zigBinary = join(this.binDir, zigBinaryName);

    // Create new symlink
    try {
      let symlinkTarget;

      if (version === 'system') {
        // For system zig, use the direct path to the binary
        symlinkTarget = targetPath;
      } else {
        // For ziggy-managed versions, find the actual zig binary
        // First check if zig binary is directly in the path
        const zigBinaryName = this.platform === 'windows' ? 'zig.exe' : 'zig';
        const directZigPath = join(targetPath, zigBinaryName);
        if (this.fileSystemManager.fileExists(directZigPath)) {
          symlinkTarget = directZigPath;
        } else {
          // Fallback: look for extracted directory structure
          const extractedDirName = `zig-${this.arch}-${this.platform}-${version}`;
          symlinkTarget = join(targetPath, extractedDirName, zigBinaryName);
        }
      }

      log(colors.gray(`Creating symlink: ${zigBinary} -> ${symlinkTarget}`));

      // Create symlink using FileSystemManager
      this.fileSystemManager.createSymlink(symlinkTarget, zigBinary, this.platform);
      
      this.versionManager.setCurrentVersion(version);
      log(colors.green(`✓ Symlinked ${version} to ${zigBinary}`));
    } catch (error) {
      console.error(colors.red('Error creating symlink:'), error);
    }
  }

  private createEnvFile() {
    let envContent: string;
    let instructions: string;

    if (this.platform === 'windows') {
      // PowerShell script for Windows
      envContent = `# Ziggy Environment for PowerShell
# Add this line to your PowerShell profile:
# . "${this.envPath.replace(/\\/g, '\\\\')}"

$env:PATH = "${this.binDir.replace(/\\/g, '\\\\')};" + $env:PATH
`;
      instructions = `Add this to your PowerShell profile:\n. "${this.envPath}"`;
    } else {
      // Bash/Zsh script for Unix-like systems
      envContent = `# Ziggy Environment
# Add this line to your shell profile (.bashrc, .zshrc, etc.):
# source "${this.envPath}"

export PATH="${this.binDir}:$PATH"
`;
      instructions = `Add this to your shell profile:\nsource "${this.envPath}"`;
    }

    this.fileSystemManager.writeFile(this.envPath, envContent);
    log(colors.green(`✓ Created env file at ${this.envPath}`));
    log(colors.yellow(`\nTo use ziggy-managed Zig versions:`));
    log(colors.cyan(instructions));
  }











  private scanExistingInstallations(): ZiggyConfig {
    const config: ZiggyConfig = { downloads: {} };
    const versionsDir = join(this.ziggyDir, 'versions');

    if (!this.fileSystemManager.fileExists(versionsDir)) {
      return config;
    }

    log(colors.yellow('📁 No ziggy.toml found. Scanning existing installations...'));

    const versionDirs = this.fileSystemManager.listDirectory(versionsDir).filter(dir => {
      const fullPath = join(versionsDir, dir);
      return this.fileSystemManager.isDirectory(fullPath);
    });

    if (versionDirs.length === 0) {
      return config;
    }

    log(colors.cyan(`Found ${versionDirs.length} potential installation(s). Scanning...`));

    // Simple progress bar
    const progressWidth = 30;
    let processed = 0;

    for (const versionDir of versionDirs) {
      const versionPath = join(versionsDir, versionDir);

      // Update progress bar
      processed++;
      const progress = processed / versionDirs.length;
      const filled = Math.floor(progress * progressWidth);
      const bar = '█'.repeat(filled) + '░'.repeat(progressWidth - filled);
      const percentage = Math.floor(progress * 100);

      process.stdout.write(`\r${colors.cyan('Scanning:')} [${bar}] ${percentage}% (${versionDir})`);

      // Look for zig binary directly in the version directory
      const zigBinary = join(versionPath, 'zig');

      if (this.fileSystemManager.fileExists(zigBinary)) {
        // Try to get version from zig binary
        let version = versionDir;

        try {
          const versionResult = Bun.spawnSync([zigBinary, 'version'], {
            stdout: 'pipe',
            timeout: 5000 // 5 second timeout
          });
          if (versionResult.exitCode === 0) {
            version = versionResult.stdout.toString().trim();
          }
        } catch (_error) {
          // Fall back to directory name
          version = versionDir;
        }

        config.downloads[version] = {
          version: version,
          path: versionPath,
          status: 'completed',
          downloadedAt: new Date().toISOString()
        };
      } else {
        // Look for extracted Zig installations (old format)
        const contents = this.fileSystemManager.listDirectory(versionPath);
        const zigExtraction = contents.find(item =>
          item.startsWith('zig-') && this.fileSystemManager.isDirectory(join(versionPath, item))
        );

        if (zigExtraction) {
          // Check if zig binary exists in subdirectory
          const zigBinaryInSubdir = join(versionPath, zigExtraction, 'zig');
          if (this.fileSystemManager.fileExists(zigBinaryInSubdir)) {
            // Try to get version from directory name or binary
            let version = versionDir;

            try {
              const versionResult = Bun.spawnSync([zigBinaryInSubdir, 'version'], {
                stdout: 'pipe',
                timeout: 5000
              });
              if (versionResult.exitCode === 0) {
                version = versionResult.stdout.toString().trim();
              }
            } catch (_error) {
              version = versionDir;
            }

            config.downloads[version] = {
              version: version,
              path: versionPath,
              status: 'completed',
              downloadedAt: new Date().toISOString()
            };
          }
        }
      }
    }

    // Clear progress bar line
    process.stdout.write('\r' + ' '.repeat(60) + '\r');

    const foundCount = Object.keys(config.downloads).length;
    if (foundCount > 0) {
      log(colors.green(`✓ Found ${foundCount} valid Zig installation(s):`));
      for (const version of Object.keys(config.downloads)) {
        log(colors.cyan(`  • ${version}`));
      }
      log(colors.yellow('Rebuilding ziggy.toml configuration...\n'));
    } else {
      log(colors.yellow('No valid Zig installations found in versions directory.\n'));
    }

    return config;
  }

  private parseSimpleToml(content: string): Partial<ZiggyConfig> {
    // Simple TOML parser for our specific structure
    const config: Partial<ZiggyConfig> = { downloads: {} };
    const lines = content.split('\n');
    let currentSection = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        currentSection = trimmed.slice(1, -1);
        continue;
      }

      // Check for currentVersion
      if (trimmed.startsWith('currentVersion = ')) {
        config.currentVersion = trimmed.split('=')[1]?.trim().replace(/"/g, '');
        continue;
      }

      if (currentSection.startsWith('downloads.')) {
        let version = currentSection.substring('downloads.'.length);
        // Remove quotes if present
        if (version.startsWith('"') && version.endsWith('"')) {
          version = version.slice(1, -1);
        }
        if (!version) continue;

        if (!config.downloads![version]) {
          config.downloads![version] = {
            version: version,
            path: '',
            downloadedAt: '',
            status: 'completed'
          };
        }

        const parts = trimmed.split('=');
        if (parts.length < 2) continue;

        const key = parts[0]?.trim();
        const value = parts.slice(1).join('=').trim().replace(/"/g, '');

        if (!key) continue;

        if (key === 'path') config.downloads![version]!.path = value;
        if (key === 'downloadedAt') config.downloads![version]!.downloadedAt = value;
        if (key === 'status') config.downloads![version]!.status = value as DownloadStatus;
        if (key === 'isSystemWide') config.downloads![version]!.isSystemWide = value === 'true';
      }
    }

    return config;
  }

  private saveConfig(): void {
    // Legacy method - now handled by ConfigManager
    this.configManager.save(this.config);
  }

  private generateToml(config: ZiggyConfig): string {
    // Legacy method - now handled by ConfigManager  
    // This method is no longer used but kept for compatibility
    return '';
  }









  public async getAvailableVersions(): Promise<string[]> {
    return this.versionManager.getAvailableVersions();
  }

  public async validateVersion(version: string): Promise<boolean> {
    return this.versionManager.validateVersion(version);
  }

  private async downloadZig(version: string, installPath: string): Promise<void> {
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
      const zigUrl = downloadInfo.tarball;
      const ext = this.platformDetector.getArchiveExtension();
      const zigTar = `zig-${this.platform}-${this.arch}-${version}.${ext}`;
      const tarPath = join(installPath, zigTar);

      log(colors.blue(`Downloading Zig ${version}...`));

      const downloadResponse = await fetch(zigUrl);
      if (!downloadResponse.ok) {
        throw new Error(`HTTP error! status: ${downloadResponse.status}`);
      }

      const contentLength = parseInt(downloadResponse.headers.get('content-length') || '0');

      // Create directory if it doesn't exist
      this.fileSystemManager.ensureDirectory(installPath);

      // Download the file
      const writer = this.fileSystemManager.createWriteStream(tarPath);
      const reader = downloadResponse.body?.getReader();

      if (!reader) {
        throw new Error('Failed to get response stream');
      }

      let downloadedBytes = 0;
      let lastProgress = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          writer.write(value);
          downloadedBytes += value.length;

          if (contentLength > 0) {
            const progressBar = createProgressBar(downloadedBytes, contentLength);
            if (progressBar !== lastProgress) {
              process.stdout.write('\r' + ' '.repeat(80) + '\r');
              process.stdout.write(colors.cyan(progressBar));
              lastProgress = progressBar;
            }
          } else {
            process.stdout.write('\r' + ' '.repeat(40) + '\r');
            process.stdout.write(colors.cyan(`Downloaded: ${formatBytes(downloadedBytes)}`));
          }
        }
      } finally {
        reader.releaseLock();
        // End the write stream properly
        writer.end();
      }

      // Wait for the file to be completedly written
      await new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      log(colors.green('Download completed!'));

      // Extract the archive
      log(colors.blue('Starting extraction process...'));

      const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      let spinnerIndex = 0;

      const spinnerInterval = setInterval(() => {
        process.stdout.write(`\r${colors.cyan(spinnerChars[spinnerIndex]!)} Extracting files...`);
        spinnerIndex = (spinnerIndex + 1) % spinnerChars.length;
      }, 100);

      try {
        log(colors.yellow(`\nExtracting ${tarPath} to ${installPath}...`));

        await this.archiveExtractor.extractArchive(tarPath, installPath);

        clearInterval(spinnerInterval);
        process.stdout.write('\r' + ' '.repeat(30) + '\r');
        log(colors.green('✓ Extraction completed!'));
      } catch (extractError) {
        clearInterval(spinnerInterval);
        process.stdout.write('\r' + ' '.repeat(30) + '\r');
        console.error(colors.red('Extraction failed:'), extractError);
        throw extractError;
      }

      // Clean up the downloaded archive
      log(colors.blue('Cleaning up downloaded archive...'));
      this.fileSystemManager.safeRemove(tarPath);
      log(colors.green('✓ Installation completed!'));

    } catch (error) {
      throw new Error(`Failed to download Zig: ${error}`);
    }
  }









  private async addToSystemPath(installPath: string): Promise<string[]> {
    const changes: string[] = [];
    const version = await this.getLatestStableVersion();
    const _zigBinPath = dirname(join(installPath, `zig-${this.platform}-${this.arch}-${version}`, 'zig'));
    const shellInfo = this.platformDetector.getShellInfo();

    log(colors.yellow(`\nDetected shell: ${colors.cyan(shellInfo.shell)}`));
    log(colors.yellow('\nZiggy will create an environment file at:'));
    log(colors.cyan(this.envPath));

    log(colors.yellow('\nWhat would you like to do?'));
    const choice = await clack.select({
      message: 'Choose setup option:',
      options: [
        { value: 'back', label: 'Go back to main menu' },
        { value: 'create', label: 'Create env file and show manual setup instructions' }
      ],
      initialValue: 'create'
    });

    if (clack.isCancel(choice) || choice === 'back') {
      return changes;
    }

    if (choice === 'create') {
      try {
        // Ask for explicit permission to create .ziggy directory and env file
        const createZiggy = await clack.confirm({
          message: `Create ${this.platformDetector.getZiggyDir()} directory and env file?`,
          initialValue: true
        });

        if (clack.isCancel(createZiggy) || !createZiggy) {
          log(colors.yellow('✓ Ziggy environment not created. You can set up PATH manually.'));
          changes.push('User declined to create .ziggy environment');
          return changes;
        }

        // Create the env file using the unified method
        this.createEnvFile();
        changes.push(`Created env file with Zig ${version} PATH`);

        // Show manual setup instructions
        log(colors.yellow('\n' + '='.repeat(60)));
        log(colors.yellow('📝 MANUAL SETUP REQUIRED'));
        log(colors.yellow('='.repeat(60)));

        log(colors.yellow('\nTo complete the Zig installation, add this line to your shell profile:'));
        const sourceLine = this.platformDetector.getShellSourceLine(this.envPath);
        log(colors.green(sourceLine));

        // Platform-specific instructions
        if (this.platform === 'win32') {
          log(colors.yellow('\n📁 Windows shell profile locations:'));
          log(colors.cyan(`• PowerShell: $PROFILE (typically: ${process.env.USERPROFILE}\\Documents\\PowerShell\\Microsoft.PowerShell_profile.ps1)`));
          log(colors.cyan('• Command Prompt: Add to system environment variables'));
        } else if (this.platform === 'darwin') {
          log(colors.yellow('\n📁 macOS shell profile locations:'));
          log(colors.cyan('• Bash: ~/.bash_profile or ~/.bashrc'));
          log(colors.cyan('• Zsh: ~/.zshrc (default on macOS Catalina+)'));
          log(colors.cyan('• Fish: ~/.config/fish/config.fish'));
        } else {
          log(colors.yellow('\n📁 Linux shell profile locations:'));
          log(colors.cyan('• Bash: ~/.bashrc or ~/.bash_profile'));
          log(colors.cyan('• Zsh: ~/.zshrc'));
          log(colors.cyan('• Fish: ~/.config/fish/config.fish'));
        }

        log(colors.yellow(`\n🔧 For your current shell (${shellInfo.shell}), add it to:`));
        log(colors.cyan(shellInfo.profileFile));

        log(colors.yellow('\n♻️  After adding the line, restart your terminal or run:'));
        log(colors.cyan(`source ${shellInfo.profileFile}`));

        log(colors.yellow('\n✨ That\'s it! Ziggy will manage the rest automatically.'));
        log(colors.yellow('='.repeat(60)));

        changes.push('Provided manual setup instructions');

        // Offer user choice to quit or return to main menu
        await this.showPostInstallOptions();

      } catch (error) {
        log(colors.red('Failed to set up Ziggy environment. Please set up PATH manually.'));
        log(colors.red('Error:'), error);
        changes.push('Failed to create Ziggy environment automatically');
      }
    } else {
      changes.push('User chose to skip Ziggy environment setup');
    }

    return changes;
  }

  private async getLatestStableVersion(): Promise<string> {
    return this.versionManager.getLatestStableVersion();
  }

  private async validateInstallPath(userPath: string): Promise<string> {
    // First expand ~ to home directory if present
    const expandedPath = this.platformDetector.expandHomePath(userPath);
    const resolvedPath = resolve(this.cwd, expandedPath);

    if (!this.fileSystemManager.fileExists(resolvedPath)) {
      // Ask before creating directory
      const createDir = await clack.confirm({
        message: `Directory ${resolvedPath} doesn't exist. Create it?`,
        initialValue: true
      });
      if (clack.isCancel(createDir) || !createDir) {
        throw new Error('Installation cancelled - directory not created');
      }
      this.fileSystemManager.createDirectory(resolvedPath);
      log(colors.green(`✓ Created directory: ${resolvedPath}`));
      return resolvedPath;
    }

    if (!this.fileSystemManager.isDirectory(resolvedPath)) {
      throw new Error('Path is not a directory');
    }

    // Check if directory is empty
    const files = this.fileSystemManager.listDirectory(resolvedPath);
    if (files.length > 0) {
      const overwrite = await clack.confirm({
        message: 'Directory is not empty. Continue?',
        initialValue: false
      });
      if (clack.isCancel(overwrite) || !overwrite) {
        throw new Error('Directory not empty');
      }
    }

    return resolvedPath;
  }

  public async run(): Promise<void> {
    // Start the TUI interface
    await this.runTUI();
  }

  private displayHeaderWithInfo(): void {
    // Split ASCII art into lines
    const asciiLines = ZIG_ASCII_ART.trim().split('\n');

    // Prepare system info lines
    const shellInfo = this.platformDetector.getShellInfo();
    const systemInfo = [
      `Architecture: ${colors.cyan(this.arch)}`,
      `Platform: ${colors.cyan(this.platform)}`,
      `OS: ${colors.cyan(this.os)}`,
      `Ziggy directory: ${colors.cyan(this.ziggyDir)}`,
      `Shell: ${colors.cyan(shellInfo.shell)}`,
      `Profile: ${colors.cyan(shellInfo.profileFile)}`
    ];

    // Find the longest ASCII line to determine padding
    const maxAsciiWidth = Math.max(...asciiLines.map(line => line.length));
    const padding = 4; // Space between ASCII and info

    // Display ASCII art with system info side by side
    const maxLines = Math.max(asciiLines.length, systemInfo.length);

    for (let i = 0; i < maxLines; i++) {
      const asciiLine = asciiLines[i] || '';
      const infoLine = systemInfo[i] || '';

      // Pad ASCII line to consistent width
      const paddedAscii = asciiLine.padEnd(maxAsciiWidth);

      if (infoLine) {
        log(colors.yellow(paddedAscii) + ' '.repeat(padding) + colors.yellow(infoLine));
      } else {
        log(colors.yellow(paddedAscii));
      }
    }

    log(''); // Add spacing after header
  }

  private async runTUI(): Promise<void> {
    // Show colorful ASCII art and system info side by side
    this.displayHeaderWithInfo();

    // Show system Zig if detected
    if (this.config.systemZig) {
      log(colors.yellow(`System Zig: ${colors.cyan(this.config.systemZig.version)} at ${colors.gray(this.config.systemZig.path)}`));
    }

    // Show current active version
    const currentVersion = this.versionManager.getCurrentVersion();
    if (currentVersion) {
      if (currentVersion === 'system' && this.config.systemZig) {
        log(colors.yellow(`Current active Zig: ${colors.green(this.config.systemZig.version)} ${colors.gray('(system installation)')}`));
      } else {
        const currentInfo = this.config.downloads[currentVersion];
        if (currentInfo) {
          log(colors.yellow(`Current active Zig: ${colors.green(currentVersion)} ${colors.gray('(managed by ziggy)')}`));
        }
      }
    } else {
      log(colors.yellow(`Current active Zig: ${colors.red('none set - run "ziggy use" to select one')}`));
    }

    // Check if ziggy directory exists and setup if needed
    if (!this.fileSystemManager.fileExists(this.ziggyDir)) {
      log(colors.yellow(`\n🔧 First time setup: Ziggy directory doesn't exist.`));

      const createDir = await clack.confirm({
        message: `Create Ziggy directory at ${this.ziggyDir}?`,
        initialValue: true
      });

      if (clack.isCancel(createDir) || !createDir) {
        clack.cancel('Setup cancelled. Ziggy needs a directory to manage Zig versions.');
        process.exit(1);
      }

      this.fileSystemManager.createDirectory(this.ziggyDir);
      this.fileSystemManager.createDirectory(join(this.ziggyDir, 'versions'));
      this.fileSystemManager.createDirectory(join(this.ziggyDir, 'bin'));
      log(colors.green(`✓ Created Ziggy directory at ${this.ziggyDir}`));

      // Save initial empty config
      this.configManager.save(this.config);
      log(colors.green(`✓ Initialized ziggy.toml configuration`));
    }

    // Show installed versions if any
    const installedVersions = Object.keys(this.config.downloads);
    if (installedVersions.length > 0) {
      log(colors.yellow(`\n📦 Installed versions:`));
      for (const version of installedVersions) {
        const info = this.config.downloads[version];
        if (!info) continue;

        // Only show completed versions, with status indicators for others
        if (info.status === 'completed') {
          const isCurrent = this.versionManager.getCurrentVersion() === version ? colors.green(' ← current') : '';
          log(colors.cyan(`• ${version}${isCurrent}`));
        } else if (info.status === 'downloading') {
          log(colors.yellow(`• ${version} [downloading...]`));
        } else if (info.status === 'failed') {
          log(colors.red(`• ${version} [failed]`));
        }
      }
    } else {
      log(colors.yellow(`\n📦 No Zig versions installed yet`));
    }

    log(''); // Add spacing

    // Main menu loop
    while (true) {
      const choices = [
        { value: 'create-project', label: 'Create new Zig project' },
        { value: 'download-latest', label: 'Download latest stable Zig' },
        { value: 'download-specific', label: 'Download specific Zig version or master branch' },
        { value: 'list-versions', label: 'List installed Zig versions' }
      ];

      // Add use command if versions are available
      const hasVersions = Object.keys(this.config.downloads).length > 0 || this.config.systemZig;
      if (hasVersions) {
        choices.push({ value: 'use-version', label: 'Switch active Zig version' });
      }

      // Add clean command if there are versions to clean
      const hasDownloadedVersions = Object.keys(this.config.downloads).length > 0;
      if (hasDownloadedVersions) {
        choices.push({ value: 'clean', label: 'Clean up Zig installations' });
      }

      choices.push({ value: 'q', label: 'Quit' });

      const action = await clack.select({
        message: colors.cyan('What would you like to do?'),
        options: choices,
        initialValue: 'download-latest'
      });

      if (clack.isCancel(action) || action === 'q') {
        log(colors.green('👋 Goodbye!'));
        process.exit(0);
      }

      try {
        switch (action) {
          case 'create-project':
            await this.handleCreateProjectTUI();
            break;
          case 'download-latest':
            await this.handleDownloadLatestTUI();
            break;
          case 'download-specific':
            await this.handleDownloadSpecificTUI();
            break;
          case 'list-versions':
            await this.listVersionsTUI();
            break;
          case 'use-version':
            await useCommand(true);
            break;
          case 'clean':
            await this.handleCleanTUI();
            break;
        }
      } catch (error) {
        if (clack.isCancel(error)) {
          // User pressed Ctrl+C during an operation
          log(colors.yellow('\n👋 Goodbye!'));
          process.exit(0);
        }
        log(colors.red(`Error: ${error instanceof Error ? error.message : String(error)}`));

        // Ask if user wants to continue
        const continueChoice = await clack.confirm({
          message: 'Would you like to return to the main menu?',
          initialValue: true
        });

        if (clack.isCancel(continueChoice) || !continueChoice) {
          log(colors.green('👋 Goodbye!'));
          process.exit(0);
        }
      }
    }
  }

  private async handleCreateProjectTUI(): Promise<void> {
    log(colors.cyan('🚀 Create New Zig Project'));
    log();

    // Ask for project name
    const projectName = await clack.text({
      message: 'What is the name of your project?',
      placeholder: 'my-zig-app',
      validate: (value) => {
        if (!value) return 'Project name is required';
        if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
          return 'Project name can only contain letters, numbers, underscores, and hyphens';
        }
        return undefined;
      }
    });

    if (clack.isCancel(projectName)) {
      return;
    }

    // Check if directory already exists
    const targetPath = resolve(process.cwd(), projectName);
    if (this.fileSystemManager.fileExists(targetPath)) {
      clack.log.error(`Directory '${projectName}' already exists`);
      return;
    }

    // Check for active Zig installations
    const currentVersion = this.versionManager.getCurrentVersion();
    const hasActiveZig = currentVersion || this.config.systemZig;

    const templateChoices = [
      { value: 'back', label: '← Back to main menu' },
      { value: 'ziggy', label: 'Lean zig-app-template', hint: 'Bare bones zig-app-template with {main, build}.zig, a .gitignore and empty README' }
    ];

    // Add zig init option if Zig is available
    if (hasActiveZig) {
      const zigVersion = currentVersion === 'system' && this.config.systemZig
        ? this.config.systemZig.version
        : currentVersion;

      templateChoices.push({
        value: 'zig-init',
        label: `Standard Zig template (Same as \`zig init\`)`,
        hint: `Using Zig ${zigVersion}`
      });
    }

    const templateChoice = await clack.select({
      message: hasActiveZig
        ? 'Choose project template:'
        : 'Choose project template: (zig init requires an active Zig installation)',
      options: templateChoices,
      initialValue: 'ziggy'
    });

    if (clack.isCancel(templateChoice) || templateChoice === 'back') {
      return;
    }

    try {
      if (templateChoice === 'ziggy') {
        // Use ziggy template
        const spinner = clack.spinner();
        spinner.start('Creating project...');

        await cloneTemplateRepository(targetPath, (message: string) => {
          spinner.message(message);
        });

        spinner.stop('✓ Project created successfully!');

        log();
        log(colors.green('🎉 Project created successfully with Ziggy template!'));
        log();
        log(colors.cyan('Next steps:'));
        log(colors.gray(`  cd ${projectName}`));
        log(colors.gray('  zig build run'));
        log();
        log(colors.yellow('Happy coding! 🦎'));
        log();
        
        // Use post-action menu for Ziggy template
        const ziggyAction = await this.showPostActionOptions([
          { value: 'create-another', label: 'Create another project' }
        ]);

        if (ziggyAction === 'create-another') {
          // Recursively call to create another project
          await this.handleCreateProjectTUI();
          return;
        }

        // For 'main-menu', just return normally

      } else if (templateChoice === 'zig-init') {
        // Use zig init
        const spinner = clack.spinner();
        spinner.start('Creating project with zig init...');

        // Create the directory first
        this.fileSystemManager.createDirectory(targetPath);

        // Get the active zig command
        let zigCommand = 'zig';
        const currentVersion = this.versionManager.getCurrentVersion();
        if (currentVersion === 'system' && this.config.systemZig) {
          zigCommand = this.config.systemZig.path;
        } else if (currentVersion) {
          // Use the symlinked zig from ziggy
          zigCommand = join(this.binDir, 'zig');
        }

        // Run zig init in the target directory
        const result = Bun.spawnSync([zigCommand, 'init'], {
          cwd: targetPath,
          stdout: 'pipe',
          stderr: 'pipe'
        });

        if (result.exitCode !== 0) {
          spinner.stop('Failed');
          const errorOutput = result.stderr?.toString() || 'Unknown error';
          throw new Error(`zig init failed: ${errorOutput}`);
        }

        spinner.stop('✓ Project created successfully!');

        log();
        log(colors.green('🎉 Project created successfully with zig init!'));
        log();
        log(colors.cyan('Next steps:'));
        log(colors.gray(`  cd ${projectName}`));
        log(colors.gray('  zig build run'));
        log();
        log(colors.yellow('Happy coding! 🦎'));
        log();
        
        // Use post-action menu for zig-init
        const zigInitAction = await this.showPostActionOptions([
          { value: 'create-another', label: 'Create another project' }
        ]);

        if (zigInitAction === 'create-another') {
          // Recursively call to create another project
          await this.handleCreateProjectTUI();
          return;
        }

        // For 'main-menu', just return normally
      }

    } catch (error) {
      clack.log.error(`Failed to create project: ${error instanceof Error ? error.message : String(error)}`);

      // Clean up if directory was created
      this.fileSystemManager.safeRemove(targetPath);
    }
  }

  private async handleDownloadLatestTUI(): Promise<void> {
    const version = await this.getLatestStableVersion();
    await this.downloadWithVersion(version);
  }

  public async handleDownloadSpecificTUI(): Promise<void> {
    const spinner = clack.spinner();
    spinner.start('Fetching available versions...');

    let availableVersions: string[];
    try {
      availableVersions = await this.getAvailableVersions();
      spinner.stop('Available versions loaded');
    } catch (_error) {
      spinner.stop('Failed to fetch versions');
      clack.log.error('Could not fetch available versions');
      return;
    }

    // Add navigation options to the version choices, with master branch at the top
    const versionChoices = [
      { value: 'back', label: '← Back to main menu' },
      { value: 'quit', label: 'Quit' },
      { value: 'master', label: 'master (development branch)', hint: 'Latest development build' },
      ...availableVersions.map(v => ({ value: v, label: v }))
    ];

    const version = await clack.select({
      message: 'Select Zig version:',
      options: versionChoices,
      initialValue: 'master'
    });

    if (clack.isCancel(version)) {
      return;
    }

    if (version === 'back') {
      return; // Go back to main menu
    }

    if (version === 'quit') {
      log(colors.green('👋 Goodbye!'));
      process.exit(0);
    }

    await this.downloadWithVersion(version);
  }



  public useVersion(selectedVersion: string): void {
    // Delegate to core installer
    this.coreInstaller.useVersion(selectedVersion);
    
    // Reload config after version change
    this.config = this.configManager.load();
  }

  public async listVersionsTUI(): Promise<void> {
    const choices = [];

    // Add system zig if available (show first)
    if (this.config.systemZig) {
      const isCurrent = this.versionManager.getCurrentVersion() === 'system' ? ' ← current' : '';
      choices.push(`System: ${this.config.systemZig.version} at ${this.config.systemZig.path}${isCurrent}`);
    }

    // Add installed ziggy versions
    const availableVersions = Object.keys(this.config.downloads).filter(v => {
      const info = this.config.downloads[v];
      return info?.status === 'completed' && v !== 'system';
    });

    for (const version of availableVersions) {
      const info = this.config.downloads[version];
      if (info?.status === 'completed') {
        const isCurrent = this.versionManager.getCurrentVersion() === version ? ' ← current' : '';
        choices.push(`Ziggy: ${version} at ${info.path}${isCurrent}`);
      }
    }

    if (choices.length === 0) {
      clack.log.warn('No Zig versions installed');
    } else {
      clack.note(choices.join('\n'), 'Available Zig versions');
    }

    // Use the new post-action menu
    await this.showPostActionOptions();
  }

  public async handleCleanTUI(): Promise<void> {
    const downloadedVersions = Object.keys(this.config.downloads).filter(v => {
      const info = this.config.downloads[v];
      return info?.status === 'completed' && v !== 'system';
    });

    if (downloadedVersions.length === 0) {
      clack.log.warn('No Zig versions to clean (only system Zig found)');
      return;
    }

    // Show current versions
    const versionsList = downloadedVersions
      .map(v => {
        const isCurrent = this.versionManager.getCurrentVersion() === v ? ' ← current' : '';
        return `• ${v}${isCurrent}`;
      })
      .join('\n');

    clack.note(versionsList, 'Installed Zig versions (managed by ziggy)');

    const choices = [
      { value: 'back', label: '← Back to main menu' },
      { value: 'quit', label: 'Quit' },
      { value: 'clean-all', label: 'Clean everything' }
    ];

    // Add option to keep current version if there is one
    const currentVersion = this.versionManager.getCurrentVersion();
    if (currentVersion && currentVersion !== 'system') {
      choices.push({
        value: 'clean-except-current',
        label: `Clean all except current active version (${currentVersion})`
      });
    }

    // Add option to select which version to keep
    if (downloadedVersions.length > 1) {
      choices.push({ value: 'select-keep', label: 'Select which version to keep' });
    }

    const action = await clack.select({
      message: 'Choose cleanup option: (Only ziggy managed installations will be affected)',
      options: choices,
      initialValue: 'back'
    });

    if (clack.isCancel(action) || action === 'back') {
      return;
    }

    if (action === 'quit') {
      log(colors.green('👋 Goodbye!'));
      process.exit(0);
    }

    switch (action) {
      case 'clean-all':
        await this.cleanAllVersions();
        break;
      case 'clean-except-current':
        await this.cleanExceptCurrent();
        break;
      case 'select-keep':
        await this.selectVersionToKeep();
        break;
    }
  }

  public async cleanAllVersions(): Promise<void> {
    const downloadedVersions = Object.keys(this.config.downloads);

    const confirm = await clack.confirm({
      message: `Are you sure you want to delete all ${downloadedVersions.length} Zig versions? This cannot be undone.`,
      initialValue: false
    });

    if (clack.isCancel(confirm) || !confirm) {
      clack.log.info('Cleanup cancelled');
      return;
    }

    const spinner = clack.spinner();
    spinner.start('Cleaning up Zig installations...');

    let cleaned = 0;
    for (const version of downloadedVersions) {
      const info = this.config.downloads[version];
      if (info && this.fileSystemManager.fileExists(info.path)) {
        try {
          this.fileSystemManager.removeDirectory(info.path);
          cleaned++;
        } catch (error) {
          log(colors.red(`Failed to remove ${version}: ${error}`));
        }
      }
    }

    // Clear downloads config
    this.config.downloads = {};
    if (this.config.systemZig) {
      this.versionManager.setCurrentVersion('system');
    } else {
      this.versionManager.clearCurrentVersion();
    }
    this.configManager.save(this.config);

    // Remove symlink if it exists
    const symlink = join(this.ziggyDir, 'bin', 'zig');
    this.fileSystemManager.safeRemove(symlink);

    spinner.stop(`Cleaned up ${cleaned} Zig installations`);
    clack.log.success('All Zig versions removed successfully');

    if (this.config.systemZig) {
      clack.log.info(`Using system Zig: ${this.config.systemZig.version}`);
    } else {
      clack.log.warn('No Zig version is currently active');
    }

    // Add post-action menu
    await this.showPostActionOptions();
  }

  public async cleanExceptCurrent(): Promise<void> {
    const currentVersion = this.versionManager.getCurrentVersion();
    if (!currentVersion || currentVersion === 'system') {
      clack.log.error('No current version set or using system version');
      return;
    }

    const versionsToDelete = Object.keys(this.config.downloads).filter(v => v !== currentVersion);

    if (versionsToDelete.length === 0) {
      clack.log.info('No other versions to clean');
      return;
    }

    const confirm = await clack.confirm({
      message: `Delete ${versionsToDelete.length} versions (keeping ${currentVersion})?`,
      initialValue: false
    });

    if (clack.isCancel(confirm) || !confirm) {
      clack.log.info('Cleanup cancelled');
      return;
    }

    const spinner = clack.spinner();
    spinner.start('Cleaning up old Zig installations...');

    let cleaned = 0;
    for (const version of versionsToDelete) {
      const info = this.config.downloads[version];
      if (info && this.fileSystemManager.fileExists(info.path)) {
        try {
          this.fileSystemManager.removeDirectory(info.path);
          delete this.config.downloads[version];
          cleaned++;
        } catch (error) {
          log(colors.red(`Failed to remove ${version}: ${error}`));
        }
      }
    }

    this.configManager.save(this.config);
    spinner.stop(`Cleaned up ${cleaned} old installations`);
    clack.log.success(`Kept ${currentVersion} as active version`);

    // Add post-action menu
    await this.showPostActionOptions();
  }

  public async selectVersionToKeep(): Promise<void> {
    const downloadedVersions = Object.keys(this.config.downloads).filter(v => {
      const info = this.config.downloads[v];
      return info?.status === 'completed' && v !== 'system';
    });

    const versionChoices = [
      { value: 'back', label: '← Back to cleanup menu' },
      ...downloadedVersions.map(v => ({
        value: v,
        label: `${v}${this.versionManager.getCurrentVersion() === v ? ' (current)' : ''}`
      }))
    ];

    const versionToKeep = await clack.select({
      message: 'Select which version to keep (all others will be deleted):',
      options: versionChoices,
      initialValue: this.versionManager.getCurrentVersion() || downloadedVersions[0]
    });

    if (clack.isCancel(versionToKeep) || versionToKeep === 'back') {
      return;
    }

    const versionsToDelete = downloadedVersions.filter(v => v !== versionToKeep);

    const confirm = await clack.confirm({
      message: `Keep ${versionToKeep} and delete ${versionsToDelete.length} other versions?`,
      initialValue: false
    });

    if (clack.isCancel(confirm) || !confirm) {
      clack.log.info('Cleanup cancelled');
      return;
    }

    const spinner = clack.spinner();
    spinner.start('Cleaning up selected Zig installations...');

    let cleaned = 0;
    for (const version of versionsToDelete) {
      const info = this.config.downloads[version];
      if (info && this.fileSystemManager.fileExists(info.path)) {
        try {
          this.fileSystemManager.removeDirectory(info.path);
          delete this.config.downloads[version];
          cleaned++;
        } catch (error) {
          log(colors.red(`Failed to remove ${version}: ${error}`));
        }
      }
    }

    // Set the kept version as current
    this.versionManager.setCurrentVersion(versionToKeep);
    this.createSymlink(this.config.downloads[versionToKeep]!.path, versionToKeep);
    this.configManager.save(this.config);

    spinner.stop(`Cleaned up ${cleaned} installations`);
    clack.log.success(`Kept ${versionToKeep} and set it as active version`);

    // Add post-action menu
    await this.showPostActionOptions();
  }

  public async downloadWithVersion(version: string): Promise<void> {
    // Check if already installed first with user confirmation
    const existing = this.config.downloads[version];
    if (existing && existing.status === 'completed') {
      clack.log.warn(`Zig ${version} is already installed at ${existing.path}`);

      const reinstall = await clack.confirm({
        message: 'Do you want to reinstall it?',
        initialValue: false
      });

      if (clack.isCancel(reinstall) || !reinstall) {
        clack.log.info('Installation skipped.');

        // Show post-install options even when skipping
        const action = await clack.select({
          message: 'What would you like to do next?',
          options: [
            { value: 'main-menu', label: 'Return to main menu' },
            { value: 'quit', label: 'Quit' }
          ],
          initialValue: 'main-menu'
        });

        if (clack.isCancel(action) || action === 'quit') {
          log(colors.green('👋 Goodbye!'));
          process.exit(0);
        }

        // If they chose main-menu, we return and let the main loop continue
        return;
      }
      
      // If reinstalling, remove the existing version first
      await this.coreInstaller.removeVersion(version);
    }

    try {
      // For now, connect to the core installer's built-in interrupt handling
      // The core installer manages its own currentDownload state internally
      await this.coreInstaller.downloadVersion(version);
      
      // Reload config after installation
      this.config = this.configManager.load();
      
      // Create env file if it doesn't exist
      if (!this.fileSystemManager.fileExists(this.envPath)) {
        this.createEnvFile();
      }

      // Show version switching guidance
      const currentVersion = this.versionManager.getCurrentVersion();
      if (!currentVersion) {
        log(colors.green(`✓ Automatically activated Zig ${version} (first installation)`));
      } else {
        // Only show "ziggy use" message if there are multiple versions to choose from
        const availableVersions = Object.keys(this.config.downloads).filter(v => {
          const info = this.config.downloads[v];
          return info?.status === 'completed';
        });

        // Add system version to count if available
        const totalVersions = availableVersions.length + (this.config.systemZig ? 1 : 0);

        if (totalVersions > 1) {
          log(colors.yellow(`\nTo switch to this version, run: ${colors.cyan(`ziggy use ${version}`)} or select ${colors.cyan('Switch active Zig version')} from the main menu.`));
        } else {
          log(colors.green(`✓ Zig ${version} is now your active version`));
        }
      }

      // Show platform-specific setup instructions
      this.showSetupInstructions();

      // Offer user choice to quit or return to main menu
      await this.showPostInstallOptions();

    } catch (error) {
      log(colors.red(`Failed to install Zig ${version}: ${error}`));
      throw error;
    } finally {
      // Clear current download state
      currentDownload = null;
    }
  }

  private async showPostInstallOptions(): Promise<void> {
    const options = [
      { value: 'quit', label: 'Quit' },
      { value: 'main-menu', label: 'Return to main menu' }
    ];

    // Add automatic PowerShell setup option for Windows
    if (this.platform === 'windows') {
      options.unshift({ value: 'setup-powershell', label: 'Add to PowerShell profile automatically' });
    }

    const action = await clack.select({
      message: 'What would you like to do next?',
      options,
      initialValue: this.platform === 'windows' ? 'setup-powershell' : 'quit'
    });

    if (clack.isCancel(action) || action === 'quit') {
      log(colors.green('👋 Goodbye!'));
      process.exit(0);
    }

    if (action === 'setup-powershell') {
      await this.setupPowerShellProfile();
      return;
    }

    // If they chose main-menu, we just return and let the main loop continue
  }

  /**
   * Generic post-action menu for consistent user experience
   * @param customOptions - Additional custom options specific to the action
   */
  private async showPostActionOptions(customOptions: { value: string; label: string; hint?: string }[] = []): Promise<string> {
    const options = [
      ...customOptions,
      { value: 'main-menu', label: '← Return to main menu' },
      { value: 'quit', label: 'Quit' }
    ];

    const action = await clack.select({
      message: 'What would you like to do next?',
      options,
      initialValue: customOptions.length > 0 ? customOptions[0]!.value : 'main-menu'
    });

    if (clack.isCancel(action) || action === 'quit') {
      log(colors.green('👋 Goodbye!'));
      process.exit(0);
    }

    return action; // Return the selected action instead of boolean
  }

  private async setupPowerShellProfile(): Promise<void> {
    try {
      // Use PowerShell's $PROFILE variable to get the correct path
      const profileResult = Bun.spawnSync(['powershell', '-Command', '$PROFILE'], {
        stdout: 'pipe',
        stderr: 'pipe'
      });
      
      let profilePath: string;
      if (profileResult.exitCode === 0) {
        profilePath = profileResult.stdout.toString().trim();
      } else {
        // Fallback to the common path for Windows PowerShell 5.x
        profilePath = `${process.env.USERPROFILE}\\Documents\\WindowsPowerShell\\Microsoft.PowerShell_profile.ps1`;
      }
      
      const envLine = `. "${this.envPath}"`;
      
      // Check if profile directory exists, create if not
      const profileDir = dirname(profilePath);
      this.fileSystemManager.ensureDirectory(profileDir);
      
      // Check if the line already exists in the profile
      let profileContent = '';
      if (this.fileSystemManager.fileExists(profilePath)) {
        profileContent = this.fileSystemManager.readFile(profilePath);
      }
      
      if (profileContent.includes(envLine)) {
        log(colors.yellow('✓ PowerShell profile already configured!'));
      } else {
        // Add the line to the profile with a comment
        this.fileSystemManager.appendFile(profilePath, `\n# Added by Ziggy\n${envLine}\n`);
        log(colors.green('✓ PowerShell profile updated successfully!'));
        log(colors.yellow('Please restart your PowerShell terminal to use Zig.'));
      }
      
    } catch (error) {
      console.error(colors.red('Failed to update PowerShell profile:'), error);
      log(colors.yellow('Please add this line manually to your PowerShell profile:'));
      log(colors.green(`. "${this.envPath}"`));
    }
  }

  private showSetupInstructions(): void {
    // Check if ziggy is already properly configured
    if (this.platformDetector.isZiggyConfigured(this.binDir)) {
      log(colors.green('\n✅ Ziggy is already configured in your environment!'));
      log(colors.gray('You can start using Zig right away.'));
      return;
    }

    // Check if env file exists but PATH is not configured
    if (this.platformDetector.hasEnvFileConfigured(this.envPath)) {
      // Env file exists but ziggy is not configured in PATH
      log(colors.yellow('\n📋 Environment file exists but PATH needs to be configured:'));
      log(colors.cyan('To activate Zig in your current session, run:'));
      
      // Platform-specific source command
      if (this.platform === 'windows') {
        log(colors.green(`. "${this.envPath}"`));
      } else {
        const ziggyDirVar = process.env.ZIGGY_DIR ? '$ZIGGY_DIR' : '$HOME/.ziggy';
        log(colors.green(`source ${ziggyDirVar}/env`));
      }
      
      log(colors.gray('\nTo make this permanent, add the source command to your shell profile.'));
      return;
    }

    log(colors.yellow('\n📋 Setup Instructions:'));

    if (this.platform === 'windows') {
      // Windows-specific instructions
      log(colors.cyan('To start using Zig:'));
      log(colors.green(`• PowerShell: Add to your profile: . "${this.envPath}"`));
      log(colors.green(`• Command Prompt: Add ${this.binDir} to your PATH manually`));
      log(colors.yellow(`\nFor PowerShell, add this line to your profile file and restart your terminal:`));
      log(colors.gray(`Profile location: $PROFILE (typically: ${process.env.USERPROFILE}\\Documents\\PowerShell\\Microsoft.PowerShell_profile.ps1)`));
    } else if (this.platform === 'linux' || this.platform === 'macos') {
      // Unix-like systems (Linux, macOS)
      const ziggyDirVar = process.env.ZIGGY_DIR ? '$ZIGGY_DIR' : '$HOME/.ziggy';
      log(colors.cyan('To start using Zig, add this to your shell profile and restart your terminal:'));
      log(colors.green(`source ${ziggyDirVar}/env`));
      log('');
      log(colors.yellow('Or run this command now to use Zig in the current session:'));
      log(colors.green(`source ${this.envPath}`));

      // Shell-specific file hints
      const shellInfo = this.platformDetector.getShellInfo();
      log(colors.gray(`\nShell profile location for ${shellInfo.shell}: ${shellInfo.profileFile}`));
    } else {
      // Unknown platform - fallback to manual PATH setup
      log(colors.yellow('Unknown platform detected.'));
      log(colors.cyan('To start using Zig, manually add this directory to your PATH:'));
      log(colors.green(this.binDir));
      log(colors.gray('\nConsult your system documentation for instructions on modifying PATH.'));
    }
  }

  private showSummary(changes: string[]): void {
    if (changes.length === 0) return;

    log(colors.yellow('\n📋 Summary of changes made:'));
    changes.forEach(change => {
      log(colors.cyan(`• ${change}`));
    });
    log('');
  }

}

// Main execution
(async () => {
  // Setup signal handlers for graceful exit
  setupSignalHandlers();

  const program = setupCLI();

  // Parse arguments
  await program.parseAsync(process.argv);
})();
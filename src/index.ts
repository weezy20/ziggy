#!/usr/bin/env bun

import { ZIG_ASCII_ART } from './ascii-art';
import { join, resolve, dirname } from 'path';
// File system operations are now handled by FileSystemManager

import * as clack from '@clack/prompts';
import which from 'which';
import { TemplateManager } from './templates/manager.js';
import { ProjectCreator } from './templates/creator.js';
import { ProjectUI } from './cli/ui/project-ui.js';
import { MainMenuUI } from './cli/ui/main-menu.js';
import { VersionSelectorUI } from './cli/ui/version-selector.js';
import { DownloadUI } from './cli/ui/download-ui.js';
import { CleanupUI } from './cli/ui/cleanup-ui.js';
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
  private templateManager: TemplateManager;
  private projectCreator: ProjectCreator;
  private projectUI: ProjectUI;
  private mainMenuUI: MainMenuUI;
  private versionSelectorUI: VersionSelectorUI;
  private downloadUI: DownloadUI;
  private cleanupUI: CleanupUI;
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
    
    // Initialize Template System
    this.templateManager = new TemplateManager();
    this.projectCreator = new ProjectCreator(this.templateManager, this.fileSystemManager);
    this.projectUI = new ProjectUI(
      this.templateManager,
      this.projectCreator,
      this.fileSystemManager,
      this.versionManager,
      this.config
    );
    
    // Initialize UI modules
    this.mainMenuUI = new MainMenuUI(
      this.platformDetector,
      this.fileSystemManager,
      this.versionManager,
      this.configManager,
      this.ziggyDir,
      this.binDir,
      this.envPath,
      this.config,
      () => this.handleCreateProjectTUI(),
      () => this.handleDownloadLatestTUI(),
      () => this.handleDownloadSpecificTUI(),
      () => this.listVersionsTUI(),
      () => useCommand(true),
      () => this.handleCleanTUI()
    );
    
    this.versionSelectorUI = new VersionSelectorUI(
      this.versionManager,
      this.config,
      () => this.getAvailableVersions(),
      () => this.showPostActionOptions()
    );
    
    this.downloadUI = new DownloadUI(
      this.platformDetector,
      this.fileSystemManager,
      this.versionManager,
      this.config,
      this.envPath,
      this.binDir,
      (version: string) => this.coreInstaller.downloadVersion(version),
      (version: string) => this.coreInstaller.removeVersion(version),
      () => { this.config = this.configManager.load(); },
      () => this.createEnvFile()
    );
    
    this.cleanupUI = new CleanupUI(
      this.fileSystemManager,
      this.versionManager,
      this.configManager,
      this.config,
      this.ziggyDir,
      (targetPath: string, version: string) => this.createSymlink(targetPath, version),
      () => this.showPostActionOptions(),
      () => { this.config = this.configManager.load(); }
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
    // Delegate to MainMenuUI
    await this.mainMenuUI.runMainMenu();
  }

  private async handleCreateProjectTUI(): Promise<void> {
    await this.projectUI.handleCreateProjectTUI();
  }

  private async handleDownloadLatestTUI(): Promise<void> {
    const version = await this.getLatestStableVersion();
    await this.downloadUI.downloadWithVersion(version);
  }

  public async handleDownloadSpecificTUI(): Promise<void> {
    const version = await this.versionSelectorUI.handleDownloadSpecificTUI();
    if (version) {
      await this.downloadUI.downloadWithVersion(version);
    }
  }



  public useVersion(selectedVersion: string): void {
    // Delegate to core installer
    this.coreInstaller.useVersion(selectedVersion);
    
    // Reload config after version change
    this.config = this.configManager.load();
  }

  public getConfigManager(): ConfigManager {
    return this.configManager;
  }

  public async listVersionsTUI(): Promise<void> {
    await this.versionSelectorUI.listVersionsTUI();
  }

  public async handleCleanTUI(): Promise<void> {
    await this.cleanupUI.handleCleanTUI();
  }









  /**
   * Generic post-action menu for consistent user experience
   * @param customOptions - Additional custom options specific to the action
   */
  private async showPostActionOptions(customOptions: { value: string; label: string; hint?: string }[] = []): Promise<string> {
    // Delegate to MainMenuUI
    return await this.mainMenuUI.showPostActionOptions(customOptions);
  }



  private showSetupInstructions(): void {
    // Check if ziggy is already properly configured
    if (this.platformDetector.isZiggyConfigured(this.binDir)) {
      log(colors.green('\n✅ Ziggy is already configured in your environment!'));
      log(colors.gray('You can start using Zig right away.'));
      return;
    }

    // Check if ziggy is already configured in PATH
    if (this.platformDetector.isZiggyInPath(this.binDir)) {
      // ziggy/bin is already in PATH, no need for env file instructions
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
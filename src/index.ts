#!/usr/bin/env bun

import { ZIG_ASCII_ART } from './ascii-art';
import { join, resolve, dirname } from 'path';
import * as clack from '@clack/prompts';
import which from 'which';
import { colors } from './utils/colors';
import { setupCLI } from './cli';
import { useCommand } from './commands/use';

// Import all the modular components
import { PlatformDetector } from './utils/platform';
import { FileSystemManager } from './utils/filesystem';
import { ArchiveExtractor } from './utils/archive';
import { SpinnerProgressReporter } from './utils/progress';
import { ConfigManager } from './core/config';
import { VersionManager } from './core/version';
import { MirrorsManager } from './core/mirrors';
import { ZigInstaller as CoreZigInstaller } from './core/installer';
import { TemplateManager } from './templates/manager.js';
import { ProjectCreator } from './templates/creator.js';
import { ProjectUI } from './cli/ui/project-ui.js';
import { MainMenuUI } from './cli/ui/main-menu.js';
import { VersionSelectorUI } from './cli/ui/version-selector.js';
import { DownloadUI } from './cli/ui/download-ui.js';
import { CleanupUI } from './cli/ui/cleanup-ui.js';

// Import interfaces
import type { 
  IZigInstaller, 
  IConfigManager, 
  IVersionManager, 
  IPlatformDetector,
  IFileSystemManager,
  IArchiveExtractor,
  ITemplateManager,
  IProjectCreator,
  IProgressReporter,
  IMirrorsManager
} from './interfaces';
import type { ZigDownloadIndex, DownloadStatus, ZiggyConfig } from './types';

export const log = console.log;

/**
 * Dependency Injection Container
 * Manages the creation and lifecycle of all application dependencies
 */
class DependencyContainer {
  private static instance: DependencyContainer;
  private dependencies: Map<string, any> = new Map();
  private singletons: Map<string, any> = new Map();

  private constructor() {}

  public static getInstance(): DependencyContainer {
    if (!DependencyContainer.instance) {
      DependencyContainer.instance = new DependencyContainer();
    }
    return DependencyContainer.instance;
  }

  public register<T>(key: string, factory: () => T, singleton = true): void {
    this.dependencies.set(key, { factory, singleton });
  }

  public resolve<T>(key: string): T {
    const dependency = this.dependencies.get(key);
    if (!dependency) {
      throw new Error(`Dependency '${key}' not found`);
    }

    if (dependency.singleton) {
      if (!this.singletons.has(key)) {
        this.singletons.set(key, dependency.factory());
      }
      return this.singletons.get(key);
    }

    return dependency.factory();
  }

  public clear(): void {
    this.dependencies.clear();
    this.singletons.clear();
  }
}

/**
 * Application Factory
 * Creates and configures all application dependencies using dependency injection
 */
class ApplicationFactory {
  private container: DependencyContainer;
  private ziggyDir: string;
  private binDir: string;
  private envPath: string;
  private platform: string;

  constructor() {
    this.container = DependencyContainer.getInstance();
    this.setupDependencies();
    
    // Get platform info for paths
    const platformDetector = this.container.resolve<IPlatformDetector>('platformDetector');
    this.platform = platformDetector.getPlatform();
    this.ziggyDir = platformDetector.getZiggyDir();
    this.binDir = join(this.ziggyDir, 'bin');
    
    // Platform-specific env file names
    if (this.platform === 'windows') {
      this.envPath = join(this.ziggyDir, 'env.ps1'); // PowerShell script
    } else {
      this.envPath = join(this.ziggyDir, 'env'); // Bash/Zsh script
    }
  }

  private setupDependencies(): void {
    // Register utility dependencies
    this.container.register<IPlatformDetector>('platformDetector', () => new PlatformDetector());
    this.container.register<IFileSystemManager>('fileSystemManager', () => new FileSystemManager());
    this.container.register<IProgressReporter>('progressReporter', () => new SpinnerProgressReporter());
    
    // Register archive extractor with dependencies
    this.container.register<IArchiveExtractor>('archiveExtractor', () => {
      const fileSystemManager = this.container.resolve<IFileSystemManager>('fileSystemManager');
      const progressReporter = this.container.resolve<IProgressReporter>('progressReporter');
      return new ArchiveExtractor(fileSystemManager, progressReporter);
    });

    // Register core dependencies
    this.container.register<IConfigManager>('configManager', () => {
      const platformDetector = this.container.resolve<IPlatformDetector>('platformDetector');
      const fileSystemManager = this.container.resolve<IFileSystemManager>('fileSystemManager');
      const ziggyDir = platformDetector.getZiggyDir();
      return new ConfigManager(ziggyDir, fileSystemManager);
    });

    this.container.register<IVersionManager>('versionManager', () => {
      const configManager = this.container.resolve<IConfigManager>('configManager');
      const platformDetector = this.container.resolve<IPlatformDetector>('platformDetector');
      const arch = platformDetector.getArch();
      const platform = platformDetector.getPlatform();
      return new VersionManager(configManager, arch, platform);
    });

    this.container.register<IMirrorsManager>('mirrorsManager', () => {
      const configManager = this.container.resolve<IConfigManager>('configManager');
      return new MirrorsManager(configManager);
    });

    this.container.register<IZigInstaller>('coreInstaller', () => {
      const configManager = this.container.resolve<IConfigManager>('configManager');
      const versionManager = this.container.resolve<IVersionManager>('versionManager');
      const platformDetector = this.container.resolve<IPlatformDetector>('platformDetector');
      const fileSystemManager = this.container.resolve<IFileSystemManager>('fileSystemManager');
      const archiveExtractor = this.container.resolve<IArchiveExtractor>('archiveExtractor');
      const mirrorsManager = this.container.resolve<IMirrorsManager>('mirrorsManager');
      const ziggyDir = platformDetector.getZiggyDir();
      return new CoreZigInstaller(
        configManager,
        versionManager,
        platformDetector,
        fileSystemManager,
        archiveExtractor,
        mirrorsManager,
        ziggyDir
      );
    });

    // Register template dependencies
    this.container.register<ITemplateManager>('templateManager', () => new TemplateManager());
    
    this.container.register<IProjectCreator>('projectCreator', () => {
      const templateManager = this.container.resolve<ITemplateManager>('templateManager');
      const fileSystemManager = this.container.resolve<IFileSystemManager>('fileSystemManager');
      return new ProjectCreator(templateManager, fileSystemManager);
    });
  }

  public createZigInstaller(): ZigInstaller {
    // Ensure directories exist
    const fileSystemManager = this.container.resolve<IFileSystemManager>('fileSystemManager');
    fileSystemManager.ensureDirectory(this.ziggyDir);
    fileSystemManager.ensureDirectory(this.binDir);

    return new ZigInstaller(this.container, this.ziggyDir, this.binDir, this.envPath);
  }

  public getContainer(): DependencyContainer {
    return this.container;
  }
}

// Global reference to current download for signal handling
let currentInstaller: ZigInstaller | null = null;

function setupSignalHandlers(): void {
  const gracefulExit = () => {
    log(colors.yellow('\n\n🛑 Interrupt: Shutting down ...'));

    // Clean up any ongoing downloads
    if (currentInstaller) {
      const currentDownload = currentInstaller.getCurrentDownload();
      if (currentDownload?.cleanup) {
        try {
          currentDownload.cleanup();
          log(colors.yellow('✓ Download cleanup completed'));
        } catch (_error) {
          log(colors.red('⚠ Download cleanup failed'));
        }
      }
    }

    log(colors.yellow('👋 Goodbye!'));
    process.exit(0);
  };

  process.on('SIGINT', gracefulExit);
  process.on('SIGTERM', gracefulExit);
}



// Utility functions are now handled by dedicated modules


export class ZigInstaller {
  private container: DependencyContainer;
  private platformDetector: IPlatformDetector;
  private fileSystemManager: IFileSystemManager;
  private configManager: IConfigManager;
  private versionManager: IVersionManager;
  private coreInstaller: IZigInstaller;
  private templateManager: ITemplateManager;
  private projectCreator: IProjectCreator;
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

  constructor(container: DependencyContainer, ziggyDir: string, binDir: string, envPath: string) {
    this.container = container;
    this.ziggyDir = ziggyDir;
    this.binDir = binDir;
    this.envPath = envPath;
    this.cwd = process.cwd();

    // Resolve dependencies from container
    this.platformDetector = container.resolve<IPlatformDetector>('platformDetector');
    this.fileSystemManager = container.resolve<IFileSystemManager>('fileSystemManager');
    this.configManager = container.resolve<IConfigManager>('configManager');
    this.versionManager = container.resolve<IVersionManager>('versionManager');
    this.coreInstaller = container.resolve<IZigInstaller>('coreInstaller');
    this.templateManager = container.resolve<ITemplateManager>('templateManager');
    this.projectCreator = container.resolve<IProjectCreator>('projectCreator');

    // Get platform info
    this.arch = this.platformDetector.getArch();
    this.platform = this.platformDetector.getPlatform();
    this.os = this.platformDetector.getOS();

    // Load configuration
    this.config = this.configManager.load();
    
    // Detect system Zig
    this.detectSystemZig();
    
    // Initialize UI modules with dependency injection
    this.initializeUIModules();
    
    // Cleanup any incomplete downloads from previous sessions
    this.cleanupIncompleteDownloads();
  }

  private initializeUIModules(): void {
    // Initialize Template UI
    this.projectUI = new ProjectUI(
      this.templateManager,
      this.projectCreator,
      this.fileSystemManager,
      this.versionManager,
      this.config
    );
    
    // Initialize Main Menu UI
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
      () => useCommand(true, undefined, this.coreInstaller, this.configManager, this.versionManager),
      () => this.handleCleanTUI()
    );
    
    // Initialize Version Selector UI
    this.versionSelectorUI = new VersionSelectorUI(
      this.versionManager,
      this.config,
      () => this.getAvailableVersions(),
      () => this.showPostActionOptions()
    );
    
    // Initialize Download UI
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
    
    // Initialize Cleanup UI
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
  }

  private detectSystemZig(): void {
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

  // Public API methods for backward compatibility and external integrations
  public getCurrentDownload(): { cleanup?: () => void } | null {
    return this.coreInstaller.getCurrentDownload();
  }

  public getConfigManager(): IConfigManager {
    return this.configManager;
  }

  // Delegate core installer methods for backward compatibility
  public async downloadVersion(version: string): Promise<void> {
    return this.coreInstaller.downloadVersion(version);
  }

  public async downloadWithVersion(version: string): Promise<void> {
    return this.coreInstaller.downloadVersion(version);
  }

  public useVersion(version: string): void {
    return this.coreInstaller.useVersion(version);
  }

  public getInstalledVersions(): string[] {
    return this.coreInstaller.getInstalledVersions();
  }

  public async validateVersion(version: string): Promise<boolean> {
    return this.coreInstaller.validateVersion(version);
  }

  public async cleanup(): Promise<void> {
    return this.coreInstaller.cleanup();
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











  // Legacy methods - now handled by ConfigManager and VersionManager
  private saveConfig(): void {
    this.configManager.save(this.config);
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

  public async listVersionsTUI(): Promise<void> {
    await this.versionSelectorUI.listVersionsTUI();
  }

  public async handleCleanTUI(): Promise<void> {
    await this.cleanupUI.handleCleanTUI();
  }

  // Additional methods for backward compatibility
  public async getAvailableVersions(): Promise<string[]> {
    return this.versionManager.getAvailableVersions();
  }

  public async getLatestStableVersion(): Promise<string> {
    return this.versionManager.getLatestStableVersion();
  }

  public createSymlink(targetPath: string, version: string): void {
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

  public createEnvFile(): void {
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









  /**
   * Generic post-action menu for consistent user experience
   * @param customOptions - Additional custom options specific to the action
   */
  private async showPostActionOptions(customOptions: { value: string; label: string; hint?: string }[] = []): Promise<string> {
    // Delegate to MainMenuUI
    return await this.mainMenuUI.showPostActionOptions(customOptions);
  }

  public displayHeaderWithInfo(): void {
    // Delegate to MainMenuUI
    this.mainMenuUI.displayHeaderWithInfo();
  }

  private async showPostInstallOptions(): Promise<void> {
    // Delegate to DownloadUI
    await this.downloadUI.showPostInstallOptions();
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

/**
 * Application Entry Point
 * Creates the application using dependency injection and starts the CLI
 */
export async function createApplication(): Promise<ZigInstaller> {
  const factory = new ApplicationFactory();
  const installer = factory.createZigInstaller();
  
  // Set global reference for signal handling
  currentInstaller = installer;
  
  return installer;
}

/**
 * Main execution function
 * Sets up the application and starts the CLI
 */
async function main(): Promise<void> {
  try {
    // Setup signal handlers for graceful exit
    setupSignalHandlers();

    // Create application with dependency injection
    await createApplication();

    // Setup and run CLI
    const program = setupCLI();
    await program.parseAsync(process.argv);
    
  } catch (error) {
    console.error(colors.red('Fatal error during startup:'), error);
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (import.meta.main) {
  main().catch((error) => {
    console.error(colors.red('Unhandled error:'), error);
    process.exit(1);
  });
}
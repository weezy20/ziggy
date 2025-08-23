#!/usr/bin/env bun

// import { ZIG_ASCII_ART } from './ascii-art';
import { join, resolve, dirname } from 'path';
import * as clack from '@clack/prompts';
import which from 'which';
import { colors } from './utils/colors';
import { setupCLI } from './cli';
import { useCommand } from './commands/use';
import { PerformanceMonitor } from './utils/performance';

// Lazy loading imports - modules are loaded only when needed
// Core modules are loaded immediately as they're always needed
import { PlatformDetector } from './utils/platform';
import { FileSystemManager } from './utils/filesystem';
import { ConfigManager } from './core/config';

// Lazy loaded modules - imported dynamically when needed
type LazyModules = {
  ArchiveExtractor?: typeof import('./utils/archive').ArchiveExtractor;
  SpinnerProgressReporter?: typeof import('./utils/progress').SpinnerProgressReporter;
  VersionManager?: typeof import('./core/version').VersionManager;
  MirrorsManager?: typeof import('./core/mirrors').MirrorsManager;
  CoreZigInstaller?: typeof import('./core/installer').ZigInstaller;
  TemplateManager?: typeof import('./templates/manager.js').TemplateManager;
  ProjectCreator?: typeof import('./templates/creator.js').ProjectCreator;
  ProjectUI?: typeof import('./cli/ui/project-ui.js').ProjectUI;
  MainMenuUI?: typeof import('./cli/ui/main-menu.js').MainMenuUI;
  VersionSelectorUI?: typeof import('./cli/ui/version-selector.js').VersionSelectorUI;
  DownloadUI?: typeof import('./cli/ui/download-ui.js').DownloadUI;
  CleanupUI?: typeof import('./cli/ui/cleanup-ui.js').CleanupUI;
};

const lazyModules: LazyModules = {};

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
import type { ZiggyConfig } from './types';
import type { CleanupUI } from './cli/ui/cleanup-ui.js';
import type { DownloadUI } from './cli/ui/download-ui.js';
import type { VersionSelectorUI } from './cli/ui/version-selector.js';
import type { MainMenuUI } from './cli/ui/main-menu.js';
import type { ProjectUI } from './cli/ui/project-ui.js';
import process from "node:process";

export const log = console.log;

/**
 * Dependency Injection Container with Lazy Loading
 * Manages the creation and lifecycle of all application dependencies
 * Supports lazy loading to improve startup performance
 */
class DependencyContainer {
  private static instance: DependencyContainer;
  private dependencies: Map<string, unknown> = new Map();
  private singletons: Map<string, unknown> = new Map();
  private lazyFactories: Map<string, () => Promise<unknown>> = new Map();

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

  public registerLazy<T>(key: string, factory: () => Promise<T>, singleton = true): void {
    this.lazyFactories.set(key, factory);
    this.dependencies.set(key, { factory: null, singleton, lazy: true });
  }

  public resolve<T>(key: string): T {
    const dependency = this.dependencies.get(key);
    if (!dependency) {
      throw new Error(`Dependency '${key}' not found`);
    }

    if (dependency.lazy) {
      throw new Error(`Dependency '${key}' is lazy and must be resolved with resolveAsync`);
    }

    if (dependency.singleton) {
      if (!this.singletons.has(key)) {
        this.singletons.set(key, dependency.factory());
      }
      return this.singletons.get(key);
    }

    return dependency.factory();
  }

  public async resolveAsync<T>(key: string): Promise<T> {
    const dependency = this.dependencies.get(key);
    if (!dependency) {
      throw new Error(`Dependency '${key}' not found`);
    }

    if (dependency.lazy) {
      if (dependency.singleton) {
        if (!this.singletons.has(key)) {
          const factory = this.lazyFactories.get(key);
          if (!factory) {
            throw new Error(`Lazy factory for '${key}' not found`);
          }
          this.singletons.set(key, await factory());
        }
        return this.singletons.get(key);
      } else {
        const factory = this.lazyFactories.get(key);
        if (!factory) {
          throw new Error(`Lazy factory for '${key}' not found`);
        }
        return await factory();
      }
    }

    // Fallback to synchronous resolution
    return this.resolve<T>(key);
  }

  public clear(): void {
    this.dependencies.clear();
    this.singletons.clear();
    this.lazyFactories.clear();
  }
}

/**
 * Application Factory
 * Creates and configures all application dependencies using dependency injection
 */
export class ApplicationFactory {
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
    // Register core dependencies that are always needed (loaded immediately)
    this.container.register<IPlatformDetector>('platformDetector', () => new PlatformDetector());
    this.container.register<IFileSystemManager>('fileSystemManager', () => new FileSystemManager());
    this.container.register<IConfigManager>('configManager', () => {
      const platformDetector = this.container.resolve<IPlatformDetector>('platformDetector');
      const fileSystemManager = this.container.resolve<IFileSystemManager>('fileSystemManager');
      const ziggyDir = platformDetector.getZiggyDir();
      return new ConfigManager(ziggyDir, fileSystemManager);
    });

    // Register lazy-loaded dependencies (loaded only when needed)
    this.container.registerLazy<IProgressReporter>('progressReporter', async () => {
      if (!lazyModules.SpinnerProgressReporter) {
        const module = await import('./utils/progress');
        lazyModules.SpinnerProgressReporter = module.SpinnerProgressReporter;
      }
      return new lazyModules.SpinnerProgressReporter();
    });
    
    this.container.registerLazy<IArchiveExtractor>('archiveExtractor', async () => {
      if (!lazyModules.ArchiveExtractor) {
        const module = await import('./utils/archive');
        lazyModules.ArchiveExtractor = module.ArchiveExtractor;
      }
      const fileSystemManager = this.container.resolve<IFileSystemManager>('fileSystemManager');
      const progressReporter = await this.container.resolveAsync<IProgressReporter>('progressReporter');
      return new lazyModules.ArchiveExtractor(fileSystemManager, progressReporter);
    });

    this.container.registerLazy<IVersionManager>('versionManager', async () => {
      if (!lazyModules.VersionManager) {
        const module = await import('./core/version');
        lazyModules.VersionManager = module.VersionManager;
      }
      const configManager = this.container.resolve<IConfigManager>('configManager');
      const platformDetector = this.container.resolve<IPlatformDetector>('platformDetector');
      const arch = platformDetector.getArch();
      const platform = platformDetector.getPlatform();
      return new lazyModules.VersionManager(configManager, arch, platform);
    });

    this.container.registerLazy<IMirrorsManager>('mirrorsManager', async () => {
      if (!lazyModules.MirrorsManager) {
        const module = await import('./core/mirrors');
        lazyModules.MirrorsManager = module.MirrorsManager;
      }
      const configManager = this.container.resolve<IConfigManager>('configManager');
      return new lazyModules.MirrorsManager(configManager);
    });

    this.container.registerLazy<IZigInstaller>('coreInstaller', async () => {
      if (!lazyModules.CoreZigInstaller) {
        const module = await import('./core/installer');
        lazyModules.CoreZigInstaller = module.ZigInstaller;
      }
      const configManager = this.container.resolve<IConfigManager>('configManager');
      const versionManager = await this.container.resolveAsync<IVersionManager>('versionManager');
      const platformDetector = this.container.resolve<IPlatformDetector>('platformDetector');
      const fileSystemManager = this.container.resolve<IFileSystemManager>('fileSystemManager');
      const archiveExtractor = await this.container.resolveAsync<IArchiveExtractor>('archiveExtractor');
      const mirrorsManager = await this.container.resolveAsync<IMirrorsManager>('mirrorsManager');
      const ziggyDir = platformDetector.getZiggyDir();
      return new lazyModules.CoreZigInstaller(
        configManager,
        versionManager,
        platformDetector,
        fileSystemManager,
        archiveExtractor,
        mirrorsManager,
        ziggyDir
      );
    });

    this.container.registerLazy<ITemplateManager>('templateManager', async () => {
      if (!lazyModules.TemplateManager) {
        const module = await import('./templates/manager.js');
        lazyModules.TemplateManager = module.TemplateManager;
      }
      return new lazyModules.TemplateManager();
    });
    
    this.container.registerLazy<IProjectCreator>('projectCreator', async () => {
      if (!lazyModules.ProjectCreator) {
        const module = await import('./templates/creator.js');
        lazyModules.ProjectCreator = module.ProjectCreator;
      }
      const templateManager = await this.container.resolveAsync<ITemplateManager>('templateManager');
      const fileSystemManager = this.container.resolve<IFileSystemManager>('fileSystemManager');
      return new lazyModules.ProjectCreator(templateManager, fileSystemManager);
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

    // Resolve core dependencies immediately (always needed)
    this.platformDetector = container.resolve<IPlatformDetector>('platformDetector');
    this.fileSystemManager = container.resolve<IFileSystemManager>('fileSystemManager');
    this.configManager = container.resolve<IConfigManager>('configManager');

    // Get platform info (cached after first call)
    this.arch = this.platformDetector.getArch();
    this.platform = this.platformDetector.getPlatform();
    this.os = this.platformDetector.getOS();

    // Load configuration
    this.config = this.configManager.load();
    
    // Defer non-critical operations to improve startup time
    // These will be done asynchronously when needed
    process.nextTick(() => {
      this.detectSystemZig();
      this.cleanupIncompleteDownloads();
    });

    // Note: Other dependencies and UI modules are loaded lazily when needed
  }

  private async initializeUIModules(): Promise<void> {
    // Lazy load dependencies
    this.versionManager = await this.container.resolveAsync<IVersionManager>('versionManager');
    this.coreInstaller = await this.container.resolveAsync<IZigInstaller>('coreInstaller');
    this.templateManager = await this.container.resolveAsync<ITemplateManager>('templateManager');
    this.projectCreator = await this.container.resolveAsync<IProjectCreator>('projectCreator');

    // Lazy load UI modules
    if (!lazyModules.ProjectUI) {
      const module = await import('./cli/ui/project-ui.js');
      lazyModules.ProjectUI = module.ProjectUI;
    }
    if (!lazyModules.MainMenuUI) {
      const module = await import('./cli/ui/main-menu.js');
      lazyModules.MainMenuUI = module.MainMenuUI;
    }
    if (!lazyModules.VersionSelectorUI) {
      const module = await import('./cli/ui/version-selector.js');
      lazyModules.VersionSelectorUI = module.VersionSelectorUI;
    }
    if (!lazyModules.DownloadUI) {
      const module = await import('./cli/ui/download-ui.js');
      lazyModules.DownloadUI = module.DownloadUI;
    }
    if (!lazyModules.CleanupUI) {
      const module = await import('./cli/ui/cleanup-ui.js');
      lazyModules.CleanupUI = module.CleanupUI;
    }

    // Initialize Template UI
    this.projectUI = new lazyModules.ProjectUI(
      this.templateManager,
      this.projectCreator,
      this.fileSystemManager,
      this.versionManager,
      this.config
    );
    
    // Initialize Main Menu UI
    this.mainMenuUI = new lazyModules.MainMenuUI(
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
    this.versionSelectorUI = new lazyModules.VersionSelectorUI(
      this.versionManager,
      this.config,
      () => this.getAvailableVersions(),
      () => this.showPostActionOptions()
    );
    
    // Initialize Download UI
    this.downloadUI = new lazyModules.DownloadUI(
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
    this.cleanupUI = new lazyModules.CleanupUI(
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
    if (!this.coreInstaller) {
      this.coreInstaller = await this.container.resolveAsync<IZigInstaller>('coreInstaller');
    }
    return this.coreInstaller.downloadVersion(version);
  }

  public async downloadWithVersion(version: string): Promise<void> {
    if (!this.coreInstaller) {
      this.coreInstaller = await this.container.resolveAsync<IZigInstaller>('coreInstaller');
    }
    return this.coreInstaller.downloadVersion(version);
  }

  public async useVersion(version: string): Promise<void> {
    if (!this.coreInstaller) {
      this.coreInstaller = await this.container.resolveAsync<IZigInstaller>('coreInstaller');
    }
    return this.coreInstaller.useVersion(version);
  }

  public async getInstalledVersions(): Promise<string[]> {
    if (!this.coreInstaller) {
      this.coreInstaller = await this.container.resolveAsync<IZigInstaller>('coreInstaller');
    }
    return this.coreInstaller.getInstalledVersions();
  }

  public async validateVersion(version: string): Promise<boolean> {
    if (!this.coreInstaller) {
      this.coreInstaller = await this.container.resolveAsync<IZigInstaller>('coreInstaller');
    }
    return this.coreInstaller.validateVersion(version);
  }

  public async cleanup(): Promise<void> {
    if (!this.coreInstaller) {
      this.coreInstaller = await this.container.resolveAsync<IZigInstaller>('coreInstaller');
    }
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
    const monitor = PerformanceMonitor.getInstance();
    monitor.startTimer('ziggy-startup');
    
    try {
      // Initialize UI modules lazily when needed
      await this.initializeUIModules();
      
      monitor.endTimer('ziggy-startup');
      
      // Start the TUI interface
      await this.runTUI();
    } catch (error) {
      monitor.endTimer('ziggy-startup');
      throw error;
    }
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
    if (!this.versionManager) {
      this.versionManager = await this.container.resolveAsync<IVersionManager>('versionManager');
    }
    return this.versionManager.getAvailableVersions();
  }

  public async getLatestStableVersion(): Promise<string> {
    if (!this.versionManager) {
      this.versionManager = await this.container.resolveAsync<IVersionManager>('versionManager');
    }
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
export function createApplication(): Promise<ZigInstaller> {
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
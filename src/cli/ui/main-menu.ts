import * as clack from '@clack/prompts';
import { colors } from '../../utils/colors';
import { ZIG_ASCII_ART } from '../../ascii-art';
import type { ZiggyConfig, ShellInfo } from '../../types';
import type { PlatformDetector } from '../../utils/platform';
import type { FileSystemManager } from '../../utils/filesystem';
import type { VersionManager } from '../../core/version';
import type { ConfigManager } from '../../core/config';

export const log = console.log;

export interface IMainMenuUI {
  runMainMenu(): Promise<void>;
  displayHeaderWithInfo(): void;
  showPostActionOptions(customOptions?: { value: string; label: string; hint?: string }[]): Promise<string>;
}

export class MainMenuUI implements IMainMenuUI {
  constructor(
    private platformDetector: PlatformDetector,
    private fileSystemManager: FileSystemManager,
    private versionManager: VersionManager,
    private configManager: ConfigManager,
    private ziggyDir: string,
    private binDir: string,
    private envPath: string,
    private config: ZiggyConfig,
    private onCreateProject: () => Promise<void>,
    private onDownloadLatest: () => Promise<void>,
    private onDownloadSpecific: () => Promise<void>,
    private onListVersions: () => Promise<void>,
    private onUseVersion: () => Promise<void>,
    private onClean: () => Promise<void>
  ) {}

  public displayHeaderWithInfo(): void {
    // Split ASCII art into lines
    const asciiLines = ZIG_ASCII_ART.trim().split('\n');

    // Prepare system info lines
    const shellInfo = this.platformDetector.getShellInfo();
    const systemInfo = [
      `Architecture: ${colors.cyan(this.platformDetector.getArch())}`,
      `Platform: ${colors.cyan(this.platformDetector.getPlatform())}`,
      `OS: ${colors.cyan(this.platformDetector.getOS())}`,
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

  public async runMainMenu(): Promise<void> {
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
      this.fileSystemManager.createDirectory(this.ziggyDir + '/versions');
      this.fileSystemManager.createDirectory(this.ziggyDir + '/bin');
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
            await this.onCreateProject();
            break;
          case 'download-latest':
            await this.onDownloadLatest();
            break;
          case 'download-specific':
            await this.onDownloadSpecific();
            break;
          case 'list-versions':
            await this.onListVersions();
            break;
          case 'use-version':
            await this.onUseVersion();
            break;
          case 'clean':
            await this.onClean();
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

  /**
   * Generic post-action menu for consistent user experience
   * @param customOptions - Additional custom options specific to the action
   */
  public async showPostActionOptions(customOptions: { value: string; label: string; hint?: string }[] = []): Promise<string> {
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
}
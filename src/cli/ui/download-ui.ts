import * as clack from '@clack/prompts';
import { colors } from '../../utils/colors';
import { dirname } from 'path';
import type { ZiggyConfig } from '../../types';
import type { PlatformDetector } from '../../utils/platform';
import type { FileSystemManager } from '../../utils/filesystem';
import type { VersionManager } from '../../core/version';
import process from "node:process";

export const log = console.log;

export interface IDownloadUI {
  downloadWithVersion(version: string): Promise<void>;
  showPostInstallOptions(): Promise<void>;
  showSetupInstructions(): void;
  setupPowerShellProfile(): Promise<void>;
}

export class DownloadUI implements IDownloadUI {
  constructor(
    private platformDetector: PlatformDetector,
    private fileSystemManager: FileSystemManager,
    private versionManager: VersionManager,
    private config: ZiggyConfig,
    private envPath: string,
    private binDir: string,
    private coreDownloadVersion: (version: string) => Promise<void>,
    private coreRemoveVersion: (version: string) => Promise<void>,
    private reloadConfig: () => void,
    private createEnvFile: () => void
  ) {}

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
      await this.coreRemoveVersion(version);
    }

    try {
      // For now, connect to the core installer's built-in interrupt handling
      // The core installer manages its own currentDownload state internally
      await this.coreDownloadVersion(version);
      
      // Reload config after installation
      this.reloadConfig();
      
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
    }
  }

  public async showPostInstallOptions(): Promise<void> {
    const options = [
      { value: 'quit', label: 'Quit' },
      { value: 'main-menu', label: 'Return to main menu' }
    ];

    // Add automatic PowerShell setup option for Windows only if ziggy/bin is not in PATH
    if (this.platformDetector.getPlatform() === 'windows' && !this.platformDetector.isZiggyInPath(this.binDir)) {
      options.unshift({ value: 'setup-powershell', label: 'Add to PowerShell profile automatically' });
    }

    const action = await clack.select({
      message: 'What would you like to do next?',
      options,
      initialValue: this.platformDetector.getPlatform() === 'windows' && !this.platformDetector.isZiggyInPath(this.binDir) ? 'setup-powershell' : 'quit'
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

  public setupPowerShellProfile(): Promise<void> {
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

  public showSetupInstructions(): void {
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
      if (this.platformDetector.getPlatform() === 'windows') {
        log(colors.green(`. "${this.envPath}"`));
      } else {
        const ziggyDirVar = process.env.ZIGGY_DIR ? '$ZIGGY_DIR' : '$HOME/.ziggy';
        log(colors.green(`source ${ziggyDirVar}/env`));
      }
      
      log(colors.gray('\nTo make this permanent, add the source command to your shell profile.'));
      return;
    }

    log(colors.yellow('\n📋 Setup Instructions:'));

    if (this.platformDetector.getPlatform() === 'windows') {
      // Windows-specific instructions
      log(colors.cyan('To start using Zig:'));
      log(colors.green(`• PowerShell: Add to your profile: . "${this.envPath}"`));
      log(colors.green(`• Command Prompt: Add ${this.binDir} to your PATH manually`));
      log(colors.yellow(`\nFor PowerShell, add this line to your profile file and restart your terminal:`));
      log(colors.gray(`Profile location: $PROFILE (typically: ${process.env.USERPROFILE}\\Documents\\PowerShell\\Microsoft.PowerShell_profile.ps1)`));
    } else if (this.platformDetector.getPlatform() === 'linux' || this.platformDetector.getPlatform() === 'macos') {
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
}
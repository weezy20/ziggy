import * as clack from '@clack/prompts';
import { colors } from '../../utils/colors';
import { join } from 'path';
import type { ZiggyConfig } from '../../types';
import type { FileSystemManager } from '../../utils/filesystem';
import type { VersionManager } from '../../core/version';
import type { ConfigManager } from '../../core/config';
import process from "node:process";

export const log = console.log;

export interface ICleanupUI {
  handleCleanTUI(): Promise<void>;
  cleanAllVersions(): Promise<void>;
  cleanExceptCurrent(): Promise<void>;
  selectVersionToKeep(): Promise<void>;
}

export class CleanupUI implements ICleanupUI {
  constructor(
    private fileSystemManager: FileSystemManager,
    private versionManager: VersionManager,
    private configManager: ConfigManager,
    private config: ZiggyConfig,
    private ziggyDir: string,
    private createSymlink: (targetPath: string, version: string) => void,
    private showPostActionOptions: () => Promise<string>,
    private reloadConfig: () => void
  ) {}

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
}
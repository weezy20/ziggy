import * as clack from '@clack/prompts';
import { colors } from '../../utils/colors';
import type { ZiggyConfig } from '../../types';
import type { VersionManager } from '../../core/version';

export const log = console.log;

export interface IVersionSelectorUI {
  listVersionsTUI(): Promise<void>;
  handleDownloadSpecificTUI(): Promise<string | null>;
}

export class VersionSelectorUI implements IVersionSelectorUI {
  constructor(
    private versionManager: VersionManager,
    private config: ZiggyConfig,
    private getAvailableVersions: () => Promise<string[]>,
    private showPostActionOptions: () => Promise<string>
  ) {}

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

    // Use the post-action menu
    await this.showPostActionOptions();
  }

  public async handleDownloadSpecificTUI(): Promise<string | null> {
    const spinner = clack.spinner();
    spinner.start('Fetching available versions...');

    let availableVersions: string[];
    try {
      availableVersions = await this.getAvailableVersions();
      spinner.stop('Available versions loaded');
    } catch (_error) {
      spinner.stop('Failed to fetch versions');
      clack.log.error('Could not fetch available versions');
      return null;
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
      return null;
    }

    if (version === 'back') {
      return null; // Go back to main menu
    }

    if (version === 'quit') {
      log(colors.green('👋 Goodbye!'));
      process.exit(0);
    }

    return version;
  }
}
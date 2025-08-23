/**
 * stats command - Display ziggy.toml contents in a user-friendly way
 */

import { colors } from '../utils/colors.js';
import { ZIG_ASCII_ART } from '../ascii-art.js';
import type { IConfigManager } from '../interfaces.js';

const log = console.log;

export async function statsCommand(configManager?: IConfigManager): Promise<void> {
  // If dependencies not provided, create them (for backward compatibility)
  if (!configManager) {
    const { createApplication } = await import('../index.js');
    const app = await createApplication();
    configManager = app.getConfigManager();
  }

  // Show the ziggy banner
  log(ZIG_ASCII_ART);
  log(colors.cyan('Zig Version Manager\n'));

  const config = configManager.load();

  // Show current version
  if (config.currentVersion) {
    log(colors.green(`Current version: ${config.currentVersion}\n`));
  } else {
    log(colors.yellow('No version currently selected\n'));
  }

  // Show installed versions
  const installedVersions = Object.keys(config.downloads || {});
  if (installedVersions.length > 0) {
    log(colors.cyan('📦 Installed Versions:'));
    installedVersions.forEach(version => {
      const indicator = config.currentVersion === version ? colors.green(' ← current') : '';
      log(colors.gray(`  • ${version}${indicator}`));
    });
    log('');
  } else {
    log(colors.yellow('📦 No Zig versions installed yet\n'));
  }

  // Show cached community mirrors
  if (config.communityMirrors && config.communityMirrors.length > 0) {
    log(colors.cyan('🌐 Cached Community Mirrors:'));
    config.communityMirrors.forEach((mirror: string) => {
      log(colors.gray(`  • ${mirror}`));
    });
    if (config.communityMirrorsLastUpdated) {
      const lastUpdated = new Date(config.communityMirrorsLastUpdated);
      log(colors.gray(`  Last updated: ${lastUpdated.toLocaleString()}`));
    }
    log('');
  } else {
    log(colors.yellow('🌐 No community mirrors cached\n'));
  }

  log(colors.gray('Run `ziggy` or `ziggy use <version>` to get started'));
  log(colors.gray('Run `ziggy --help` for command line help'));
}

import * as clack from '@clack/prompts';
import { selectCleanupAction, showNote } from '../cli/prompts/common.js';
import type { IZigInstaller, IConfigManager } from '../interfaces.js';
// import type { ZiggyConfig } from '../types.js';

/**
 * Clean command - cleanup Zig installations
 * @param installer - Core installer instance
 * @param configManager - Configuration manager instance
 */
export async function cleanCommand(installer?: IZigInstaller, configManager?: IConfigManager): Promise<void> {
  // If dependencies not provided, create them (for backward compatibility)
  if (!installer || !configManager) {
    const { createApplication } = await import('../index.js');
    const app = await createApplication();
    installer = app;
    configManager = app.getConfigManager();
  }
  
  const config = configManager.load();
  
  const downloadedVersions = Object.keys(config.downloads).filter(v => {
    const info = config.downloads[v];
    return info?.status === 'completed' && v !== 'system';
  });

  if (downloadedVersions.length === 0) {
    clack.log.warn('No Zig versions to clean (only system Zig found)');
    return;
  }

  // Show current versions
  const versionsList = downloadedVersions
    .map(v => {
      const isCurrent = config.currentVersion === v ? ' ← current' : '';
      return `• ${v}${isCurrent}`;
    })
    .join('\n');
  
  showNote(versionsList, 'Installed Zig versions (managed by ziggy)');

  const action = await selectCleanupAction(downloadedVersions, config.currentVersion);

  if (action === 'back') {
    return;
  }

  switch (action) {
    case 'clean-all':
      await (installer as { cleanAllVersions(): Promise<void> }).cleanAllVersions();
      break;
    case 'clean-except-current':
      await (installer as { cleanExceptCurrent(): Promise<void> }).cleanExceptCurrent();
      break;
    case 'select-keep':
      await (installer as { selectVersionToKeep(): Promise<void> }).selectVersionToKeep();
      break;
  }
}

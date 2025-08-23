import * as clack from '@clack/prompts';
import { createApplication } from '../index';
import { selectCleanupAction, showNote } from '../cli/prompts/common.js';

/**
 * Clean command - cleanup Zig installations
 */
export async function cleanCommand(): Promise<void> {
  const installer = await createApplication();
  
  const downloadedVersions = Object.keys(installer.config.downloads).filter(v => {
    const info = installer.config.downloads[v];
    return info?.status === 'completed' && v !== 'system';
  });

  if (downloadedVersions.length === 0) {
    clack.log.warn('No Zig versions to clean (only system Zig found)');
    return;
  }

  // Show current versions
  const versionsList = downloadedVersions
    .map(v => {
      const isCurrent = installer.config.currentVersion === v ? ' ← current' : '';
      return `• ${v}${isCurrent}`;
    })
    .join('\n');
  
  showNote(versionsList, 'Installed Zig versions (managed by ziggy)');

  const action = await selectCleanupAction(downloadedVersions, installer.config.currentVersion);

  if (action === 'back') {
    return;
  }

  switch (action) {
    case 'clean-all':
      await installer.cleanAllVersions();
      break;
    case 'clean-except-current':
      await installer.cleanExceptCurrent();
      break;
    case 'select-keep':
      await installer.selectVersionToKeep();
      break;
  }
}

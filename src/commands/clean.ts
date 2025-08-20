import * as clack from '@clack/prompts';
import { ZigInstaller } from '../index';
import { colors } from '../utils/colors';

/**
 * Clean command - cleanup Zig installations
 */
export async function cleanCommand(): Promise<void> {
  const installer = new ZigInstaller();
  
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
  
  clack.note(versionsList, 'Installed Zig versions (managed by ziggy)');

  const choices = [
    { value: 'clean-all', label: 'Clean everything' }
  ];

  // Add option to keep current version if there is one
  if (installer.config.currentVersion && installer.config.currentVersion !== 'system') {
    choices.push({ 
      value: 'clean-except-current', 
      label: `Clean all except current active version (${installer.config.currentVersion})` 
    });
  }

  // Add option to select which version to keep
  if (downloadedVersions.length > 1) {
    choices.push({ value: 'select-keep', label: 'Select which version to keep' });
  }

  const action = await clack.select({
    message: 'Choose cleanup option: (Only ziggy managed installations will be affected)',
    options: choices,
    initialValue: 'clean-all'
  });

  if (clack.isCancel(action)) {
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

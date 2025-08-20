import * as clack from '@clack/prompts';
import { ZigInstaller } from '../index';
import { colors } from '../utils/colors';

// Helper function to handle clack prompt cancellation
function handleClackCancel<T>(result: T | symbol): T {
  if (clack.isCancel(result)) {
    clack.cancel('Operation cancelled');
    process.exit(0);
  }
  return result as T;
}

/**
 * Use command - select which Zig version to use
 */
export async function useCommand(): Promise<void> {
  const installer = new ZigInstaller();
  
  const choices = [];
  
  // Add system zig if available (show first)
  if (installer.config.systemZig) {
    choices.push({ 
      value: 'system',
      label: `${installer.config.systemZig.version} (system installation)` 
    });
  }
  
  // Add installed ziggy versions (only non-system versions)
  const availableVersions = Object.keys(installer.config.downloads).filter(v => {
    const info = installer.config.downloads[v];
    return info?.status === 'completed' && !info.isSystemWide && v !== 'system';
  });
  
  for (const version of availableVersions) {
    const isCurrent = installer.config.currentVersion === version ? ' (current)' : '';
    choices.push({ 
      value: version,
      label: `${version} (downloaded by ziggy)${isCurrent}` 
    });
  }
  
  if (choices.length === 0) {
    clack.log.warn('No Zig versions available to use. Download a version first.');
    return;
  }
  
  const selectedVersion = await clack.select({
    message: 'Select Zig version to use:',
    options: choices,
    initialValue: choices.length > 0 ? choices[0]?.value || 'back' : 'back'
  });
  
  if (clack.isCancel(selectedVersion)) {
    return;
  }
  
  await installer.useVersion(selectedVersion);
}

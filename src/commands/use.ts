import * as clack from '@clack/prompts';
import { ZigInstaller } from '../index';
import { colors } from '../utils/colors';

/**
 * Use command - select which Zig version to use
 * @param includeNavigation - Whether to include back/quit options for TUI mode
 */
export async function useCommand(includeNavigation = false): Promise<boolean> {
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
    return false;
  }
  
  // Add navigation options for TUI mode
  if (includeNavigation) {
    choices.unshift(
      { value: 'back', label: '← Back to main menu' },
      { value: 'quit', label: 'Quit' }
    );
  }
  
  const selectedVersion = await clack.select({
    message: 'Select Zig version to use:',
    options: choices,
    initialValue: choices.length > 0 ? choices[0]?.value || 'back' : 'back'
  });
  
  if (clack.isCancel(selectedVersion)) {
    return false;
  }
  
  if (includeNavigation) {
    if (selectedVersion === 'back') {
      return false; // Go back to main menu
    }
    
    if (selectedVersion === 'quit') {
      console.log(colors.green('👋 Goodbye!'));
      process.exit(0);
    }
  }
  
  installer.useVersion(selectedVersion);
  return true;
}

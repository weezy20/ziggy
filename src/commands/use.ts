import * as clack from '@clack/prompts';
import { ZigInstaller, log } from '../index';
import { colors } from '../utils/colors';

/**
 * Use command - select which Zig version to use
 * @param includeNavigation - Whether to include back/quit options for TUI mode
 * @param specificVersion - Specific version to use directly (bypasses interactive selection)
 */
export async function useCommand(includeNavigation = false, specificVersion?: string): Promise<boolean> {
  const installer = new ZigInstaller();
  
  // If a specific version is provided, try to use it directly
  if (specificVersion) {
    return await handleSpecificVersion(installer, specificVersion, includeNavigation);
  }
  
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
    
    if (includeNavigation) {
      await showPostActionMenu(installer, [
        { value: 'download', label: 'Download a Zig version' }
      ]);
    }
    
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
      log(colors.green('👋 Goodbye!'));
      process.exit(0);
    }
  }
  
  installer.useVersion(selectedVersion);
  
  // Show post-action menu when in TUI mode
  if (includeNavigation) {
    await showPostActionMenu(installer);
  }
  
  return true;
}

/**
 * Handle switching to a specific version directly
 */
async function handleSpecificVersion(installer: ZigInstaller, version: string, includeNavigation: boolean): Promise<boolean> {
  // Check if the version is installed
  const isInstalled = installer.config.downloads[version]?.status === 'completed' || 
                     (version === 'system' && installer.config.systemZig);
  
  if (isInstalled) {
    // Version is installed, switch to it
    installer.useVersion(version);
    
    if (includeNavigation) {
      await showPostActionMenu(installer);
    }
    
    return true;
  }
  
  // Version is not installed, check if it's a valid version
  if (version === 'system') {
    clack.log.error('System Zig is not available');
    return false;
  }
  
  // Check if it's a valid Zig version
  const isValidVersion = await installer.validateVersion(version);
  
  if (!isValidVersion) {
    clack.log.error(`Version "${version}" is not a valid Zig version`);
    
    if (includeNavigation) {
      await showPostActionMenu(installer, [
        { value: 'show-available', label: 'Show available versions' }
      ]);
    }
    
    return false;
  }
  
  // Version is valid but not installed, offer to download
  const shouldDownload = await clack.confirm({
    message: `Version "${version}" is not installed. Would you like to download it?`,
    initialValue: true
  });
  
  if (clack.isCancel(shouldDownload) || !shouldDownload) {
    clack.log.info('Download cancelled');
    
    if (includeNavigation) {
      await showPostActionMenu(installer);
    }
    
    return false;
  }
  
  try {
    // Download the version
    log(colors.green(`\n🚀 Installing Zig ${version}...`));
    await installer.downloadWithVersion(version);
    
    // Switch to the newly downloaded version
    installer.useVersion(version);
    
    log(colors.green(`✅ Successfully switched to Zig ${version}!`));
    
    if (includeNavigation) {
      await showPostActionMenu(installer);
    }
    
    return true;
    
  } catch (error) {
    clack.log.error(`Failed to download version "${version}": ${error instanceof Error ? error.message : String(error)}`);
    
    if (includeNavigation) {
      await showPostActionMenu(installer);
    }
    
    return false;
  }
}

/**
 * Show consistent post-action menu for use command
 */
async function showPostActionMenu(installer: ZigInstaller, customOptions: { value: string; label: string }[] = []) {
  const postActionOptions = [
    ...customOptions,
    { value: 'switch-again', label: 'Switch to another version' },
    { value: 'list-versions', label: 'List all versions' }
  ];

  const action = await clack.select({
    message: 'What would you like to do next?',
    options: [
      ...postActionOptions,
      { value: 'main-menu', label: '← Return to main menu' },
      { value: 'quit', label: 'Quit' }
    ],
    initialValue: 'main-menu'
  });

  if (clack.isCancel(action) || action === 'quit') {
    log(colors.green('👋 Goodbye!'));
    process.exit(0);
  }

  if (action === 'switch-again') {
    // Recursively call useCommand to switch again
    await useCommand(true);
    return;
  }

  if (action === 'list-versions') {
    // List versions and then return to main menu
    await installer.listVersionsTUI();
    return;
  }
  
  if (action === 'download') {
    // Go to download menu
    await installer.handleDownloadSpecificTUI();
    return;
  }
  
  if (action === 'show-available') {
    // Show available versions
    try {
      const availableVersions = await installer.getAvailableVersions();
      const versionsList = ['master', ...availableVersions].join(', ');
      clack.note(versionsList, 'Available Zig versions');
    } catch (error) {
      clack.log.error('Failed to fetch available versions');
    }
    
    await showPostActionMenu(installer);
    return;
  }
  
  // For 'main-menu' or any other action, just return
}

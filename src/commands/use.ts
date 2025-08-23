import * as clack from '@clack/prompts';
import { colors } from '../utils/colors';
import { selectPrompt, confirmPrompt } from '../cli/prompts/common.js';
import type { IZigInstaller, IConfigManager, IVersionManager } from '../interfaces.js';
import type { ZiggyConfig } from '../types.js';
import process from "node:process";

const log = console.log;

/**
 * Use command - select which Zig version to use
 * @param includeNavigation - Whether to include back/quit options for TUI mode
 * @param specificVersion - Specific version to use directly (bypasses interactive selection)
 * @param installer - Core installer instance
 * @param configManager - Configuration manager instance
 * @param versionManager - Version manager instance
 */
export async function useCommand(
  includeNavigation = false, 
  specificVersion?: string,
  installer?: IZigInstaller,
  configManager?: IConfigManager,
  versionManager?: IVersionManager
): Promise<boolean> {
  // If dependencies not provided, create them (for backward compatibility)
  if (!installer || !configManager || !versionManager) {
    const { createApplication } = await import('../index.js');
    const app = await createApplication();
    installer = app;
    configManager = app.getConfigManager();
    versionManager = configManager as IVersionManager; // Type assertion for backward compatibility
  }
  
  const config = configManager.load();
  
  // If a specific version is provided, try to use it directly
  if (specificVersion) {
    return await handleSpecificVersion(installer, specificVersion, includeNavigation, config);
  }
  
  const choices = [];
  
  // Add system zig if available (show first)
  if (config.systemZig) {
    choices.push({ 
      value: 'system',
      label: `${config.systemZig.version} (system installation)` 
    });
  }
  
  // Add installed ziggy versions (only non-system versions)
  const availableVersions = Object.keys(config.downloads).filter(v => {
    const info = config.downloads[v];
    return info?.status === 'completed' && !info.isSystemWide && v !== 'system';
  });
  
  for (const version of availableVersions) {
    const isCurrent = config.currentVersion === version ? ' (current)' : '';
    choices.push({ 
      value: version,
      label: `${version} (downloaded by ziggy)${isCurrent}` 
    });
  }
  
  if (choices.length === 0) {
    clack.log.warn('No Zig versions available to use. Download a version first.');
    
    if (includeNavigation) {
      await showPostActionMenu([
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
  
  const selectedVersion = await selectPrompt(
    'Select Zig version to use:',
    choices,
    choices.length > 0 ? choices[0]?.value || 'back' : 'back',
    includeNavigation ? { includeBack: true, includeQuit: true } : undefined
  );
  
  if (selectedVersion === 'back') {
    return false; // Go back to main menu
  }
  
  installer.useVersion(selectedVersion);
  
  // Show post-action menu when in TUI mode
  if (includeNavigation) {
    await showPostActionMenu();
  }
  
  return true;
}

/**
 * Handle switching to a specific version directly
 */
async function handleSpecificVersion(installer: IZigInstaller, version: string, includeNavigation: boolean, config: ZiggyConfig): Promise<boolean> {
  // Check if the version is installed
  const isInstalled = config.downloads[version]?.status === 'completed' || 
                     (version === 'system' && config.systemZig);
  
  if (isInstalled) {
    // Version is installed, switch to it
    installer.useVersion(version);
    
    if (includeNavigation) {
      await showPostActionMenu();
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
      await showPostActionMenu([
        { value: 'show-available', label: 'Show available versions' }
      ]);
    }
    
    return false;
  }
  
  // Version is valid but not installed, offer to download
  const shouldDownload = await confirmPrompt(
    `Version "${version}" is not installed. Would you like to download it?`,
    true,
    'Download cancelled'
  );
  
  if (!shouldDownload) {
    clack.log.info('Download cancelled');
    
    if (includeNavigation) {
      await showPostActionMenu();
    }
    
    return false;
  }
  
  try {
    // Download the version
    log(colors.green(`\n🚀 Installing Zig ${version}...`));
    await installer.downloadVersion(version);
    
    // Switch to the newly downloaded version
    installer.useVersion(version);
    
    log(colors.green(`✅ Successfully switched to Zig ${version}!`));
    
    if (includeNavigation) {
      await showPostActionMenu();
    }
    
    return true;
    
  } catch (error) {
    clack.log.error(`Failed to download version "${version}": ${error instanceof Error ? error.message : String(error)}`);
    
    if (includeNavigation) {
      await showPostActionMenu();
    }
    
    return false;
  }
}

/**
 * Show consistent post-action menu for use command
 */
async function showPostActionMenu(customOptions: { value: string; label: string }[] = []) {
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
    await useCommand(true, undefined, installer, configManager, versionManager);
    return;
  }

  if (action === 'list-versions') {
    // Import and use list command
    const { listCommand } = await import('./list.js');
    await listCommand();
    return;
  }
  
  if (action === 'download') {
    // Show message about downloading
    log(colors.yellow('Please use the main menu to download versions.'));
    return;
  }
  
  if (action === 'show-available') {
    // Show available versions - this would need to be implemented with proper dependencies
    log(colors.yellow('Please use the main menu to see available versions.'));
    await showPostActionMenu();
    return;
  }
  
  // For 'main-menu' or any other action, just return
}

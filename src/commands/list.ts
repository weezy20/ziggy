import { colors } from '../utils/colors';
import type { IConfigManager, IVersionManager } from '../interfaces.js';
// import type { ZiggyConfig } from '../types.js';

const log = console.log;

/**
 * List command - show installed Zig versions
 * @param configManager - Configuration manager instance
 * @param versionManager - Version manager instance
 */
export async function listCommand(configManager?: IConfigManager, versionManager?: IVersionManager): Promise<void> {
  // If dependencies not provided, create them (for backward compatibility)
  if (!configManager || !versionManager) {
    const { createApplication } = await import('../index.js');
    const app = await createApplication();
    configManager = app.getConfigManager();
    versionManager = configManager as IVersionManager; // Type assertion for backward compatibility
  }
  
  const config = configManager.load();
  
  log(colors.yellow('\n📦 Installed Zig Versions:\n'));
  
  const installedVersions = Object.keys(config.downloads);
  
  if (installedVersions.length === 0 && !config.systemZig) {
    log(colors.gray('No Zig versions installed.'));
    log(colors.yellow('Run `ziggy` to download and install Zig versions.'));
    return;
  }

  // Show system Zig if available
  if (config.systemZig) {
    const isCurrent = config.currentVersion === 'system' ? colors.green(' (current)') : '';
    log(`${colors.cyan('system')} ${config.systemZig.version}${isCurrent}`);
    log(`  ${colors.gray('Path:')} ${config.systemZig.path}`);
  }

  // Show downloaded versions
  for (const version of installedVersions) {
    if (version === 'system') continue; // Skip system entry in downloads
    
    const info = config.downloads[version];
    if (!info) continue;
    
    const isCurrent = config.currentVersion === version ? colors.green(' (current)') : '';
    const statusColor = info.status === 'completed' ? colors.green :
                       info.status === 'downloading' ? colors.yellow :
                       colors.red;
    
    log(`${colors.cyan(version)}${isCurrent}`);
    log(`  ${colors.gray('Status:')} ${statusColor(info.status)}`);
    log(`  ${colors.gray('Path:')} ${info.path}`);
    log(`  ${colors.gray('Downloaded:')} ${new Date(info.downloadedAt).toLocaleDateString()}`);
  }

  log('');
}

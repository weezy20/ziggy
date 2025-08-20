import { ZigInstaller } from '../index';
import { colors } from '../utils/colors';

/**
 * List command - show installed Zig versions
 */
export async function listCommand(): Promise<void> {
  const installer = new ZigInstaller();
  
  console.log(colors.yellow('\n📦 Installed Zig Versions:\n'));
  
  const installedVersions = Object.keys(installer.config.downloads);
  
  if (installedVersions.length === 0 && !installer.config.systemZig) {
    console.log(colors.gray('No Zig versions installed.'));
    console.log(colors.yellow('Run `ziggy` to download and install Zig versions.'));
    return;
  }

  // Show system Zig if available
  if (installer.config.systemZig) {
    const isCurrent = installer.config.currentVersion === 'system' ? colors.green(' (current)') : '';
    console.log(`${colors.cyan('system')} ${installer.config.systemZig.version}${isCurrent}`);
    console.log(`  ${colors.gray('Path:')} ${installer.config.systemZig.path}`);
  }

  // Show downloaded versions
  for (const version of installedVersions) {
    if (version === 'system') continue; // Skip system entry in downloads
    
    const info = installer.config.downloads[version];
    if (!info) continue;
    
    const isCurrent = installer.config.currentVersion === version ? colors.green(' (current)') : '';
    const statusColor = info.status === 'completed' ? colors.green :
                       info.status === 'downloading' ? colors.yellow :
                       colors.red;
    
    console.log(`${colors.cyan(version)}${isCurrent}`);
    console.log(`  ${colors.gray('Status:')} ${statusColor(info.status)}`);
    console.log(`  ${colors.gray('Path:')} ${info.path}`);
    console.log(`  ${colors.gray('Downloaded:')} ${new Date(info.downloadedAt).toLocaleDateString()}`);
  }

  console.log('');
}

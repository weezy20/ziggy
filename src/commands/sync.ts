/**
 * sync command - Manual mirror synchronization
 * Completely rebuilds mirrors.toml from community list, resets all ranks to default, and clears failure history
 */

import { colors } from '../utils/colors.js';
import { withProgress, showError, showSuccess, showInfo } from '../cli/prompts/common.js';
import type { IMirrorsManager } from '../interfaces.js';

const log = console.log;

/**
 * Execute the sync command to manually refresh community mirrors
 * @param mirrorsManager - Optional mirrors manager instance (for dependency injection)
 */
export async function syncCommand(mirrorsManager?: IMirrorsManager): Promise<void> {
  try {
    // If mirrors manager not provided, create it (for backward compatibility)
    if (!mirrorsManager) {
      const { ApplicationFactory } = await import('../index.js');
      const factory = new ApplicationFactory();
      const container = factory.getContainer();
      mirrorsManager = await container.resolveAsync<IMirrorsManager>('mirrorsManager');
    }

    log(colors.cyan('🔄 Ziggy Mirror Sync'));
    log();

    // Show current mirror status before sync
    const currentConfig = mirrorsManager.loadMirrorsConfig();
    const mirrorCount = currentConfig.mirrors.length;
    const lastSynced = currentConfig.last_synced;

    if (mirrorCount > 0) {
      showInfo(`Current mirrors: ${mirrorCount}`);
      if (lastSynced) {
        const lastSyncDate = new Date(lastSynced);
        showInfo(`Last synced: ${lastSyncDate.toLocaleString()}`);
      }
      log();
      showInfo('This will completely rebuild the mirrors configuration and reset all rankings');
      log();
    }

    // Perform sync operation with progress indicator
    await withProgress(
      async (updateMessage) => {
        updateMessage('Fetching latest community mirrors...');
        await mirrorsManager!.syncMirrors();
      },
      'Synchronizing mirrors...',
      undefined, // Let the function handle success message
      'Failed to synchronize mirrors'
    );

    // Show updated mirror status after sync
    const updatedConfig = mirrorsManager.loadMirrorsConfig();
    const newMirrorCount = updatedConfig.mirrors.length;
    const newLastSynced = updatedConfig.last_synced;

    log();
    showSuccess(`✓ Synchronized ${newMirrorCount} community mirrors`);
    
    if (newLastSynced) {
      const syncDate = new Date(newLastSynced);
      showInfo(`Sync completed at: ${syncDate.toLocaleString()}`);
    }

    // Show additional information about the sync
    showInfo('Completely rebuilt mirrors configuration:');
    if (mirrorCount !== newMirrorCount) {
      const change = newMirrorCount - mirrorCount;
      if (change > 0) {
        showInfo(`• Added ${change} new mirrors`);
      } else if (change < 0) {
        showInfo(`• Removed ${Math.abs(change)} outdated mirrors`);
      } else {
        showInfo(`• Updated ${newMirrorCount} existing mirrors`);
      }
    } else {
      showInfo(`• Refreshed ${newMirrorCount} mirrors`);
    }

    showInfo('• All mirror ranks reset to default values (1)');
    showInfo('• All previous failure history cleared');
    log();
    log(colors.gray('Fresh mirrors will now be used for faster downloads'));
    log(colors.gray('Run `ziggy stats` to see current mirror status'));

  } catch (error) {
    log();
    
    if (error instanceof Error) {
      // Handle specific error types with appropriate messages
      if (error.message.includes('HTTP')) {
        showError('Failed to fetch community mirrors from server');
        log(colors.gray('Please check your internet connection and try again'));
      } else if (error.message.includes('ENOTFOUND') || error.message.includes('network')) {
        showError('Network error occurred while fetching mirrors');
        log(colors.gray('Please check your internet connection and try again'));
      } else if (error.message.includes('timeout')) {
        showError('Request timed out while fetching mirrors');
        log(colors.gray('The mirror server may be temporarily unavailable'));
      } else {
        showError(`Sync failed: ${error.message}`);
      }
    } else {
      showError(`Sync failed: ${String(error)}`);
    }

    log();
    log(colors.yellow('💡 Troubleshooting tips:'));
    log(colors.gray('  • Check your internet connection'));
    log(colors.gray('  • Try again in a few minutes'));
    log(colors.gray('  • Existing mirrors will continue to work'));
    
    // Exit with error code to indicate failure
    process.exit(1);
  }
}
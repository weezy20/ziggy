import { Command } from 'commander';
import { ZigInstaller } from './index';
import { initCommand } from './commands/init';
import { useCommand } from './commands/use';
import { listCommand } from './commands/list';
import { cleanCommand } from './commands/clean';
import { setupCommand } from './commands/setup';
import { statsCommand } from './commands/stats';
import { colors } from './utils/colors';

export function setupCLI(): Command {
  const program = new Command();
  
  program
    .name('ziggy')
    .description('Zig Version Manager - Download, install, and manage Zig versions')
    .version('1.1.0');

  // Init command - creates new Zig project from template
  program
    .command('init')
    .description('Initialize a new Zig project from template')
    .argument('[project-name]', 'Name of the project to create')
    .action(async (projectName?: string) => {
      try {
        await initCommand(projectName);
      } catch (error) {
        console.error(colors.red('Error:'), error);
        process.exit(1);
      }
    });

  // Use command - select Zig version
  program
    .command('use')
    .description('Select which Zig version to use')
    .argument('[version]', 'Specific version to use (e.g., "master", "0.14.1")')
    .action(async (version?: string) => {
      try {
        await useCommand(false, version);
      } catch (error) {
        console.error(colors.red('Error:'), error);
        process.exit(1);
      }
    });

  // List command - show installed versions
  program
    .command('list')
    .description('List installed Zig versions')
    .action(async () => {
      try {
        await listCommand();
      } catch (error) {
        console.error(colors.red('Error:'), error);
        process.exit(1);
      }
    });

  // Clean command - cleanup installations
  program
    .command('clean')
    .description('Clean up Zig installations')
    .action(async () => {
      try {
        await cleanCommand();
      } catch (error) {
        console.error(colors.red('Error:'), error);
        process.exit(1);
      }
    });

  // Setup command - configure shell environment
  program
    .command('setup')
    .description('Setup shell environment for Ziggy')
    .action(async () => {
      try {
        await setupCommand();
      } catch (error) {
        console.error(colors.red('Error:'), error);
        process.exit(1);
      }
    });

  // Stats command - show download statistics and mirror health
  program
    .command('stats')
    .description('Show download statistics and mirror health')
    .action(async () => {
      try {
        const installer = new ZigInstaller();
        await statsCommand(installer.getConfigManager());
      } catch (error) {
        console.error(colors.red('Error:'), error);
        process.exit(1);
      }
    });

  // Default action (interactive mode)
  program
    .action(async () => {
      try {
        const installer = new ZigInstaller();
        await installer.run();
      } catch (error) {
        console.error(colors.red('Fatal error:'), error);
        process.exit(1);
      }
    });

  return program;
}

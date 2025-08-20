import { Command } from 'commander';
import { ZigInstaller } from './index';
import { initCommand } from './commands/init';
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
    .action(async () => {
      try {
        const installer = new ZigInstaller();
        await installer.handleUseCommand();
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
        const installer = new ZigInstaller();
        await installer.listVersions();
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
        const installer = new ZigInstaller();
        await installer.handleCleanTUI();
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

import { resolve } from 'path';
import { existsSync } from 'fs';
import * as clack from '@clack/prompts';
import { cloneTemplateRepository } from '../utils/template';
import { colors } from '../utils/colors';
import { handleClackCancel } from '../utils/clack-helpers';
const log = console.log;

/**
 * Initialize a new Zig project using the template
 */
export async function initCommand(projectName?: string): Promise<void> {
  log(colors.cyan('🚀 Ziggy Init - Create a new Zig project'));
  log();

  let targetProjectName = projectName;

  // If no project name provided, ask for it
  if (!targetProjectName) {
    const namePrompt = await clack.text({
      message: 'What is the name of your project?',
      placeholder: 'my-zig-app',
      validate: (value) => {
        if (!value) return 'Project name is required';
        if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
          return 'Project name can only contain letters, numbers, underscores, and hyphens';
        }
        return undefined;
      }
    });

    targetProjectName = handleClackCancel(namePrompt);
  }

  const targetPath = resolve(process.cwd(), targetProjectName);

  // Check if directory already exists
  if (existsSync(targetPath)) {
    console.error(colors.red(`❌ Directory '${targetProjectName}' already exists`));
    process.exit(1);
  }

  const spinner = clack.spinner();

  try {
    // Download and extract the template repository
    spinner.start('Initializing project...');
    
    await cloneTemplateRepository(targetPath, (message) => {
      spinner.message(message);
    });
    
    spinner.stop(colors.green('🎉 Project created successfully!'));

    log();
    log(colors.cyan('Next steps:'));
    log(colors.gray(`  cd ${targetProjectName}`));
    log(colors.gray('  zig build run'));
    log();
    log();
    log(colors.yellow('Happy coding!'));
    log();
    process.exit(0);

  } catch (error) {
    spinner.stop('Failed');
    console.error(colors.red(`❌ Failed to create project: ${error}`));
    process.exit(1);
  }
}

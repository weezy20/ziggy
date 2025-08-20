import { resolve } from 'path';
import { existsSync } from 'fs';
import * as clack from '@clack/prompts';
import { cloneTemplateRepository } from '../utils/template';

// Console colors using ANSI escape codes
const colors = {
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  gray: (text: string) => `\x1b[90m${text}\x1b[0m`,
};

// Helper function to handle clack prompt cancellation
function handleClackCancel<T>(result: T | symbol): T {
  if (clack.isCancel(result)) {
    clack.cancel('Operation cancelled');
    process.exit(0);
  }
  return result;
}

/**
 * Initialize a new Zig project using the template
 */
export async function initCommand(projectName?: string): Promise<void> {
  console.log(colors.cyan('🚀 Ziggy Init - Create a new Zig project'));
  console.log();

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

    console.log();
    console.log(colors.cyan('Next steps:'));
    console.log(colors.gray(`  cd ${targetProjectName}`));
    console.log(colors.gray('  zig build run'));
    console.log();
    console.log();
    console.log(colors.yellow('Happy coding!'));
    console.log();
    process.exit(0);

  } catch (error) {
    spinner.stop('Failed');
    console.error(colors.red(`❌ Failed to create project: ${error}`));
    process.exit(1);
  }
}

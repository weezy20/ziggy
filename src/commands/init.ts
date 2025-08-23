import { resolve } from 'path';
import * as clack from '@clack/prompts';
import { TemplateManager } from '../templates/manager.js';
import { ProjectCreator } from '../templates/creator.js';
import { FileSystemManager } from '../utils/filesystem.js';
import { colors } from '../utils/colors.js';
import { handleClackCancel } from '../utils/clack-helpers.js';
const log = console.log;

/**
 * Initialize a new Zig project using templates
 */
export async function initCommand(projectName?: string): Promise<void> {
  log(colors.cyan('🚀 Ziggy Init - Create a new Zig project'));
  log();

  // Initialize template system
  const templateManager = new TemplateManager();
  const fileSystemManager = new FileSystemManager();
  const projectCreator = new ProjectCreator(templateManager, fileSystemManager);

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
  if (fileSystemManager.fileExists(targetPath)) {
    console.error(colors.red(`❌ Directory '${targetProjectName}' already exists`));
    process.exit(1);
  }

  // Ask user to select template
  const availableTemplates = templateManager.getAllTemplateInfo();
  const templateOptions = availableTemplates.map(template => ({
    value: template.name,
    label: `${template.displayName} - ${template.description}`
  }));

  const selectedTemplate = await clack.select({
    message: 'Choose a project template:',
    options: templateOptions,
    initialValue: 'standard'
  });

  if (clack.isCancel(selectedTemplate)) {
    clack.cancel('Project creation cancelled.');
    process.exit(1);
  }

  const spinner = clack.spinner();

  try {
    // Create project from selected template
    spinner.start('Initializing project...');
    
    await projectCreator.createFromTemplate(
      selectedTemplate, 
      targetProjectName, 
      targetPath,
      (message) => {
        spinner.message(message);
      }
    );
    
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

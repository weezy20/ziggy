import { resolve } from 'path';
import * as clack from '@clack/prompts';
import { TemplateManager } from '../templates/manager.js';
import { ProjectCreator } from '../templates/creator.js';
import { FileSystemManager } from '../utils/filesystem.js';
import { colors } from '../utils/colors.js';
import { textPrompt, selectPrompt, withProgress } from '../cli/prompts/common.js';
import { validateProjectName } from '../cli/prompts/validators.js';
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
    targetProjectName = await textPrompt(
      'What is the name of your project?',
      'my-zig-app',
      validateProjectName,
      'Project creation cancelled.'
    );
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

  const selectedTemplate = await selectPrompt(
    'Choose a project template:',
    templateOptions,
    'standard',
    undefined,
    'Project creation cancelled.'
  );

  try {
    // Create project from selected template using progress utility
    await withProgress(
      async (updateMessage) => {
        await projectCreator.createFromTemplate(
          selectedTemplate, 
          targetProjectName, 
          targetPath,
          updateMessage
        );
      },
      'Initializing project...',
      colors.green('🎉 Project created successfully!'),
      'Failed to create project'
    );

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
    console.error(colors.red(`❌ Failed to create project: ${error}`));
    process.exit(1);
  }
}

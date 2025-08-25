/**
 * Project Creation TUI - Handles interactive project creation
 */

import * as clack from '@clack/prompts';
import { resolve } from 'path';
import { TemplateManager } from '../../templates/manager.js';
import { ProjectCreator } from '../../templates/creator.js';
import { colors } from '../../utils/colors.js';
import type { IFileSystemManager, IVersionManager } from '../../interfaces.js';
import type { ZiggyConfig } from '../../types.js';
import process from "node:process";

const log = console.log;

export class ProjectUI {
  constructor(
    private templateManager: TemplateManager,
    private projectCreator: ProjectCreator,
    private fileSystemManager: IFileSystemManager,
    private versionManager: IVersionManager,
    private config: ZiggyConfig
  ) {}

  public async handleCreateProjectTUI(): Promise<void> {
    log(colors.cyan('🚀 Create New Zig Project'));
    log();

    // Get project name
    const projectName = await clack.text({
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

    if (clack.isCancel(projectName)) {
      clack.cancel('Project creation cancelled.');
      return;
    }

    const targetPath = resolve(process.cwd(), projectName);

    // Check if directory already exists
    if (this.fileSystemManager.fileExists(targetPath)) {
      log(colors.red(`❌ Directory '${projectName}' already exists`));
      return;
    }

    // Check for active Zig installation
    const currentVersion = this.versionManager.getCurrentVersion();
    const hasActiveZig = currentVersion || this.config.systemZig;

    // Build template choices
    const templateChoices = [
      { value: 'back', label: '← Back to main menu' }
    ];

    // Add all templates in the proper order
    const availableTemplates = this.templateManager.getAllTemplateInfo();
    for (const template of availableTemplates) {
      // For zig-init templates, check if Zig is available
      if (template.type === 'zig-init' && !hasActiveZig) {
        templateChoices.push({
          value: template.name,
          label: `${template.displayName} (requires active Zig)`,
          hint: `${template.description} - Install Zig first`
        });
      } else {
        templateChoices.push({
          value: template.name,
          label: template.displayName,
          hint: template.description
        });
      }
    }

    const templateChoice = await clack.select({
      message: 'Choose project template:',
      options: templateChoices,
      initialValue: 'barebones' // Default to barebones (first option)
    });

    if (clack.isCancel(templateChoice) || templateChoice === 'back') {
      return;
    }

    try {
      await this.handleTemplateCreation(templateChoice, projectName, targetPath);
    } catch (error) {
      log(colors.red(`❌ Failed to create project: ${error}`));
    }
  }

  private async handleTemplateCreation(templateName: string, projectName: string, targetPath: string): Promise<void> {
    const templateInfo = this.templateManager.getTemplateInfo(templateName);
    
    // Check if zig-init template requires active Zig
    if (templateInfo?.type === 'zig-init') {
      const currentVersion = this.versionManager.getCurrentVersion();
      const hasActiveZig = currentVersion || this.config.systemZig;
      
      if (!hasActiveZig) {
        log(colors.red('❌ This template requires an active Zig installation. Please install Zig first.'));
        return;
      }
    }

    const spinner = clack.spinner();
    spinner.start('Creating project...');

    await this.projectCreator.createFromTemplate(templateName, projectName, targetPath, (message: string) => {
      spinner.message(message);
    });

    spinner.stop(colors.green('🎉 Project created successfully!'));

    log();
    log(colors.green('🎉 Project created successfully!'));
    log();
    log(colors.cyan('Next steps:'));
    log(colors.gray(`  cd ${projectName}`));
    log(colors.gray('  zig build run'));
    
    // Add template-specific instructions
    if (templateInfo?.name === 'minimal') {
      log(colors.gray('  zig build test'));
    }
    
    log();

    // Show post-action options
    const action = await this.showPostActionOptions([
      { value: 'create-another', label: 'Create another project' }
    ]);

    if (action === 'create-another') {
      await this.handleCreateProjectTUI();
    }
  }

  private async showPostActionOptions(additionalOptions: Array<{ value: string; label: string }> = []): Promise<string> {
    const options = [
      { value: 'main-menu', label: '← Back to main menu' },
      ...additionalOptions
    ];

    const action = await clack.select({
      message: 'What would you like to do next?',
      options,
      initialValue: 'main-menu'
    });

    if (clack.isCancel(action)) {
      return 'main-menu';
    }

    return action;
  }
}
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

    // Add Ziggy templates
    const availableTemplates = this.templateManager.getAllTemplateInfo();
    for (const template of availableTemplates) {
      templateChoices.push({
        value: template.name,
        label: template.displayName,
        hint: template.description
      });
    }

    // Add zig init option if Zig is available
    if (hasActiveZig) {
      const zigVersion = currentVersion === 'system' && this.config.systemZig
        ? this.config.systemZig.version
        : currentVersion;

      templateChoices.push({
        value: 'zig-init',
        label: `Standard Zig template (Same as \`zig init\`)`,
        hint: `Using Zig ${zigVersion}`
      });
    }

    const templateChoice = await clack.select({
      message: hasActiveZig
        ? 'Choose project template:'
        : 'Choose project template: (zig init requires an active Zig installation)',
      options: templateChoices,
      initialValue: 'standard'
    });

    if (clack.isCancel(templateChoice) || templateChoice === 'back') {
      return;
    }

    try {
      if (templateChoice === 'zig-init') {
        await this.handleZigInitTemplate(projectName, targetPath);
      } else {
        await this.handleZiggyTemplate(templateChoice, projectName, targetPath);
      }
    } catch (error) {
      log(colors.red(`❌ Failed to create project: ${error}`));
    }
  }

  private async handleZiggyTemplate(templateName: string, projectName: string, targetPath: string): Promise<void> {
    const spinner = clack.spinner();
    spinner.start('Creating project...');

    await this.projectCreator.createFromTemplate(templateName, projectName, targetPath, (message: string) => {
      spinner.message(message);
    });

    spinner.stop(colors.green('🎉 Project created successfully!'));

    log();
    log(colors.green('🎉 Project created successfully with Ziggy template!'));
    log();
    log(colors.cyan('Next steps:'));
    log(colors.gray(`  cd ${projectName}`));
    log(colors.gray('  zig build run'));
    log();

    // Show post-action options
    const action = await this.showPostActionOptions([
      { value: 'create-another', label: 'Create another project' }
    ]);

    if (action === 'create-another') {
      await this.handleCreateProjectTUI();
    }
  }

  private async handleZigInitTemplate(projectName: string, targetPath: string): Promise<void> {
    const spinner = clack.spinner();
    spinner.start('Creating project with zig init...');

    try {
      // Create directory first
      this.fileSystemManager.createDirectory(targetPath, true);

      // Run zig init in the target directory
      const result = Bun.spawnSync(['zig', 'init'], {
        cwd: targetPath,
        stdout: 'pipe',
        stderr: 'pipe'
      });

      if (result.exitCode !== 0) {
        const errorOutput = result.stderr.toString();
        throw new Error(`zig init failed: ${errorOutput}`);
      }

      spinner.stop(colors.green('🎉 Project created successfully!'));

      log();
      log(colors.green('🎉 Project created successfully with zig init!'));
      log();
      log(colors.cyan('Next steps:'));
      log(colors.gray(`  cd ${projectName}`));
      log(colors.gray('  zig build run'));
      log();

      // Show post-action options
      const action = await this.showPostActionOptions([
        { value: 'create-another', label: 'Create another project' }
      ]);

      if (action === 'create-another') {
        await this.handleCreateProjectTUI();
      }

    } catch (error) {
      spinner.stop('Failed');
      
      // Clean up directory if creation failed
      if (this.fileSystemManager.fileExists(targetPath)) {
        this.fileSystemManager.safeRemove(targetPath, true);
      }
      
      throw error;
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
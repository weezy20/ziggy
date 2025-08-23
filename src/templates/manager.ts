/**
 * Template Manager - Handles template discovery and validation
 */

import type { ITemplateManager } from '../interfaces.js';

export interface TemplateInfo {
  name: string;
  displayName: string;
  description: string;
  url: string;
  branch?: string;
}

export class TemplateManager implements ITemplateManager {
  private templates: Map<string, TemplateInfo> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  private initializeTemplates(): void {
    // Standard template - the lean Zig app template
    this.templates.set('standard', {
      name: 'standard',
      displayName: 'Standard Zig App',
      description: 'A lean Zig application template with basic structure',
      url: 'https://codeload.github.com/weezy20/zig-app-template/zip/refs/heads/master',
      branch: 'master'
    });

    // Lean template - minimal setup
    this.templates.set('lean', {
      name: 'lean',
      displayName: 'Lean Project',
      description: 'Minimal Zig project with just the essentials',
      url: '', // Will be handled differently - creates minimal structure locally
    });
  }

  public getAvailableTemplates(): string[] {
    return Array.from(this.templates.keys());
  }

  public getTemplateInfo(templateName: string): TemplateInfo | undefined {
    return this.templates.get(templateName);
  }

  public getAllTemplateInfo(): TemplateInfo[] {
    return Array.from(this.templates.values());
  }

  public validateTemplate(templateName: string): boolean {
    return this.templates.has(templateName);
  }

  public async createProject(templateName: string, projectName: string, targetPath: string): Promise<void> {
    if (!this.validateTemplate(templateName)) {
      throw new Error(`Template '${templateName}' not found`);
    }

    const template = this.templates.get(templateName)!;
    
    // This method delegates to the ProjectCreator
    // The actual implementation will be handled by the ProjectCreator class
    throw new Error('createProject should be called through ProjectCreator');
  }
}
/**
 * Template Manager - Handles template discovery and validation
 */

import type { ITemplateManager } from '../interfaces.js';

export interface TemplateInfo {
  name: string;
  displayName: string;
  description: string;
  type: 'cached' | 'lean' | 'zig-init';
  cacheUrl?: string; // For cached templates
  zigInitFlags?: string[]; // For zig init variants
  url?: string; // Legacy field for backward compatibility
  branch?: string; // Legacy field for backward compatibility
}

export class TemplateManager implements ITemplateManager {
  private templates: Map<string, TemplateInfo> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  private initializeTemplates(): void {
    // Barebones - cached with embedded fallback
    this.templates.set('barebones', {
      name: 'barebones',
      displayName: 'Barebones Project (main.zig & build.zig)',
      description: 'just enough to `zig build run`',
      type: 'cached',
      cacheUrl: 'https://raw.githubusercontent.com/weezy20/zig-app-template/master/'
    });

    // Minimal - enhanced lean with build.zig.zon
    this.templates.set('minimal', {
      name: 'minimal',
      displayName: 'Minimal Project with testing harness',
      description: 'Adds some test harness & a `build.zig.zon`',
      type: 'lean'
    });

    // Standard - zig init
    this.templates.set('standard', {
      name: 'standard',
      displayName: 'Standard Zig template (zig init)',
      description: 'The standard `zig init` template',
      type: 'zig-init',
      zigInitFlags: []
    });

    // Standard Minimal - zig init -m
    this.templates.set('standard-minimal', {
      name: 'standard-minimal',
      displayName: 'Standard Zig template minimal (zig init -m)',
      description: 'The standard `zig init -m` template',
      type: 'zig-init',
      zigInitFlags: ['-m']
    });
  }

  public getAvailableTemplates(): string[] {
    // Return templates in the specified order: Barebones, Minimal, Standard, Standard Minimal
    return ['barebones', 'minimal', 'standard', 'standard-minimal'];
  }

  public getTemplateInfo(templateName: string): TemplateInfo | undefined {
    return this.templates.get(templateName);
  }

  public getAllTemplateInfo(): TemplateInfo[] {
    // Return templates in the specified order
    return this.getAvailableTemplates()
      .map(name => this.templates.get(name)!)
      .filter(Boolean);
  }

  public validateTemplate(templateName: string): boolean {
    return this.templates.has(templateName);
  }

  public createProject(templateName: string, _projectName: string, _targetPath: string): Promise<void> {
    if (!this.validateTemplate(templateName)) {
      throw new Error(`Template '${templateName}' not found`);
    }

    const _template = this.templates.get(templateName)!;
    
    // This method delegates to the ProjectCreator
    // The actual implementation will be handled by the ProjectCreator class
    throw new Error('createProject should be called through ProjectCreator');
  }
}
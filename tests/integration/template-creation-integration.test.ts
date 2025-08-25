/**
 * Integration tests for template creation functionality
 * Tests actual template creation with real file system operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { tmpdir } from 'os';
import { createApplication } from '../../src/index.js';
import { TemplateManager } from '../../src/templates/manager.js';
import type { ZigInstaller } from '../../src/index.js';

describe('Template Creation Integration Tests', () => {
  let testDir: string;
  let installer: ZigInstaller;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Set up test environment
    testDir = join(tmpdir(), `ziggy-test-${Date.now()}`);
    process.env.ZIGGY_DIR = testDir;
    
    // Create application with dependency injection
    installer = await createApplication();
    
    // Create test directory
    const container = (installer as any).container;
    const fileSystemManager = container.resolve('fileSystemManager');
    fileSystemManager.createDirectory(testDir, true);
  });

  afterEach(() => {
    // Clean up test directory
    const container = (installer as any).container;
    const fileSystemManager = container.resolve('fileSystemManager');
    if (fileSystemManager.fileExists(testDir)) {
      fileSystemManager.safeRemove(testDir, true);
    }
    
    // Restore environment
    process.env = originalEnv;
  });

  describe('Template Manager', () => {
    it('should provide four distinct template options', () => {
      const templateManager = new TemplateManager();
      const templates = templateManager.getAllTemplateInfo();
      
      expect(templates.length).toBe(4);
      
      const templateNames = templates.map(t => t.name);
      expect(templateNames).toEqual(['barebones', 'minimal', 'standard', 'standard-minimal']);
      
      // Verify each template has required properties
      templates.forEach(template => {
        expect(template.name).toBeDefined();
        expect(template.displayName).toBeDefined();
        expect(template.description).toBeDefined();
        expect(template.type).toBeDefined();
      });
    });

    it('should validate template names correctly', () => {
      const templateManager = new TemplateManager();
      
      expect(templateManager.validateTemplate('barebones')).toBe(true);
      expect(templateManager.validateTemplate('minimal')).toBe(true);
      expect(templateManager.validateTemplate('standard')).toBe(true);
      expect(templateManager.validateTemplate('standard-minimal')).toBe(true);
      expect(templateManager.validateTemplate('nonexistent')).toBe(false);
    });
  });

  describe('Component Integration', () => {
    it('should create all components without errors', async () => {
      // Access components through the container
      const container = (installer as any).container;
      const templateManager = await container.resolveAsync('templateManager');
      const projectCreator = await container.resolveAsync('projectCreator');
      
      expect(templateManager).toBeDefined();
      expect(projectCreator).toBeDefined();
    });
  });

  describe('Barebones Template Creation', () => {
    it('should create barebones project with embedded fallback', async () => {
      const container = (installer as any).container;
      const projectCreator = await container.resolveAsync('projectCreator');
      const fileSystemManager = container.resolve('fileSystemManager');

      // Mock network failure to force embedded fallback
      const originalFetch = global.fetch;
      global.fetch = () => Promise.reject(new Error('Network error'));

      const projectName = 'test-barebones';
      const projectPath = join(testDir, 'projects', projectName);

      await projectCreator.createFromTemplate('barebones', projectName, projectPath);

      // Verify project structure
      expect(fileSystemManager.fileExists(projectPath)).toBe(true);
      expect(fileSystemManager.fileExists(join(projectPath, 'main.zig'))).toBe(true);
      expect(fileSystemManager.fileExists(join(projectPath, 'build.zig'))).toBe(true);
      expect(fileSystemManager.fileExists(join(projectPath, '.gitignore'))).toBe(true);

      // Verify no extra files
      expect(fileSystemManager.fileExists(join(projectPath, 'src'))).toBe(false);
      expect(fileSystemManager.fileExists(join(projectPath, 'README.md'))).toBe(false);

      // Verify main.zig content
      const mainZig = fileSystemManager.readFile(join(projectPath, 'main.zig'));
      expect(mainZig).toContain('pub fn main() !void {}');

      // Verify build.zig content
      const buildZig = fileSystemManager.readFile(join(projectPath, 'build.zig'));
      expect(buildZig).toContain('pub fn build(b: *std.Build) void {');
      expect(buildZig).toContain('main.zig');

      // Verify .gitignore content
      const gitignore = fileSystemManager.readFile(join(projectPath, '.gitignore'));
      expect(gitignore).toContain('.zig-cache/');
      expect(gitignore).toContain('zig-out/');

      // Restore fetch
      global.fetch = originalFetch;
    });
  });

  describe('Minimal Template Creation', () => {
    it('should create minimal project with testing harness', async () => {
      const container = (installer as any).container;
      const projectCreator = await container.resolveAsync('projectCreator');
      const fileSystemManager = container.resolve('fileSystemManager');

      const projectName = 'test-minimal';
      const projectPath = join(testDir, 'projects', projectName);

      await projectCreator.createFromTemplate('minimal', projectName, projectPath);

      // Verify project structure
      expect(fileSystemManager.fileExists(projectPath)).toBe(true);
      expect(fileSystemManager.fileExists(join(projectPath, 'build.zig'))).toBe(true);
      expect(fileSystemManager.fileExists(join(projectPath, 'src'))).toBe(true);
      expect(fileSystemManager.fileExists(join(projectPath, 'src', 'main.zig'))).toBe(true);
      expect(fileSystemManager.fileExists(join(projectPath, 'README.md'))).toBe(true);
      expect(fileSystemManager.fileExists(join(projectPath, '.gitignore'))).toBe(true);

      // Verify build.zig content
      const buildZig = fileSystemManager.readFile(join(projectPath, 'build.zig'));
      expect(buildZig).toContain(projectName);
      expect(buildZig).toContain('src/main.zig');
      expect(buildZig).toContain('pub fn build');
      expect(buildZig).toContain('test');

      // Verify main.zig content
      const mainZig = fileSystemManager.readFile(join(projectPath, 'src', 'main.zig'));
      expect(mainZig).toContain('pub fn main');
      expect(mainZig).toContain(`Hello, {s}!\\n", .{"${projectName}"}`);
      expect(mainZig).toContain('test "simple test"');

      // Verify README.md content
      const readme = fileSystemManager.readFile(join(projectPath, 'README.md'));
      expect(readme).toContain(`# ${projectName}`);
      expect(readme).toContain('zig build');
      expect(readme).toContain('zig build run');
      expect(readme).toContain('zig build test');

      // Verify .gitignore content
      const gitignore = fileSystemManager.readFile(join(projectPath, '.gitignore'));
      expect(gitignore).toContain('.zig-cache/');
      expect(gitignore).toContain('zig-out/');
    });
  });

  describe('Error Handling', () => {
    it('should handle existing directory gracefully', async () => {
      const container = (installer as any).container;
      const projectCreator = await container.resolveAsync('projectCreator');
      const fileSystemManager = container.resolve('fileSystemManager');

      const projectName = 'existing-project';
      const projectPath = join(testDir, 'projects', projectName);
      
      // Create the directory first
      fileSystemManager.createDirectory(projectPath, true);

      await expect(
        projectCreator.createFromTemplate('minimal', projectName, projectPath)
      ).rejects.toThrow('Directory');
    });

    it('should handle invalid template names', async () => {
      const container = (installer as any).container;
      const projectCreator = await container.resolveAsync('projectCreator');

      const projectName = 'test-project';
      const projectPath = join(testDir, 'projects', projectName);

      await expect(
        projectCreator.createFromTemplate('invalid-template', projectName, projectPath)
      ).rejects.toThrow("Template 'invalid-template' not found");
    });
  });
});
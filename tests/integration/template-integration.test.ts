/**
 * Integration tests for template functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { TemplateManager } from '../../src/templates/manager.js';
import { ProjectCreator } from '../../src/templates/creator.js';
import { FileSystemManager } from '../../src/utils/filesystem.js';
import { tmpdir } from 'os';

describe('Template Integration Tests', () => {
  let templateManager: TemplateManager;
  let projectCreator: ProjectCreator;
  let fileSystemManager: FileSystemManager;
  let testDir: string;

  beforeEach(() => {
    templateManager = new TemplateManager();
    fileSystemManager = new FileSystemManager();
    projectCreator = new ProjectCreator(templateManager, fileSystemManager);
    
    // Create a unique test directory
    testDir = join(tmpdir(), `ziggy-test-${Date.now()}`);
    fileSystemManager.createDirectory(testDir, true);
  });

  afterEach(() => {
    // Clean up test directory
    if (fileSystemManager.fileExists(testDir)) {
      fileSystemManager.safeRemove(testDir, true);
    }
  });

  describe('Lean Template', () => {
    it('should create a complete lean project', async () => {
      const projectName = 'test-lean';
      const projectPath = join(testDir, projectName);

      await projectCreator.createFromTemplate('lean', projectName, projectPath);

      // Verify project structure
      expect(fileSystemManager.fileExists(projectPath)).toBe(true);
      expect(fileSystemManager.fileExists(join(projectPath, 'build.zig'))).toBe(true);
      expect(fileSystemManager.fileExists(join(projectPath, 'src'))).toBe(true);
      expect(fileSystemManager.fileExists(join(projectPath, 'src', 'main.zig'))).toBe(true);
      expect(fileSystemManager.fileExists(join(projectPath, 'README.md'))).toBe(true);

      // Verify build.zig content
      const buildZig = fileSystemManager.readFile(join(projectPath, 'build.zig'));
      expect(buildZig).toContain(projectName);
      expect(buildZig).toContain('src/main.zig');
      expect(buildZig).toContain('pub fn build');

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
    });

    it('should handle project names with special characters', async () => {
      const projectName = 'my-test_app';
      const projectPath = join(testDir, projectName);

      await projectCreator.createFromTemplate('lean', projectName, projectPath);

      // Verify the project was created successfully
      expect(fileSystemManager.fileExists(projectPath)).toBe(true);
      
      // Verify the project name is used correctly in files
      const buildZig = fileSystemManager.readFile(join(projectPath, 'build.zig'));
      expect(buildZig).toContain(projectName);
      
      const mainZig = fileSystemManager.readFile(join(projectPath, 'src', 'main.zig'));
      expect(mainZig).toContain(projectName);
    });
  });

  describe('Template Manager Integration', () => {
    it('should provide valid template information', () => {
      const templates = templateManager.getAllTemplateInfo();
      
      expect(templates.length).toBeGreaterThanOrEqual(2);
      
      const standardTemplate = templates.find(t => t.name === 'standard');
      const leanTemplate = templates.find(t => t.name === 'lean');
      
      expect(standardTemplate).toBeDefined();
      expect(leanTemplate).toBeDefined();
      
      // Verify template structure
      expect(standardTemplate?.name).toBe('standard');
      expect(standardTemplate?.displayName).toBe('Standard Zig App');
      expect(standardTemplate?.url).toContain('github.com');
      
      expect(leanTemplate?.name).toBe('lean');
      expect(leanTemplate?.displayName).toBe('Lean Project');
      expect(leanTemplate?.url).toBe(''); // Local template
    });

    it('should validate templates correctly', () => {
      expect(templateManager.validateTemplate('standard')).toBe(true);
      expect(templateManager.validateTemplate('lean')).toBe(true);
      expect(templateManager.validateTemplate('nonexistent')).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle existing directory gracefully', async () => {
      const projectName = 'existing-project';
      const projectPath = join(testDir, projectName);
      
      // Create the directory first
      fileSystemManager.createDirectory(projectPath);

      await expect(
        projectCreator.createFromTemplate('lean', projectName, projectPath)
      ).rejects.toThrow('Directory');
    });

    it('should handle invalid template names', async () => {
      const projectName = 'test-project';
      const projectPath = join(testDir, projectName);

      await expect(
        projectCreator.createFromTemplate('invalid-template', projectName, projectPath)
      ).rejects.toThrow("Template 'invalid-template' not found");
    });
  });
});
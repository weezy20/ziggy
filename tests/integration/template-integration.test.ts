/**
 * Integration tests for template functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { TemplateManager } from '../../src/templates/manager.js';
import { ProjectCreator } from '../../src/templates/creator.js';
import { TemplateCacheManager } from '../../src/templates/cache-manager.js';
import { ZigInitHandler } from '../../src/templates/zig-init-handler.js';
import { BuildZigZonGenerator } from '../../src/templates/build-zig-zon-generator.js';
import { FileSystemManager } from '../../src/utils/filesystem.js';
import { PlatformDetector, type IPlatformDetector } from '../../src/utils/platform.js';
import { tmpdir } from 'os';

describe('Template Integration Tests', () => {
  let templateManager: TemplateManager;
  let projectCreator: ProjectCreator;
  let fileSystemManager: FileSystemManager;
  let platformDetector: IPlatformDetector;
  let cacheManager: TemplateCacheManager;
  let zigInitHandler: ZigInitHandler;
  let buildZigZonGenerator: BuildZigZonGenerator;
  let testDir: string;

  beforeEach(() => {
    fileSystemManager = new FileSystemManager();
    platformDetector = new PlatformDetector();
    templateManager = new TemplateManager();
    cacheManager = new TemplateCacheManager(fileSystemManager, platformDetector);
    zigInitHandler = new ZigInitHandler(platformDetector, fileSystemManager);
    buildZigZonGenerator = new BuildZigZonGenerator(fileSystemManager, platformDetector);
    projectCreator = new ProjectCreator(
      templateManager, 
      fileSystemManager, 
      cacheManager, 
      zigInitHandler, 
      buildZigZonGenerator
    );
    
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

  describe('Barebones Template', () => {
    it('should create a barebones project with minimal files', async () => {
      const projectName = 'test-barebones';
      const projectPath = join(testDir, projectName);

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
    });

    it('should use embedded fallback when cache fails', async () => {
      // Mock network failure by temporarily breaking fetch
      const originalFetch = global.fetch;
      global.fetch = () => Promise.reject(new Error('Network error'));

      const projectName = 'test-barebones-fallback';
      const projectPath = join(testDir, projectName);

      await projectCreator.createFromTemplate('barebones', projectName, projectPath);

      // Verify project was still created using embedded content
      expect(fileSystemManager.fileExists(projectPath)).toBe(true);
      expect(fileSystemManager.fileExists(join(projectPath, 'main.zig'))).toBe(true);
      expect(fileSystemManager.fileExists(join(projectPath, 'build.zig'))).toBe(true);

      // Restore fetch
      global.fetch = originalFetch;
    });
  });

  describe('Minimal Template', () => {
    it('should create a minimal project with testing harness', async () => {
      const projectName = 'test-minimal';
      const projectPath = join(testDir, projectName);

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
    });

    it('should handle project names with special characters', async () => {
      const projectName = 'my-test_app';
      const projectPath = join(testDir, projectName);

      await projectCreator.createFromTemplate('minimal', projectName, projectPath);

      // Verify the project was created successfully
      expect(fileSystemManager.fileExists(projectPath)).toBe(true);
      
      // Verify the project name is used correctly in files
      const buildZig = fileSystemManager.readFile(join(projectPath, 'build.zig'));
      expect(buildZig).toContain(projectName);
      
      const mainZig = fileSystemManager.readFile(join(projectPath, 'src', 'main.zig'));
      expect(mainZig).toContain(projectName);
    });
  });

  describe('Standard Templates', () => {
    it('should handle standard template when zig is available', async () => {
      // Check if zig is available
      const zigAvailable = await zigInitHandler.validateZigInstallation();
      
      if (!zigAvailable) {
        console.log('Zig not available, skipping standard template test');
        return;
      }

      const projectName = 'test-standard';
      const projectPath = join(testDir, projectName);

      await projectCreator.createFromTemplate('standard', projectName, projectPath);

      // Verify project was created
      expect(fileSystemManager.fileExists(projectPath)).toBe(true);
      expect(fileSystemManager.fileExists(join(projectPath, '.gitignore'))).toBe(true);
    });

    it('should handle standard-minimal template when zig is available', async () => {
      // Check if zig is available
      const zigAvailable = await zigInitHandler.validateZigInstallation();
      
      if (!zigAvailable) {
        console.log('Zig not available, skipping standard-minimal template test');
        return;
      }

      const projectName = 'test-standard-minimal';
      const projectPath = join(testDir, projectName);

      await projectCreator.createFromTemplate('standard-minimal', projectName, projectPath);

      // Verify project was created
      expect(fileSystemManager.fileExists(projectPath)).toBe(true);
      expect(fileSystemManager.fileExists(join(projectPath, '.gitignore'))).toBe(true);
    });

    it('should provide helpful error when zig is not available', async () => {
      // Mock zig as unavailable
      const originalValidate = zigInitHandler.validateZigInstallation;
      zigInitHandler.validateZigInstallation = async () => false;

      const projectName = 'test-standard-no-zig';
      const projectPath = join(testDir, projectName);

      await expect(
        projectCreator.createFromTemplate('standard', projectName, projectPath)
      ).rejects.toThrow();

      // Restore original method
      zigInitHandler.validateZigInstallation = originalValidate;
    });
  });

  describe('Template Manager Integration', () => {
    it('should provide valid template information', () => {
      const templates = templateManager.getAllTemplateInfo();
      
      expect(templates.length).toBe(4);
      
      const barebonesTemplate = templates.find(t => t.name === 'barebones');
      const minimalTemplate = templates.find(t => t.name === 'minimal');
      const standardTemplate = templates.find(t => t.name === 'standard');
      const standardMinimalTemplate = templates.find(t => t.name === 'standard-minimal');
      
      expect(barebonesTemplate).toBeDefined();
      expect(minimalTemplate).toBeDefined();
      expect(standardTemplate).toBeDefined();
      expect(standardMinimalTemplate).toBeDefined();
      
      // Verify template structure
      expect(barebonesTemplate?.displayName).toContain('Barebones Project');
      expect(minimalTemplate?.displayName).toContain('Minimal Project');
      expect(standardTemplate?.displayName).toContain('Standard Zig template (zig init)');
      expect(standardMinimalTemplate?.displayName).toContain('Standard Zig template minimal');
    });

    it('should validate templates correctly', () => {
      expect(templateManager.validateTemplate('barebones')).toBe(true);
      expect(templateManager.validateTemplate('minimal')).toBe(true);
      expect(templateManager.validateTemplate('standard')).toBe(true);
      expect(templateManager.validateTemplate('standard-minimal')).toBe(true);
      expect(templateManager.validateTemplate('nonexistent')).toBe(false);
    });

    it('should return templates in correct order', () => {
      const templates = templateManager.getAllTemplateInfo();
      const names = templates.map(t => t.name);
      
      expect(names).toEqual(['barebones', 'minimal', 'standard', 'standard-minimal']);
    });
  });

  describe('Error Handling', () => {
    it('should handle existing directory gracefully', async () => {
      const projectName = 'existing-project';
      const projectPath = join(testDir, projectName);
      
      // Create the directory first
      fileSystemManager.createDirectory(projectPath);

      await expect(
        projectCreator.createFromTemplate('minimal', projectName, projectPath)
      ).rejects.toThrow('Directory');
    });

    it('should handle invalid template names', async () => {
      const projectName = 'test-project';
      const projectPath = join(testDir, projectName);

      await expect(
        projectCreator.createFromTemplate('invalid-template', projectName, projectPath)
      ).rejects.toThrow("Template 'invalid-template' not found");
    });

    it('should clean up on failure', async () => {
      const projectName = 'cleanup-test';
      const projectPath = join(testDir, projectName);

      // Mock a failure during project creation
      const originalWriteFile = fileSystemManager.writeFile;
      let callCount = 0;
      fileSystemManager.writeFile = (path: string, content: string) => {
        callCount++;
        if (callCount > 2) {
          throw new Error('Simulated write failure');
        }
        return originalWriteFile.call(fileSystemManager, path, content);
      };

      await expect(
        projectCreator.createFromTemplate('minimal', projectName, projectPath)
      ).rejects.toThrow('Simulated write failure');

      // Verify cleanup occurred
      expect(fileSystemManager.fileExists(projectPath)).toBe(false);

      // Restore original method
      fileSystemManager.writeFile = originalWriteFile;
    });
  });
});
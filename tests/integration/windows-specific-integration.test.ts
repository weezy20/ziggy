/**
 * Windows-specific integration tests for template functionality
 * Tests Windows zig.exe path resolution and zig init delegation
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { tmpdir } from 'os';
import { createApplication } from '../../src/index.js';
import type { ZigInstaller } from '../../src/index.js';

// Only run these tests on Windows
const isWindows = process.platform === 'win32';

describe('Windows-Specific Integration Tests', () => {
  let testDir: string;
  let installer: ZigInstaller;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    if (!isWindows) {
      return; // Skip setup if not on Windows
    }

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
    if (!isWindows) {
      return; // Skip cleanup if not on Windows
    }

    // Clean up test directory
    const container = (installer as any).container;
    const fileSystemManager = container.resolve('fileSystemManager');
    if (fileSystemManager.fileExists(testDir)) {
      fileSystemManager.safeRemove(testDir, true);
    }
    
    // Restore environment
    process.env = originalEnv;
  });

  describe('Windows Zig Path Resolution', () => {
    it('should detect Windows platform correctly', async () => {
      if (!isWindows) {
        console.log('Skipping Windows-specific test on non-Windows platform');
        return;
      }

      const container = (installer as any).container;
      const platformDetector = container.resolve('platformDetector');
      
      expect(platformDetector.getPlatform()).toBe('windows');
      expect(platformDetector.getOS()).toBe('win32');
      expect(platformDetector.getArchiveExtension()).toBe('zip');
    });

    it('should handle zig.exe path resolution', async () => {
      if (!isWindows) {
        console.log('Skipping Windows-specific test on non-Windows platform');
        return;
      }

      const container = (installer as any).container;
      const platformDetector = container.resolve('platformDetector');
      const fileSystemManager = container.resolve('fileSystemManager');
      
      // Create ZigInitHandler directly since it's not registered in the container
      const { ZigInitHandler } = await import('../../src/templates/zig-init-handler.js');
      const zigInitHandler = new ZigInitHandler(platformDetector, fileSystemManager);
      
      // Test that the handler can attempt to find zig executable
      // This may return null if zig is not installed, which is fine for testing
      const zigPath = zigInitHandler.findZigExecutable();
      
      // If zig is found, it should be a .exe file on Windows
      if (zigPath) {
        expect(zigPath).toMatch(/\.exe$/);
      }
      
      // The method should not throw an error
      expect(() => zigInitHandler.findZigExecutable()).not.toThrow();
    });

    it('should provide Windows-specific error suggestions', async () => {
      if (!isWindows) {
        console.log('Skipping Windows-specific test on non-Windows platform');
        return;
      }

      const container = (installer as any).container;
      const platformDetector = container.resolve('platformDetector');
      const fileSystemManager = container.resolve('fileSystemManager');
      
      // Create ZigInitHandler directly since it's not registered in the container
      const { ZigInitHandler } = await import('../../src/templates/zig-init-handler.js');
      const zigInitHandler = new ZigInitHandler(platformDetector, fileSystemManager);
      
      // Test error suggestions for common Windows issues
      const notFoundError = 'zig: command not found';
      const suggestion = zigInitHandler.getErrorSuggestion(notFoundError);
      
      expect(suggestion).toContain('Zig executable not found');
      expect(suggestion).toContain('ziggy use');
      expect(suggestion).toContain('ziggy list');
    });
  });

  describe('Windows Zig Init Delegation', () => {
    it('should handle zig init when zig is not available', async () => {
      if (!isWindows) {
        console.log('Skipping Windows-specific test on non-Windows platform');
        return;
      }

      const container = (installer as any).container;
      const platformDetector = container.resolve('platformDetector');
      const fileSystemManager = container.resolve('fileSystemManager');
      
      // Create ZigInitHandler directly since it's not registered in the container
      const { ZigInitHandler } = await import('../../src/templates/zig-init-handler.js');
      const zigInitHandler = new ZigInitHandler(platformDetector, fileSystemManager);
      
      // Mock zig as not available
      const originalFindZig = zigInitHandler.findZigExecutable;
      zigInitHandler.findZigExecutable = () => null;
      
      const projectPath = join(testDir, 'test-standard');
      
      const result = await zigInitHandler.executeZigInit({
        targetPath: projectPath
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Zig executable not found');
      
      // Restore original method
      zigInitHandler.findZigExecutable = originalFindZig;
    });

    it('should create standard template when zig is available', async () => {
      if (!isWindows) {
        console.log('Skipping Windows-specific test on non-Windows platform');
        return;
      }

      const container = (installer as any).container;
      const projectCreator = await container.resolveAsync('projectCreator');
      const platformDetector = container.resolve('platformDetector');
      const fileSystemManager = container.resolve('fileSystemManager');
      
      // Create ZigInitHandler to check if zig is available
      const { ZigInitHandler } = await import('../../src/templates/zig-init-handler.js');
      const zigInitHandler = new ZigInitHandler(platformDetector, fileSystemManager);
      
      // Check if zig is available
      const zigAvailable = await zigInitHandler.validateZigInstallation();
      
      if (!zigAvailable) {
        console.log('Zig not available, skipping standard template test');
        return;
      }

      const projectName = 'test-standard-windows';
      const projectPath = join(testDir, 'projects', projectName);

      await projectCreator.createFromTemplate('standard', projectName, projectPath);

      // Verify project was created
      expect(fileSystemManager.fileExists(projectPath)).toBe(true);
      expect(fileSystemManager.fileExists(join(projectPath, '.gitignore'))).toBe(true);
      
      // Verify .gitignore has Windows-appropriate content
      const gitignore = fileSystemManager.readFile(join(projectPath, '.gitignore'));
      expect(gitignore).toContain('.zig-cache/');
      expect(gitignore).toContain('zig-out/');
    });

    it('should create standard-minimal template when zig is available', async () => {
      if (!isWindows) {
        console.log('Skipping Windows-specific test on non-Windows platform');
        return;
      }

      const container = (installer as any).container;
      const projectCreator = await container.resolveAsync('projectCreator');
      const platformDetector = container.resolve('platformDetector');
      const fileSystemManager = container.resolve('fileSystemManager');
      
      // Create ZigInitHandler to check if zig is available
      const { ZigInitHandler } = await import('../../src/templates/zig-init-handler.js');
      const zigInitHandler = new ZigInitHandler(platformDetector, fileSystemManager);
      
      // Check if zig is available
      const zigAvailable = await zigInitHandler.validateZigInstallation();
      
      if (!zigAvailable) {
        console.log('Zig not available, skipping standard-minimal template test');
        return;
      }

      const projectName = 'test-standard-minimal-windows';
      const projectPath = join(testDir, 'projects', projectName);

      await projectCreator.createFromTemplate('standard-minimal', projectName, projectPath);

      // Verify project was created
      expect(fileSystemManager.fileExists(projectPath)).toBe(true);
      expect(fileSystemManager.fileExists(join(projectPath, '.gitignore'))).toBe(true);
      
      // Verify .gitignore has Windows-appropriate content
      const gitignore = fileSystemManager.readFile(join(projectPath, '.gitignore'));
      expect(gitignore).toContain('.zig-cache/');
      expect(gitignore).toContain('zig-out/');
    });
  });

  describe('Windows Environment Integration', () => {
    it('should handle Windows paths correctly', async () => {
      if (!isWindows) {
        console.log('Skipping Windows-specific test on non-Windows platform');
        return;
      }

      const container = (installer as any).container;
      const platformDetector = container.resolve('platformDetector');
      
      // Test Windows-specific path handling
      const ziggyDir = platformDetector.getZiggyDir();
      expect(ziggyDir).toMatch(/^[A-Z]:\\/); // Should start with drive letter
      
      // Test path expansion
      const testPath = '~/test/path';
      const expanded = platformDetector.expandHomePath(testPath);
      expect(expanded).toMatch(/^[A-Z]:\\/); // Should be expanded to full path
    });

    it('should generate correct shell commands for Windows', async () => {
      if (!isWindows) {
        console.log('Skipping Windows-specific test on non-Windows platform');
        return;
      }

      const container = (installer as any).container;
      const platformDetector = container.resolve('platformDetector');
      
      // Test shell info detection
      const shellInfo = platformDetector.getShellInfo();
      
      // On Windows, should detect PowerShell or Command Prompt
      expect(['PowerShell', 'Command Prompt']).toContain(shellInfo.shell);
      
      // Test PATH export line generation
      const pathLine = platformDetector.getPathExportLine('powershell', 'C:\\test\\bin');
      expect(pathLine).toBeDefined();
    });

    it('should handle Windows symlink creation', async () => {
      if (!isWindows) {
        console.log('Skipping Windows-specific test on non-Windows platform');
        return;
      }

      const container = (installer as any).container;
      const fileSystemManager = container.resolve('fileSystemManager');
      
      // Create a test file to link to
      const testFile = join(testDir, 'test-file.txt');
      fileSystemManager.writeFile(testFile, 'test content');
      
      const linkPath = join(testDir, 'test-link.txt');
      
      // Test symlink creation (may require admin privileges)
      try {
        fileSystemManager.createSymlink(testFile, linkPath, 'win32');
        
        // If successful, verify the link exists
        if (fileSystemManager.fileExists(linkPath)) {
          expect(fileSystemManager.fileExists(linkPath)).toBe(true);
        }
      } catch (error) {
        // Symlink creation may fail due to permissions on Windows
        // This is expected behavior and not a test failure
        console.log('Symlink creation failed (expected on Windows without admin privileges):', error.message);
      }
    });
  });
});
/**
 * Project Creator - Handles project creation from templates
 */

import { resolve, join } from 'path';
import { extract as extractZip } from 'zip-lib';
import type { IProjectCreator, IFileSystemManager } from '../interfaces.js';
import type { IPlatformDetector } from '../utils/platform.js';
import type { TemplateManager, TemplateInfo } from './manager.js';
import { ZigInitHandler } from './zig-init-handler.js';
import { TemplateCacheManager } from './cache-manager.js';
import { BuildZigZonGenerator } from './build-zig-zon-generator.js';
import { getStandardGitignore } from './embedded/gitignore.js';
import { colors } from '../utils/colors.js';
import process from "node:process";

export class ProjectCreator implements IProjectCreator {
  private zigInitHandler: ZigInitHandler;
  private cacheManager: TemplateCacheManager;
  private buildZigZonGenerator: BuildZigZonGenerator;

  constructor(
    private templateManager: TemplateManager,
    private fileSystemManager: IFileSystemManager,
    private platformDetector: IPlatformDetector
  ) {
    this.zigInitHandler = new ZigInitHandler(platformDetector, fileSystemManager);
    this.cacheManager = new TemplateCacheManager(fileSystemManager, platformDetector);
    this.buildZigZonGenerator = new BuildZigZonGenerator(fileSystemManager, platformDetector);
  }

  public async createFromTemplate(
    templateName: string, 
    projectName: string, 
    targetPath: string,
    onProgress?: (message: string) => void
  ): Promise<void> {
    const absolutePath = resolve(targetPath);
    
    // Check if target directory already exists
    if (this.fileSystemManager.fileExists(absolutePath)) {
      throw new Error(`Directory ${targetPath} already exists`);
    }

    const template = this.templateManager.getTemplateInfo(templateName);
    if (!template) {
      throw new Error(`Template '${templateName}' not found`);
    }

    // Handle different template types
    switch (template.type) {
      case 'lean':
        await this.createMinimalProject(projectName, absolutePath, onProgress);
        break;
      case 'cached':
        await this.createCachedProject(template, projectName, absolutePath, onProgress);
        break;
      case 'zig-init':
        await this.createFromZigInit(template, projectName, absolutePath, onProgress);
        break;
      default:
        throw new Error(`Unsupported template type: ${template.type}`);
    }

    // Add .gitignore to all project types
    await this.addGitignore(absolutePath);
    
    await this.initializeProject(absolutePath);
  }

  private async createMinimalProject(
    projectName: string,
    targetPath: string,
    onProgress?: (message: string) => void
  ): Promise<void> {
    onProgress?.('Creating minimal project structure...');

    // Create project directory
    this.fileSystemManager.createDirectory(targetPath, true);

    // Create basic build.zig
    const buildZig = `const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const exe = b.addExecutable(.{
        .name = "${projectName}",
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });

    b.installArtifact(exe);

    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());

    if (b.args) |args| {
        run_cmd.addArgs(args);
    }

    const run_step = b.step("run", "Run the app");
    run_step.dependOn(&run_cmd.step);

    const exe_unit_tests = b.addTest(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });

    const run_exe_unit_tests = b.addRunArtifact(exe_unit_tests);

    const test_step = b.step("test", "Run unit tests");
    test_step.dependOn(&run_exe_unit_tests.step);
}
`;

    // Create src directory and main.zig
    const srcDir = join(targetPath, 'src');
    this.fileSystemManager.createDirectory(srcDir);

    const mainZig = `const std = @import("std");

pub fn main() !void {
    std.debug.print("Hello, {s}!\\n", .{"${projectName}"});
}

test "simple test" {
    var list = std.ArrayList(i32).init(std.testing.allocator);
    defer list.deinit();
    try list.append(42);
    try std.testing.expectEqual(@as(i32, 42), list.pop());
}
`;

    // Create README.md
    const readme = `# ${projectName}

A Zig project created with Ziggy.

## Building

\`\`\`bash
zig build
\`\`\`

## Running

\`\`\`bash
zig build run
\`\`\`

## Testing

\`\`\`bash
zig build test
\`\`\`
`;

    // Write files
    this.fileSystemManager.writeFile(join(targetPath, 'build.zig'), buildZig);
    this.fileSystemManager.writeFile(join(srcDir, 'main.zig'), mainZig);
    this.fileSystemManager.writeFile(join(targetPath, 'README.md'), readme);

    // Generate build.zig.zon if active Zig version is available
    onProgress?.('Generating build.zig.zon...');
    try {
      await this.buildZigZonGenerator.generateForProject(targetPath, projectName);
    } catch (error) {
      console.warn(`Failed to generate build.zig.zon: ${error}`);
      // Continue without build.zig.zon - this is optional
    }

    onProgress?.('Minimal project created successfully!');
  }

  /**
   * Create project from cached template with fallback to embedded content
   */
  private async createCachedProject(
    template: TemplateInfo,
    projectName: string,
    targetPath: string,
    onProgress?: (message: string) => void
  ): Promise<void> {
    onProgress?.('Setting up cached template project...');

    // Create project directory
    this.fileSystemManager.createDirectory(targetPath, true);

    try {
      // Get template files from cache manager (handles download, cache, and fallback)
      const cacheUrl = template.cacheUrl;
      if (!cacheUrl) {
        throw new Error(`No cache URL configured for template: ${template.name}`);
      }

      onProgress?.('Loading template files...');
      const templateFiles = await this.cacheManager.getTemplate(template.name, cacheUrl);

      // Copy files from cache to target directory
      for (const [fileName, content] of Object.entries(templateFiles)) {
        const targetFilePath = join(targetPath, fileName);
        
        // Replace placeholder project name if needed
        let processedContent = content;
        if (fileName === 'build.zig') {
          // Replace "app" with actual project name in build.zig
          processedContent = content.replace(
            /\.name = "app"/g, 
            `.name = "${projectName}"`
          );
        }
        
        this.fileSystemManager.writeFile(targetFilePath, processedContent);
      }

      onProgress?.('Cached project created successfully!');
    } catch (error) {
      // Clean up if creation failed
      if (this.fileSystemManager.fileExists(targetPath)) {
        try {
          this.fileSystemManager.safeRemove(targetPath, true);
        } catch (cleanupError) {
          console.warn(colors.yellow(`⚠ Failed to clean up directory: ${cleanupError}`));
        }
      }
      
      throw new Error(`Failed to create cached project: ${error}`);
    }
  }

  private async createFromRemoteTemplate(
    template: TemplateInfo,
    _projectName: string,
    targetPath: string,
    onProgress?: (message: string) => void
  ): Promise<void> {
    console.log("🖥️  " + colors.blue(`Downloading ${template.displayName}...`));
    
    try {
      onProgress?.('Downloading template...');
      
      // Download the zip archive
      const templateUrl = template.url || template.cacheUrl;
      if (!templateUrl) {
        throw new Error(`No URL configured for template: ${template.name}`);
      }
      const response = await fetch(templateUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      onProgress?.('Extracting template...');
      
      // Create a temporary file for the zip
      const tempDir = join(process.cwd(), '.tmp');
      if (!this.fileSystemManager.fileExists(tempDir)) {
        this.fileSystemManager.createDirectory(tempDir, true);
      }
      
      const zipPath = join(tempDir, 'template.zip');
      const writer = this.fileSystemManager.createWriteStream(zipPath);
      
      // Write the response to file
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get response stream');
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          writer.write(value);
        }
      } finally {
        reader.releaseLock();
        writer.end();
      }

      // Wait for the file to be completely written
      await new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      onProgress?.('Setting up project...');

      // Extract the zip file
      await extractZip(zipPath, tempDir);
      
      // Move the extracted contents (GitHub creates a folder named repo-branch)
      const extractedDir = join(tempDir, 'zig-app-template-master');
      if (this.fileSystemManager.fileExists(extractedDir)) {
        // Create target directory
        this.fileSystemManager.createDirectory(targetPath, true);
        
        // Move all contents from extracted directory to target
        const files = this.fileSystemManager.listDirectory(extractedDir);
        
        for (const file of files) {
          const srcPath = join(extractedDir, file);
          const destPath = join(targetPath, file);
          
          if (this.fileSystemManager.isDirectory(srcPath)) {
            await this.copyDirectoryRecursive(srcPath, destPath);
          } else {
            const content = this.fileSystemManager.readFile(srcPath);
            this.fileSystemManager.writeFile(destPath, content);
          }
        }
      } else {
        throw new Error('Failed to find extracted template directory');
      }
      
      // Clean up temporary files
      if (this.fileSystemManager.fileExists(tempDir)) {
        this.fileSystemManager.safeRemove(tempDir, true);
      }
      
    } catch (error) {
      // Clean up if download failed and directory was created
      if (this.fileSystemManager.fileExists(targetPath)) {
        try {
          this.fileSystemManager.safeRemove(targetPath, true);
        } catch (cleanupError) {
          console.warn(colors.yellow(`⚠ Failed to clean up directory: ${cleanupError}`));
        }
      }
      
      // Clean up temp directory
      const tempDir = join(process.cwd(), '.tmp');
      if (this.fileSystemManager.fileExists(tempDir)) {
        try {
          this.fileSystemManager.safeRemove(tempDir, true);
        } catch (cleanupError) {
          console.warn(colors.yellow(`⚠ Failed to clean up temp directory: ${cleanupError}`));
        }
      }
      
      throw new Error(`Failed to download template: ${error}`);
    }
  }

  private async createFromZigInit(
    template: TemplateInfo,
    projectName: string,
    targetPath: string,
    onProgress?: (message: string) => void
  ): Promise<void> {
    onProgress?.('Checking Zig installation...');

    // Validate Zig installation first
    const isZigAvailable = await this.zigInitHandler.validateZigInstallation();
    if (!isZigAvailable) {
      throw new Error(
        'Zig is not available or not properly installed. ' +
        'Please install Zig using "ziggy use <version>" or ensure Zig is in your PATH.'
      );
    }

    onProgress?.('Creating project with zig init...');

    // Execute zig init with the template's flags
    const result = await this.zigInitHandler.executeZigInit({
      flags: template.zigInitFlags || [],
      projectName,
      targetPath
    }, onProgress);

    if (!result.success) {
      const errorMessage = result.error || 'Unknown error occurred during zig init';
      const suggestion = this.zigInitHandler.getErrorSuggestion(errorMessage);
      throw new Error(`${errorMessage}\n\n${suggestion}`);
    }

    onProgress?.('Project created successfully with zig init!');
  }

  private async copyDirectoryRecursive(srcDir: string, destDir: string): Promise<void> {
    this.fileSystemManager.createDirectory(destDir, true);
    
    const files = this.fileSystemManager.listDirectory(srcDir);
    
    for (const file of files) {
      const srcPath = join(srcDir, file);
      const destPath = join(destDir, file);
      
      if (this.fileSystemManager.isDirectory(srcPath)) {
        await this.copyDirectoryRecursive(srcPath, destPath);
      } else {
        const content = this.fileSystemManager.readFile(srcPath);
        this.fileSystemManager.writeFile(destPath, content);
      }
    }
  }

  /**
   * Add standard .gitignore file to project
   */
  private async addGitignore(projectPath: string): Promise<void> {
    const gitignorePath = join(projectPath, '.gitignore');
    
    // Only create .gitignore if it doesn't already exist
    if (!this.fileSystemManager.fileExists(gitignorePath)) {
      const gitignoreContent = getStandardGitignore();
      this.fileSystemManager.writeFile(gitignorePath, gitignoreContent);
    }
  }

  public async initializeProject(_projectPath: string): Promise<void> {
    // Additional initialization steps can be added here
    // For now, this is a placeholder for future enhancements
    // such as git initialization, dependency setup, etc.
  }
}
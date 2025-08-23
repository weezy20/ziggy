/**
 * Project Creator - Handles project creation from templates
 */

import { resolve, join } from 'path';
import { extract as extractZip } from 'zip-lib';
import type { IProjectCreator, IFileSystemManager } from '../interfaces.js';
import type { TemplateManager, TemplateInfo } from './manager.js';
import { colors } from '../utils/colors.js';

export class ProjectCreator implements IProjectCreator {
  constructor(
    private templateManager: TemplateManager,
    private fileSystemManager: IFileSystemManager
  ) {}

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

    if (templateName === 'lean') {
      await this.createLeanProject(projectName, absolutePath, onProgress);
    } else {
      await this.createFromRemoteTemplate(template, projectName, absolutePath, onProgress);
    }

    await this.initializeProject(absolutePath);
  }

  private async createLeanProject(
    projectName: string,
    targetPath: string,
    onProgress?: (message: string) => void
  ): Promise<void> {
    onProgress?.('Creating lean project structure...');

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

    onProgress?.('Lean project created successfully!');
  }

  private async createFromRemoteTemplate(
    template: TemplateInfo,
    projectName: string,
    targetPath: string,
    onProgress?: (message: string) => void
  ): Promise<void> {
    console.log("🖥️  " + colors.blue(`Downloading ${template.displayName}...`));
    
    try {
      onProgress?.('Downloading template...');
      
      // Download the zip archive
      const response = await fetch(template.url);
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

  public async initializeProject(projectPath: string): Promise<void> {
    // Additional initialization steps can be added here
    // For now, this is a placeholder for future enhancements
    // such as git initialization, dependency setup, etc.
  }
}
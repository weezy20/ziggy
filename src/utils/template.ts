import { existsSync, rmSync, mkdirSync, createWriteStream, readdirSync, renameSync } from 'fs';
import { resolve, join } from 'path';
import { extract as extractZip } from 'zip-lib';
import { colors } from './colors';

// Lean Zig app template without the bloat
const LEAN_ZIG_APP_TEMPLATE_ARCHIVE = 'https://codeload.github.com/weezy20/zig-app-template/zip/refs/heads/master';


export async function cloneTemplateRepository(
  targetPath: string, 
  onProgress?: (message: string) => void
): Promise<void> {
  const absolutePath = resolve(targetPath);
  
  // Check if target directory already exists
  if (existsSync(absolutePath)) {
    throw new Error(`Directory ${targetPath} already exists`);
  }

  console.log("🖥️  " + colors.blue(`Downloading lean Zig app template...`));
  
  try {
    onProgress?.('Downloading template...');
    
    // Download the zip archive
    const response = await fetch(LEAN_ZIG_APP_TEMPLATE_ARCHIVE);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    onProgress?.('Extracting template...');
    
    // Create a temporary file for the zip
    const tempDir = join(process.cwd(), '.tmp');
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    
    const zipPath = join(tempDir, 'template.zip');
    const writer = createWriteStream(zipPath);
    
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
    if (existsSync(extractedDir)) {
      // Create target directory
      mkdirSync(absolutePath, { recursive: true });
      
      // Move all contents from extracted directory to target
      const files = readdirSync(extractedDir);
      
      for (const file of files) {
        const srcPath = join(extractedDir, file);
        const destPath = join(absolutePath, file);
        renameSync(srcPath, destPath);
      }
    } else {
      throw new Error('Failed to find extracted template directory');
    }
    
    // Clean up temporary files
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    
  } catch (error) {
    // Clean up if download failed and directory was created
    if (existsSync(absolutePath)) {
      try {
        rmSync(absolutePath, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn(colors.yellow(`⚠ Failed to clean up directory: ${cleanupError}`));
      }
    }
    
    // Clean up temp directory
    const tempDir = join(process.cwd(), '.tmp');
    if (existsSync(tempDir)) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn(colors.yellow(`⚠ Failed to clean up temp directory: ${cleanupError}`));
      }
    }
    
    throw new Error(`Failed to download template: ${error}`);
  }
}

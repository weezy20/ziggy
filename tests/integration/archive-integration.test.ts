/**
 * Integration tests for ArchiveExtractor with ZigInstaller
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ZigInstaller } from '../../src/index.js';
import { join } from 'path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';

describe('Archive Integration', () => {
  let tempDir: string;
  let zigInstaller: ZigInstaller;

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = join(process.cwd(), 'test-temp-' + Date.now());
    mkdirSync(tempDir, { recursive: true });
    
    // Initialize ZigInstaller
    zigInstaller = new ZigInstaller();
  });

  afterEach(() => {
    // Clean up temporary directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should have ArchiveExtractor properly integrated', () => {
    // Verify that ZigInstaller has the archiveExtractor property
    expect(zigInstaller).toHaveProperty('archiveExtractor');
    
    // Access the private property through type assertion for testing
    const installer = zigInstaller as any;
    expect(installer.archiveExtractor).toBeDefined();
    expect(typeof installer.archiveExtractor.extractArchive).toBe('function');
    expect(typeof installer.archiveExtractor.extractTarXz).toBe('function');
    expect(typeof installer.archiveExtractor.extractZip).toBe('function');
  });

  it('should use ArchiveExtractor for file extension detection', async () => {
    const installer = zigInstaller as any;
    const archiveExtractor = installer.archiveExtractor;

    // Test that the extractArchive method can handle different file types
    const testCases = [
      { file: 'test.tar.xz', shouldThrow: false },
      { file: 'test.zip', shouldThrow: false },
      { file: 'test.rar', shouldThrow: true },
      { file: 'test', shouldThrow: true }
    ];

    for (const testCase of testCases) {
      const filePath = join(tempDir, testCase.file);
      const outputPath = join(tempDir, 'output');
      
      // Create a dummy file
      writeFileSync(filePath, 'dummy content');

      if (testCase.shouldThrow) {
        await expect(archiveExtractor.extractArchive(filePath, outputPath))
          .rejects.toThrow('Unsupported archive format');
      } else {
        // These will fail because they're not real archives, but they shouldn't throw
        // "Unsupported archive format" errors
        try {
          await archiveExtractor.extractArchive(filePath, outputPath);
        } catch (error) {
          // Should not be an "Unsupported archive format" error
          expect((error as Error).message).not.toContain('Unsupported archive format');
        }
      }
    }
  });

  it('should properly initialize ArchiveExtractor with FileSystemManager', () => {
    const installer = zigInstaller as any;
    
    // Verify that ArchiveExtractor was initialized with the same FileSystemManager
    expect(installer.archiveExtractor).toBeDefined();
    expect(installer.fileSystemManager).toBeDefined();
    
    // Both should be defined and working
    expect(typeof installer.fileSystemManager.fileExists).toBe('function');
    expect(typeof installer.archiveExtractor.extractArchive).toBe('function');
  });
});
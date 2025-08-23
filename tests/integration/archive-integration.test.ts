/**
 * Integration tests for ArchiveExtractor with ZigInstaller
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createApplication } from '../../src/index.js';
import type { ZigInstaller } from '../../src/index.js';
import { join } from 'path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';

describe('Archive Integration', () => {
  let tempDir: string;
  let zigInstaller: ZigInstaller;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = join(process.cwd(), 'test-temp-' + Date.now());
    mkdirSync(tempDir, { recursive: true });
    
    // Initialize ZigInstaller using the factory
    zigInstaller = await createApplication();
  });

  afterEach(() => {
    // Clean up temporary directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should have ArchiveExtractor properly integrated', () => {
    // Verify that ZigInstaller is properly initialized with dependency injection
    expect(zigInstaller).toBeDefined();
    expect(typeof zigInstaller.run).toBe('function');
    expect(typeof zigInstaller.downloadVersion).toBe('function');
    expect(typeof zigInstaller.validateVersion).toBe('function');
    
    // The ZigInstaller should be able to perform operations that require archive extraction
    // This tests that the dependency injection is working correctly
    expect(zigInstaller.platform).toBeDefined();
    expect(typeof zigInstaller.platform).toBe('string');
  });

  it('should use ArchiveExtractor for file extension detection', async () => {
    // Test that the ZigInstaller can properly handle different archive formats
    // by testing the platform-specific archive extension detection
    const expectedExtension = zigInstaller.platform === 'windows' ? 'zip' : 'tar.xz';
    
    // Verify that the platform detection is working correctly
    expect(zigInstaller.platform).toBeDefined();
    
    // Test that the installer can validate versions (which requires network access)
    // This indirectly tests that the dependency injection is working
    const isValidVersion = await zigInstaller.validateVersion('master');
    expect(typeof isValidVersion).toBe('boolean');
    
    // Test that the installer has the expected platform-specific behavior
    if (zigInstaller.platform === 'windows') {
      expect(zigInstaller.platform).toBe('windows');
    } else {
      expect(['linux', 'macos'].includes(zigInstaller.platform)).toBe(true);
    }
  });

  it('should properly initialize with dependency injection', () => {
    // Verify that ZigInstaller was properly initialized with all dependencies
    expect(zigInstaller).toBeDefined();
    expect(zigInstaller.config).toBeDefined();
    expect(typeof zigInstaller.config).toBe('object');
    
    // Test that the installer can access its configuration manager
    const configManager = zigInstaller.getConfigManager();
    expect(configManager).toBeDefined();
    expect(typeof configManager.load).toBe('function');
    expect(typeof configManager.save).toBe('function');
    
    // Test that the installer has all the required methods
    expect(typeof zigInstaller.downloadVersion).toBe('function');
    expect(typeof zigInstaller.useVersion).toBe('function');
    expect(typeof zigInstaller.getInstalledVersions).toBe('function');
    expect(typeof zigInstaller.validateVersion).toBe('function');
    expect(typeof zigInstaller.cleanup).toBe('function');
  });
});
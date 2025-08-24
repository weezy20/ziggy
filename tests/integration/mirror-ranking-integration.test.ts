/**
 * Integration tests for mirror ranking and selection
 * Tests the complete flow of mirror management with real file operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { MirrorsManager } from '../../src/core/mirrors.js';
import { MirrorConfigManager } from '../../src/utils/mirror-config.js';
import type { IConfigManager } from '../../src/interfaces.js';
import type { MirrorsConfig } from '../../src/types.js';

describe('Mirror Ranking Integration Tests', () => {
  let tempDir: string;
  let mirrorsManager: MirrorsManager;
  let configManager: MirrorConfigManager;
  let mockConfigManager: IConfigManager;

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = join(tmpdir(), `ziggy-mirror-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    
    // Create config manager with custom temp directory
    configManager = new MirrorConfigManager(join(tempDir, '.ziggy'));
    
    // Mock the main config manager (not used in these tests)
    mockConfigManager = {
      load: () => ({}),
      save: () => {},
      scanExistingInstallations: () => ({})
    };

    mirrorsManager = new MirrorsManager(mockConfigManager);
  });

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should handle complete mirror ranking workflow', () => {
    // 1. Start with empty configuration
    expect(configManager.configExists()).toBe(false);
    
    // 2. Load config (should create default)
    let config = configManager.loadConfig();
    expect(config.mirrors).toHaveLength(0);
    expect(configManager.configExists()).toBe(true);
    
    // 3. Add some mirrors manually
    config = configManager.addOrUpdateMirror(config, 'https://mirror1.example.com', 1);
    config = configManager.addOrUpdateMirror(config, 'https://mirror2.example.com', 1);
    config = configManager.addOrUpdateMirror(config, 'https://mirror3.example.com', 1);
    configManager.saveConfig(config);
    
    // 4. Test that we can load and save configurations
    const loadedConfig = configManager.loadConfig();
    expect(loadedConfig.mirrors).toHaveLength(3);
    
    // 5. Test manual rank updates
    let updatedConfig = configManager.addOrUpdateMirror(loadedConfig, 'https://mirror1.example.com', 3);
    updatedConfig = configManager.addOrUpdateMirror(updatedConfig, 'https://mirror2.example.com', 3);
    configManager.saveConfig(updatedConfig);
    
    // 6. Verify ranks were updated correctly
    const finalConfig = configManager.loadConfig();
    const mirror1 = finalConfig.mirrors.find(m => m.url === 'https://mirror1.example.com');
    const mirror2 = finalConfig.mirrors.find(m => m.url === 'https://mirror2.example.com');
    const mirror3 = finalConfig.mirrors.find(m => m.url === 'https://mirror3.example.com');
    
    expect(mirror1?.rank).toBe(3);
    expect(mirror2?.rank).toBe(3);
    expect(mirror3?.rank).toBe(1); // unchanged
    
    // 7. Test that configuration persists across loads
    const reloadedConfig = configManager.loadConfig();
    expect(reloadedConfig.mirrors).toHaveLength(3);
    expect(reloadedConfig.mirrors.find(m => m.url === 'https://mirror3.example.com')?.rank).toBe(1);
  });

  it('should reject non-HTTPS URLs in configuration', () => {
    // Test that non-HTTPS URLs are rejected when saving configuration
    expect(() => {
      const configWithInsecureUrl: MirrorsConfig = {
        mirrors: [
          { url: 'https://secure.example.com', rank: 1 },
          { url: 'http://insecure.example.com', rank: 1 }
        ],
        last_synced: new Date().toISOString()
      };
      configManager.saveConfig(configWithInsecureUrl);
    }).toThrow('URL must use HTTPS protocol');
    
    // Test that only HTTPS URLs are accepted
    const validConfig: MirrorsConfig = {
      mirrors: [
        { url: 'https://secure.example.com', rank: 1 }
      ],
      last_synced: new Date().toISOString()
    };
    
    // This should not throw
    configManager.saveConfig(validConfig);
    
    const loadedConfig = configManager.loadConfig();
    expect(loadedConfig.mirrors).toHaveLength(1);
    expect(loadedConfig.mirrors[0]?.url).toBe('https://secure.example.com');
  });

  it('should validate mirror configuration structure', () => {
    // Test that configuration validation works correctly
    const validConfig: MirrorsConfig = {
      mirrors: [
        { url: 'https://mirror1.example.com', rank: 1 },
        { url: 'https://mirror2.example.com', rank: 5 }
      ],
      last_synced: new Date().toISOString()
    };
    
    // Should save and load without issues
    configManager.saveConfig(validConfig);
    const loadedConfig = configManager.loadConfig();
    
    expect(loadedConfig.mirrors).toHaveLength(2);
    expect(loadedConfig.mirrors[0]?.rank).toBe(1);
    expect(loadedConfig.mirrors[1]?.rank).toBe(5);
    
    // Test invalid rank
    expect(() => {
      const invalidConfig: MirrorsConfig = {
        mirrors: [
          { url: 'https://mirror.example.com', rank: 0 } // Invalid rank
        ],
        last_synced: new Date().toISOString()
      };
      configManager.saveConfig(invalidConfig);
    }).toThrow('rank must be a positive number');
    
    // Test invalid timestamp
    expect(() => {
      const invalidConfig: MirrorsConfig = {
        mirrors: [],
        last_synced: 'invalid-timestamp'
      };
      configManager.saveConfig(invalidConfig);
    }).toThrow('must be a valid ISO 8601 timestamp');
  });
});
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { MirrorConfigManager } from '../../src/utils/mirror-config.js';
import type { MirrorsConfig } from '../../src/types.js';

describe('MirrorConfigManager Integration Tests', () => {
  let tempDir: string;
  let configManager: MirrorConfigManager;

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = join(tmpdir(), `ziggy-integration-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    
    // Create config manager with custom directory
    configManager = new MirrorConfigManager(join(tempDir, '.ziggy'));
  });

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should handle complete workflow: create, load, modify, save', () => {
    // 1. Load config (should create default)
    const initialConfig = configManager.loadConfig();
    expect(initialConfig.mirrors).toHaveLength(0);
    expect(configManager.configExists()).toBe(true);

    // 2. Add some mirrors
    let config = configManager.addOrUpdateMirror(
      initialConfig, 
      'https://mirror1.example.com/zig/', 
      1
    );
    config = configManager.addOrUpdateMirror(
      config, 
      'https://mirror2.example.com/zig/', 
      2
    );

    // 3. Update last synced timestamp
    config = configManager.updateLastSynced(config);

    // 4. Save the updated config
    configManager.saveConfig(config);

    // 5. Load again and verify persistence
    const reloadedConfig = configManager.loadConfig();
    expect(reloadedConfig.mirrors).toHaveLength(2);
    expect(reloadedConfig.mirrors[0].url).toBe('https://mirror1.example.com/zig/');
    expect(reloadedConfig.mirrors[1].url).toBe('https://mirror2.example.com/zig/');

    // 6. Verify TOML file content is valid
    const configPath = configManager.getConfigPath();
    const tomlContent = readFileSync(configPath, 'utf-8');
    
    expect(tomlContent).toContain('last_synced');
    expect(tomlContent).toContain('[[mirrors]]');
    expect(tomlContent).toContain('https://mirror1.example.com/zig/');
    expect(tomlContent).toContain('https://mirror2.example.com/zig/');
    expect(tomlContent).toContain('rank = 1');
    expect(tomlContent).toContain('rank = 2');
  });

  it('should handle corrupted TOML file gracefully', () => {
    // Create a corrupted TOML file
    const configPath = configManager.getConfigPath();
    const configDir = join(tempDir, '.ziggy');
    mkdirSync(configDir, { recursive: true });
    
    // Write invalid TOML content
    require('fs').writeFileSync(configPath, 'invalid toml content [[[', 'utf-8');
    
    // Loading should create a new default config
    const config = configManager.loadConfig();
    expect(config.mirrors).toHaveLength(0);
    expect(typeof config.last_synced).toBe('string');
    
    // File should now contain valid TOML
    const tomlContent = readFileSync(configPath, 'utf-8');
    expect(tomlContent).toContain('last_synced');
    expect(tomlContent).toContain('mirrors = []');
  });

  it('should validate HTTPS requirement during operations', () => {
    const config = configManager.loadConfig();
    
    // Adding non-HTTPS mirror should fail
    expect(() => {
      configManager.addOrUpdateMirror(config, 'http://insecure.example.com/zig/', 1);
    }).toThrow('Mirror URL must use HTTPS protocol');
    
    // Saving config with non-HTTPS mirror should fail
    const invalidConfig: MirrorsConfig = {
      mirrors: [{ url: 'ftp://old-protocol.example.com/zig/', rank: 1 }],
      last_synced: new Date().toISOString()
    };
    
    expect(() => {
      configManager.saveConfig(invalidConfig);
    }).toThrow('URL must use HTTPS protocol');
  });

  it('should handle concurrent access safely', () => {
    // This test simulates potential race conditions
    const config1 = configManager.loadConfig();
    const config2 = configManager.loadConfig();
    
    // Modify both configs differently
    const modifiedConfig1 = configManager.addOrUpdateMirror(
      config1, 
      'https://mirror1.example.com/zig/', 
      1
    );
    
    const modifiedConfig2 = configManager.addOrUpdateMirror(
      config2, 
      'https://mirror2.example.com/zig/', 
      1
    );
    
    // Save both (last one wins)
    configManager.saveConfig(modifiedConfig1);
    configManager.saveConfig(modifiedConfig2);
    
    // Verify the final state
    const finalConfig = configManager.loadConfig();
    expect(finalConfig.mirrors).toHaveLength(1);
    expect(finalConfig.mirrors[0].url).toBe('https://mirror2.example.com/zig/');
  });
});
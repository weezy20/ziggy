import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { MirrorConfigManager } from '../../src/utils/mirror-config.js';
import type { MirrorsConfig } from '../../src/types.js';

describe('MirrorConfigManager', () => {
  let tempDir: string;
  let configManager: MirrorConfigManager;


  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = join(tmpdir(), `ziggy-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    
    // Create new config manager instance with custom config dir
    configManager = new MirrorConfigManager(join(tempDir, '.ziggy'));
  });

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('getConfigPath', () => {
    it('should return correct path to mirrors.toml', () => {
      const path = configManager.getConfigPath();
      expect(path).toBe(join(tempDir, '.ziggy', 'mirrors.toml'));
    });
  });

  describe('configExists', () => {
    it('should return false when config does not exist', () => {
      expect(configManager.configExists()).toBe(false);
    });

    it('should return true when config exists', () => {
      const config = configManager.createDefaultConfig();
      configManager.saveConfig(config);
      expect(configManager.configExists()).toBe(true);
    });
  });

  describe('createDefaultConfig', () => {
    it('should create valid default configuration', () => {
      const config = configManager.createDefaultConfig();
      
      expect(config).toHaveProperty('mirrors');
      expect(config).toHaveProperty('last_synced');
      expect(Array.isArray(config.mirrors)).toBe(true);
      expect(config.mirrors).toHaveLength(0);
      expect(typeof config.last_synced).toBe('string');
      
      // Verify it's a valid ISO 8601 timestamp
      expect(() => new Date(config.last_synced)).not.toThrow();
    });
  });

  describe('loadConfig', () => {
    it('should create and return default config when file does not exist', () => {
      const config = configManager.loadConfig();
      
      expect(config.mirrors).toHaveLength(0);
      expect(typeof config.last_synced).toBe('string');
      expect(configManager.configExists()).toBe(true);
    });

    it('should load existing configuration', () => {
      const originalConfig: MirrorsConfig = {
        mirrors: [
          { url: 'https://mirror1.example.com/zig/', rank: 1 },
          { url: 'https://mirror2.example.com/zig/', rank: 2 }
        ],
        last_synced: '2024-08-24T10:30:00Z'
      };
      
      configManager.saveConfig(originalConfig);
      const loadedConfig = configManager.loadConfig();
      
      expect(loadedConfig).toEqual(originalConfig);
    });
  });

  describe('saveConfig', () => {
    it('should save valid configuration to file', () => {
      const config: MirrorsConfig = {
        mirrors: [
          { url: 'https://mirror.example.com/zig/', rank: 1 }
        ],
        last_synced: '2024-08-24T10:30:00Z'
      };
      
      configManager.saveConfig(config);
      expect(configManager.configExists()).toBe(true);
      
      const loadedConfig = configManager.loadConfig();
      expect(loadedConfig).toEqual(config);
    });

    it('should create .ziggy directory if it does not exist', () => {
      const config = configManager.createDefaultConfig();
      configManager.saveConfig(config);
      
      expect(existsSync(join(tempDir, '.ziggy'))).toBe(true);
    });

    it('should reject configuration with non-HTTPS URLs', () => {
      const config: MirrorsConfig = {
        mirrors: [
          { url: 'http://insecure.example.com/zig/', rank: 1 }
        ],
        last_synced: '2024-08-24T10:30:00Z'
      };
      
      expect(() => configManager.saveConfig(config)).toThrow('URL must use HTTPS protocol');
    });

    it('should reject configuration with invalid rank', () => {
      const config: MirrorsConfig = {
        mirrors: [
          { url: 'https://mirror.example.com/zig/', rank: 0 }
        ],
        last_synced: '2024-08-24T10:30:00Z'
      };
      
      expect(() => configManager.saveConfig(config)).toThrow('rank must be a positive number');
    });
  });

  describe('updateLastSynced', () => {
    it('should update last_synced timestamp', () => {
      const config: MirrorsConfig = {
        mirrors: [],
        last_synced: '2024-01-01T00:00:00Z'
      };
      
      const updatedConfig = configManager.updateLastSynced(config);
      
      expect(updatedConfig.mirrors).toEqual(config.mirrors);
      expect(updatedConfig.last_synced).not.toBe(config.last_synced);
      expect(new Date(updatedConfig.last_synced).getTime()).toBeGreaterThan(
        new Date(config.last_synced).getTime()
      );
    });
  });

  describe('addOrUpdateMirror', () => {
    it('should add new mirror', () => {
      const config: MirrorsConfig = {
        mirrors: [],
        last_synced: '2024-08-24T10:30:00Z'
      };
      
      const updatedConfig = configManager.addOrUpdateMirror(
        config, 
        'https://new-mirror.example.com/zig/', 
        1
      );
      
      expect(updatedConfig.mirrors).toHaveLength(1);
      expect(updatedConfig.mirrors[0]).toEqual({
        url: 'https://new-mirror.example.com/zig/',
        rank: 1
      });
    });

    it('should update existing mirror', () => {
      const config: MirrorsConfig = {
        mirrors: [
          { url: 'https://mirror.example.com/zig/', rank: 1 }
        ],
        last_synced: '2024-08-24T10:30:00Z'
      };
      
      const updatedConfig = configManager.addOrUpdateMirror(
        config, 
        'https://mirror.example.com/zig/', 
        5
      );
      
      expect(updatedConfig.mirrors).toHaveLength(1);
      expect(updatedConfig.mirrors[0].rank).toBe(5);
    });

    it('should reject non-HTTPS URLs', () => {
      const config = configManager.createDefaultConfig();
      
      expect(() => configManager.addOrUpdateMirror(
        config, 
        'http://insecure.example.com/zig/', 
        1
      )).toThrow('Mirror URL must use HTTPS protocol');
    });
  });

  describe('removeMirror', () => {
    it('should remove existing mirror', () => {
      const config: MirrorsConfig = {
        mirrors: [
          { url: 'https://mirror1.example.com/zig/', rank: 1 },
          { url: 'https://mirror2.example.com/zig/', rank: 2 }
        ],
        last_synced: '2024-08-24T10:30:00Z'
      };
      
      const updatedConfig = configManager.removeMirror(
        config, 
        'https://mirror1.example.com/zig/'
      );
      
      expect(updatedConfig.mirrors).toHaveLength(1);
      expect(updatedConfig.mirrors[0].url).toBe('https://mirror2.example.com/zig/');
    });

    it('should handle removing non-existent mirror gracefully', () => {
      const config: MirrorsConfig = {
        mirrors: [
          { url: 'https://mirror.example.com/zig/', rank: 1 }
        ],
        last_synced: '2024-08-24T10:30:00Z'
      };
      
      const updatedConfig = configManager.removeMirror(
        config, 
        'https://nonexistent.example.com/zig/'
      );
      
      expect(updatedConfig.mirrors).toHaveLength(1);
      expect(updatedConfig.mirrors[0].url).toBe('https://mirror.example.com/zig/');
    });
  });
});
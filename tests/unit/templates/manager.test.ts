/**
 * Unit tests for TemplateManager
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { TemplateManager } from '../../../src/templates/manager.js';

describe('TemplateManager', () => {
  let templateManager: TemplateManager;

  beforeEach(() => {
    templateManager = new TemplateManager();
  });

  describe('getAvailableTemplates', () => {
    it('should return available template names', () => {
      const templates = templateManager.getAvailableTemplates();
      
      expect(templates).toContain('barebones');
      expect(templates).toContain('minimal');
      expect(templates).toContain('standard');
      expect(templates).toContain('standard-minimal');
      expect(templates.length).toBe(4);
    });
  });

  describe('validateTemplate', () => {
    it('should validate existing templates', () => {
      expect(templateManager.validateTemplate('barebones')).toBe(true);
      expect(templateManager.validateTemplate('minimal')).toBe(true);
      expect(templateManager.validateTemplate('standard')).toBe(true);
      expect(templateManager.validateTemplate('standard-minimal')).toBe(true);
    });

    it('should reject non-existent templates', () => {
      expect(templateManager.validateTemplate('nonexistent')).toBe(false);
      expect(templateManager.validateTemplate('')).toBe(false);
      expect(templateManager.validateTemplate('lean')).toBe(false); // Old template name
    });
  });

  describe('getTemplateInfo', () => {
    it('should return template info for existing templates', () => {
      const standardInfo = templateManager.getTemplateInfo('standard');
      
      expect(standardInfo).toBeDefined();
      expect(standardInfo?.name).toBe('standard');
      expect(standardInfo?.displayName).toBe('Standard Zig template (zig init)');
      expect(standardInfo?.description).toBe('The standard `zig init` template');
      expect(standardInfo?.type).toBe('zig-init');
    });

    it('should return barebones template info correctly', () => {
      const barebonesInfo = templateManager.getTemplateInfo('barebones');
      
      expect(barebonesInfo).toBeDefined();
      expect(barebonesInfo?.name).toBe('barebones');
      expect(barebonesInfo?.displayName).toBe('Barebones Project (main.zig & build.zig)');
      expect(barebonesInfo?.description).toBe('just enough to `zig build run`');
      expect(barebonesInfo?.type).toBe('cached');
      expect(barebonesInfo?.cacheUrl).toContain('githubusercontent.com');
    });

    it('should return undefined for non-existent templates', () => {
      const info = templateManager.getTemplateInfo('nonexistent');
      expect(info).toBeUndefined();
    });
  });

  describe('getAllTemplateInfo', () => {
    it('should return all template information', () => {
      const allTemplates = templateManager.getAllTemplateInfo();
      
      expect(allTemplates.length).toBe(4);
      
      const barebonesTemplate = allTemplates.find(t => t.name === 'barebones');
      const minimalTemplate = allTemplates.find(t => t.name === 'minimal');
      const standardTemplate = allTemplates.find(t => t.name === 'standard');
      const standardMinimalTemplate = allTemplates.find(t => t.name === 'standard-minimal');
      
      expect(barebonesTemplate).toBeDefined();
      expect(minimalTemplate).toBeDefined();
      expect(standardTemplate).toBeDefined();
      expect(standardMinimalTemplate).toBeDefined();
      
      expect(barebonesTemplate?.displayName).toBe('Barebones Project (main.zig & build.zig)');
      expect(minimalTemplate?.displayName).toBe('Minimal Project with testing harness');
      expect(standardTemplate?.displayName).toBe('Standard Zig template (zig init)');
      expect(standardMinimalTemplate?.displayName).toBe('Standard Zig template minimal (zig init -m)');
    });

    it('should return templates in correct order', () => {
      const allTemplates = templateManager.getAllTemplateInfo();
      const templateNames = allTemplates.map(t => t.name);
      
      expect(templateNames).toEqual(['barebones', 'minimal', 'standard', 'standard-minimal']);
    });
  });

  describe('createProject', () => {
    it('should throw error when called directly', () => {
      expect(() => {
        templateManager.createProject('standard', 'test-project', '/tmp/test');
      }).toThrow('createProject should be called through ProjectCreator');
    });

    it('should throw error for invalid template', () => {
      expect(() => {
        templateManager.createProject('invalid', 'test-project', '/tmp/test');
      }).toThrow("Template 'invalid' not found");
    });
  });
});
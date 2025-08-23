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
      
      expect(templates).toContain('standard');
      expect(templates).toContain('lean');
      expect(templates.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('validateTemplate', () => {
    it('should validate existing templates', () => {
      expect(templateManager.validateTemplate('standard')).toBe(true);
      expect(templateManager.validateTemplate('lean')).toBe(true);
    });

    it('should reject non-existent templates', () => {
      expect(templateManager.validateTemplate('nonexistent')).toBe(false);
      expect(templateManager.validateTemplate('')).toBe(false);
    });
  });

  describe('getTemplateInfo', () => {
    it('should return template info for existing templates', () => {
      const standardInfo = templateManager.getTemplateInfo('standard');
      
      expect(standardInfo).toBeDefined();
      expect(standardInfo?.name).toBe('standard');
      expect(standardInfo?.displayName).toBe('Standard Zig App');
      expect(standardInfo?.description).toContain('lean Zig application');
      expect(standardInfo?.url).toContain('github.com');
    });

    it('should return undefined for non-existent templates', () => {
      const info = templateManager.getTemplateInfo('nonexistent');
      expect(info).toBeUndefined();
    });
  });

  describe('getAllTemplateInfo', () => {
    it('should return all template information', () => {
      const allTemplates = templateManager.getAllTemplateInfo();
      
      expect(allTemplates.length).toBeGreaterThanOrEqual(2);
      
      const standardTemplate = allTemplates.find(t => t.name === 'standard');
      const leanTemplate = allTemplates.find(t => t.name === 'lean');
      
      expect(standardTemplate).toBeDefined();
      expect(leanTemplate).toBeDefined();
      
      expect(standardTemplate?.displayName).toBe('Standard Zig App');
      expect(leanTemplate?.displayName).toBe('Lean Project');
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
import { describe, it, expect } from 'vitest';
import {
  validateProjectName,
  validateVersionString,
  validatePath,
  validateRequired,
  validateNumber,
  combineValidators
} from '../../../../src/cli/prompts/validators';

describe('prompt utilities', () => {
  describe('validateProjectName', () => {
    it('should accept valid project names', () => {
      expect(validateProjectName('my-project')).toBeUndefined();
      expect(validateProjectName('my_project')).toBeUndefined();
      expect(validateProjectName('project123')).toBeUndefined();
      expect(validateProjectName('MyProject')).toBeUndefined();
    });

    it('should reject invalid project names', () => {
      expect(validateProjectName('')).toBe('Project name is required');
      expect(validateProjectName('my project')).toBe('Project name can only contain letters, numbers, underscores, and hyphens');
      expect(validateProjectName('-project')).toBe('Project name cannot start with a hyphen or underscore');
    });
  });

  describe('validateVersionString', () => {
    it('should accept valid version strings', () => {
      expect(validateVersionString('0.11.0')).toBeUndefined();
      expect(validateVersionString('0.12.0-dev.1')).toBeUndefined();
      expect(validateVersionString('master')).toBeUndefined();
      expect(validateVersionString('system')).toBeUndefined();
    });

    it('should reject invalid version strings', () => {
      expect(validateVersionString('')).toBe('Version is required');
      expect(validateVersionString('1.0')).toBe('Version must be in format X.Y.Z, X.Y.Z-dev.N, or "master"');
      expect(validateVersionString('invalid')).toBe('Version must be in format X.Y.Z, X.Y.Z-dev.N, or "master"');
    });
  });

  describe('validatePath', () => {
    it('should accept valid paths', () => {
      expect(validatePath('/valid/path')).toBeUndefined();
      expect(validatePath('relative/path')).toBeUndefined();
    });

    it('should reject invalid paths', () => {
      expect(validatePath('')).toBe('Path is required');
      const longPath = 'a'.repeat(261);
      expect(validatePath(longPath)).toBe('Path is too long (maximum 260 characters)');
    });
  });

  describe('validateRequired', () => {
    it('should accept non-empty strings', () => {
      expect(validateRequired('valid')).toBeUndefined();
      expect(validateRequired('  valid  ')).toBeUndefined();
    });

    it('should reject empty strings', () => {
      expect(validateRequired('')).toBe('This field is required');
      expect(validateRequired('   ')).toBe('This field is required');
    });
  });

  describe('validateNumber', () => {
    it('should accept valid numbers', () => {
      expect(validateNumber('123')).toBeUndefined();
      expect(validateNumber('123.45')).toBeUndefined();
      expect(validateNumber('-123')).toBeUndefined();
    });

    it('should reject invalid numbers', () => {
      expect(validateNumber('')).toBe('Number is required');
      expect(validateNumber('not-a-number')).toBe('Must be a valid number');
      expect(validateNumber('5', 10)).toBe('Number must be at least 10');
    });
  });

  describe('combineValidators', () => {
    it('should combine multiple validators', () => {
      const validator1 = (value: string) => value.length < 3 ? 'Too short' : undefined;
      const validator2 = (value: string) => value.includes('bad') ? 'Contains bad word' : undefined;
      
      const combined = combineValidators(validator1, validator2);
      
      expect(combined('ab')).toBe('Too short');
      expect(combined('bad word')).toBe('Contains bad word');
      expect(combined('good')).toBeUndefined();
    });
  });
});
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateProjectName,
  validateVersionString,
  validatePath,
  validateDirectoryName,
  validateUrl,
  validateRequired,
  validateNumber,
  validatePositiveInteger,
  combineValidators,
  validateInList,
  validateLength,
  validatePattern
} from '../../../../src/cli/prompts/validators';

describe('validators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateProjectName', () => {
    it('should accept valid project names', () => {
      expect(validateProjectName('my-project')).toBeUndefined();
      expect(validateProjectName('my_project')).toBeUndefined();
      expect(validateProjectName('project123')).toBeUndefined();
      expect(validateProjectName('MyProject')).toBeUndefined();
      expect(validateProjectName('a')).toBeUndefined();
    });

    it('should reject empty or whitespace-only names', () => {
      expect(validateProjectName('')).toBe('Project name is required');
      expect(validateProjectName('   ')).toBe('Project name is required');
    });

    it('should reject names with invalid characters', () => {
      expect(validateProjectName('my project')).toBe('Project name can only contain letters, numbers, underscores, and hyphens');
      expect(validateProjectName('my@project')).toBe('Project name can only contain letters, numbers, underscores, and hyphens');
      expect(validateProjectName('my.project')).toBe('Project name can only contain letters, numbers, underscores, and hyphens');
    });

    it('should reject names that are too long', () => {
      const longName = 'a'.repeat(101);
      expect(validateProjectName(longName)).toBe('Project name must be less than 100 characters long');
    });

    it('should reject reserved names', () => {
      expect(validateProjectName('con')).toBe('"con" is a reserved name and cannot be used');
      expect(validateProjectName('CON')).toBe('"CON" is a reserved name and cannot be used');
      expect(validateProjectName('prn')).toBe('"prn" is a reserved name and cannot be used');
    });

    it('should reject names starting or ending with special characters', () => {
      expect(validateProjectName('-project')).toBe('Project name cannot start with a hyphen or underscore');
      expect(validateProjectName('_project')).toBe('Project name cannot start with a hyphen or underscore');
      expect(validateProjectName('project-')).toBe('Project name cannot end with a hyphen or underscore');
      expect(validateProjectName('project_')).toBe('Project name cannot end with a hyphen or underscore');
    });
  });

  describe('validateVersionString', () => {
    it('should accept valid version strings', () => {
      expect(validateVersionString('0.11.0')).toBeUndefined();
      expect(validateVersionString('0.12.0-dev.1')).toBeUndefined();
      expect(validateVersionString('0.13.0-dev.123+abc123')).toBeUndefined();
      expect(validateVersionString('master')).toBeUndefined();
      expect(validateVersionString('system')).toBeUndefined();
    });

    it('should reject empty versions', () => {
      expect(validateVersionString('')).toBe('Version is required');
      expect(validateVersionString('   ')).toBe('Version is required');
    });

    it('should reject invalid version formats', () => {
      expect(validateVersionString('1.0')).toBe('Version must be in format X.Y.Z, X.Y.Z-dev.N, or "master"');
      expect(validateVersionString('v1.0.0')).toBe('Version must be in format X.Y.Z, X.Y.Z-dev.N, or "master"');
      expect(validateVersionString('1.0.0.0')).toBe('Version must be in format X.Y.Z, X.Y.Z-dev.N, or "master"');
      expect(validateVersionString('invalid')).toBe('Version must be in format X.Y.Z, X.Y.Z-dev.N, or "master"');
    });
  });

  describe('validatePath', () => {
    it('should accept valid paths', () => {
      expect(validatePath('/valid/path')).toBeUndefined();
      expect(validatePath('relative/path')).toBeUndefined();
      
      // Mock Windows platform for this test
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(validatePath('C:\\Windows\\Path')).toBeUndefined();
      // Restore original platform
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should reject empty paths', () => {
      expect(validatePath('')).toBe('Path is required');
      expect(validatePath('   ')).toBe('Path is required');
    });

    it('should reject paths that are too long', () => {
      const longPath = 'a'.repeat(261);
      expect(validatePath(longPath)).toBe('Path is too long (maximum 260 characters)');
    });

    it('should reject paths with invalid characters on Windows', () => {
      // Mock Windows platform
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      expect(validatePath('path<with>invalid')).toBe('Path contains invalid characters');
      expect(validatePath('path|with|pipes')).toBe('Path contains invalid characters');
      expect(validatePath('path"with"quotes')).toBe('Path contains invalid characters');

      // Restore original platform
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe('validateDirectoryName', () => {
    it('should accept valid directory names', () => {
      expect(validateDirectoryName('valid-dir')).toBeUndefined();
      expect(validateDirectoryName('valid_dir')).toBeUndefined();
      expect(validateDirectoryName('ValidDir123')).toBeUndefined();
    });

    it('should reject empty directory names', () => {
      expect(validateDirectoryName('')).toBe('Directory name is required');
      expect(validateDirectoryName('   ')).toBe('Directory name is required');
    });

    it('should reject current and parent directory references', () => {
      expect(validateDirectoryName('.')).toBe('Cannot use "." or ".." as directory name');
      expect(validateDirectoryName('..')).toBe('Cannot use "." or ".." as directory name');
    });

    it('should reject names that are too long', () => {
      const longName = 'a'.repeat(256);
      expect(validateDirectoryName(longName)).toBe('Directory name is too long (maximum 255 characters)');
    });

    it('should reject reserved names on Windows', () => {
      // Mock Windows platform
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      expect(validateDirectoryName('con')).toBe('"con" is a reserved name and cannot be used');
      expect(validateDirectoryName('CON')).toBe('"CON" is a reserved name and cannot be used');

      // Restore original platform
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe('validateUrl', () => {
    it('should accept valid URLs', () => {
      expect(validateUrl('https://example.com')).toBeUndefined();
      expect(validateUrl('http://example.com/path')).toBeUndefined();
      expect(validateUrl('https://api.example.com/v1/data')).toBeUndefined();
    });

    it('should reject empty URLs', () => {
      expect(validateUrl('')).toBe('URL is required');
      expect(validateUrl('   ')).toBe('URL is required');
    });

    it('should reject invalid URL formats', () => {
      expect(validateUrl('not-a-url')).toBe('Invalid URL format');
      expect(validateUrl('ftp://example.com')).toBe('URL must use http or https protocol');
      expect(validateUrl('file:///path/to/file')).toBe('URL must use http or https protocol');
    });
  });

  describe('validateRequired', () => {
    it('should accept non-empty strings', () => {
      expect(validateRequired('valid')).toBeUndefined();
      expect(validateRequired('  valid  ')).toBeUndefined();
    });

    it('should reject empty or whitespace-only strings', () => {
      expect(validateRequired('')).toBe('This field is required');
      expect(validateRequired('   ')).toBe('This field is required');
    });
  });

  describe('validateNumber', () => {
    it('should accept valid numbers', () => {
      expect(validateNumber('123')).toBeUndefined();
      expect(validateNumber('123.45')).toBeUndefined();
      expect(validateNumber('-123')).toBeUndefined();
      expect(validateNumber('0')).toBeUndefined();
    });

    it('should reject empty or invalid numbers', () => {
      expect(validateNumber('')).toBe('Number is required');
      expect(validateNumber('not-a-number')).toBe('Must be a valid number');
      expect(validateNumber('123abc')).toBe('Must be a valid number');
    });

    it('should enforce min/max constraints', () => {
      expect(validateNumber('5', 10)).toBe('Number must be at least 10');
      expect(validateNumber('15', 0, 10)).toBe('Number must be at most 10');
      expect(validateNumber('5', 0, 10)).toBeUndefined();
    });
  });

  describe('validatePositiveInteger', () => {
    it('should accept positive integers', () => {
      expect(validatePositiveInteger('1')).toBeUndefined();
      expect(validatePositiveInteger('123')).toBeUndefined();
      expect(validatePositiveInteger('999')).toBeUndefined();
    });

    it('should reject non-positive numbers', () => {
      expect(validatePositiveInteger('0')).toBe('Number must be at least 1');
      expect(validatePositiveInteger('-1')).toBe('Number must be at least 1');
    });

    it('should reject non-integers', () => {
      expect(validatePositiveInteger('1.5')).toBe('Must be a whole number');
      // Note: 1.0 is technically an integer in JavaScript, so we test with 1.1
      expect(validatePositiveInteger('1.1')).toBe('Must be a whole number');
    });
  });

  describe('combineValidators', () => {
    it('should combine multiple validators', () => {
      const validator1 = vi.fn().mockReturnValue(undefined);
      const validator2 = vi.fn().mockReturnValue('Error from validator2');
      const validator3 = vi.fn();

      const combined = combineValidators(validator1, validator2, validator3);
      const result = combined('test-value');

      expect(validator1).toHaveBeenCalledWith('test-value');
      expect(validator2).toHaveBeenCalledWith('test-value');
      expect(validator3).not.toHaveBeenCalled(); // Should stop at first error
      expect(result).toBe('Error from validator2');
    });

    it('should return undefined when all validators pass', () => {
      const validator1 = vi.fn().mockReturnValue(undefined);
      const validator2 = vi.fn().mockReturnValue(undefined);

      const combined = combineValidators(validator1, validator2);
      const result = combined('test-value');

      expect(result).toBeUndefined();
    });
  });

  describe('validateInList', () => {
    it('should accept values in the allowed list', () => {
      const validator = validateInList(['option1', 'option2', 'option3']);
      
      expect(validator('option1')).toBeUndefined();
      expect(validator('option2')).toBeUndefined();
      expect(validator('option3')).toBeUndefined();
    });

    it('should reject values not in the allowed list', () => {
      const validator = validateInList(['option1', 'option2']);
      
      expect(validator('option3')).toBe('Value must be one of: option1, option2');
      expect(validator('invalid')).toBe('Value must be one of: option1, option2');
    });

    it('should handle case sensitivity', () => {
      const caseSensitive = validateInList(['Option1', 'Option2'], true);
      const caseInsensitive = validateInList(['Option1', 'Option2'], false);
      
      expect(caseSensitive('option1')).toBe('Value must be one of: Option1, Option2');
      expect(caseInsensitive('option1')).toBeUndefined();
    });

    it('should reject empty values', () => {
      const validator = validateInList(['option1', 'option2']);
      
      expect(validator('')).toBe('Value is required');
      expect(validator('   ')).toBe('Value is required');
    });
  });

  describe('validateLength', () => {
    it('should accept strings within length constraints', () => {
      const validator = validateLength(3, 10);
      
      expect(validator('abc')).toBeUndefined();
      expect(validator('abcdefghij')).toBeUndefined();
      expect(validator('hello')).toBeUndefined();
    });

    it('should reject strings that are too short', () => {
      const validator = validateLength(5);
      
      expect(validator('abc')).toBe('Must be at least 5 characters long');
    });

    it('should reject strings that are too long', () => {
      const validator = validateLength(0, 5);
      
      expect(validator('abcdefg')).toBe('Must be at most 5 characters long');
    });

    it('should handle empty strings with min length', () => {
      const validator = validateLength(1);
      
      expect(validator('')).toBe('Value is required');
    });

    it('should allow empty strings when no min length', () => {
      const validator = validateLength(undefined, 10);
      
      expect(validator('')).toBeUndefined();
    });
  });

  describe('validatePattern', () => {
    it('should accept strings matching the pattern', () => {
      const validator = validatePattern(/^[a-z]+$/, 'Must contain only lowercase letters');
      
      expect(validator('abc')).toBeUndefined();
      expect(validator('hello')).toBeUndefined();
    });

    it('should reject strings not matching the pattern', () => {
      const validator = validatePattern(/^[a-z]+$/, 'Must contain only lowercase letters');
      
      expect(validator('ABC')).toBe('Must contain only lowercase letters');
      expect(validator('abc123')).toBe('Must contain only lowercase letters');
    });

    it('should reject empty strings', () => {
      const validator = validatePattern(/^[a-z]+$/, 'Must contain only lowercase letters');
      
      expect(validator('')).toBe('Value is required');
      expect(validator('   ')).toBe('Value is required');
    });
  });
});
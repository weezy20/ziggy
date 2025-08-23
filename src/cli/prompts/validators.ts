/**
 * Input validation utilities for consistent user input handling
 */

/**
 * Validate project name input
 */
import process from "node:process";
export function validateProjectName(value: string): string | undefined {
  if (!value || value.trim().length === 0) {
    return 'Project name is required';
  }

  const trimmed = value.trim();

  // Check for valid characters (letters, numbers, underscores, hyphens)
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return 'Project name can only contain letters, numbers, underscores, and hyphens';
  }

  // Check length constraints
  if (trimmed.length < 1) {
    return 'Project name must be at least 1 character long';
  }

  if (trimmed.length > 100) {
    return 'Project name must be less than 100 characters long';
  }

  // Check for reserved names
  const reservedNames = ['con', 'prn', 'aux', 'nul', 'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9', 'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'];
  if (reservedNames.includes(trimmed.toLowerCase())) {
    return `"${trimmed}" is a reserved name and cannot be used`;
  }

  // Check for leading/trailing special characters
  if (trimmed.startsWith('-') || trimmed.startsWith('_')) {
    return 'Project name cannot start with a hyphen or underscore';
  }

  if (trimmed.endsWith('-') || trimmed.endsWith('_')) {
    return 'Project name cannot end with a hyphen or underscore';
  }

  return undefined;
}

/**
 * Validate version string input
 */
export function validateVersionString(value: string): string | undefined {
  if (!value || value.trim().length === 0) {
    return 'Version is required';
  }

  const trimmed = value.trim();

  // Allow 'master' as a special case
  if (trimmed === 'master') {
    return undefined;
  }

  // Allow 'system' as a special case
  if (trimmed === 'system') {
    return undefined;
  }

  // Basic semantic version pattern (flexible to allow various Zig version formats)
  // Matches patterns like: 0.11.0, 0.12.0-dev.1, 0.13.0-dev.123+abc123
  const versionPattern = /^(\d+)\.(\d+)\.(\d+)(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
  
  if (!versionPattern.test(trimmed)) {
    return 'Version must be in format X.Y.Z, X.Y.Z-dev.N, or "master"';
  }

  return undefined;
}

/**
 * Validate file path input
 */
export function validatePath(value: string): string | undefined {
  if (!value || value.trim().length === 0) {
    return 'Path is required';
  }

  const trimmed = value.trim();

  // Check for invalid characters (platform-specific)
  // On Windows, exclude colon from invalid chars for drive letters (C:\)
  const invalidChars = process.platform === 'win32' 
    // deno-lint-ignore no-control-regex
    ? /[<>"|?*\u0000-\u001f]/
    // deno-lint-ignore no-control-regex
    : /[\u0000]/;

  if (invalidChars.test(trimmed)) {
    return 'Path contains invalid characters';
  }

  // Check for excessively long paths
  if (trimmed.length > 260) {
    return 'Path is too long (maximum 260 characters)';
  }

  return undefined;
}

/**
 * Validate directory name input
 */
export function validateDirectoryName(value: string): string | undefined {
  if (!value || value.trim().length === 0) {
    return 'Directory name is required';
  }

  const trimmed = value.trim();

  // Check for valid characters
  const invalidChars = process.platform === 'win32'
    // deno-lint-ignore no-control-regex
    ? /[<>:"|?*\u0000-\u001f\\\/]/
    // deno-lint-ignore no-control-regex
    : /[\u0000\/]/;

  if (invalidChars.test(trimmed)) {
    return 'Directory name contains invalid characters';
  }

  // Check for reserved names on Windows
  if (process.platform === 'win32') {
    const reservedNames = ['con', 'prn', 'aux', 'nul', 'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9', 'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'];
    if (reservedNames.includes(trimmed.toLowerCase())) {
      return `"${trimmed}" is a reserved name and cannot be used`;
    }
  }

  // Check for current/parent directory references
  if (trimmed === '.' || trimmed === '..') {
    return 'Cannot use "." or ".." as directory name';
  }

  // Check length
  if (trimmed.length > 255) {
    return 'Directory name is too long (maximum 255 characters)';
  }

  return undefined;
}

/**
 * Validate URL input
 */
export function validateUrl(value: string): string | undefined {
  if (!value || value.trim().length === 0) {
    return 'URL is required';
  }

  const trimmed = value.trim();

  try {
    const url = new URL(trimmed);
    
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      return 'URL must use http or https protocol';
    }

    return undefined;
  } catch {
    return 'Invalid URL format';
  }
}

/**
 * Validate non-empty string input
 */
export function validateRequired(value: string): string | undefined {
  if (!value || value.trim().length === 0) {
    return 'This field is required';
  }
  return undefined;
}

/**
 * Validate numeric input
 */
export function validateNumber(value: string, min?: number, max?: number): string | undefined {
  if (!value || value.trim().length === 0) {
    return 'Number is required';
  }

  const num = Number(value.trim());
  
  if (isNaN(num)) {
    return 'Must be a valid number';
  }

  if (min !== undefined && num < min) {
    return `Number must be at least ${min}`;
  }

  if (max !== undefined && num > max) {
    return `Number must be at most ${max}`;
  }

  return undefined;
}

/**
 * Validate positive integer input
 */
export function validatePositiveInteger(value: string): string | undefined {
  const numberValidation = validateNumber(value, 1);
  if (numberValidation) {
    return numberValidation;
  }

  const num = Number(value.trim());
  if (!Number.isInteger(num) || num !== Math.floor(num)) {
    return 'Must be a whole number';
  }

  return undefined;
}

/**
 * Create a custom validator that combines multiple validators
 */
export function combineValidators(...validators: Array<(value: string) => string | undefined>) {
  return (value: string): string | undefined => {
    for (const validator of validators) {
      const result = validator(value);
      if (result) {
        return result;
      }
    }
    return undefined;
  };
}

/**
 * Create a validator that checks if a value is in a list of allowed values
 */
export function validateInList(allowedValues: string[], caseSensitive: boolean = true): (value: string) => string | undefined {
  return (value: string): string | undefined => {
    if (!value || value.trim().length === 0) {
      return 'Value is required';
    }

    const trimmed = value.trim();
    const compareValues = caseSensitive ? allowedValues : allowedValues.map(v => v.toLowerCase());
    const compareValue = caseSensitive ? trimmed : trimmed.toLowerCase();

    if (!compareValues.includes(compareValue)) {
      return `Value must be one of: ${allowedValues.join(', ')}`;
    }

    return undefined;
  };
}

/**
 * Create a validator that checks string length
 */
export function validateLength(min?: number, max?: number): (value: string) => string | undefined {
  return (value: string): string | undefined => {
    if (!value) {
      return min && min > 0 ? 'Value is required' : undefined;
    }

    const length = value.length;

    if (min !== undefined && length < min) {
      return `Must be at least ${min} characters long`;
    }

    if (max !== undefined && length > max) {
      return `Must be at most ${max} characters long`;
    }

    return undefined;
  };
}

/**
 * Create a validator that checks against a regular expression
 */
export function validatePattern(pattern: RegExp, errorMessage: string): (value: string) => string | undefined {
  return (value: string): string | undefined => {
    if (!value || value.trim().length === 0) {
      return 'Value is required';
    }

    if (!pattern.test(value.trim())) {
      return errorMessage;
    }

    return undefined;
  };
}
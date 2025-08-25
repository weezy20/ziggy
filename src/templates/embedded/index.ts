/**
 * Embedded Templates Index
 * Exports all embedded template content for fallback scenarios
 */

export { getBarebonesTemplate, BAREBONES_MAIN_ZIG, BAREBONES_BUILD_ZIG } from './barebones.js';
export { getStandardGitignore, STANDARD_GITIGNORE } from './gitignore.js';

import { getBarebonesTemplate } from './barebones.js';

/**
 * Get embedded template by name
 */
export function getEmbeddedTemplate(templateName: string): Record<string, string> {
  switch (templateName) {
    case 'barebones':
      return getBarebonesTemplate();
    default:
      throw new Error(`No embedded template available for: ${templateName}`);
  }
}

/**
 * Check if embedded template exists for given name
 */
export function hasEmbeddedTemplate(templateName: string): boolean {
  return templateName === 'barebones';
}
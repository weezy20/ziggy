/**
 * Tests for embedded template content
 */

import { describe, it, expect } from 'bun:test';
import { getStandardGitignore, STANDARD_GITIGNORE } from '../../../src/templates/embedded/gitignore.js';

describe('Embedded Templates', () => {
  describe('getStandardGitignore', () => {
    it('should return standard .gitignore content', () => {
      const gitignoreContent = getStandardGitignore();
      
      expect(gitignoreContent).toBe(STANDARD_GITIGNORE);
      expect(typeof gitignoreContent).toBe('string');
      expect(gitignoreContent.length).toBeGreaterThan(0);
    });

    it('should include required Zig build artifacts', () => {
      const gitignoreContent = getStandardGitignore();
      
      // Requirements 5.2: Must contain .zig-cache/ and zig-out/
      expect(gitignoreContent).toContain('.zig-cache/');
      expect(gitignoreContent).toContain('zig-out/');
    });

    it('should follow standard Zig project ignore patterns', () => {
      const gitignoreContent = getStandardGitignore();
      
      // Should include common IDE and OS files
      expect(gitignoreContent).toContain('.vscode/');
      expect(gitignoreContent).toContain('.idea/');
      expect(gitignoreContent).toContain('.DS_Store');
      expect(gitignoreContent).toContain('Thumbs.db');
      
      // Should include temporary files
      expect(gitignoreContent).toContain('*.tmp');
      expect(gitignoreContent).toContain('*.log');
    });

    it('should have proper formatting with comments', () => {
      const gitignoreContent = getStandardGitignore();
      
      // Should have section comments
      expect(gitignoreContent).toContain('# Zig build artifacts');
      expect(gitignoreContent).toContain('# IDE and editor files');
      expect(gitignoreContent).toContain('# OS generated files');
      expect(gitignoreContent).toContain('# Temporary files');
    });
  });
});
/**
 * Embedded .gitignore Template Content
 * Standard Zig project ignore patterns
 */

export const STANDARD_GITIGNORE = `# Zig build artifacts
.zig-cache/
zig-out/

# IDE and editor files
.vscode/
.idea/
*.swp
*.swo
*~

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Temporary files
*.tmp
*.temp
*.log

# Dependencies and packages
node_modules/
*.tgz
*.tar.gz
`;

/**
 * Get standard .gitignore content for Zig projects
 */
export function getStandardGitignore(): string {
  return STANDARD_GITIGNORE;
}
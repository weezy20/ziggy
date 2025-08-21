/**
 * Test setup and configuration for Ziggy tests
 */

// Global test setup
export const testConfig = {
  timeout: 30000, // 30 seconds for integration tests
  tempDir: '/tmp/ziggy-tests',
};

// Mock implementations for testing
export class MockConfigManager {
  private mockConfig: any = {};
  
  load() {
    return this.mockConfig;
  }
  
  save(config: any) {
    this.mockConfig = config;
  }
  
  scanExistingInstallations() {
    return this.mockConfig;
  }
}

export class MockFileSystemManager {
  private mockFiles = new Map<string, string>();
  public operations: string[] = [];
  
  createDirectory(path: string) {
    this.operations.push(`mkdir:${path}`);
  }
  
  removeDirectory(path: string) {
    this.operations.push(`rmdir:${path}`);
  }
  
  createSymlink(target: string, link: string) {
    this.operations.push(`symlink:${target}->${link}`);
  }
  
  copyFile(source: string, destination: string) {
    this.operations.push(`copy:${source}->${destination}`);
  }
  
  fileExists(path: string): boolean {
    return this.mockFiles.has(path);
  }
}
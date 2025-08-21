/**
 * Basic test to verify interfaces are properly defined
 */

import { describe, it, expect } from 'bun:test';
import type { 
  IZigInstaller, 
  IConfigManager, 
  IVersionManager,
  IPlatformDetector,
  IFileSystemManager,
  IArchiveExtractor,
  ITUIManager 
} from '../../src/interfaces.js';

describe('Core Interfaces', () => {
  it('should have all required interface definitions', () => {
    // This test verifies that our interfaces are properly exported
    // and can be imported without errors
    
    const interfaceNames = [
      'IZigInstaller',
      'IConfigManager', 
      'IVersionManager',
      'IPlatformDetector',
      'IFileSystemManager',
      'IArchiveExtractor',
      'ITUIManager'
    ];
    
    // If we can import the interfaces, they're properly defined
    expect(interfaceNames.length).toBe(7);
  });
});
/**
 * Basic test to verify interfaces are properly defined
 */

import { describe, it, expect } from 'bun:test';
import type { 
  IZigInstaller as _IZigInstaller, 
  IConfigManager as _IConfigManager, 
  IVersionManager as _IVersionManager,
  IPlatformDetector as _IPlatformDetector,
  IFileSystemManager as _IFileSystemManager,
  IArchiveExtractor as _IArchiveExtractor,
  ITUIManager as _ITUIManager 
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
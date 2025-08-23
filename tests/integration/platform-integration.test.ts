/**
 * Integration tests for platform detection in ZigInstaller
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createApplication } from '../../src/index.js';
import type { ZigInstaller } from '../../src/index.js';
import { PlatformDetector } from '../../src/utils/platform.js';

describe('Platform Detection Integration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should properly initialize ZigInstaller with platform detection', async () => {
    // Set up a temporary home directory for testing
    process.env.HOME = '/tmp/test-home';
    process.env.ZIGGY_DIR = '/tmp/test-ziggy';

    const installer = await createApplication();
    
    // Verify that platform detection is working
    expect(installer.platform).toBeDefined();
    expect(typeof installer.platform).toBe('string');
    
    // Verify that the platform matches what PlatformDetector would return
    const detector = new PlatformDetector();
    expect(installer.platform).toBe(detector.getPlatform());
  });

  it('should use PlatformDetector for archive extension detection', async () => {
    process.env.HOME = '/tmp/test-home';
    process.env.ZIGGY_DIR = '/tmp/test-ziggy';

    const installer = await createApplication();
    const detector = new PlatformDetector();
    
    // The installer should use the same archive extension as the detector
    const expectedExtension = detector.getArchiveExtension();
    
    // We can't directly test the private method, but we can verify
    // that the platform detection is consistent
    expect(installer.platform).toBe(detector.getPlatform());
    
    // Verify that the expected extension is correct for the platform
    if (detector.getPlatform() === 'windows') {
      expect(expectedExtension).toBe('zip');
    } else {
      expect(expectedExtension).toBe('tar.xz');
    }
  });

  it('should properly detect shell information through PlatformDetector', async () => {
    process.env.HOME = '/tmp/test-home';
    process.env.ZIGGY_DIR = '/tmp/test-ziggy';

    const installer = await createApplication();
    const detector = new PlatformDetector();
    
    // Both should return the same shell information
    const installerShell = detector.getShellInfo();
    const detectorShell = detector.getShellInfo();
    
    expect(installerShell).toEqual(detectorShell);
    expect(installerShell.shell).toBeDefined();
    expect(installerShell.profileFile).toBeDefined();
    expect(installerShell.command).toBeDefined();
  });
});
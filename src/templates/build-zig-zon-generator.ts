/**
 * Build.zig.zon Generator - Handles generation of build.zig.zon files with fingerprints
 */

import { join } from 'path';
import { createHash } from 'crypto';
import type { IFileSystemManager } from '../interfaces.js';
import type { IPlatformDetector } from '../utils/platform.js';

export interface BuildZigZonConfig {
  name: string;
  version: string;
  minimum_zig_version: string;
  paths: string[];
  fingerprint?: string;
}

export class BuildZigZonGenerator {
  constructor(
    private fileSystemManager: IFileSystemManager,
    private platformDetector: IPlatformDetector
  ) {}

  /**
   * Generate build.zig.zon file for a project
   */
  public async generateForProject(
    projectPath: string,
    projectName: string
  ): Promise<void> {
    // Get active Zig version
    const zigVersion = this.getActiveZigVersion();
    if (!zigVersion) {
      // Skip build.zig.zon generation if no active Zig version
      console.warn('No active Zig version found. Skipping build.zig.zon generation.');
      return;
    }

    // Generate fingerprint
    const fingerprint = this.generateFingerprint(projectName);

    // Create build.zig.zon configuration
    const config: BuildZigZonConfig = {
      name: projectName,
      version: '0.0.1',
      minimum_zig_version: zigVersion,
      paths: [''],
      fingerprint
    };

    // Write build.zig.zon file
    const buildZigZonPath = join(projectPath, 'build.zig.zon');
    const content = this.formatBuildZigZon(config);
    this.fileSystemManager.writeFile(buildZigZonPath, content);
  }

  /**
   * Generate fingerprint using CRC32 algorithm
   * Lower 32 bits: random non-zero/non-max u32
   * Upper 32 bits: CRC32 of package name
   */
  private generateFingerprint(packageName: string): string {
    // Generate random u32 for lower bits (avoiding 0 and 0xffffffff)
    let lowerBits: number;
    do {
      lowerBits = Math.floor(Math.random() * 0xffffffff);
    } while (lowerBits === 0 || lowerBits === 0xffffffff);

    // Calculate CRC32 of package name for upper bits
    const upperBits = this.calculateCRC32(packageName);

    // Combine into u64 (upper 32 bits << 32 | lower 32 bits)
    const fingerprint = (BigInt(upperBits) << 32n) | BigInt(lowerBits);
    
    return `0x${fingerprint.toString(16)}`;
  }

  /**
   * Calculate CRC32 checksum of a string
   */
  private calculateCRC32(input: string): number {
    // CRC32 polynomial (IEEE 802.3)
    const polynomial = 0xedb88320;
    
    // Initialize CRC table
    const crcTable = new Array(256);
    for (let i = 0; i < 256; i++) {
      let crc = i;
      for (let j = 0; j < 8; j++) {
        if (crc & 1) {
          crc = (crc >>> 1) ^ polynomial;
        } else {
          crc = crc >>> 1;
        }
      }
      crcTable[i] = crc;
    }

    // Calculate CRC32
    let crc = 0xffffffff;
    const bytes = Buffer.from(input, 'utf8');
    
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];
      crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
    }
    
    return (crc ^ 0xffffffff) >>> 0; // Ensure unsigned 32-bit
  }

  /**
   * Get the active Zig version from Ziggy configuration
   */
  private getActiveZigVersion(): string | null {
    try {
      const ziggyDir = this.platformDetector.getZiggyDir();
      const configPath = join(ziggyDir, 'config.json');
      
      if (!this.fileSystemManager.fileExists(configPath)) {
        return null;
      }

      const configContent = this.fileSystemManager.readFile(configPath);
      const config = JSON.parse(configContent);
      
      return config.activeVersion || null;
    } catch (error) {
      console.warn(`Failed to read Ziggy configuration: ${error}`);
      return null;
    }
  }

  /**
   * Format build.zig.zon configuration as Zig syntax
   */
  private formatBuildZigZon(config: BuildZigZonConfig): string {
    const pathsArray = config.paths.map(path => `"${path}"`).join(', ');
    
    return `.{
    .name = "${config.name}",
    .version = "${config.version}",
    .minimum_zig_version = "${config.minimum_zig_version}",
    .paths = .{${pathsArray}},
    .fingerprint = ${config.fingerprint},
}
`;
  }
}
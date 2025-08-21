/**
 * Cryptographic utilities for checksum verification
 */

import { createHash } from 'crypto';
import { readFileSync } from 'fs';

const log = console.log;

// Import the minisign implementation
const minisign = require('../minisign.js');

/**
 * Calculate SHA256 checksum of a file
 */
export function calculateSha256(filePath: string): string {
  const fileBuffer = readFileSync(filePath);
  const hash = createHash('sha256');
  hash.update(fileBuffer);
  return hash.digest('hex');
}

/**
 * Verify file checksum against expected value
 */
export function verifyChecksum(filePath: string, expectedChecksum: string): boolean {
  try {
    const actualChecksum = calculateSha256(filePath);
    return actualChecksum.toLowerCase() === expectedChecksum.toLowerCase();
  } catch (error) {
    log(`Checksum verification failed: ${error}`);
    return false;
  }
}

/**
 * Verify minisign signature of a file
 */
export function verifyMinisignature(filePath: string, signatureBuffer: Buffer, publicKey: string): boolean {
  try {
    const fileBuffer = readFileSync(filePath);
    const parsedKey = minisign.parseKey(publicKey);
    const parsedSignature = minisign.parseSignature(signatureBuffer);
    
    return minisign.verifySignature(parsedKey, parsedSignature, fileBuffer);
  } catch (error) {
    log(`Minisign verification failed: ${error}`);
    return false;
  }
}

/**
 * Parse shasum file content to extract checksum
 * Shasum files typically contain lines like: "checksum filename"
 */
export function parseShasumFile(shasumContent: string, filename: string): string | null {
  const lines = shasumContent.split('\n');
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2) {
      const checksum = parts[0];
      const file = parts[parts.length - 1];
      
      // Check if this line corresponds to our file
      if (checksum && file && (file === filename || file.endsWith(filename))) {
        return checksum;
      }
    }
  }
  return null;
}

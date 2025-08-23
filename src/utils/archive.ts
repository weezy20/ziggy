/**
 * Archive extraction utilities for Ziggy
 * Handles extraction of .tar.xz and .zip files with progress reporting
 */

import * as tar from 'tar';
import { xz } from '@napi-rs/lzma';
import { extract as extractZipLib } from 'zip-lib';
import type { IArchiveExtractor, IFileSystemManager, IProgressReporter } from '../interfaces.js';
import { colors } from './colors.js';
import { PerformanceMonitor, MemoryOptimizer } from './performance.js';
import { Buffer } from "node:buffer";

export class ArchiveExtractor implements IArchiveExtractor {
    constructor(
        private fileSystemManager: IFileSystemManager,
        private progressReporter?: IProgressReporter
    ) { }

    /**
     * Extract a .tar.xz archive to the specified output path
     * @param filePath Path to the .tar.xz file
     * @param outputPath Directory to extract to
     */
    public extractTarXz(filePath: string, outputPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const monitor = PerformanceMonitor.getInstance();
                monitor.startTimer(`extract-tarxz-${filePath}`);
                
                this.progressReporter?.startProgress(`Extracting ${filePath}...`);

                // Use streaming approach to reduce memory usage
                const inputStream = this.fileSystemManager.createReadStream(filePath);
                const chunks: Uint8Array[] = [];
                let totalSize = 0;
                const MAX_MEMORY_USAGE = 100 * 1024 * 1024; // 100MB limit

                inputStream.on('data', (chunk: string | Buffer) => {
                    const uint8Chunk = Buffer.isBuffer(chunk) ? new Uint8Array(chunk) : new Uint8Array(Buffer.from(chunk));
                    totalSize += uint8Chunk.length;
                    
                    // Check memory usage to prevent excessive memory consumption
                    if (totalSize > MAX_MEMORY_USAGE) {
                        inputStream.destroy();
                        throw new Error(`Archive too large (>${MAX_MEMORY_USAGE / 1024 / 1024}MB). Consider using a different extraction method.`);
                    }
                    
                    chunks.push(uint8Chunk);
                });

                inputStream.on('end', async () => {
                    try {
                        // Combine all chunks into a single Uint8Array efficiently
                        const compressedData = new Uint8Array(totalSize);
                        let offset = 0;
                        for (const chunk of chunks) {
                            compressedData.set(chunk, offset);
                            offset += chunk.length;
                        }

                        // Clear chunks array to free memory
                        chunks.length = 0;

                        // Decompress the XZ data
                        const decompressedData = await xz.decompress(compressedData);

                        // Create a temporary tar file with streaming
                        const tempTarPath = filePath.replace('.tar.xz', '.tar');
                        const tempWriter = this.fileSystemManager.createWriteStream(tempTarPath);
                        
                        // Write in chunks to avoid memory spikes
                        const CHUNK_SIZE = 64 * 1024; // 64KB chunks
                        for (let i = 0; i < decompressedData.length; i += CHUNK_SIZE) {
                            const chunk = decompressedData.slice(i, i + CHUNK_SIZE);
                            tempWriter.write(chunk);
                        }
                        tempWriter.end();

                        await new Promise<void>((resolveWrite, rejectWrite) => {
                            tempWriter.on('finish', resolveWrite);
                            tempWriter.on('error', rejectWrite);
                        });

                        // Extract the tar file
                        await tar.extract({
                            file: tempTarPath,
                            cwd: outputPath,
                            strip: 1 // Remove the top-level directory
                        });

                        // Clean up temp file
                        this.fileSystemManager.safeRemove(tempTarPath);

                        this.progressReporter?.finishProgress('Extraction completed successfully');
                        
                        // End performance monitoring and cleanup memory
                        monitor.endTimer(`extract-tarxz-${filePath}`);
                        MemoryOptimizer.forceGC();
                        
                        resolve();
                    } catch (error) {
                        this.progressReporter?.reportError(error as Error);
                        monitor.endTimer(`extract-tarxz-${filePath}`);
                        reject(error);
                    }
                });

                inputStream.on('error', (error: Error) => {
                    this.progressReporter?.reportError(error);
                    reject(error);
                });
            } catch (error) {
                this.progressReporter?.reportError(error as Error);
                reject(error);
            }
        });
    }

    /**
     * Extract a .zip archive to the specified output path
     * @param filePath Path to the .zip file
     * @param outputPath Directory to extract to
     */
    public async extractZip(filePath: string, outputPath: string): Promise<void> {
        try {
            this.progressReporter?.startProgress(`Extracting ZIP: ${filePath}...`);

            console.log(colors.gray(`Extracting ZIP: ${filePath} to ${outputPath}`));

            await extractZipLib(filePath, outputPath);

            console.log(colors.gray('ZIP extraction completed'));
            this.progressReporter?.finishProgress('ZIP extraction completed successfully');
        } catch (error) {
            console.error(colors.red('ZIP extraction failed:'), error);
            this.progressReporter?.reportError(error as Error);
            throw error;
        }
    }

    /**
     * Determine the appropriate extraction method based on file extension
     * @param filePath Path to the archive file
     * @param outputPath Directory to extract to
     */
    public async extractArchive(filePath: string, outputPath: string): Promise<void> {
        const extension = this.getFileExtension(filePath);

        switch (extension) {
            case 'tar.xz':
                await this.extractTarXz(filePath, outputPath);
                break;
            case 'zip':
                await this.extractZip(filePath, outputPath);
                break;
            default:
                throw new Error(`Unsupported archive format: ${extension}`);
        }
    }

    /**
     * Get the file extension for archive type detection
     * @param filePath Path to the file
     * @returns The file extension (e.g., 'tar.xz', 'zip')
     */
    private getFileExtension(filePath: string): string {
        if (filePath.endsWith('.tar.xz')) {
            return 'tar.xz';
        }
        if (filePath.endsWith('.zip')) {
            return 'zip';
        }

        // Fallback to simple extension
        const parts = filePath.split('.');
        return parts[parts.length - 1] || '';
    }
}
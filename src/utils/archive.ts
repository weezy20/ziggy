/**
 * Archive extraction utilities for Ziggy
 * Handles extraction of .tar.xz and .zip files with progress reporting
 */

import * as tar from 'tar';
import { xz } from '@napi-rs/lzma';
import { extract as extractZipLib } from 'zip-lib';
import type { IArchiveExtractor, IFileSystemManager, IProgressReporter } from '../interfaces.js';
import { colors } from './colors.js';

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
                this.progressReporter?.startProgress(`Extracting ${filePath}...`);

                const inputStream = this.fileSystemManager.createReadStream(filePath);
                const chunks: Uint8Array[] = [];

                inputStream.on('data', (chunk: string | Buffer) => {
                    chunks.push(Buffer.isBuffer(chunk) ? new Uint8Array(chunk) : new Uint8Array(Buffer.from(chunk)));
                });

                inputStream.on('end', async () => {
                    try {
                        // Combine all chunks into a single Uint8Array
                        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
                        const compressedData = new Uint8Array(totalLength);
                        let offset = 0;
                        for (const chunk of chunks) {
                            compressedData.set(chunk, offset);
                            offset += chunk.length;
                        }

                        // Decompress the XZ data
                        const decompressedData = await xz.decompress(compressedData);

                        // Create a temporary tar file
                        const tempTarPath = filePath.replace('.tar.xz', '.tar');
                        const tempWriter = this.fileSystemManager.createWriteStream(tempTarPath);
                        tempWriter.write(decompressedData);
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
                        resolve();
                    } catch (error) {
                        this.progressReporter?.reportError(error as Error);
                        reject(error);
                    }
                });

                inputStream.on('error', (error) => {
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
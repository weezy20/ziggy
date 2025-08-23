/**
 * Core interfaces for the Ziggy refactored architecture
 * These interfaces define the contracts between different layers and modules
 */

import type { ZiggyConfig, ShellInfo, DownloadProgress } from './types.js';

// Core installer interface
export interface IZigInstaller {
  downloadVersion(version: string): Promise<void>;
  useVersion(version: string): void;
  getInstalledVersions(): string[];
  validateVersion(version: string): Promise<boolean>;
  cleanup(): Promise<void>;
  getCurrentDownload(): { cleanup?: () => void } | null;
  getConfigManager(): IConfigManager;
}

// Configuration management interface
export interface IConfigManager {
  load(): ZiggyConfig;
  save(config: ZiggyConfig): void;
  scanExistingInstallations(): ZiggyConfig;
}

// Version management interface
export interface IVersionManager {
  getAvailableVersions(): Promise<string[]>;
  validateVersion(version: string): Promise<boolean>;
  getCurrentVersion(): string | undefined;
  setCurrentVersion(version: string): void;
  clearCurrentVersion(): void;
}

// Platform detection interface
export interface IPlatformDetector {
  getArch(): string;
  getPlatform(): string;
  getOS(): string;
  getShellInfo(): ShellInfo;
  isZiggyConfigured(binDir: string): boolean;
  hasEnvFileConfigured(envPath: string): boolean;
  isZiggyInPath(binDir: string): boolean;
  getZiggyDir(): string;
  expandHomePath(path: string): string;
  getShellSourceLine(envPath: string): string;
  getPathExportLine(shell: string, zigBinPath: string): string;
  getArchiveExtension(): string;
}

// File system operations interface
export interface IFileSystemManager {
  createDirectory(path: string, recursive?: boolean): void;
  removeDirectory(path: string, force?: boolean): void;
  createSymlink(target: string, link: string, platform?: string): void;
  copyFile(source: string, destination: string): void;
  fileExists(path: string): boolean;
  removeFile(path: string): void;
  writeFile(path: string, content: string): void;
  readFile(path: string): string;
  appendFile(path: string, content: string): void;
  createWriteStream(path: string): NodeJS.WritableStream;
  createReadStream(path: string): NodeJS.ReadableStream;
  getStats(path: string): { size: number; isFile(): boolean; isDirectory(): boolean };
  listDirectory(path: string): string[];
  isDirectory(path: string): boolean;
  isFile(path: string): boolean;
  ensureDirectory(path: string): void;
  safeRemove(path: string, recursive?: boolean): void;
}

// Archive extraction interface
export interface IArchiveExtractor {
  extractTarXz(filePath: string, outputPath: string): Promise<void>;
  extractZip(filePath: string, outputPath: string): Promise<void>;
}

// TUI interface
export interface ITUIManager {
  runMainMenu(): Promise<void>;
  showVersionSelection(): Promise<string>;
  showDownloadMenu(): Promise<void>;
  showCleanupMenu(): Promise<void>;
  showProjectCreation(): Promise<void>;
}

// Template management interface
export interface ITemplateManager {
  getAvailableTemplates(): string[];
  createProject(templateName: string, projectName: string, targetPath: string): Promise<void>;
  validateTemplate(templateName: string): boolean;
}

// Project creation interface
export interface IProjectCreator {
  createFromTemplate(templateName: string, projectName: string, targetPath: string): Promise<void>;
  initializeProject(projectPath: string): Promise<void>;
}

// Progress reporting interface
export interface IProgressReporter {
  startProgress(message: string): void;
  updateProgress(progress: DownloadProgress): void;
  finishProgress(message?: string): void;
  reportError(error: Error): void;
}

// Community mirrors management interface
export interface IMirrorsManager {
  getCommunityMirrors(): Promise<string[]>;
  getCachedMirrors(): string[];
  updateMirrorsCache(): Promise<void>;
  selectMirrorForDownload(mirrors: string[]): string[];
  isMirrorsCacheExpired(): boolean;
  getMirrorUrls(originalUrl: string): Promise<string[]>;
}
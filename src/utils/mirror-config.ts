import { parse, stringify } from 'smol-toml';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { MirrorsConfig, Mirror } from '../types.js';

/**
 * Utility class for managing mirrors.toml configuration file
 * Handles TOML parsing, serialization, and file operations for mirror management
 */
export class MirrorConfigManager {
    private readonly configPath: string;
    private readonly configDir: string;

    constructor(customConfigDir?: string) {
        this.configDir = customConfigDir || join(homedir(), '.ziggy');
        this.configPath = join(this.configDir, 'mirrors.toml');
    }

    /**
     * Get the full path to the mirrors.toml configuration file
     * @returns The absolute path to mirrors.toml
     */
    getConfigPath(): string {
        return this.configPath;
    }

    /**
     * Check if the mirrors.toml configuration file exists
     * @returns True if the file exists, false otherwise
     */
    configExists(): boolean {
        return existsSync(this.configPath);
    }

    /**
     * Create the default mirrors configuration with empty mirrors array
     * @returns Default MirrorsConfig object
     */
    createDefaultConfig(): MirrorsConfig {
        return {
            mirrors: [],
            last_synced: new Date().toISOString()
        };
    }

    /**
     * Load mirrors configuration from mirrors.toml file
     * Creates default configuration if file doesn't exist
     * @returns Parsed MirrorsConfig object
     * @throws Error if TOML parsing fails or file is corrupted
     */
    loadConfig(): MirrorsConfig {
        try {
            if (!this.configExists()) {
                // Lazy creation - create default config when first needed
                const defaultConfig = this.createDefaultConfig();
                this.saveConfig(defaultConfig);
                return defaultConfig;
            }

            const tomlContent = readFileSync(this.configPath, 'utf-8');
            const parsed = parse(tomlContent) as MirrorsConfig;

            // Validate the parsed configuration
            this.validateConfig(parsed);

            return parsed;
        } catch (error) {
            // If parsing fails, create a new default config
            console.warn(`Warning: Failed to parse mirrors.toml, creating new default configuration. Error: ${error}`);
            const defaultConfig = this.createDefaultConfig();
            this.saveConfig(defaultConfig);
            return defaultConfig;
        }
    }

    /**
     * Save mirrors configuration to mirrors.toml file
     * Creates the .ziggy directory if it doesn't exist
     * @param config MirrorsConfig object to save
     * @throws Error if file writing fails
     */
    saveConfig(config: MirrorsConfig): void {
        try {
            // Validate configuration before saving
            this.validateConfig(config);

            // Ensure the .ziggy directory exists
            if (!existsSync(this.configDir)) {
                mkdirSync(this.configDir, { recursive: true });
            }

            // Serialize to TOML format
            const tomlContent = stringify(config);

            // Write to file atomically using a temporary file
            const tempPath = `${this.configPath}.tmp`;
            writeFileSync(tempPath, tomlContent, 'utf-8');

            // Rename temp file to actual config file (atomic operation on most filesystems)
            if (existsSync(this.configPath)) {
                // On Windows, we need to remove the target file first
                if (process.platform === 'win32') {
                    const fs = require('fs');
                    fs.unlinkSync(this.configPath);
                }
            }

            const fs = require('fs');
            fs.renameSync(tempPath, this.configPath);
        } catch (error) {
            throw new Error(`Failed to save mirrors configuration: ${error}`);
        }
    }

    /**
     * Validate mirrors configuration structure and data
     * @param config MirrorsConfig object to validate
     * @throws Error if configuration is invalid
     */
    private validateConfig(config: MirrorsConfig): void {
        if (!config || typeof config !== 'object') {
            throw new Error('Invalid configuration: must be an object');
        }

        if (!Array.isArray(config.mirrors)) {
            throw new Error('Invalid configuration: mirrors must be an array');
        }

        if (!config.last_synced || typeof config.last_synced !== 'string') {
            throw new Error('Invalid configuration: last_synced must be a string');
        }

        // Validate each mirror
        for (const mirror of config.mirrors) {
            this.validateMirror(mirror);
        }

        // Validate ISO 8601 timestamp format
        const date = new Date(config.last_synced);
        if (isNaN(date.getTime())) {
            throw new Error('Invalid configuration: last_synced must be a valid ISO 8601 timestamp');
        }
    }

    /**
     * Validate individual mirror configuration
     * @param mirror Mirror object to validate
     * @throws Error if mirror configuration is invalid
     */
    private validateMirror(mirror: Mirror): void {
        if (!mirror || typeof mirror !== 'object') {
            throw new Error('Invalid mirror: must be an object');
        }

        if (!mirror.url || typeof mirror.url !== 'string') {
            throw new Error('Invalid mirror: url must be a non-empty string');
        }

        if (!mirror.url.startsWith('https://')) {
            throw new Error(`Invalid mirror: URL must use HTTPS protocol: ${mirror.url}`);
        }

        if (typeof mirror.rank !== 'number' || mirror.rank < 1) {
            throw new Error('Invalid mirror: rank must be a positive number');
        }
    }

    /**
     * Update the last_synced timestamp to current time
     * @param config MirrorsConfig object to update
     * @returns Updated MirrorsConfig object
     */
    updateLastSynced(config: MirrorsConfig): MirrorsConfig {
        return {
            ...config,
            last_synced: new Date().toISOString()
        };
    }

    /**
     * Add or update a mirror in the configuration
     * @param config Current MirrorsConfig
     * @param url Mirror URL to add/update
     * @param rank Mirror rank (defaults to 1 for new mirrors)
     * @returns Updated MirrorsConfig object
     */
    addOrUpdateMirror(config: MirrorsConfig, url: string, rank: number = 1): MirrorsConfig {
        // Validate the URL
        if (!url.startsWith('https://')) {
            throw new Error(`Mirror URL must use HTTPS protocol: ${url}`);
        }

        const mirrors = [...config.mirrors];
        const existingIndex = mirrors.findIndex(m => m.url === url);

        if (existingIndex >= 0) {
            // Update existing mirror
            mirrors[existingIndex] = { url, rank };
        } else {
            // Add new mirror
            mirrors.push({ url, rank });
        }

        return {
            ...config,
            mirrors
        };
    }

    /**
     * Remove a mirror from the configuration
     * @param config Current MirrorsConfig
     * @param url Mirror URL to remove
     * @returns Updated MirrorsConfig object
     */
    removeMirror(config: MirrorsConfig, url: string): MirrorsConfig {
        return {
            ...config,
            mirrors: config.mirrors.filter(m => m.url !== url)
        };
    }
}

/**
 * Default instance of MirrorConfigManager for convenient access
 */
export const mirrorConfigManager = new MirrorConfigManager();
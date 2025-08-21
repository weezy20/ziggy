/**
 * Progress reporting utilities for Ziggy
 * Provides spinner and progress indicators for long-running operations
 */

import type { IProgressReporter } from '../interfaces.js';
import type { DownloadProgress } from '../types.js';
import { colors } from './colors.js';

export class SpinnerProgressReporter implements IProgressReporter {
  private spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private spinnerIndex = 0;
  private spinnerInterval: Timer | null = null;
  private currentMessage = '';

  public startProgress(message: string): void {
    this.currentMessage = message;
    this.spinnerIndex = 0;
    
    // Clear any existing spinner
    this.stopSpinner();
    
    // Start new spinner
    this.spinnerInterval = setInterval(() => {
      process.stdout.write(`\r${colors.cyan(this.spinnerChars[this.spinnerIndex]!)} ${this.currentMessage}`);
      this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerChars.length;
    }, 100);
  }

  public updateProgress(_progress: DownloadProgress): void {
    // For spinner reporter, we don't show detailed progress
    // The spinner continues to show activity
  }

  public finishProgress(message?: string): void {
    this.stopSpinner();
    if (message) {
      process.stdout.write(`\r${colors.green('✓')} ${message}\n`);
    } else {
      process.stdout.write(`\r${colors.green('✓')} ${this.currentMessage}\n`);
    }
  }

  public reportError(error: Error): void {
    this.stopSpinner();
    process.stdout.write(`\r${colors.red('✗')} ${this.currentMessage} - ${error.message}\n`);
  }

  private stopSpinner(): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
      // Clear the spinner line
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
    }
  }
}

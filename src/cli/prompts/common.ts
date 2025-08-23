import * as clack from '@clack/prompts';
import { colors } from '../../utils/colors.js';
import process from "node:process";

export const log = console.log;

/**
 * Common prompt patterns and utilities for consistent user interaction
 */

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

export interface NavigationOptions {
  includeBack?: boolean;
  includeQuit?: boolean;
  backLabel?: string;
  quitLabel?: string;
}

export interface PostActionOption {
  value: string;
  label: string;
  hint?: string;
}

/**
 * Handle clack prompt cancellation with consistent behavior
 */
export function handleCancel<T>(result: T | symbol, message?: string): T {
  if (clack.isCancel(result)) {
    clack.cancel(message || 'Operation cancelled');
    process.exit(0);
  }
  return result as T;
}

/**
 * Create a confirmation prompt with consistent styling
 */
export async function confirmPrompt(
  message: string,
  initialValue: boolean = true,
  cancelMessage?: string
): Promise<boolean> {
  const result = await clack.confirm({
    message,
    initialValue
  });

  return handleCancel(result, cancelMessage);
}

/**
 * Create a text input prompt with validation
 */
export async function textPrompt(
  message: string,
  placeholder?: string,
  validate?: (value: string) => string | undefined,
  cancelMessage?: string
): Promise<string> {
  const result = await clack.text({
    message,
    placeholder,
    validate
  });

  return handleCancel(result, cancelMessage);
}

/**
 * Create a select prompt with optional navigation options
 */
export async function selectPrompt(
  message: string,
  options: SelectOption[],
  initialValue?: string,
  navigation?: NavigationOptions,
  cancelMessage?: string
): Promise<string> {
  const allOptions = [...options];

  // Add navigation options if requested
  if (navigation?.includeBack || navigation?.includeQuit) {
    const navOptions: SelectOption[] = [];
    
    if (navigation.includeBack) {
      navOptions.push({
        value: 'back',
        label: navigation.backLabel || '← Back'
      });
    }
    
    if (navigation.includeQuit) {
      navOptions.push({
        value: 'quit',
        label: navigation.quitLabel || 'Quit'
      });
    }
    
    // Add navigation options at the beginning
    allOptions.unshift(...navOptions);
  }

  const result = await clack.select({
    message,
    options: allOptions,
    initialValue: initialValue || (allOptions.length > 0 ? allOptions[0]!.value : undefined)
  });

  const selected = handleCancel(result, cancelMessage);

  // Handle navigation actions
  if (selected === 'quit') {
    log(colors.green('👋 Goodbye!'));
    process.exit(0);
  }

  return selected;
}

/**
 * Create a multi-select prompt with validation
 */
export async function multiselectPrompt(
  message: string,
  options: SelectOption[],
  required: boolean = false,
  cancelMessage?: string
): Promise<string[]> {
  const result = await clack.multiselect({
    message,
    options,
    required
  });

  return handleCancel(result, cancelMessage);
}

/**
 * Show a spinner with consistent styling and error handling
 */
export function createSpinner(initialMessage?: string): clack.Spinner {
  const spinner = clack.spinner();
  if (initialMessage) {
    spinner.start(initialMessage);
  }
  return spinner;
}

/**
 * Display an informational note with consistent styling
 */
export function showNote(content: string, title?: string): void {
  clack.note(content, title);
}

/**
 * Display a warning message with consistent styling
 */
export function showWarning(message: string): void {
  clack.log.warn(message);
}

/**
 * Display an error message with consistent styling
 */
export function showError(message: string): void {
  clack.log.error(message);
}

/**
 * Display a success message with consistent styling
 */
export function showSuccess(message: string): void {
  clack.log.success(message);
}

/**
 * Display an info message with consistent styling
 */
export function showInfo(message: string): void {
  clack.log.info(message);
}

/**
 * Create a standardized post-action menu
 */
export async function showPostActionMenu(
  customOptions: PostActionOption[] = [],
  includeMainMenu: boolean = true,
  includeQuit: boolean = true,
  defaultAction?: string
): Promise<string> {
  const options: SelectOption[] = [...customOptions];

  if (includeMainMenu) {
    options.push({ value: 'main-menu', label: '← Return to main menu' });
  }

  if (includeQuit) {
    options.push({ value: 'quit', label: 'Quit' });
  }

  const action = await selectPrompt(
    'What would you like to do next?',
    options,
    defaultAction || (customOptions.length > 0 ? customOptions[0]!.value : 'main-menu')
  );

  if (action === 'quit') {
    log(colors.green('👋 Goodbye!'));
    process.exit(0);
  }

  return action;
}

/**
 * Create a version selection prompt with common patterns
 */
export async function selectVersionPrompt(
  message: string,
  versions: string[],
  currentVersion?: string,
  includeNavigation: boolean = true,
  includeSpecialVersions: { master?: boolean; system?: boolean } = {}
): Promise<string> {
  const options: SelectOption[] = [];

  // Add navigation if requested
  if (includeNavigation) {
    options.push(
      { value: 'back', label: '← Back' },
      { value: 'quit', label: 'Quit' }
    );
  }

  // Add special versions
  if (includeSpecialVersions.master) {
    options.push({
      value: 'master',
      label: 'master (development branch)',
      hint: 'Latest development build'
    });
  }

  if (includeSpecialVersions.system) {
    options.push({
      value: 'system',
      label: 'system (system installation)',
      hint: 'Use system-installed Zig'
    });
  }

  // Add regular versions with current indicator
  for (const version of versions) {
    const isCurrent = currentVersion === version ? ' (current)' : '';
    options.push({
      value: version,
      label: `${version}${isCurrent}`
    });
  }

  return await selectPrompt(message, options, 'master');
}

/**
 * Create a cleanup selection prompt with common patterns
 */
export async function selectCleanupAction(
  installedVersions: string[],
  currentVersion?: string
): Promise<string> {
  const options: SelectOption[] = [
    { value: 'back', label: '← Back' },
    { value: 'quit', label: 'Quit' },
    { value: 'clean-all', label: 'Clean everything' }
  ];

  // Add option to keep current version if there is one
  if (currentVersion && currentVersion !== 'system') {
    options.push({
      value: 'clean-except-current',
      label: `Clean all except current active version (${currentVersion})`
    });
  }

  // Add option to select which version to keep
  if (installedVersions.length > 1) {
    options.push({
      value: 'select-keep',
      label: 'Select which version to keep'
    });
  }

  return await selectPrompt(
    'Choose cleanup option: (Only ziggy managed installations will be affected)',
    options,
    'back'
  );
}

/**
 * Show a list of items with consistent formatting
 */
export function showVersionList(
  versions: Array<{ version: string; path?: string; isCurrent?: boolean; status?: string }>,
  title: string = 'Available versions'
): void {
  if (versions.length === 0) {
    showWarning('No versions available');
    return;
  }

  const formattedList = versions.map(v => {
    const currentIndicator = v.isCurrent ? ' ← current' : '';
    const statusIndicator = v.status ? ` [${v.status}]` : '';
    const pathInfo = v.path ? ` at ${v.path}` : '';
    return `• ${v.version}${currentIndicator}${statusIndicator}${pathInfo}`;
  }).join('\n');

  showNote(formattedList, title);
}

/**
 * Handle common error scenarios with consistent messaging
 */
export function handleCommonError(error: unknown, context: string): void {
  if (clack.isCancel(error)) {
    log(colors.yellow('\n👋 Goodbye!'));
    process.exit(0);
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  showError(`${context}: ${errorMessage}`);
}

/**
 * Create a progress indicator for long-running operations
 */
export async function withProgress<T>(
  operation: (updateMessage: (message: string) => void) => Promise<T>,
  initialMessage: string,
  successMessage?: string,
  errorMessage?: string
): Promise<T> {
  const spinner = createSpinner(initialMessage);

  try {
    const result = await operation((message: string) => {
      spinner.message(message);
    });

    spinner.stop(successMessage || 'Operation completed');
    return result;
  } catch (error) {
    spinner.stop('Failed');
    if (errorMessage) {
      showError(errorMessage);
    }
    throw error;
  }
}
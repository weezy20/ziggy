import * as clack from '@clack/prompts';

/**
 * Helper function to handle clack prompt cancellation
 */
export function handleClackCancel<T>(result: T | symbol): T {
  if (clack.isCancel(result)) {
    clack.cancel('Operation cancelled');
    process.exit(0);
  }
  return result as T;
}
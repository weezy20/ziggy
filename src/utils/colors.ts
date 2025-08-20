import { isatty } from 'tty';

// Check if output is going to a TTY (terminal)
const isTTY = isatty(Bun.stdout.fd);

/**
 * Console colors using ANSI escape codes
 * Only applies colors if output is going to a TTY
 */
export const colors = {
  red: (text: string) => isTTY ? `\x1b[31m${text}\x1b[0m` : text,
  green: (text: string) => isTTY ? `\x1b[32m${text}\x1b[0m` : text,
  yellow: (text: string) => isTTY ? `\x1b[33m${text}\x1b[0m` : text,
  blue: (text: string) => isTTY ? `\x1b[34m${text}\x1b[0m` : text,
  cyan: (text: string) => isTTY ? `\x1b[36m${text}\x1b[0m` : text,
  gray: (text: string) => isTTY ? `\x1b[90m${text}\x1b[0m` : text,
};

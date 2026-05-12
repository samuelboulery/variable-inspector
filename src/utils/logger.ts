/* eslint-disable no-console */
// `process` is injected by Vite's `define` at build time. The logger is the
// single sanctioned place to call `console.*` — all other call sites must go
// through this wrapper so production builds stay silent.

/**
 * Determines whether the plugin is running in a production build.
 * Vite replaces `process.env.NODE_ENV` with the literal string at build time.
 */
function detectProductionMode(): boolean {
  try {
    return typeof process !== 'undefined' && process.env.NODE_ENV === 'production';
  } catch {
    return false;
  }
}

const isProd = detectProductionMode();

/**
 * Logger utility. All methods are no-ops in production builds.
 * Use this instead of `console.*` throughout the codebase.
 */
export const logger = {
  /** Log an informational message (dev only). */
  log: (...args: unknown[]): void => {
    if (!isProd) console.log(...args);
  },
  /** Log a warning message (dev only). */
  warn: (...args: unknown[]): void => {
    if (!isProd) console.warn(...args);
  },
  /** Log an error message (dev only). */
  error: (...args: unknown[]): void => {
    if (!isProd) console.error(...args);
  },
};

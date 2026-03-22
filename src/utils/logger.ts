/**
 * Determines whether the plugin is running in a production build.
 * Vite replaces `process.env.NODE_ENV` with the literal string at build time.
 */
function detectProductionMode(): boolean {
  try {
    return process.env.NODE_ENV === 'production';
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

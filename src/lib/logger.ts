/**
 * Lightweight logger that silences chatty `log/info/debug` in production
 * builds while preserving `warn/error` so real problems still surface.
 *
 * Usage: `import { logger } from "@/lib/logger";` then `logger.error(...)`.
 *
 * Why: keeping raw `console.log` everywhere bloats the prod bundle's runtime
 * output, leaks internal state to end users, and slows things down on slower
 * devices. Warnings/errors are kept because they help diagnose real bugs.
 */
const isProd = import.meta.env.PROD;

type LogFn = (...args: unknown[]) => void;

const noop: LogFn = () => {};

export const logger = {
  log:   isProd ? noop : ((...a: unknown[]) => console.log(...a))   as LogFn,
  info:  isProd ? noop : ((...a: unknown[]) => console.info(...a))  as LogFn,
  debug: isProd ? noop : ((...a: unknown[]) => console.debug(...a)) as LogFn,
  // Always kept — these matter in production for real diagnostics.
  warn:  ((...a: unknown[]) => console.warn(...a))  as LogFn,
  error: ((...a: unknown[]) => console.error(...a)) as LogFn,
};

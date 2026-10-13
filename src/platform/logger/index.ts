import type { LogLevel } from '@/contract';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

let currentLevel: LogLevel = 'warn';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * A scoped console logger. The level is process-wide rather than per-logger so
 * that the options page can flip it once and every future line obeys.
 */
export function createLogger(scope: string): Logger {
  const emit =
    (level: Exclude<LogLevel, 'silent'>, fn: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel]) return;
      fn(`[${scope}]`, ...args);
    };

  return {
    debug: emit('debug', console.debug.bind(console)),
    info: emit('info', console.info.bind(console)),
    warn: emit('warn', console.warn.bind(console)),
    error: emit('error', console.error.bind(console)),
  };
}

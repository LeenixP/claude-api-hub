const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatTime(): string {
  return new Date().toISOString().slice(11, 23);
}

export const logger = {
  debug(msg: string, data?: Record<string, unknown>): void {
    if (!shouldLog('debug')) return;
    console.debug(`${formatTime()} [debug] ${msg}`, data ? JSON.stringify(data) : '');
  },
  info(msg: string, data?: Record<string, unknown>): void {
    if (!shouldLog('info')) return;
    console.log(`${formatTime()} [info] ${msg}`, data ? JSON.stringify(data) : '');
  },
  warn(msg: string, data?: Record<string, unknown>): void {
    if (!shouldLog('warn')) return;
    console.warn(`${formatTime()} [warn] ${msg}`, data ? JSON.stringify(data) : '');
  },
  error(msg: string, data?: Record<string, unknown>): void {
    if (!shouldLog('error')) return;
    console.error(`${formatTime()} [error] ${msg}`, data ? JSON.stringify(data) : '');
  },
};

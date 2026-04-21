import type { GatewayConfig } from '../providers/types.js';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LEVELS;

export class Logger {
  private minLevel: number;

  constructor(level: string) {
    this.minLevel = LEVELS[(level as LogLevel) ?? 'info'] ?? LEVELS.info;
  }

  private write(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
    if (LEVELS[level] < this.minLevel) return;
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...extra,
    };
    process.stderr.write(JSON.stringify(entry) + '\n');
  }

  debug(message: string, extra?: Record<string, unknown>): void {
    this.write('debug', message, extra);
  }

  info(message: string, extra?: Record<string, unknown>): void {
    this.write('info', message, extra);
  }

  warn(message: string, extra?: Record<string, unknown>): void {
    this.write('warn', message, extra);
  }

  error(message: string, extra?: Record<string, unknown>): void {
    this.write('error', message, extra);
  }
}

export function createLogger(level: GatewayConfig['logLevel'] | string): Logger {
  return new Logger(level);
}

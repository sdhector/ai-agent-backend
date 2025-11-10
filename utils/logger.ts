export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

export class Logger {
  private context: string;
  private level: LogLevel;

  constructor(context: string) {
    this.context = context;
    this.level = (process.env.LOG_LEVEL as LogLevel) || 'INFO';
  }

  debug(message: string, meta: Record<string, any> = {}): void {
    if (this.shouldLog('DEBUG')) {
      console.log(`[DEBUG] [${this.context}] ${message}`, meta);
    }
  }

  info(message: string, meta: Record<string, any> = {}): void {
    if (this.shouldLog('INFO')) {
      console.log(`[INFO] [${this.context}] ${message}`, meta);
    }
  }

  warn(message: string, meta: Record<string, any> = {}): void {
    if (this.shouldLog('WARN')) {
      console.warn(`[WARN] [${this.context}] ${message}`, meta);
    }
  }

  error(message: string, error: Error | null = null, meta: Record<string, any> = {}): void {
    if (this.shouldLog('ERROR')) {
      console.error(`[ERROR] [${this.context}] ${message}`, {
        error: error?.message,
        stack: error?.stack,
        ...meta
      });
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }
}

export function createLogger(context: string): Logger {
  return new Logger(context);
}

module.exports = { createLogger, LOG_LEVELS };

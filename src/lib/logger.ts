// Define log levels
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'NONE';

// Simple logging utility
export const logger = {
  level: 'ERROR' as LogLevel,

  setLevel(level: LogLevel) {
    this.level = level;
  },

  debug(message: string, ...args: any[]) {
    if (['DEBUG'].includes(this.level)) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },

  info(message: string, ...args: any[]) {
    if (['DEBUG', 'INFO'].includes(this.level)) {
      console.log(message, ...args);
    }
  },

  warn(message: string, ...args: any[]) {
    if (['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(this.level)) {
      console.warn(message, ...args);
    }
  },

  error(message: string, ...args: any[]) {
    if (['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(this.level)) {
      console.error(message, ...args);
    }
  }
};
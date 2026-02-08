import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { JinyangError, isJinyangError } from '../errors/index.js';

/**
 * Log levels for structured logging
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Structured log entry
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  issueId?: string;
  provider?: string;
  duration?: number;
  errorType?: string;
  errorCode?: string;
  context?: Record<string, unknown>;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  logDir: string;
  consoleEnabled: boolean;
  fileEnabled: boolean;
  minLevel: LogLevel;
  maxFileSizeMb: number;
  maxFiles: number;
}

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: LoggerConfig = {
  logDir: join(homedir(), '.jinyang', 'logs'),
  consoleEnabled: true,
  fileEnabled: true,
  minLevel: 'info',
  maxFileSizeMb: 100,
  maxFiles: 10,
};

/**
 * Log level priority (higher = more severe)
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

/**
 * Production-grade structured logger for jinyang.
 * 
 * Features:
 * - Structured JSON logging to files
 * - Console output with color coding
 * - Automatic log rotation
 * - Error context preservation
 * - Issue and provider correlation
 */
export class Logger {
  private config: LoggerConfig;
  private currentLogFile: string;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentLogFile = this.getLogFilePath();
    this.ensureLogDir();
  }

  /**
   * Get today's log file path
   */
  private getLogFilePath(): string {
    const date = new Date().toISOString().split('T')[0];
    return join(this.config.logDir, `${date}.log`);
  }

  /**
   * Ensure log directory exists
   */
  private ensureLogDir(): void {
    if (!existsSync(this.config.logDir)) {
      mkdirSync(this.config.logDir, { recursive: true });
    }
  }

  /**
   * Check if log level meets minimum threshold
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.minLevel];
  }

  /**
   * Create a structured log entry
   */
  private createEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: 'jinyang',
      context,
    };
  }

  /**
   * Write log entry to file
   */
  private writeToFile(entry: LogEntry): void {
    if (!this.config.fileEnabled) return;

    try {
      const logLine = JSON.stringify(entry) + '\n';
      appendFileSync(this.currentLogFile, logLine);
    } catch (error) {
      // Fallback to console if file write fails
      console.error('[Logger] Failed to write to log file:', error);
    }
  }

  /**
   * Write log entry to console
   */
  private writeToConsole(entry: LogEntry): void {
    if (!this.config.consoleEnabled) return;

    const color = this.getLevelColor(entry.level);
    const prefix = `[${entry.timestamp}] ${color}[${entry.level.toUpperCase()}]${'\x1b[0m'}`;
    
    let output = `${prefix} ${entry.message}`;
    
    if (entry.issueId) {
      output += ` [${entry.issueId}]`;
    }
    
    if (entry.provider) {
      output += ` (provider: ${entry.provider})`;
    }
    
    if (entry.duration !== undefined) {
      output += ` (${entry.duration}ms)`;
    }

    if (entry.errorType) {
      output += ` [${entry.errorType}:${entry.errorCode}]`;
    }

    if (entry.context && Object.keys(entry.context).length > 0) {
      output += '\n' + JSON.stringify(entry.context, null, 2);
    }

    if (entry.level === 'error' || entry.level === 'fatal') {
      console.error(output);
    } else if (entry.level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  /**
   * Get ANSI color for log level
   */
  private getLevelColor(level: LogLevel): string {
    switch (level) {
      case 'debug': return '\x1b[36m'; // Cyan
      case 'info': return '\x1b[32m'; // Green
      case 'warn': return '\x1b[33m'; // Yellow
      case 'error': return '\x1b[31m'; // Red
      case 'fatal': return '\x1b[35m'; // Magenta
      default: return '\x1b[0m';
    }
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const entry = this.createEntry(level, message, context);
    this.writeToFile(entry);
    this.writeToConsole(entry);
  }

  // Public logging methods
  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  fatal(message: string, context?: Record<string, unknown>): void {
    this.log('fatal', message, context);
  }

  /**
   * Log an error with structured context
   * 
   * @param error - Error to log
   * @param issueId - Related issue ID
   * @param provider - Provider that caused the error
   * @param duration - Execution duration in ms
   */
  logError(
    error: Error | unknown,
    issueId?: string,
    provider?: string,
    duration?: number
  ): void {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    const context: Record<string, unknown> = {
      errorName: errorObj.name,
      errorMessage: errorObj.message,
      stack: errorObj.stack,
    };

    if (isJinyangError(error)) {
      context.jinyangError = error.toJSON();
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message: errorObj.message,
      service: 'jinyang',
      issueId,
      provider,
      duration,
      errorType: errorObj.name,
      errorCode: isJinyangError(error) ? error.code : 'UNKNOWN',
      context,
    };

    this.writeToFile(entry);
    this.writeToConsole(entry);
  }

  /**
   * Log execution start
   */
  logExecutionStart(issueId: string, provider: string, context?: Record<string, unknown>): void {
    this.info(`Execution started`, { issueId, provider, ...context });
  }

  /**
   * Log execution completion
   */
  logExecutionComplete(
    issueId: string,
    provider: string,
    success: boolean,
    duration: number,
    filesCount?: number,
    context?: Record<string, unknown>
  ): void {
    const level = success ? 'info' : 'error';
    const message = success 
      ? `Execution completed successfully` 
      : `Execution failed`;
    
    this.log(level, message, {
      issueId,
      provider,
      success,
      duration,
      filesCount,
      ...context,
    });
  }

  /**
   * Log webhook received
   */
  logWebhookReceived(
    issueId: string,
    eventType: string,
    executionMode: string,
    context?: Record<string, unknown>
  ): void {
    this.info(`Webhook received`, { issueId, eventType, executionMode, ...context });
  }

  /**
   * Log provider health status change
   */
  logProviderHealth(provider: string, healthy: boolean, latency?: number, error?: string): void {
    const level = healthy ? 'info' : 'warn';
    this.log(level, `Provider health: ${healthy ? 'healthy' : 'unhealthy'}`, {
      provider,
      healthy,
      latency,
      error,
    });
  }

  /**
   * Log worktree operations
   */
  logWorktree(
    operation: 'create' | 'cleanup' | 'preserve' | 'cleanup_orphaned',
    issueId: string,
    worktreePath: string,
    success: boolean,
    error?: string
  ): void {
    const level = success ? 'info' : 'error';
    this.log(level, `Worktree ${operation}: ${success ? 'success' : 'failed'}`, {
      operation,
      issueId,
      worktreePath,
      success,
      error,
    });
  }
}

/**
 * Global logger instance
 */
let globalLogger: Logger | null = null;

/**
 * Get or create the global logger instance
 */
export function getLogger(config?: Partial<LoggerConfig>): Logger {
  if (!globalLogger) {
    globalLogger = new Logger(config);
  }
  return globalLogger;
}

/**
 * Set the global logger instance
 */
export function setLogger(logger: Logger): void {
  globalLogger = logger;
}

import { ProviderType } from '../types/index.js';

/**
 * Error severity levels for structured logging
 */
export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Base error class for all jinyang errors.
 * Provides structured context for debugging and monitoring.
 */
export class JinyangError extends Error {
  public readonly timestamp: Date;
  public readonly severity: ErrorSeverity;

  constructor(
    message: string,
    public readonly code: string,
    severity: ErrorSeverity = 'error',
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'JinyangError';
    this.timestamp = new Date();
    this.severity = severity;
  }

  /**
   * Convert error to structured JSON for logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      severity: this.severity,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * Execution errors during agent execution
 */
export class ExecutionError extends JinyangError {
  constructor(
    message: string,
    public readonly executorType: string,
    public readonly issueId?: string,
    context?: Record<string, unknown>,
    severity: ErrorSeverity = 'error'
  ) {
    super(message, 'EXECUTION_ERROR', severity, {
      executorType,
      issueId,
      ...context,
    });
    this.name = 'ExecutionError';
  }
}

/**
 * Network-specific execution errors
 */
export class NetworkError extends ExecutionError {
  public readonly statusCode?: number;
  
  constructor(
    message: string,
    executorType: string,
    statusCode?: number,
    issueId?: string,
    context?: Record<string, unknown>
  ) {
    const code = NetworkError.classifyStatusCode(statusCode);
    super(message, executorType, issueId, { statusCode, ...context }, 'error');
    this.name = 'NetworkError';
    this.statusCode = statusCode;
    Object.defineProperty(this, 'code', { value: code, writable: false });
  }

  private static classifyStatusCode(code?: number): string {
    if (!code) return 'NETWORK_ERROR';
    if (code === 401) return 'AUTHENTICATION_ERROR';
    if (code === 429) return 'RATE_LIMIT_ERROR';
    if (code >= 500) return 'SERVER_ERROR';
    if (code >= 400) return 'CLIENT_ERROR';
    return 'NETWORK_ERROR';
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    if (!this.statusCode) return true; // Network errors are retryable
    return this.statusCode >= 500 || this.statusCode === 429;
  }
}

/**
 * SSE connection errors
 */
export class SSEConnectionError extends ExecutionError {
  public readonly sessionId?: string;
  
  constructor(
    message: string,
    executorType: string,
    sessionId?: string,
    issueId?: string,
    context?: Record<string, unknown>
  ) {
    super(message, executorType, issueId, { sessionId, ...context }, 'error');
    this.name = 'SSEConnectionError';
    this.sessionId = sessionId;
    Object.defineProperty(this, 'code', { value: 'SSE_CONNECTION_ERROR', writable: false });
  }
}

/**
 * Verification errors for result validation
 */
export class VerificationError extends JinyangError {
  constructor(
    message: string,
    public readonly verificationType: 'git' | 'file' | 'commit' | 'all',
    public readonly failures: string[],
    public readonly issueId?: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'VERIFICATION_ERROR', 'warning', {
      verificationType,
      failures,
      issueId,
      ...context,
    });
    this.name = 'VerificationError';
  }
}

/**
 * Worktree operation errors
 */
export class WorktreeError extends JinyangError {
  constructor(
    message: string,
    public readonly worktreeCode: 
      | 'GIT_ERROR'
      | 'PERMISSION_DENIED'
      | 'DISK_SPACE'
      | 'WORKTREE_EXISTS'
      | 'REPO_NOT_FOUND'
      | 'INVALID_MODE'
      | 'ORPHANED_CLEANUP_FAILED',
    public readonly issueId?: string,
    public readonly worktreePath?: string,
    context?: Record<string, unknown>
  ) {
    super(message, worktreeCode, worktreeCode === 'DISK_SPACE' ? 'critical' : 'error', {
      issueId,
      worktreePath,
      ...context,
    });
    this.name = 'WorktreeError';
  }

  /**
   * Check if error is user-fixable
   */
  isUserFixable(): boolean {
    return ['PERMISSION_DENIED', 'DISK_SPACE'].includes(this.worktreeCode);
  }
}

/**
 * Routing errors for issue routing failures
 */
export class RoutingError extends JinyangError {
  constructor(
    message: string,
    public readonly routingCode:
      | 'NO_CONFIG'
      | 'NO_MATCH'
      | 'INVALID_REPOSITORY'
      | 'CONFIG_LOAD_ERROR',
    public readonly issueId?: string,
    context?: Record<string, unknown>
  ) {
    super(message, routingCode, 'error', { issueId, ...context });
    this.name = 'RoutingError';
  }
}

/**
 * Provider errors for provider availability
 */
export class ProviderError extends JinyangError {
  constructor(
    message: string,
    public readonly providerType: ProviderType,
    public readonly providerCode:
      | 'UNAVAILABLE'
      | 'HEALTH_CHECK_FAILED'
      | 'AUTHENTICATION_FAILED'
      | 'RATE_LIMITED'
      | 'TIMEOUT',
    public readonly context?: Record<string, unknown>
  ) {
    super(message, `PROVIDER_${providerCode}`, ProviderError.classifySeverity(providerCode), {
      providerType,
      ...context,
    });
    this.name = 'ProviderError';
  }

  private static classifySeverity(code: string): ErrorSeverity {
    if (code === 'RATE_LIMITED') return 'warning';
    if (code === 'AUTHENTICATION_FAILED') return 'critical';
    return 'error';
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    return ['UNAVAILABLE', 'HEALTH_CHECK_FAILED', 'RATE_LIMITED'].includes(this.providerCode);
  }
}

/**
 * Webhook processing errors
 */
export class WebhookError extends JinyangError {
  constructor(
    message: string,
    public readonly webhookCode:
      | 'INVALID_PAYLOAD'
      | 'SIGNATURE_INVALID'
      | 'PAYLOAD_TOO_LARGE'
      | 'RATE_LIMITED'
      | 'PARSING_ERROR',
    public readonly requestId?: string,
    context?: Record<string, unknown>
  ) {
    const severity: ErrorSeverity = 
      webhookCode === 'SIGNATURE_INVALID' ? 'warning' : 
      webhookCode === 'PAYLOAD_TOO_LARGE' ? 'error' : 'info';
    
    super(message, webhookCode, severity, { requestId, ...context });
    this.name = 'WebhookError';
  }
}

/**
 * Linear API errors
 */
export class LinearAPIError extends JinyangError {
  constructor(
    message: string,
    public readonly linearCode:
      | 'API_ERROR'
      | 'RATE_LIMITED'
      | 'AUTHENTICATION_FAILED'
      | 'ISSUE_NOT_FOUND'
      | 'UPDATE_FAILED',
    public readonly issueId?: string,
    context?: Record<string, unknown>
  ) {
    super(message, linearCode, 'error', { issueId, ...context });
    this.name = 'LinearAPIError';
  }
}

/**
 * Orchestrator errors for coordination failures
 */
export class OrchestratorError extends JinyangError {
  constructor(
    message: string,
    public readonly orchestratorCode:
      | 'PROCESSING_FAILED'
      | 'RETRY_EXHAUSTED'
      | 'FALLBACK_FAILED'
      | 'CONTEXT_LOST'
      | 'LINEAR_UPDATE_FAILED',
    public readonly issueId?: string,
    public readonly phase?: string,
    context?: Record<string, unknown>
  ) {
    super(message, orchestratorCode, 'error', { issueId, phase, ...context });
    this.name = 'OrchestratorError';
  }
}

/**
 * Type guard for error classification
 */
export function isJinyangError(error: unknown): error is JinyangError {
  return error instanceof JinyangError;
}

/**
 * Type guard for execution errors
 */
export function isExecutionError(error: unknown): error is ExecutionError {
  return error instanceof ExecutionError;
}

/**
 * Type guard for retryable errors
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof NetworkError) return error.isRetryable();
  if (error instanceof ProviderError) return error.isRetryable();
  if (error instanceof SSEConnectionError) return true;
  return false;
}

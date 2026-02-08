import type { ProviderRouter } from '../provider/router.js';
import type { ProviderType, HealthStatus } from '../types/index.js';

/**
 * Configuration for retry behavior with exponential backoff
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Initial delay in milliseconds (default: 1000) */
  baseDelayMs: number;
  /** Maximum delay between retries in milliseconds (default: 30000) */
  maxDelayMs: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier: number;
  /** Error patterns/codes that should trigger a retry */
  retryableErrors: string[];
  /** HTTP status codes that should trigger a retry */
  retryableStatusCodes: number[];
  /** Whether to respect Retry-After header (default: true) */
  respectRetryAfter: boolean;
}

/**
 * Context for retry operations (for logging and debugging)
 */
export interface RetryContext {
  /** Issue identifier for tracking */
  issueId: string;
  /** Operation being retried */
  operation: string;
  /** Provider type if applicable */
  provider?: ProviderType;
}

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  /** Whether the operation succeeded */
  success: boolean;
  /** The result value if successful */
  data?: T;
  /** Error if operation failed after all retries */
  error?: Error;
  /** Number of retry attempts made */
  attempts: number;
  /** Total duration in milliseconds */
  duration: number;
  /** Whether any retries were performed */
  wasRetried: boolean;
  /** Delay values used for each retry */
  retryDelays: number[];
}

/**
 * Custom error class for non-retryable errors
 */
export class NonRetryableError extends Error {
  constructor(
    message: string,
    public readonly originalError?: Error,
    public readonly reason: string = 'Error is not retryable'
  ) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN',
    'NETWORK_ERROR',
    'TIMEOUT',
    'SESSION_FAILED',
    'PROVIDER_UNAVAILABLE',
    'SSE_CONNECTION_DROP',
    'WORKTREE_FAILURE',
    'rate limit',
    'Rate limit',
    '429',
    '503',
    '504',
  ],
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  respectRetryAfter: true,
};

/**
 * Error patterns that should NOT be retried (immediate failure)
 */
const NON_RETRYABLE_PATTERNS = [
  '401', // Unauthorized - auth failure
  'Unauthorized',
  'unauthorized',
  '403', // Forbidden
  '400', // Bad Request
  'Bad Request',
  'bad request',
  'GIT_VERIFICATION_FAILED',
  'FILE_VERIFICATION_FAILED',
  'verification failed',
  'git conflict',
  'merge conflict',
  'CONFLICT',
  'Authentication failed',
  'Invalid API key',
  'invalid token',
  'prompt too long',
  'context window exceeded',
  'Failed to send prompt', // API-level validation errors
  'Failed to create session', // API-level validation errors
];

/**
 * Calculate delay for a given retry attempt using exponential backoff
 */
export function calculateDelay(
  attempt: number,
  config: RetryConfig,
  retryAfterHeader?: number
): number {
  // Respect Retry-After header if present and enabled
  if (config.respectRetryAfter && retryAfterHeader && retryAfterHeader > 0) {
    // Retry-After is in seconds, convert to milliseconds
    return Math.min(retryAfterHeader * 1000, config.maxDelayMs);
  }

  // Calculate exponential backoff: baseDelay * (multiplier ^ attempt)
  // Retry 1: wait 1000ms
  // Retry 2: wait 2000ms
  // Retry 3: wait 4000ms
  const delay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);

  // Cap at max delay
  return Math.min(delay, config.maxDelayMs);
}

/**
 * Check if an error is retryable based on patterns and status codes
 */
export function isRetryableError(
  error: Error | unknown,
  config: RetryConfig
): { retryable: boolean; reason: string } {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorString = errorMessage.toLowerCase();

  // First check non-retryable patterns (higher priority)
  for (const pattern of NON_RETRYABLE_PATTERNS) {
    if (errorMessage.includes(pattern) || errorString.includes(pattern.toLowerCase())) {
      return {
        retryable: false,
        reason: `Non-retryable error pattern detected: ${pattern}`,
      };
    }
  }

  // Check retryable status codes in message
  for (const code of config.retryableStatusCodes) {
    const codeStr = code.toString();
    if (errorMessage.includes(codeStr)) {
      return {
        retryable: true,
        reason: `Retryable HTTP status code: ${code}`,
      };
    }
  }

  // Check retryable error patterns
  for (const pattern of config.retryableErrors) {
    if (
      errorMessage.includes(pattern) ||
      errorString.includes(pattern.toLowerCase())
    ) {
      return {
        retryable: true,
        reason: `Retryable error pattern: ${pattern}`,
      };
    }
  }

  // Default: not retryable if unknown
  return {
    retryable: false,
    reason: 'Unknown error type - not in retryable list',
  };
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract Retry-After header value from error or response
 */
export function extractRetryAfter(error: Error | unknown): number | undefined {
  if (error instanceof Error && 'retryAfter' in error) {
    const retryAfter = (error as { retryAfter?: number }).retryAfter;
    if (typeof retryAfter === 'number' && retryAfter > 0) {
      return retryAfter;
    }
  }

  // Try to parse from error message
  const errorMessage = error instanceof Error ? error.message : String(error);
  const match = errorMessage.match(/retry[- ]?after[:\s]*(\d+)/i);
  if (match) {
    const value = parseInt(match[1], 10);
    if (!isNaN(value) && value > 0) {
      return value;
    }
  }

  return undefined;
}

/**
 * Execute a function with intelligent retry logic and exponential backoff
 *
 * @param fn - The function to execute with retry
 * @param config - Retry configuration
 * @param context - Context for logging and debugging
 * @param providerRouter - Optional provider router for marking provider as failed on final retry
 * @returns Promise resolving to retry result
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => executor.execute(config),
 *   DEFAULT_RETRY_CONFIG,
 *   { issueId: 'ROM-123', operation: 'execute', provider: 'opencode-glm47' }
 * );
 *
 * if (result.success) {
 *   console.log('Success:', result.data);
 * } else {
 *   console.error('Failed after', result.attempts, 'attempts');
 * }
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  context: RetryContext,
  providerRouter?: ProviderRouter
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  const retryDelays: number[] = [];
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const result = await fn();

      const duration = Date.now() - startTime;
      const wasRetried = attempt > 0;

      if (wasRetried) {
        console.log(
          `[Retry] ${context.operation} for ${context.issueId} succeeded after ${attempt} retry attempt(s)`
        );
      }

      return {
        success: true,
        data: result,
        attempts: attempt + 1,
        duration,
        wasRetried,
        retryDelays,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry this error
      const { retryable, reason } = isRetryableError(lastError, config);

      if (!retryable) {
        console.log(
          `[Retry] ${context.operation} for ${context.issueId} failed with non-retryable error: ${reason}`
        );
        // Return as failed result instead of throwing for non-retryable errors
        // This maintains compatibility with existing code that expects error results
        const duration = Date.now() - startTime;
        return {
          success: false,
          error: lastError,
          attempts: attempt + 1,
          duration,
          wasRetried: attempt > 0,
          retryDelays,
        };
      }

      // If this was the last attempt, don't retry
      if (attempt >= config.maxRetries) {
        console.error(
          `[Retry] ${context.operation} for ${context.issueId} failed after ${config.maxRetries} retries: ${lastError.message}`
        );

        // Mark provider as failed if providerRouter is provided
        if (providerRouter && context.provider) {
          console.log(
            `[Retry] Marking provider ${context.provider} as failed after exhausting retries`
          );
          try {
            // Force health refresh to mark provider as unhealthy
            providerRouter.forceHealthRefresh();
          } catch (routerError) {
            console.error('[Retry] Failed to mark provider as failed:', routerError);
          }
        }

        const duration = Date.now() - startTime;
        return {
          success: false,
          error: lastError,
          attempts: attempt + 1,
          duration,
          wasRetried: attempt > 0,
          retryDelays,
        };
      }

      // Calculate and apply delay
      const retryAfter = extractRetryAfter(lastError);
      const delay = calculateDelay(attempt, config, retryAfter);
      retryDelays.push(delay);

      console.log(
        `[Retry] ${context.operation} for ${context.issueId} attempt ${attempt + 1}/${config.maxRetries + 1} failed: ${lastError.message}. Retrying in ${delay}ms...`
      );

      // Wait before next attempt
      await sleep(delay);
    }
  }

  // Should never reach here, but TypeScript needs it
  const duration = Date.now() - startTime;
  return {
    success: false,
    error: lastError,
    attempts: config.maxRetries + 1,
    duration,
    wasRetried: true,
    retryDelays,
  };
}

/**
 * Create a retry configuration with custom overrides
 */
export function createRetryConfig(overrides?: Partial<RetryConfig>): RetryConfig {
  return {
    ...DEFAULT_RETRY_CONFIG,
    ...overrides,
    // Merge arrays to avoid completely replacing defaults
    retryableErrors: [
      ...DEFAULT_RETRY_CONFIG.retryableErrors,
      ...(overrides?.retryableErrors || []),
    ],
    retryableStatusCodes: [
      ...DEFAULT_RETRY_CONFIG.retryableStatusCodes,
      ...(overrides?.retryableStatusCodes || []),
    ],
  };
}

/**
 * Wrap a function with retry logic, returning a new function
 */
export function wrapWithRetry<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  config: RetryConfig,
  contextFactory: (...args: TArgs) => RetryContext,
  providerRouter?: ProviderRouter
): (...args: TArgs) => Promise<RetryResult<TResult>> {
  return async (...args: TArgs) => {
    const context = contextFactory(...args);
    return withRetry(() => fn(...args), config, context, providerRouter);
  };
}

/**
 * Quick retry wrapper with default config
 */
export async function retryWithDefaults<T>(
  fn: () => Promise<T>,
  context: RetryContext,
  providerRouter?: ProviderRouter
): Promise<RetryResult<T>> {
  return withRetry(fn, DEFAULT_RETRY_CONFIG, context, providerRouter);
}

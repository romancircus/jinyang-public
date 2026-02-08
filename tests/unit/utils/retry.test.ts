import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withRetry,
  createRetryConfig,
  calculateDelay,
  isRetryableError,
  extractRetryAfter,
  sleep,
  wrapWithRetry,
  retryWithDefaults,
  DEFAULT_RETRY_CONFIG,
  NonRetryableError,
  type RetryConfig,
  type RetryContext,
  type RetryResult,
} from '../../../src/utils/retry.js';
import type { ProviderRouter } from '../../../src/provider/router.js';
import type { ProviderType } from '../../../src/types/index.js';

describe('retry utility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('calculateDelay', () => {
    it('should calculate exponential backoff correctly', () => {
      const config: RetryConfig = {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        retryableErrors: [],
        retryableStatusCodes: [],
        respectRetryAfter: true,
      };

      // Retry 1: 1000ms
      expect(calculateDelay(0, config)).toBe(1000);
      // Retry 2: 2000ms
      expect(calculateDelay(1, config)).toBe(2000);
      // Retry 3: 4000ms
      expect(calculateDelay(2, config)).toBe(4000);
    });

    it('should cap delay at maxDelayMs', () => {
      const config: RetryConfig = {
        maxRetries: 10,
        baseDelayMs: 1000,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
        retryableErrors: [],
        retryableStatusCodes: [],
        respectRetryAfter: true,
      };

      // Should cap at 5000ms
      expect(calculateDelay(5, config)).toBe(5000);
    });

    it('should respect Retry-After header when present', () => {
      const config: RetryConfig = {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        retryableErrors: [],
        retryableStatusCodes: [],
        respectRetryAfter: true,
      };

      // Retry-After of 5 seconds = 5000ms
      expect(calculateDelay(0, config, 5)).toBe(5000);
    });

    it('should cap Retry-After at maxDelayMs', () => {
      const config: RetryConfig = {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
        retryableErrors: [],
        retryableStatusCodes: [],
        respectRetryAfter: true,
      };

      // Retry-After of 60 seconds should be capped at maxDelayMs
      expect(calculateDelay(0, config, 60)).toBe(10000);
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable HTTP status codes', () => {
      const config = DEFAULT_RETRY_CONFIG;
      
      const timeoutError = new Error('Request failed with status 408');
      const tooManyRequestsError = new Error('Request failed with status 429');
      const serverError = new Error('Request failed with status 503');

      expect(isRetryableError(timeoutError, config).retryable).toBe(true);
      expect(isRetryableError(tooManyRequestsError, config).retryable).toBe(true);
      expect(isRetryableError(serverError, config).retryable).toBe(true);
    });

    it('should identify non-retryable HTTP status codes', () => {
      const config = DEFAULT_RETRY_CONFIG;
      
      const authError = new Error('Request failed with status 401');
      const badRequestError = new Error('Request failed with status 400');
      const forbiddenError = new Error('Request failed with status 403');

      expect(isRetryableError(authError, config).retryable).toBe(false);
      expect(isRetryableError(badRequestError, config).retryable).toBe(false);
      expect(isRetryableError(forbiddenError, config).retryable).toBe(false);
    });

    it('should identify retryable error patterns', () => {
      const config = DEFAULT_RETRY_CONFIG;
      
      const networkError = new Error('ETIMEDOUT: Connection timed out');
      const rateLimitError = new Error('Rate limit exceeded');
      const timeoutError = new Error('TIMEOUT: Operation timed out');

      expect(isRetryableError(networkError, config).retryable).toBe(true);
      expect(isRetryableError(rateLimitError, config).retryable).toBe(true);
      expect(isRetryableError(timeoutError, config).retryable).toBe(true);
    });

    it('should identify non-retryable error patterns', () => {
      const config = DEFAULT_RETRY_CONFIG;
      
      const gitConflictError = new Error('git conflict detected');
      const verificationError = new Error('GIT_VERIFICATION_FAILED');
      const invalidTokenError = new Error('Invalid API key');

      expect(isRetryableError(gitConflictError, config).retryable).toBe(false);
      expect(isRetryableError(verificationError, config).retryable).toBe(false);
      expect(isRetryableError(invalidTokenError, config).retryable).toBe(false);
    });

    it('should handle string errors', () => {
      const config = DEFAULT_RETRY_CONFIG;
      
      expect(isRetryableError('ETIMEDOUT', config).retryable).toBe(true);
      expect(isRetryableError('401 Unauthorized', config).retryable).toBe(false);
    });
  });

  describe('extractRetryAfter', () => {
    it('should extract Retry-After from error object', () => {
      const error = new Error('Rate limited') as Error & { retryAfter: number };
      error.retryAfter = 30;
      
      expect(extractRetryAfter(error)).toBe(30);
    });

    it('should parse Retry-After from error message', () => {
      const error1 = new Error('Rate limited. Retry after: 60 seconds');
      const error2 = new Error('429 Too Many Requests. Retry-After: 120');
      const error3 = new Error('retry after 30');

      expect(extractRetryAfter(error1)).toBe(60);
      expect(extractRetryAfter(error2)).toBe(120);
      expect(extractRetryAfter(error3)).toBe(30);
    });

    it('should return undefined for invalid values', () => {
      expect(extractRetryAfter(new Error('No retry info'))).toBeUndefined();
      expect(extractRetryAfter('just a string')).toBeUndefined();
    });
  });

  describe('sleep', () => {
    it('should resolve after specified time', async () => {
      const startTime = Date.now();
      
      const sleepPromise = sleep(1000);
      vi.advanceTimersByTime(1000);
      await sleepPromise;
      
      expect(Date.now() - startTime).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const context: RetryContext = { issueId: 'ROM-123', operation: 'test' };

      const result = await withRetry(fn, DEFAULT_RETRY_CONFIG, context);

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(1);
      expect(result.wasRetried).toBe(false);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error and succeed', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValueOnce('success');

      const context: RetryContext = { issueId: 'ROM-123', operation: 'test' };

      const resultPromise = withRetry(fn, DEFAULT_RETRY_CONFIG, context);
      
      // First attempt fails immediately
      await vi.advanceTimersByTimeAsync(0);
      
      // Wait for first retry delay (1000ms)
      await vi.advanceTimersByTimeAsync(1000);
      
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(2);
      expect(result.wasRetried).toBe(true);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should return failed result immediately on non-retryable error', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('401 Unauthorized'));
      const context: RetryContext = { issueId: 'ROM-123', operation: 'test' };

      const result = await withRetry(fn, DEFAULT_RETRY_CONFIG, context);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('401');
      expect(result.attempts).toBe(1);
      expect(result.wasRetried).toBe(false);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should fail after maxRetries exhausted', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));
      const context: RetryContext = { issueId: 'ROM-123', operation: 'test' };
      
      const config: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        maxRetries: 2,
      };

      const resultPromise = withRetry(fn, config, context);
      
      // Advance through all retry delays
      await vi.advanceTimersByTimeAsync(0); // First attempt
      await vi.advanceTimersByTimeAsync(1000); // Retry 1 delay
      await vi.advanceTimersByTimeAsync(2000); // Retry 2 delay
      
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3); // Initial + 2 retries
      expect(result.error).toBeDefined();
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should use provider router on final retry failure', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'));
      const context: RetryContext = { 
        issueId: 'ROM-123', 
        operation: 'test',
        provider: 'opencode-glm47' as ProviderType
      };
      
      const mockProviderRouter = {
        forceHealthRefresh: vi.fn(),
      } as unknown as ProviderRouter;

      const config: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        maxRetries: 1,
      };

      const resultPromise = withRetry(fn, config, context, mockProviderRouter);
      
      await vi.advanceTimersByTimeAsync(0); // First attempt
      await vi.advanceTimersByTimeAsync(1000); // Retry 1 delay
      
      await resultPromise;

      expect(mockProviderRouter.forceHealthRefresh).toHaveBeenCalled();
    });

    it('should track retry delays', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValueOnce('success');

      const context: RetryContext = { issueId: 'ROM-123', operation: 'test' };

      const resultPromise = withRetry(fn, DEFAULT_RETRY_CONFIG, context);
      
      await vi.advanceTimersByTimeAsync(0); // First attempt
      await vi.advanceTimersByTimeAsync(1000); // Retry 1 delay
      await vi.advanceTimersByTimeAsync(2000); // Retry 2 delay
      
      const result = await resultPromise;

      expect(result.retryDelays).toEqual([1000, 2000]);
    });
  });

  describe('createRetryConfig', () => {
    it('should create config with defaults', () => {
      const config = createRetryConfig();

      expect(config.maxRetries).toBe(DEFAULT_RETRY_CONFIG.maxRetries);
      expect(config.baseDelayMs).toBe(DEFAULT_RETRY_CONFIG.baseDelayMs);
    });

    it('should merge custom values', () => {
      const config = createRetryConfig({ maxRetries: 5, baseDelayMs: 500 });

      expect(config.maxRetries).toBe(5);
      expect(config.baseDelayMs).toBe(500);
      expect(config.backoffMultiplier).toBe(DEFAULT_RETRY_CONFIG.backoffMultiplier);
    });

    it('should merge arrays rather than replace', () => {
      const config = createRetryConfig({ retryableErrors: ['CUSTOM_ERROR'] });

      expect(config.retryableErrors).toContain('CUSTOM_ERROR');
      expect(config.retryableErrors).toContain('ETIMEDOUT');
    });
  });

  describe('wrapWithRetry', () => {
    it('should wrap function with retry logic', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const contextFactory = (arg: string) => ({ 
        issueId: `ROM-${arg}`, 
        operation: 'test' 
      });

      const wrappedFn = wrapWithRetry(fn, DEFAULT_RETRY_CONFIG, contextFactory);
      const result = await wrappedFn('123');

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(fn).toHaveBeenCalledWith('123');
    });
  });

  describe('retryWithDefaults', () => {
    it('should use default config', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const context: RetryContext = { issueId: 'ROM-123', operation: 'test' };

      const result = await retryWithDefaults(fn, context);

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
    });
  });

  describe('NonRetryableError', () => {
    it('should create error with original error and reason', () => {
      const originalError = new Error('Original error');
      const error = new NonRetryableError('Non-retryable', originalError, 'Auth failed');

      expect(error.message).toBe('Non-retryable');
      expect(error.originalError).toBe(originalError);
      expect(error.reason).toBe('Auth failed');
      expect(error.name).toBe('NonRetryableError');
    });

    it('should be usable as a standard error type', () => {
      const error = new NonRetryableError('Test error');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(NonRetryableError);
    });
  });
});

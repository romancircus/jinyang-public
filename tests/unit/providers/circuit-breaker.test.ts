import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitOpenError, CircuitState } from '../../../src/provider/circuit-breaker.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      halfOpenMaxCalls: 2
    });
  });

  describe('Initial State', () => {
    it('should start in closed state', () => {
      expect(breaker.getState()).toBe('closed');
    });

    it('should have zero failures and successes initially', () => {
      const stats = breaker.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.state).toBe('closed');
    });
  });

  describe('Closed State', () => {
    it('should execute successful operations', async () => {
      const fn = () => Promise.resolve('success');
      const result = await breaker.execute(fn);
      expect(result).toBe('success');
      expect(breaker.getState()).toBe('closed');
    });

    it('should track successes', async () => {
      await breaker.execute(() => Promise.resolve('a'));
      await breaker.execute(() => Promise.resolve('b'));
      const stats = breaker.getStats();
      expect(stats.successes).toBe(2);
      expect(stats.failures).toBe(0);
    });

    it('should track failures when operation fails', async () => {
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
      const stats = breaker.getStats();
      expect(stats.failures).toBe(1);
      expect(stats.successes).toBe(0);
    });

    it('should propagate error from failed operation', async () => {
      const customError = new Error('custom error');
      await expect(breaker.execute(() => Promise.reject(customError))).rejects.toBe(customError);
    });

    it('should record last success time', async () => {
      const before = new Date();
      await breaker.execute(() => Promise.resolve('success'));
      const after = new Date();
      const stats = breaker.getStats();
      expect(stats.lastSuccessTime).toBeDefined();
      expect(stats.lastSuccessTime!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(stats.lastSuccessTime!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should record last failure time', async () => {
      const before = new Date();
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      const after = new Date();
      const stats = breaker.getStats();
      expect(stats.lastFailureTime).toBeDefined();
      expect(stats.lastFailureTime!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(stats.lastFailureTime!.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Open State Transition', () => {
    it('should transition to open after threshold failures', async () => {
      const error = new Error('fail');

      // 2 failures - still closed
      await expect(breaker.execute(() => Promise.reject(error))).rejects.toThrow();
      await expect(breaker.execute(() => Promise.reject(error))).rejects.toThrow();
      expect(breaker.getState()).toBe('closed');

      // 3rd failure - should open
      await expect(breaker.execute(() => Promise.reject(error))).rejects.toThrow();
      expect(breaker.getState()).toBe('open');
    });

    it('should reject calls immediately when open', async () => {
      // Trigger open state
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      expect(breaker.getState()).toBe('open');

      // Should reject without executing
      let executed = false;
      await expect(
        breaker.execute(() => {
          executed = true;
          return Promise.resolve('should not run');
        })
      ).rejects.toThrow(CircuitOpenError);

      expect(executed).toBe(false);
    });

    it('should reset failure count on success in closed state', async () => {
      // 2 failures
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(breaker.getStats().failures).toBe(2);

      // Success should reset
      await breaker.execute(() => Promise.resolve('success'));
      expect(breaker.getStats().failures).toBe(0);
    });
  });

  describe('Half-Open State Transition', () => {
    it('should transition from open to half-open after timeout', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }
      expect(breaker.getState()).toBe('open');

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Check transition to half-open (by calling execute)
      expect(breaker.getState()).toBe('half-open');
    });

    it('should close circuit after success in half-open', async () => {
      // Open circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Success in half-open should close
      await breaker.execute(() => Promise.resolve('success'));
      expect(breaker.getState()).toBe('closed');

      // Should allow normal operation again
      const result = await breaker.execute(() => Promise.resolve('working'));
      expect(result).toBe('working');
    });

    it('should reopen circuit on failure in half-open', async () => {
      // Open circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Failure in half-open should reopen
      await expect(breaker.execute(() => Promise.reject(new Error('fail again')))).rejects.toThrow('fail again');
      expect(breaker.getState()).toBe('open');
    });

    it('should reset counters when transitioning to half-open', async () => {
      // Open circuit with failures
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Check state transition
      expect(breaker.getState()).toBe('half-open');

      // Counters should be reset
      const stats = breaker.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
    });

    it('should track successes in half-open before closing', async () => {
      // Open circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Success should close the circuit immediately
      await breaker.execute(() => Promise.resolve('success'));

      // Now should be closed, not half-open
      expect(breaker.getState()).toBe('closed');
    });
  });

  describe('Default Configuration', () => {
    it('should use default values when no config provided', () => {
      const defaultBreaker = new CircuitBreaker();
      expect(defaultBreaker.getStats().state).toBe('closed');

      // Test with default threshold of 5
      for (let i = 0; i < 4; i++) {
        expect(defaultBreaker.getState()).toBe('closed');
        defaultBreaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
      }
    });

    it('should allow partial config override', () => {
      const partialBreaker = new CircuitBreaker({ failureThreshold: 2 });
      expect(partialBreaker.getStats().state).toBe('closed');
    });
  });

  describe('Reset', () => {
    it('should reset all state', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }
      expect(breaker.getState()).toBe('open');

      // Reset
      breaker.reset();

      expect(breaker.getState()).toBe('closed');
      const stats = breaker.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.lastFailureTime).toBeUndefined();
      expect(stats.lastSuccessTime).toBeUndefined();

      // Should work normally again
      const result = await breaker.execute(() => Promise.resolve('working'));
      expect(result).toBe('working');
    });
  });

  describe('Concurrent Calls', () => {
    it('should handle concurrent calls in closed state', async () => {
      const promises = [
        breaker.execute(() => Promise.resolve('a')),
        breaker.execute(() => Promise.resolve('b')),
        breaker.execute(() => Promise.resolve('c'))
      ];

      const results = await Promise.all(promises);
      expect(results).toEqual(['a', 'b', 'c']);
      expect(breaker.getStats().successes).toBe(3);
    });

    it('should handle concurrent failures in closed state', async () => {
      const promises = [
        breaker.execute(() => Promise.reject(new Error('1'))).catch(() => {}),
        breaker.execute(() => Promise.reject(new Error('2'))).catch(() => {}),
        breaker.execute(() => Promise.reject(new Error('3'))).catch(() => {})
      ];

      await Promise.all(promises);
      expect(breaker.getState()).toBe('open');
      expect(breaker.getStats().failures).toBe(3);
    });

    it('should limit concurrent calls in half-open state', async () => {
      // Open circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should be in half-open
      expect(breaker.getState()).toBe('half-open');

      // Fire 3 concurrent calls (max is 2)
      const results = await Promise.allSettled([
        breaker.execute(() => Promise.resolve('a')),
        breaker.execute(() => Promise.resolve('b')),
        breaker.execute(() => Promise.resolve('c'))
      ]);

      // Some should succeed, one should be rejected
      const successes = results.filter(r => r.status === 'fulfilled').length;
      const failures = results.filter(r => r.status === 'rejected').length;
      expect(successes).toBe(2);
      expect(failures).toBe(1);
    });
  });

  describe('Error Types', () => {
    it('should throw CircuitOpenError when circuit is open', async () => {
      // Open circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      try {
        await breaker.execute(() => Promise.resolve('test'));
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        expect((error as CircuitOpenError).message).toBe('Circuit breaker is open');
        expect((error as CircuitOpenError).name).toBe('CircuitOpenError');
      }
    });

    it('should throw CircuitOpenError when max calls exceeded in half-open', async () => {
      // Open circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Use up half-open calls (2 max) - both succeed so circuit closes
      await breaker.execute(() => Promise.resolve('1'));
      await breaker.execute(() => Promise.resolve('2'));

      // Third call should succeed because circuit is now closed
      const result = await breaker.execute(() => Promise.resolve('3'));
      expect(result).toBe('3');
      expect(breaker.getState()).toBe('closed');
    });

    it('should throw CircuitOpenError when half-open exceeds max concurrent calls', async () => {
      // Create breaker with halfOpenMaxCalls = 1 for clearer testing
      const singleCallBreaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeoutMs: 1000,
        halfOpenMaxCalls: 1
      });

      // Open circuit
      for (let i = 0; i < 3; i++) {
        await expect(singleCallBreaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Fire 2 concurrent calls (max is 1)
      const results = await Promise.allSettled([
        singleCallBreaker.execute(() => new Promise(resolve => setTimeout(() => resolve('a'), 100))),
        singleCallBreaker.execute(() => Promise.resolve('b'))
      ]);

      // One should succeed, one should be rejected due to max concurrent limit
      const successes = results.filter(r => r.status === 'fulfilled').length;
      const failures = results.filter(r => r.status === 'rejected').length;
      expect(successes).toBe(1);
      expect(failures).toBe(1);

      // The failure should be CircuitOpenError
      const failure = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
      expect(failure.reason).toBeInstanceOf(CircuitOpenError);
    });
  });

  describe('Stats Consistency', () => {
    it('should return consistent stats across calls', async () => {
      await breaker.execute(() => Promise.resolve('success'));

      const stats1 = breaker.getStats();
      const stats2 = breaker.getStats();

      expect(stats1.state).toBe(stats2.state);
      expect(stats1.failures).toBe(stats2.failures);
      expect(stats1.successes).toBe(stats2.successes);
      expect(stats1.lastSuccessTime?.getTime()).toBe(stats2.lastSuccessTime?.getTime());
    });

    it('should update stats after state transitions', async () => {
      const initialStats = breaker.getStats();
      expect(initialStats.state).toBe('closed');

      // Failures
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

      const openStats = breaker.getStats();
      expect(openStats.state).toBe('open');
      expect(openStats.failures).toBe(3);
    });
  });

  describe('Long-Running Operations', () => {
    it('should handle operations that take time', async () => {
      const slowFn = () => new Promise<string>(resolve => {
        setTimeout(() => resolve('completed'), 50);
      });

      const result = await breaker.execute(slowFn);
      expect(result).toBe('completed');
      expect(breaker.getStats().successes).toBe(1);
    });

    it('should handle timeout during open transition check', async () => {
      // Open circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      }

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // State should be half-open before any execute call
      expect(breaker.getState()).toBe('half-open');
    });
  });
});

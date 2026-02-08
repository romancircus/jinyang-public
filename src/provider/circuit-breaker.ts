import { promises as fs } from 'fs'
import { join } from 'path'
import { CircuitState as InternalState } from '../types/circuit-breaker.js'
import type { CircuitBreakerConfig, ProviderCircuitState } from '../types/circuit-breaker.js'

// Legacy CircuitState type for backward compatibility with tests
export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
}

export class CircuitOpenError extends Error {
  constructor(message: string = 'Circuit breaker is open') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  sleepWindowMs: 60000,
  halfOpenMaxCalls: 2,
  statePath: join(process.env.HOME!, '.jinyang/providers/state.json')
}

export class CircuitBreaker {
  private config: CircuitBreakerConfig
  private providerId: string
  private state: ProviderCircuitState
  private successes: number = 0
  private halfOpenCalls: number = 0

  constructor(providerIdOrConfig?: string | Partial<CircuitBreakerConfig & { resetTimeoutMs?: number; halfOpenMaxCalls?: number }>, config?: Partial<CircuitBreakerConfig>) {
    // Support both patterns: new CircuitBreaker(config) and new CircuitBreaker(providerId, config)
    // Also handle legacy config property names (resetTimeoutMs -> sleepWindowMs)
    let mergedConfig: Partial<CircuitBreakerConfig> = {}

    if (typeof providerIdOrConfig === 'string') {
      this.providerId = providerIdOrConfig
      mergedConfig = config || {}
    } else {
      this.providerId = 'default'
      mergedConfig = providerIdOrConfig || {}
    }

    // Map legacy property names to new ones
    const normalizedConfig: Partial<CircuitBreakerConfig> = {
      ...mergedConfig,
      sleepWindowMs: (mergedConfig as { resetTimeoutMs?: number }).resetTimeoutMs ?? mergedConfig.sleepWindowMs
    }

    this.config = { ...DEFAULT_CONFIG, ...normalizedConfig }
    this.state = this.getInitialState()
  }

  private getInitialState(): ProviderCircuitState {
    return {
      providerId: this.providerId,
      state: InternalState.CLOSED,
      failures: 0,
      successes: 0
    }
  }

  async loadState(): Promise<void> {
    try {
      const data = await fs.readFile(this.config.statePath, 'utf-8')
      const allStates: Record<string, ProviderCircuitState> = JSON.parse(data)
      const saved = allStates[this.providerId]
      if (saved) {
        this.state = saved
        this.checkRecoveryEligible()
      }
    } catch {
      this.state = this.getInitialState()
    }
  }

  async saveState(): Promise<void> {
    try {
      await fs.mkdir(join(process.env.HOME!, '.jinyang/providers'), { recursive: true })
      let allStates: Record<string, ProviderCircuitState> = {}
      try {
        const data = await fs.readFile(this.config.statePath, 'utf-8')
        allStates = JSON.parse(data)
      } catch {}
      allStates[this.providerId] = this.state
      await fs.writeFile(this.config.statePath, JSON.stringify(allStates, null, 2))
    } catch {}
  }

  private checkRecoveryEligible(): void {
    if (this.state.state !== InternalState.OPEN || !this.state.nextRetryAt) return
    const now = Date.now()
    if (now >= this.state.nextRetryAt) {
      this.state.state = InternalState.HALF_OPEN
      this.halfOpenCalls = 0
      this.state.failures = 0
      this.state.successes = 0
    }
  }

  // Legacy execute pattern for backward compatibility
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.checkRecoveryEligible()

    if (this.state.state === InternalState.OPEN) {
      throw new CircuitOpenError()
    }

    if (this.state.state === InternalState.HALF_OPEN) {
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        throw new CircuitOpenError('Circuit breaker is half-open and max test calls reached')
      }
      this.halfOpenCalls++
    }

    try {
      const result = await fn()
      await this.recordSuccess()
      return result
    } catch (error) {
      await this.recordFailure()
      throw error
    }
  }

  async recordSuccess(): Promise<void> {
    this.state.failures = 0
    this.successes++
    this.state.lastSuccessTime = Date.now()

    if (this.state.state === InternalState.HALF_OPEN) {
      this.state.state = InternalState.CLOSED
      this.halfOpenCalls = 0
      this.state.successes = 0
    }

    this.state.lastFailureTime = undefined
    this.state.openedAt = undefined
    this.state.nextRetryAt = undefined
    await this.saveState()
  }

  async recordFailure(): Promise<void> {
    this.state.failures++
    this.state.lastFailureTime = Date.now()

    if (this.state.state === InternalState.HALF_OPEN) {
      this.openCircuit()
    } else if (this.state.failures >= this.config.failureThreshold) {
      this.openCircuit()
    }

    await this.saveState()
  }

  private openCircuit(): void {
    this.state.state = InternalState.OPEN
    this.state.openedAt = Date.now()
    this.state.nextRetryAt = Date.now() + this.config.sleepWindowMs
    this.halfOpenCalls = 0
  }

  async allowRequest(): Promise<boolean> {
    this.checkRecoveryEligible()
    return this.state.state !== InternalState.OPEN
  }

  // Legacy getState returns CircuitStats for backward compatibility
  getState(): CircuitState {
    this.checkRecoveryEligible()
    switch (this.state.state) {
      case InternalState.CLOSED: return 'closed'
      case InternalState.OPEN: return 'open'
      case InternalState.HALF_OPEN: return 'half-open'
      default: return 'closed'
    }
  }

  // Legacy getStats for backward compatibility
  getStats(): CircuitStats {
    this.checkRecoveryEligible()
    let stateStr: CircuitState
    switch (this.state.state) {
      case InternalState.CLOSED: stateStr = 'closed'; break
      case InternalState.OPEN: stateStr = 'open'; break
      case InternalState.HALF_OPEN: stateStr = 'half-open'; break
      default: stateStr = 'closed'
    }
    return {
      state: stateStr,
      failures: this.state.failures,
      successes: this.successes,
      lastFailureTime: this.state.lastFailureTime ? new Date(this.state.lastFailureTime) : undefined,
      lastSuccessTime: this.state.lastSuccessTime ? new Date(this.state.lastSuccessTime) : undefined
    }
  }

  // Reset for backward compatibility
  reset(): void {
    this.state.state = InternalState.CLOSED
    this.state.failures = 0
    this.successes = 0
    this.halfOpenCalls = 0
    this.state.openedAt = undefined
    this.state.nextRetryAt = undefined
    this.state.lastFailureTime = undefined
  }

  getFailureCount(): number {
    return this.state.failures
  }

  isTestRequest(): boolean {
    return this.state.state === InternalState.HALF_OPEN
  }
}

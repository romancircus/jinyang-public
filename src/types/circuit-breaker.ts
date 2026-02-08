export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface ProviderCircuitState {
  state: CircuitState
  failures: number
  successes: number
  lastFailureTime?: number
  lastSuccessTime?: number
  openedAt?: number
  nextRetryAt?: number
  providerId: string
}

export interface CircuitBreakerConfig {
  failureThreshold: number
  sleepWindowMs: number
  halfOpenMaxCalls: number
  statePath: string
}

export interface CircuitBreakerOptions {
  providerId: string
  config?: Partial<CircuitBreakerConfig>
}

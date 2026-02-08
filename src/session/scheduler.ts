import type { SessionConfig } from './types.js'

export interface SchedulerConfig {
  maxConcurrency?: number
}

export interface ScheduledSession {
  config: SessionConfig
  queuedAt: Date
  startedAt?: Date
}

export class Scheduler {
  private maxConcurrency: number
  private activeSessions: Map<string, ScheduledSession>
  private waitingQueue: Array<ScheduledSession>
  private completionCallbacks: Map<string, (sessionId: string) => void>

  constructor(config?: SchedulerConfig) {
    this.maxConcurrency = config?.maxConcurrency ?? 27
    this.activeSessions = new Map()
    this.waitingQueue = []
    this.completionCallbacks = new Map()
  }

  getSessionCount(): { active: number; waiting: number } {
    return {
      active: this.activeSessions.size,
      waiting: this.waitingQueue.length
    }
  }

  getAvailableSlots(): number {
    return this.maxConcurrency - this.activeSessions.size
  }

  addSession(config: SessionConfig): { status: 'started' | 'queued'; sessionId: string } {
    if (this.activeSessions.size >= this.maxConcurrency) {
      this.waitingQueue.push({ config, queuedAt: new Date() })
      return { status: 'queued', sessionId: config.id }
    }

    this.activeSessions.set(config.id, {
      config,
      queuedAt: new Date(),
      startedAt: new Date()
    })
    return { status: 'started', sessionId: config.id }
  }

  removeSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId)
    if (session) {
      this.activeSessions.delete(sessionId)
      this.processWaitingQueue()
    }
  }

  registerCompletionCallback(sessionId: string, callback: (sessionId: string) => void): void {
    this.completionCallbacks.set(sessionId, callback)
  }

  markSessionComplete(sessionId: string, commitSha?: string): void {
    const callback = this.completionCallbacks.get(sessionId)
    if (callback) {
      callback(sessionId)
      this.completionCallbacks.delete(sessionId)
    }
    this.removeSession(sessionId)
  }

  markSessionFailed(sessionId: string, error: Error): void {
    const callback = this.completionCallbacks.get(sessionId)
    if (callback) {
      callback(sessionId)
      this.completionCallbacks.delete(sessionId)
    }
    this.removeSession(sessionId)
  }

  private processWaitingQueue(): void {
    while (this.waitingQueue.length > 0 && this.activeSessions.size < this.maxConcurrency) {
      const nextSession = this.waitingQueue.shift()
      if (!nextSession) break

      this.activeSessions.set(nextSession.config.id, {
        config: nextSession.config,
        queuedAt: nextSession.queuedAt,
        startedAt: new Date()
      })
    }
  }

  getQueuePosition(sessionId: string): number | null {
    const position = this.waitingQueue.findIndex(s => s.config.id === sessionId)
    return position === -1 ? null : position + 1
  }

  getActiveSessions(): Array<{ id: string; linearIssueId: string; repository: string; startedAt: Date }> {
    return Array.from(this.activeSessions.values()).map(s => ({
      id: s.config.id,
      linearIssueId: s.config.linearIssueId,
      repository: s.config.repository,
      startedAt: s.startedAt!
    }))
  }

  getWaitingSessions(): Array<{ id: string; linearIssueId: string; repository: string; queuedAt: Date }> {
    return this.waitingQueue.map(s => ({
      id: s.config.id,
      linearIssueId: s.config.linearIssueId,
      repository: s.config.repository,
      queuedAt: s.queuedAt
    }))
  }

  getMaxConcurrency(): number {
    return this.maxConcurrency
  }

  clearWaitingQueue(): void {
    this.waitingQueue = []
  }

  hasCapacity(): boolean {
    return this.activeSessions.size < this.maxConcurrency
  }
}
import { LinearClient, RateLimitError } from './client.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const SESSIONS_DIR = join(homedir(), '.jinyang', 'sessions');

export interface PollerConfig {
  intervalMs: number;
  maxIntervalMs: number;
  labels: string[];
  states: string[];
}

export class LinearPoller {
  private client: LinearClient;
  private config: PollerConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private abortController = new AbortController();
  private orchestrator: any;

  // Exponential backoff state
  private currentIntervalMs: number;
  private consecutiveFailures = 0;
  private lastSuccessfulPoll: Date | null = null;
  private rateLimitedUntil: Date | null = null;

  // Concurrency limit — don't execute all matching issues simultaneously
  private static readonly CONCURRENCY_LIMIT = 5;

  constructor(orchestrator: any, config?: Partial<PollerConfig>) {
    this.client = new LinearClient();
    this.orchestrator = orchestrator;
    this.config = {
      intervalMs: config?.intervalMs || 30 * 60 * 1000, // 30 minutes default (was 5 min)
      maxIntervalMs: config?.maxIntervalMs || 60 * 60 * 1000, // 1 hour max backoff
      labels: config?.labels || ['jinyang:auto'],
      states: config?.states || ['backlog', 'in_progress'],
    };
    this.currentIntervalMs = this.config.intervalMs;
  }

  /**
   * Check if issue already has an active session
   */
  private async hasActiveSession(issueId: string): Promise<boolean> {
    try {
      const sessionPath = join(SESSIONS_DIR, `${issueId}.json`);
      await fs.access(sessionPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current poller status for monitoring
   */
  public getStatus(): {
    isRunning: boolean;
    currentIntervalMs: number;
    consecutiveFailures: number;
    lastSuccessfulPoll: Date | null;
    rateLimitedUntil: Date | null;
    nextPollIn: number;
  } {
    return {
      isRunning: this.isRunning,
      currentIntervalMs: this.currentIntervalMs,
      consecutiveFailures: this.consecutiveFailures,
      lastSuccessfulPoll: this.lastSuccessfulPoll,
      rateLimitedUntil: this.rateLimitedUntil,
      nextPollIn: this.currentIntervalMs,
    };
  }

  /**
   * Check if we should skip polling due to rate limit
   */
  private shouldSkipDueToRateLimit(): boolean {
    // Check static rate limit status from LinearClient
    const status = LinearClient.checkRateLimitStatus();
    if (status.isLimited) {
      const waitMinutes = Math.ceil(status.retryInMs / 60000);
      console.log(`[Poller] Skipping poll - rate limited for ${waitMinutes} more minutes`);
      return true;
    }

    // Check proactive budget before burning API calls on a poll
    if (LinearClient.isApproachingRateLimit()) {
      const remaining = LinearClient.getRemainingBudget();
      console.log(`[Poller] Skipping poll - approaching rate limit (${remaining} requests remaining in budget)`);
      return true;
    }

    // Check our own rate limit tracking
    if (this.rateLimitedUntil) {
      if (new Date() < this.rateLimitedUntil) {
        const waitMinutes = Math.ceil((this.rateLimitedUntil.getTime() - Date.now()) / 60000);
        console.log(`[Poller] Skipping poll - rate limited for ${waitMinutes} more minutes`);
        return true;
      } else {
        // Rate limit expired, clear it
        this.rateLimitedUntil = null;
        console.log('[Poller] Rate limit expired, resuming normal polling');
      }
    }

    return false;
  }

  /**
   * Apply exponential backoff after failure
   */
  private applyBackoff(): void {
    this.consecutiveFailures++;

    // Double the interval, up to max
    this.currentIntervalMs = Math.min(
      this.currentIntervalMs * 2,
      this.config.maxIntervalMs
    );

    console.log(
      `[Poller] Backoff applied: ${this.consecutiveFailures} failures, ` +
      `next poll in ${Math.round(this.currentIntervalMs / 60000)} minutes`
    );

    // Reschedule with new interval
    this.reschedule();
  }

  /**
   * Reset backoff after successful poll
   */
  private resetBackoff(): void {
    if (this.consecutiveFailures > 0) {
      console.log('[Poller] Backoff reset after successful poll');
    }
    this.consecutiveFailures = 0;
    this.currentIntervalMs = this.config.intervalMs;
    this.lastSuccessfulPoll = new Date();
  }

  /**
   * Handle rate limit error
   */
  private handleRateLimit(error: RateLimitError): void {
    const resetTime = error.resetTime ?? (Date.now() + 60 * 60 * 1000);
    this.rateLimitedUntil = new Date(resetTime);

    const waitMinutes = Math.ceil(error.retryAfterMs / 60000);
    console.log(
      `[Poller] Rate limited! Pausing for ${waitMinutes} minutes ` +
      `(until ${this.rateLimitedUntil.toISOString()})`
    );

    // Set interval to resume after rate limit expires
    this.currentIntervalMs = Math.max(error.retryAfterMs + 60000, this.config.intervalMs); // Add 1 min buffer
    this.reschedule();
  }

  /**
   * Reschedule the next poll with updated interval
   */
  private reschedule(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    if (!this.isRunning) {
      return;
    }

    this.intervalId = setInterval(() => {
      if (!this.isRunning) return;
      this.poll().catch(error => {
        console.error('[Poller] Unhandled poll error in reschedule:', error);
      });
    }, this.currentIntervalMs);
  }

  /**
   * Poll for issues matching criteria
   */
  async poll(): Promise<void> {
    // Check if aborted
    if (this.abortController.signal.aborted) {
      console.log('[Poller] Poll aborted');
      return;
    }

    // Check rate limit before attempting
    if (this.shouldSkipDueToRateLimit()) {
      return;
    }

    try {
      const budget = LinearClient.getRemainingBudget();
      const used = LinearClient.getRequestsInWindow();
      console.log(`[Poller] Starting poll (API budget: ${budget} remaining, ${used} used in window)...`);

      const issues = await this.client.listIssues({
        labels: this.config.labels,
        states: this.config.states as any,
      });

      console.log(`[Poller] Found ${issues.length} issues matching criteria`);

      // Reset backoff on successful query
      this.resetBackoff();

      let executedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;

      // Filter out issues with active sessions first
      const toExecute = [];
      for (const issue of issues) {
        if (await this.hasActiveSession(issue.identifier)) {
          console.log(`[Poller] Skipping ${issue.identifier} - already has active session`);
          skippedCount++;
        } else {
          toExecute.push(issue);
        }
      }

      // Process in batches to prevent burst API usage
      for (let i = 0; i < toExecute.length; i += LinearPoller.CONCURRENCY_LIMIT) {
        // Check if aborted between batches
        if (this.abortController.signal.aborted) {
          console.log('[Poller] Poll interrupted - stopping');
          break;
        }

        const batch = toExecute.slice(i, i + LinearPoller.CONCURRENCY_LIMIT);
        console.log(`[Poller] Processing batch ${Math.floor(i / LinearPoller.CONCURRENCY_LIMIT) + 1}: ${batch.map(b => b.identifier).join(', ')}`);

        const results = await Promise.allSettled(
          batch.map(issue => {
            console.log(`[Poller] Auto-executing ${issue.identifier}: ${issue.title}`);
            return this.orchestrator.processIssue({
              id: issue.id,
              identifier: issue.identifier,
              title: issue.title,
              description: issue.description,
              labels: issue.labels,
            });
          })
        );

        for (let j = 0; j < results.length; j++) {
          if (results[j].status === 'fulfilled') {
            executedCount++;
          } else {
            failedCount++;
            console.error(`[Poller] Failed to execute ${batch[j].identifier}:`, (results[j] as PromiseRejectedResult).reason);
          }
        }
      }

      console.log(`[Poller] Completed: ${executedCount} executed, ${skippedCount} skipped, ${failedCount} failed`);
    } catch (error) {
      // Handle rate limit error specifically
      if (error instanceof RateLimitError) {
        this.handleRateLimit(error);
        return;
      }

      // Log other errors and apply backoff
      console.error('[Poller] Poll failed:', error);
      this.applyBackoff();

      // Only stop on abort, not on regular errors
      if (this.abortController.signal.aborted) {
        console.log('[Poller] Stopping due to abort');
        this.stop();
      }
    }
  }

  /**
   * Start polling at configured interval
   */
  start(): void {
    if (this.isRunning) {
      console.log('[Poller] Already running');
      return;
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    this.currentIntervalMs = this.config.intervalMs;
    this.consecutiveFailures = 0;

    console.log(
      `[Poller] Starting with ${Math.round(this.config.intervalMs / 60000)} minute interval ` +
      `(max backoff: ${Math.round(this.config.maxIntervalMs / 60000)} minutes)`
    );

    // Don't run immediately on start - wait for first interval
    // This prevents burning API calls on rapid restarts
    console.log(`[Poller] First poll in ${Math.round(this.config.intervalMs / 60000)} minutes`);

    // Set up interval
    this.intervalId = setInterval(() => {
      if (!this.isRunning) return;
      this.poll().catch(error => {
        console.error('[Poller] Unhandled poll error:', error);
      });
    }, this.currentIntervalMs);
  }

  /**
   * Stop polling
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.abortController.abort();

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log('[Poller] Stopped');
  }

  /**
   * Check if poller is currently running
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Run a single poll (useful for testing or manual triggering)
   * Note: This respects rate limits
   */
  async runOnce(): Promise<void> {
    await this.poll();
  }

  /**
   * Force a poll ignoring rate limits (use with caution)
   * Only for admin/testing purposes
   */
  async forceRunOnce(): Promise<void> {
    // Clear rate limit state
    LinearClient.clearRateLimitStatus();
    this.rateLimitedUntil = null;
    this.resetBackoff();

    console.log('[Poller] Force running poll (rate limits cleared)');
    await this.poll();
  }
}

import { clientManager } from './client.js';

export interface SessionStatus {
  status: 'queued' | 'started' | 'in_progress' | 'done' | 'error';
  output?: any;
  error?: string;
}

export interface PollOptions {
  sessionId: string;
  onProgress?: (status: SessionStatus) => void;
  initialDelay?: number;
  maxAttempts?: number;
  pollIntervalMs?: number;
  errorRetryDelayMs?: number;
}

export class SessionPoller {
  private timeoutId?: NodeJS.Timeout;
  private isRunning = false;
  private abortController = new AbortController();
  private onProgressCallback?: (status: SessionStatus) => void;

  async poll(options: PollOptions): Promise<SessionStatus> {
    const {
      sessionId,
      onProgress,
      initialDelay = 1000,
      maxAttempts = 600,
      pollIntervalMs = 2000,
      errorRetryDelayMs = 5000
    } = options;

    this.onProgressCallback = onProgress;
    this.isRunning = true;

    // Ensure OpenCode is initialized
    if (!clientManager.isInitialized()) {
      await clientManager.initialize();
    }

    const opencodeClient = clientManager.getClient();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Check if polling was stopped
      if (!this.isRunning || this.abortController.signal.aborted) {
        throw new Error('Session polling aborted');
      }

      try {
        const statusResult = await opencodeClient.session.status({});
        const sessionStatusMap = statusResult.data;

        let status: SessionStatus;

        if (sessionStatusMap && sessionStatusMap[sessionId]) {
          const sessionStatus = sessionStatusMap[sessionId];

          if (sessionStatus.type === 'idle') {
            status = { status: 'done' };
          } else if (sessionStatus.type === 'retry') {
            status = { status: 'in_progress' };
          } else if (sessionStatus.type === 'busy') {
            status = { status: 'in_progress' };
          } else {
            status = { status: 'in_progress' };
          }
        } else {
          status = { status: 'done' };
        }

        if (this.onProgressCallback && this.isRunning) {
          this.onProgressCallback(status);
        }

        if (status.status === 'done' || status.status === 'error') {
          this.cleanup();
          return status;
        }

        // Wait before next poll
        const delayMs = attempt === 0 ? initialDelay : pollIntervalMs;
        await this.delay(delayMs);
      } catch (error) {
        console.error(`Poll attempt ${attempt + 1} failed:`, error);
        if (attempt === maxAttempts - 1) {
          this.cleanup();
          throw error;
        }
        await this.delay(errorRetryDelayMs);
      }
    }

    this.cleanup();
    throw new Error('Session polling timeout');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.timeoutId = setTimeout(() => {
        this.timeoutId = undefined;
        resolve();
      }, ms);
    });
  }

  stop(): void {
    this.isRunning = false;
    this.abortController.abort();
    this.cleanup();
    console.log('[SessionPoller] Polling stopped');
  }

  private cleanup(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
    this.onProgressCallback = undefined;
    this.isRunning = false;
  }

  get isActive(): boolean {
    return this.isRunning;
  }
}

// Backward-compatible function using the new class
export async function pollSessionStatus(
  sessionId: string,
  onProgress?: (status: SessionStatus) => void,
  initialDelay: number = 1000,
  maxAttempts: number = 600
): Promise<SessionStatus> {
  const poller = new SessionPoller();
  return poller.poll({
    sessionId,
    onProgress,
    initialDelay,
    maxAttempts
  });
}

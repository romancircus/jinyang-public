import { createOpencode } from '@opencode-ai/sdk';
import { AgentExecutor, createExecutionContext, createExecutionConfig } from './base.js';
import type {
  AgentExecutionConfig,
  ExecutionResult,
  ProviderMetadata,
  GitCommit,
} from './types.js';
import type { HealthStatus, ProviderType } from '../types/index.js';
import type { ExecutionContext } from './types.js';
import { withRetry, DEFAULT_RETRY_CONFIG, type RetryResult, isRetryableError, NonRetryableError } from '../utils/retry.js';
import type { ProviderRouter } from '../provider/router.js';
import { NetworkError, SSEConnectionError, ExecutionError } from '../errors/index.js';
import { getLogger } from '../logging/index.js';

/**
 * Configuration for OpenCode provider
 */
export interface OpenCodeConfig {
  /** API key for LLM provider (set via OpenCode server config) */
  apiKey?: string;
  timeoutMs: number;
  model?: string;
  /** OpenCode server base URL (default: http://localhost:4096) */
  baseUrl?: string;
  /** Working directory for the session */
  directory?: string;
}

/**
 * OpenCode event from SSE stream.
 * Matches the SDK Event union type where sessionID lives inside properties.
 */
interface OpenCodeEvent {
  type: string;
  properties?: {
    sessionID?: string;
    status?: { type: string; attempt?: number; message?: string; next?: number };
    info?: Record<string, unknown>;
    error?: Record<string, unknown>;
    file?: string;
    [key: string]: unknown;
  };
}

/**
 * SSE result type from SDK
 */
type ServerSentEventsResult<TData = unknown> = {
  stream: AsyncGenerator<TData>;
};

/**
 * OpenCodeExecutor - Executes prompts using the @opencode-ai/sdk
 *
 * Implements the AgentExecutor interface for OpenCode provider.
 * Uses SSE event subscription for real-time execution monitoring.
 * Includes intelligent retry logic with exponential backoff for transient failures.
 *
 * @example
 * ```typescript
 * const executor = new OpenCodeExecutor({
 *   timeoutMs: 300000,
 *   baseUrl: 'http://localhost:4096',
 *   directory: '/path/to/worktree'
 * });
 *
 * const result = await executor.execute({
 *   prompt: 'Create a hello world file',
 *   context: executionContext,
 *   model: 'kimi-k2.5'
 * });
 * ```
 */
export class OpenCodeExecutor extends AgentExecutor {
  readonly providerType: ProviderType = 'opencode-glm47';
  readonly supportedModels: string[] = ['kimi-k2.5', 'kimi-k2.6', 'gpt-4o', 'glm-4'];

  private client: any;
  private opencodeInstance: any = null;
  private config: OpenCodeConfig;
  private providerRouter?: ProviderRouter;
  private logger = getLogger();

  private constructor(config: OpenCodeConfig, providerRouter?: ProviderRouter) {
    super();
    this.config = config;
    this.providerRouter = providerRouter;
  }

  /**
   * Async factory method to create and initialize OpenCodeExecutor.
   * Starts the OpenCode server and creates the client.
   */
  static async create(config: OpenCodeConfig, providerRouter?: ProviderRouter): Promise<OpenCodeExecutor> {
    const executor = new OpenCodeExecutor(config, providerRouter);
    await executor.initialize();
    return executor;
  }

  /**
   * Get a dynamic port for the OpenCode server.
   * Uses a random port in the range 4096-4596 to avoid collisions
   * with concurrent executions.
   */
  private static nextPort = 4096;
  private static getNextPort(): number {
    const port = OpenCodeExecutor.nextPort;
    OpenCodeExecutor.nextPort = 4096 + ((OpenCodeExecutor.nextPort - 4096 + 1) % 500);
    return port;
  }

  /**
   * Initialize the OpenCode server and client.
   * Starts the server on a dynamic port and creates the client.
   */
  private async initialize(): Promise<void> {
    const port = OpenCodeExecutor.getNextPort();
    this.logger.info(`Starting OpenCode server on port ${port}`);

    const result = await createOpencode({
      hostname: '127.0.0.1',
      port,
      timeout: this.config.timeoutMs,
    });
    this.client = result.client;
    this.opencodeInstance = result.server;
  }

  /**
   * Cleanup method to stop the OpenCode server when done.
   * Should be called when executor is no longer needed.
   */
  async dispose(): Promise<void> {
    if (this.opencodeInstance && typeof this.opencodeInstance.close === 'function') {
      this.opencodeInstance.close();
    }
  }

  /**
   * Set the provider router for circuit breaker integration
   */
  setProviderRouter(router: ProviderRouter): void {
    this.providerRouter = router;
  }

  /**
   * Execute a prompt using OpenCode SDK with SSE event subscription.
   *
   * CRITICAL: Must subscribe to events BEFORE sending prompt to avoid missing events.
   *
   * This method includes intelligent retry logic with exponential backoff for:
   * - Network timeouts
   * - 429 Too Many Requests
   * - 503 Service Unavailable
   * - SSE connection drops
   * - Temporary worktree failures
   *
   * @param config - Execution configuration with prompt and context
   * @returns Execution result with parsed git commits and file operations
   */
  async execute(config: AgentExecutionConfig): Promise<ExecutionResult> {
    const startTime = this.startTimer();

    // Execute with retry logic
    const retryResult = await withRetry(
      () => this.executeInternal(config, startTime),
      DEFAULT_RETRY_CONFIG,
      {
        issueId: config.context.issueId,
        operation: 'OpenCodeExecutor.execute',
        provider: this.providerType,
      },
      this.providerRouter
    );

    if (retryResult.success && retryResult.data) {
      return retryResult.data;
    }

    // Return error result if retry exhausted
    const duration = this.elapsedMs(startTime);
    const errorMessage = retryResult.error?.message || 'Execution failed after retries';

    // Determine error type from the error message
    let errorType: 'TIMEOUT' | 'SESSION_FAILED' | 'UNKNOWN' = 'SESSION_FAILED';
    if (errorMessage.includes('timed out') || errorMessage.includes('TIMEOUT')) {
      errorType = 'TIMEOUT';
    } else if (errorMessage.includes('Failed to create session') || errorMessage.includes('Failed to send prompt')) {
      errorType = 'UNKNOWN';
    }

    return this.createErrorResult(
      errorType,
      errorMessage,
      duration,
      retryResult.error
    );
  }

  /**
   * Internal execution method that can be retried.
   * This contains the actual execution logic.
   */
  private async executeInternal(
    config: AgentExecutionConfig,
    startTime: number
  ): Promise<ExecutionResult> {
    const { prompt, context, model } = config;

    // STEP 1: Subscribe to events FIRST (critical - before any operation)
    const eventStream = await this.client.event.subscribe();
    const events: OpenCodeEvent[] = [];

    // STEP 2: Create a new session in the worktree directory
    // The SDK accepts directory as a query parameter on session.create()
    const worktreeDir = context.worktreePath;
    const createResult = await this.client.session.create({
      query: worktreeDir ? { directory: worktreeDir } : undefined,
    });

    if (createResult.error) {
      const errorMsg = JSON.stringify(createResult.error);
      throw new Error(`Failed to create session: ${errorMsg}`);
    }

    const sessionId = createResult.data.id;
    this.logger.info('Created OpenCode session', { sessionId, directory: worktreeDir });

    // STEP 3: Send the prompt
    const promptResult = await this.client.session.prompt({
      path: { id: sessionId },
      body: {
        model: model ? { providerID: 'anthropic', modelID: model } : undefined,
        parts: [{ type: 'text', text: prompt }],
      },
    });

    if (promptResult.error) {
      const errorMsg = JSON.stringify(promptResult.error);
      throw new Error(`Failed to send prompt: ${errorMsg}`);
    }

    // STEP 4: Collect events until completion, failure, or timeout
    // Use three-way race: SSE events, session status polling, and timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Execution timed out after ${context.timeoutMs}ms`));
      }, context.timeoutMs);
    });

    const eventCollectionPromise = this.collectEvents(
      eventStream.stream as AsyncGenerator<OpenCodeEvent>,
      sessionId,
      events
    );

    // Backup: poll session status every 10s in case SSE misses idle event
    const statusPollingPromise = this.pollSessionStatus(sessionId, context.timeoutMs);

    // Race between SSE events, status polling, and timeout
    try {
      await Promise.race([eventCollectionPromise, statusPollingPromise, timeoutPromise]);
    } catch (error) {
      // Abort the session on timeout
      try {
        await this.client.session.abort({ path: { id: sessionId } });
      } catch {
        // Ignore abort errors
      }
      throw error;
    }

    // STEP 5: Parse results from collected events
    const { commits, files } = this.parseEventsForResults(events, context);

    // Build output from events
    const output = this.buildOutputFromEvents(events);

    const duration = this.elapsedMs(startTime);

    // Check for session error (SDK uses session.error, not session.failed/aborted)
    const errorEvent = events.find((e) => e.type === 'session.error');
    if (errorEvent) {
      const errorData = errorEvent.properties?.error as { data?: { message?: string }; name?: string } | undefined;
      throw new Error(
        errorData?.data?.message || errorData?.name || 'Session failed during execution'
      );
    }

    return this.createSuccessResult(output, files, commits, duration);
  }

  /**
   * Collect events from the SSE stream until session completion or failure.
   * Includes automatic reconnection with exponential backoff for stream errors.
   *
   * @param eventStream - The SSE event stream from OpenCode (eventStream.stream)
   * @param sessionId - The session ID to filter events for
   * @param events - Array to collect events into
   * @param maxReconnectAttempts - Maximum number of reconnection attempts (default: 5)
   * @param initialBackoffMs - Initial backoff delay in milliseconds (default: 1000)
   */
  private async collectEvents(
    eventStream: AsyncGenerator<OpenCodeEvent>,
    sessionId: string,
    events: OpenCodeEvent[],
    maxReconnectAttempts: number = 3,
    initialBackoffMs: number = 500
  ): Promise<void> {
    let reconnectAttempts = 0;
    let currentBackoffMs = initialBackoffMs;
    let isComplete = false;

    while (!isComplete && reconnectAttempts <= maxReconnectAttempts) {
      try {
        // Process events from the stream
        for await (const event of eventStream) {
          // SDK Event types have sessionID inside properties, not at top level
          const eventSessionId = event.properties?.sessionID;

          // Only process events for our session (skip events without sessionID or for other sessions)
          if (eventSessionId && eventSessionId !== sessionId) {
            continue;
          }

          events.push(event);

          // session.idle = agent finished successfully (no nested status check needed)
          if (event.type === 'session.idle') {
            isComplete = true;
            break;
          }

          // session.status with status.type === 'idle' also means completion
          if (event.type === 'session.status') {
            const status = event.properties?.status;
            if (status?.type === 'idle') {
              isComplete = true;
              break;
            }
          }

          // session.error = agent hit an error (SDK uses session.error, not session.aborted/failed)
          if (event.type === 'session.error') {
            isComplete = true;
            break;
          }
        }

        // If we exited the loop normally, mark as complete
        isComplete = true;
      } catch (error) {
        reconnectAttempts++;

        console.error('[SSE] Stream error:', error);
        this.logger.error('SSE stream error', {
          error,
          sessionId,
          reconnectAttempts,
          maxReconnectAttempts
        });

        // Check if we should retry
        if (reconnectAttempts > maxReconnectAttempts) {
          // Use NonRetryableError so outer retry system doesn't attempt full retry
          throw new NonRetryableError(
            `SSE stream failed after ${maxReconnectAttempts} reconnection attempts. Last error: ${this.extractErrorMessage(error)}`
          );
        }

        // Check if the session is still active before reconnecting
        try {
          const sessionStatus = await this.client.session.status({});
          const sessionInfo = sessionStatus.data?.[sessionId];

          if (!sessionInfo || sessionInfo.type === 'idle') {
            // Session is complete or doesn't exist, no need to reconnect
            this.logger.info('Session completed or not found, stopping reconnection attempts', { sessionId });
            isComplete = true;
            break;
          }
        } catch (statusError) {
          this.logger.error('Failed to check session status during reconnection', { statusError });
        }

        // Wait with exponential backoff before reconnecting
        this.logger.info(`Reconnecting to SSE stream in ${currentBackoffMs}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`, {
          sessionId,
          backoffMs: currentBackoffMs,
          attempt: reconnectAttempts
        });

        await this.delay(currentBackoffMs);

        // Exponential backoff with jitter (max 30 seconds)
        currentBackoffMs = Math.min(currentBackoffMs * 2 + Math.random() * 1000, 30000);

        // Re-subscribe to events for reconnection
        try {
          const newEventStream = await this.client.event.subscribe();
          eventStream = newEventStream.stream as AsyncGenerator<OpenCodeEvent>;
          this.logger.info('Successfully reconnected to SSE stream', { sessionId, attempt: reconnectAttempts });
        } catch (subscribeError) {
          this.logger.error('Failed to resubscribe to SSE stream', { subscribeError, sessionId });
          // Continue to next retry attempt
        }
      }
    }
  }

  /**
   * Poll session status as backup for SSE event detection.
   * Resolves when session becomes idle or disappears.
   * Used as a race with SSE event collection to handle cases where
   * the SSE stream misses the idle event.
   */
  private async pollSessionStatus(sessionId: string, timeoutMs: number): Promise<void> {
    const pollIntervalMs = 10000; // Check every 10 seconds
    const maxPolls = Math.ceil(timeoutMs / pollIntervalMs);

    // Wait 15 seconds before first poll (give SSE a chance to work)
    await this.delay(15000);

    for (let i = 0; i < maxPolls; i++) {
      try {
        const statusResult = await this.client.session.status({});
        const sessions = statusResult.data || {};
        const sessionInfo = sessions[sessionId];

        // Session is idle or doesn't exist anymore
        if (!sessionInfo || sessionInfo.type === 'idle') {
          this.logger.info('Session idle detected via status polling', { sessionId, poll: i + 1 });
          return;
        }
      } catch (error) {
        this.logger.error('Session status poll failed', { sessionId, error });
      }

      await this.delay(pollIntervalMs);
    }
  }

  /**
   * Delay helper for async operations
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Parse events to extract git commits and file operations.
   *
   * @param events - All collected events
   * @param context - Execution context for issue ID
   * @returns Parsed commits and files
   */
  private parseEventsForResults(
    events: OpenCodeEvent[],
    context: ExecutionContext
  ): { commits: GitCommit[]; files: string[] } {
    const commits: GitCommit[] = [];
    const files: string[] = [];

    for (const event of events) {
      // Parse file edited events
      if (event.type === 'file.edited') {
        const filePath = event.properties?.file as string;
        if (filePath && !files.includes(filePath)) {
          files.push(filePath);
        }
      }

      // Parse message.updated events for assistant messages with tool calls
      if (event.type === 'message.updated') {
        const message = event.properties?.info as {
          summary?: { diffs?: Array<{ file: string }> };
          role?: string;
        } | undefined;

        if (message?.role === 'assistant' && message?.summary?.diffs) {
          for (const diff of message.summary.diffs) {
            if (diff.file && !files.includes(diff.file)) {
              files.push(diff.file);
            }
          }
        }
      }

      // Look for git commit information in tool call events
      if (event.type === 'tool.call') {
        const toolData = event.properties as {
          tool?: string;
          arguments?: { command?: string; message?: string; sha?: string };
          result?: unknown;
        } | undefined;

        if (toolData?.tool === 'git_commit') {
          const args = toolData.arguments;
          if (args?.message) {
            commits.push({
              sha: String(args.sha || 'unknown'),
              message: String(args.message),
              author: 'jinyang-agent',
              date: new Date(),
              issueId: context.issueId,
            });
          }
        }

        // Parse bash commands for git operations
        if (toolData?.tool === 'bash' && toolData?.arguments?.command) {
          const command = toolData.arguments.command;

          // Try to extract git commit info from git commit commands
          if (command.includes('git commit')) {
            const sha = this.extractShaFromResult(toolData.result);
            if (sha) {
              commits.push({
                sha,
                message: this.extractCommitMessage(command),
                author: 'jinyang-agent',
                date: new Date(),
                issueId: context.issueId,
              });
            }
          }
        }
      }
    }

    return { commits, files };
  }

  /**
   * Extract SHA from tool call result.
   */
  private extractShaFromResult(result: unknown): string | undefined {
    if (typeof result === 'string') {
      // Try to find a 40-character hex SHA
      const shaMatch = result.match(/[a-f0-9]{40}/);
      if (shaMatch) {
        return shaMatch[0];
      }
      // Try to find a 7-character short SHA
      const shortShaMatch = result.match(/[a-f0-9]{7}/);
      if (shortShaMatch) {
        return shortShaMatch[0];
      }
    }
    return undefined;
  }

  /**
   * Extract commit message from git commit command.
   */
  private extractCommitMessage(command: string): string {
    const match = command.match(/-m\s+['"]([^'"]+)['"]/);
    return match ? match[1] : 'Auto-generated commit';
  }

  /**
   * Build output string from collected events.
   */
  private buildOutputFromEvents(events: OpenCodeEvent[]): string {
    const outputParts: string[] = [];

    for (const event of events) {
      if (event.type === 'message.updated') {
        const message = event.properties?.info as { summary?: { title?: string; body?: string } } | undefined;
        if (message?.summary?.title) {
          outputParts.push(message.summary.title);
        }
        if (message?.summary?.body) {
          outputParts.push(message.summary.body);
        }
      }
    }

    return outputParts.join('\n');
  }

  /**
   * Check if the OpenCode provider is healthy.
   *
   * Performs a simple health check by trying to list sessions.
   *
   * @returns Health status with latency information
   */
  async healthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      // Check if we can list sessions as a health check
      const result = await this.client.session.list();

      if (result.error) {
        throw new Error(JSON.stringify(result.error));
      }

      const latency = Date.now() - startTime;

      return {
        provider: this.providerType,
        healthy: true,
        latency,
      };
    } catch (error) {
      return {
        provider: this.providerType,
        healthy: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error during health check',
      };
    }
  }

  /**
   * Get metadata about this OpenCode provider.
   *
   * @returns Provider metadata including name, version, and capabilities
   */
  getMetadata(): ProviderMetadata {
    return {
      name: 'OpenCode',
      type: this.providerType,
      version: '1.1.51', // @opencode-ai/sdk version
      supportedModels: this.supportedModels,
      features: [
        'sse-events',
        'tool-calls',
        'git-integration',
        'file-operations',
        'timeout-handling',
        'health-checks',
        'intelligent-retry',
      ],
    };
  }

  // ==================== Error Handling Helpers ====================

  /**
   * Check if error is a network error
   */
  private isNetworkError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const msg = error.message.toLowerCase();
    return msg.includes('network') ||
           msg.includes('timeout') ||
           msg.includes('connection') ||
           msg.includes('econn') ||
           msg.includes('etimedout') ||
           msg.includes('ENOTFOUND') ||
           /\b(401|403|429|500|502|503|504)\b/.test(error.message);
  }

  /**
   * Check if error is an SSE connection error
   */
  private isSSEConnectionError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const msg = error.message.toLowerCase();
    return msg.includes('sse') ||
           msg.includes('event stream') ||
           msg.includes('subscription') ||
           msg.includes('abort') && msg.includes('stream');
  }

  /**
   * Extract error message from unknown error
   */
  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown error';
    }
  }

  /**
   * Extract HTTP status code from error
   */
  private extractStatusCode(error: unknown): number | undefined {
    if (!(error instanceof Error)) return undefined;

    // Check message for status code
    const match = error.message.match(/\b(401|403|429|500|502|503|504)\b/);
    if (match) return parseInt(match[1], 10);

    return undefined;
  }

  /**
   * Extract status code from error object
   */
  private extractStatusCodeFromObject(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') return undefined;

    const err = error as Record<string, unknown>;
    if (typeof err.status === 'number') return err.status;
    if (typeof err.statusCode === 'number') return err.statusCode;
    if (typeof err.code === 'number') return err.code;

    // Check nested error
    if (err.error && typeof err.error === 'object') {
      return this.extractStatusCodeFromObject(err.error);
    }

    return undefined;
  }

  /**
   * Extract session ID from error context
   */
  private extractSessionId(error: unknown): string | undefined {
    if (!(error instanceof Error)) return undefined;
    const match = error.message.match(/session[\s-]?id[\s:]?([a-zA-Z0-9_-]+)/i);
    return match ? match[1] : undefined;
  }
}

// Re-export factory functions
export { createExecutionContext, createExecutionConfig };

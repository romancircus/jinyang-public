import { AgentExecutor } from './base.js';
import type {
  AgentProvider,
  ExecutionResult,
  GitCommit,
  ProviderMetadata,
  AgentExecutionConfig,
  ToolCallEvent,
} from './types.js';
import type { HealthStatus } from '../types/index.js';
import { withRetry, DEFAULT_RETRY_CONFIG } from '../utils/retry.js';
import type { ProviderRouter } from '../provider/router.js';

/**
 * Kimi API configuration
 */
export interface KimiConfig {
  apiKey: string;
  timeoutMs: number;
  model?: string;
  baseUrl?: string;
}

/**
 * Kimi API request format (OpenAI compatible)
 */
interface KimiChatCompletionRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: {
        type: 'object';
        properties: Record<string, unknown>;
        required: string[];
      };
    };
  }>;
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

/**
 * Kimi API response format (OpenAI compatible)
 */
interface KimiChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Kimi API error response
 */
interface KimiErrorResponse {
  error: {
    message: string;
    type: string;
    param?: string;
    code?: string;
  };
}

/**
 * Rate limit information from Kimi API
 */
interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

/**
 * Tool definition for git operations
 */
const GIT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'git_commit',
      description: 'Execute a git commit with the given message',
      parameters: {
        type: 'object' as const,
        properties: {
          message: {
            type: 'string',
            description: 'The commit message',
          },
          hash: {
            type: 'string',
            description: 'Expected commit hash (for verification)',
          },
        },
        required: ['message'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description: 'Write content to a file at the specified path',
      parameters: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file',
          },
          content: {
            type: 'string',
            description: 'Content to write to the file',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_file',
      description: 'Edit a file by replacing oldString with newString',
      parameters: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file',
          },
          oldString: {
            type: 'string',
            description: 'String to find and replace',
          },
          newString: {
            type: 'string',
            description: 'Replacement string',
          },
        },
        required: ['path', 'oldString', 'newString'],
      },
    },
  },
];

/**
 * Kimi Executor - Fallback provider tier using Kimi API
 * 
 * Uses OpenAI-compatible API endpoint for chat completions with tool calling.
 * Supports git operations through structured tool calls.
 * 
 * @example
 * ```typescript
 * const executor = new KimiExecutor({
 *   apiKey: process.env.KIMI_API_KEY!,
 *   timeoutMs: 300000,
 *   model: 'kimi-k2.5',
 * });
 * 
 * const result = await executor.execute({
 *   prompt: 'Create a test file',
 *   context: executionContext,
 * });
 * ```
 */
export class KimiExecutor extends AgentExecutor {
  readonly providerType: AgentProvider = 'kimi-k25-api';
  readonly supportedModels: string[] = ['kimi-k2.5', 'kimi-k2.6'];

  private readonly config: Required<KimiConfig>;
  private lastRateLimitInfo?: RateLimitInfo;
  private providerRouter?: ProviderRouter;

  /**
   * Default Kimi API endpoint
   */
  static readonly DEFAULT_API_URL = 'https://api.moonshot.cn/v1/chat/completions';

  /**
   * Create a new KimiExecutor
   * 
   * @param config - Kimi API configuration
   * @param providerRouter - Optional provider router for circuit breaker integration
   */
  constructor(config: KimiConfig, providerRouter?: ProviderRouter) {
    super();
    this.config = {
      model: 'kimi-k2.5',
      baseUrl: KimiExecutor.DEFAULT_API_URL,
      ...config,
    };
    this.providerRouter = providerRouter;
  }

  /**
   * Set the provider router for circuit breaker integration
   */
  setProviderRouter(router: ProviderRouter): void {
    this.providerRouter = router;
  }

  /**
   * Execute a prompt using Kimi API with tool calling support.
   * 
   * This method includes intelligent retry logic with exponential backoff for:
   * - Network timeouts
   * - 429 Too Many Requests (respects Retry-After header)
   * - 503 Service Unavailable
   * - Connection errors
   * 
   * @param config - Execution configuration
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
        operation: 'KimiExecutor.execute',
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
    let errorType: 'TIMEOUT' | 'PROVIDER_UNAVAILABLE' | 'SESSION_FAILED' | 'UNKNOWN' = 'SESSION_FAILED';
    if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('rate limit')) {
      errorType = 'PROVIDER_UNAVAILABLE';
    } else if (errorMessage.includes('401') || errorMessage.toLowerCase().includes('unauthorized')) {
      errorType = 'SESSION_FAILED'; // Auth errors are session-level failures
    } else if (errorMessage.includes('timed out') || errorMessage.toLowerCase().includes('timeout')) {
      errorType = 'TIMEOUT';
    } else if (errorMessage.includes('503') || errorMessage.includes('502') || errorMessage.includes('504')) {
      errorType = 'PROVIDER_UNAVAILABLE';
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
    const response = await this.callKimiApi(config);
    const parsed = this.parseResponse(response, config.context.worktreePath);
    const duration = this.elapsedMs(startTime);

    return this.createSuccessResult(
      JSON.stringify(response),
      parsed.files,
      parsed.commits,
      duration
    );
  }

  /**
   * Check if Kimi API is healthy
   * 
   * Makes a lightweight request to verify API availability
   * 
   * @returns Health status with latency information
   */
  async healthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      // Make a minimal request to check API health
      const response = await fetch(this.config.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1,
        } satisfies KimiChatCompletionRequest),
      });

      const latency = Date.now() - startTime;

      // Extract rate limit headers if present
      this.extractRateLimitHeaders(response.headers);

      if (response.ok) {
        return {
          provider: this.providerType,
          healthy: true,
          latency,
        };
      }

      // Check for auth errors (401) which indicate bad API key
      if (response.status === 401) {
        return {
          provider: this.providerType,
          healthy: false,
          latency,
          error: 'Invalid API key',
        };
      }

      // Check for rate limits (429)
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        return {
          provider: this.providerType,
          healthy: false,
          latency,
          error: `Rate limited. Retry after ${retryAfter || 'unknown'} seconds`,
        };
      }

      return {
        provider: this.providerType,
        healthy: false,
        latency,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        provider: this.providerType,
        healthy: false,
        latency,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get provider metadata
   * 
   * @returns Metadata about this provider
   */
  getMetadata(): ProviderMetadata {
    return {
      name: 'Kimi API Executor',
      type: this.providerType,
      version: '1.0.0',
      supportedModels: this.supportedModels,
      features: [
        'tool_calls',
        'git_operations',
        'file_operations',
        'rate_limit_handling',
        'openai_compatible',
      ],
    };
  }

  /**
   * Get last rate limit information from API response
   * 
   * @returns Rate limit info or undefined if no request made yet
   */
  getRateLimitInfo(): RateLimitInfo | undefined {
    return this.lastRateLimitInfo;
  }

  /**
   * Call Kimi API with the given prompt
   * 
   * @param config - Execution configuration
   * @returns API response
   */
  private async callKimiApi(
    config: AgentExecutionConfig
  ): Promise<KimiChatCompletionResponse> {
    const request: KimiChatCompletionRequest = {
      model: config.model || this.config.model,
      messages: [
        {
          role: 'system',
          content: this.buildSystemPrompt(config.context),
        },
        {
          role: 'user',
          content: config.prompt,
        },
      ],
      tools: GIT_TOOLS,
      tool_choice: 'auto',
      temperature: 0.2,
      max_tokens: 4096,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(this.config.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Extract rate limit headers
      this.extractRateLimitHeaders(response.headers);

      if (!response.ok) {
        const errorBody = await response.text();
        let errorMessage: string;
        
        // Special handling for rate limits (429)
        if (response.status === 429) {
          const retryAfter = response.headers?.get?.('retry-after');
          errorMessage = `Rate limit exceeded (HTTP 429). Retry after ${retryAfter || 'unknown'} seconds`;
        } else {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        
        try {
          const errorJson = JSON.parse(errorBody) as KimiErrorResponse;
          if (errorJson.error?.message && response.status !== 429) {
            errorMessage = errorJson.error.message;
          }
        } catch {
          // Use status text if JSON parsing fails
        }

        throw new Error(errorMessage);
      }

      return response.json() as Promise<KimiChatCompletionResponse>;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Build system prompt with execution context
   * 
   * @param context - Execution context
   * @returns System prompt string
   */
  private buildSystemPrompt(context: AgentExecutionConfig['context']): string {
    return `You are an autonomous agent executing development tasks.

Execution Context:
- Issue ID: ${context.issueId}
- Session ID: ${context.sessionId}
- Worktree: ${context.worktreePath}
- Timeout: ${context.timeoutMs}ms

Available Tools:
1. git_commit - Commit changes with a message
2. write_file - Create or overwrite files
3. edit_file - Modify existing files

Guidelines:
- Use git_commit after completing file operations
- Include the issue ID (${context.issueId}) in commit messages
- Work within the provided worktree directory
- Respect the timeout limit`;
  }

  /**
   * Parse API response to extract git commits and file operations
   * 
   * @param response - API response
   * @param worktreePath - Path to worktree for context
   * @returns Parsed commits and files
   */
  private parseResponse(
    response: KimiChatCompletionResponse,
    worktreePath: string
  ): { commits: GitCommit[]; files: string[] } {
    const commits: GitCommit[] = [];
    const files: string[] = [];

    const message = response.choices[0]?.message;
    if (!message) {
      return { commits, files };
    }

    // Parse tool calls from response
    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        const parsed = this.parseToolCall(toolCall, worktreePath);
        
        if (parsed.type === 'git_commit' && parsed.data) {
          const commitData = parsed.data as { message: string; hash?: string };
          commits.push({
            sha: commitData.hash || 'pending',
            message: commitData.message,
            author: 'Kimi Agent',
            date: new Date(),
          });
        } else if (parsed.type === 'write_file' && parsed.data) {
          const fileData = parsed.data as { path: string };
          files.push(fileData.path);
        } else if (parsed.type === 'edit_file' && parsed.data) {
          const fileData = parsed.data as { path: string };
          if (!files.includes(fileData.path)) {
            files.push(fileData.path);
          }
        }
      }
    }

    return { commits, files };
  }

  /**
   * Parse a single tool call from the response
   * 
   * @param toolCall - Tool call from API response
   * @param _worktreePath - Path to worktree (for context)
   * @returns Parsed tool call data
   */
  private parseToolCall(
    toolCall: { function: { name: string; arguments: string } },
    _worktreePath: string
  ): { type: string; data?: Record<string, unknown> } {
    try {
      const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
      
      return {
        type: toolCall.function.name,
        data: args,
      };
    } catch {
      return {
        type: toolCall.function.name,
        data: undefined,
      };
    }
  }

  /**
   * Extract rate limit information from response headers
   * 
   * @param headers - Response headers
   */
  private extractRateLimitHeaders(headers?: Headers | unknown): void {
    if (!headers || typeof headers !== 'object') return;
    
    // Handle both native Headers and plain objects (for test mocks)
    const getHeader = (name: string): string | null => {
      if (headers instanceof Headers) {
        return headers.get(name);
      }
      // Handle plain object mock
      const h = headers as Record<string, string>;
      return h[name] || h[name.toLowerCase()] || null;
    };
    
    try {
      const limit = getHeader('x-ratelimit-limit');
      const remaining = getHeader('x-ratelimit-remaining');
      const reset = getHeader('x-ratelimit-reset');
      const retryAfter = getHeader('retry-after');

      if (limit || remaining || reset || retryAfter) {
        this.lastRateLimitInfo = {
          limit: limit ? parseInt(limit, 10) : 0,
          remaining: remaining ? parseInt(remaining, 10) : 0,
          reset: reset ? parseInt(reset, 10) : 0,
          retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
        };
      }
    } catch {
      // Ignore errors when extracting headers
    }
  }
}

/**
 * Factory function to create KimiExecutor from environment variables
 * 
 * @returns KimiExecutor instance or undefined if KIMI_API_KEY not set
 */
export function createKimiExecutorFromEnv(): KimiExecutor | undefined {
  const apiKey = process.env.KIMI_API_KEY;
  if (!apiKey) {
    return undefined;
  }

  return new KimiExecutor({
    apiKey,
    timeoutMs: parseInt(process.env.KIMI_TIMEOUT_MS || '300000', 10),
    model: process.env.KIMI_MODEL || 'kimi-k2.5',
  });
}

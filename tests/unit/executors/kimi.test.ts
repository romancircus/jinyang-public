import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KimiExecutor, createKimiExecutorFromEnv, type KimiConfig } from '../../../src/executors/kimi.js';
import { createExecutionContext } from '../../../src/executors/base.js';
import type { AgentExecutionConfig, ExecutionContext } from '../../../src/executors/types.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('KimiExecutor', () => {
  let executor: KimiExecutor;
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    vi.clearAllMocks();
    executor = new KimiExecutor({
      apiKey: mockApiKey,
      timeoutMs: 30000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct provider type', () => {
      expect(executor.providerType).toBe('kimi-k25-api');
    });

    it('should have supported models', () => {
      expect(executor.supportedModels).toContain('kimi-k2.5');
      expect(executor.supportedModels).toContain('kimi-k2.6');
    });

    it('should use default baseUrl when not provided', () => {
      const testExecutor = new KimiExecutor({
        apiKey: mockApiKey,
        timeoutMs: 30000,
      });
      expect(testExecutor).toBeDefined();
    });

    it('should use provided baseUrl', () => {
      const customExecutor = new KimiExecutor({
        apiKey: mockApiKey,
        timeoutMs: 30000,
        baseUrl: 'https://custom.api.com/v1/chat/completions',
      });
      expect(customExecutor).toBeDefined();
    });

    it('should use custom model when provided', () => {
      const customExecutor = new KimiExecutor({
        apiKey: mockApiKey,
        timeoutMs: 30000,
        model: 'kimi-k2.6',
      });
      expect(customExecutor).toBeDefined();
    });
  });

  describe('execute', () => {
    const createMockContext = (): ExecutionContext =>
      createExecutionContext({
        worktreePath: '/tmp/test-worktree',
        sessionId: 'test-session-123',
        issueId: 'ROM-366',
        baselineCommit: 'abc123',
        timeoutMs: 30000,
      });

    it('should successfully execute a prompt', async () => {
      const mockResponse = {
        id: 'chat-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'kimi-k2.5',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Task completed successfully',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({
          'content-type': 'application/json',
        }),
        json: async () => mockResponse,
      });

      const config: AgentExecutionConfig = {
        prompt: 'Create a test file',
        context: createMockContext(),
        model: 'kimi-k2.5',
      };

      const result = await executor.execute(config);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.moonshot.cn/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle tool calls in response', async () => {
      const mockResponse = {
        id: 'chat-456',
        object: 'chat.completion',
        created: Date.now(),
        model: 'kimi-k2.5',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'git_commit',
                    arguments: JSON.stringify({
                      message: 'feat: ROM-366 add feature',
                      hash: 'def789',
                    }),
                  },
                },
                {
                  id: 'call-2',
                  type: 'function',
                  function: {
                    name: 'write_file',
                    arguments: JSON.stringify({
                      path: 'src/test.ts',
                      content: 'console.log("test");',
                    }),
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 100,
          total_tokens: 300,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        json: async () => mockResponse,
      });

      const config: AgentExecutionConfig = {
        prompt: 'Create a test file and commit it',
        context: createMockContext(),
      };

      const result = await executor.execute(config);

      expect(result.success).toBe(true);
      expect(result.gitCommits).toHaveLength(1);
      expect(result.gitCommits[0].sha).toBe('def789');
      expect(result.gitCommits[0].message).toBe('feat: ROM-366 add feature');
      expect(result.files).toContain('src/test.ts');
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
        text: async () => 'Internal Server Error',
      });

      const config: AgentExecutionConfig = {
        prompt: 'Create a test file',
        context: createMockContext(),
      };

      const result = await executor.execute(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('SESSION_FAILED');
    });

    it('should handle rate limit errors', async () => {
      // Use mockResolvedValue (not Once) since retry will call it multiple times
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({
          'retry-after': '1', // Short retry-after for testing
        }),
        text: async () => 'Rate limit exceeded',
      });

      // Create executor with shorter retry config for testing
      const testExecutor = new KimiExecutor({
        apiKey: mockApiKey,
        timeoutMs: 30000,
      });

      const config: AgentExecutionConfig = {
        prompt: 'Create a test file',
        context: createMockContext(),
      };

      const result = await testExecutor.execute(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('PROVIDER_UNAVAILABLE');
      expect(result.error).toContain('429');
    }, 15000); // Increase timeout to allow for retries

    it('should handle authentication errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
        text: async () => 'Invalid API key',
      });

      const config: AgentExecutionConfig = {
        prompt: 'Create a test file',
        context: createMockContext(),
      };

      const result = await executor.execute(config);

      expect(result.success).toBe(false);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const config: AgentExecutionConfig = {
        prompt: 'Create a test file',
        context: createMockContext(),
      };

      const result = await executor.execute(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should handle malformed JSON in tool call arguments', async () => {
      const mockResponse = {
        id: 'chat-789',
        object: 'chat.completion',
        created: Date.now(),
        model: 'kimi-k2.5',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'git_commit',
                    arguments: 'invalid json',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        json: async () => mockResponse,
      });

      const config: AgentExecutionConfig = {
        prompt: 'Commit changes',
        context: createMockContext(),
      };

      const result = await executor.execute(config);

      expect(result.success).toBe(true);
      // Should handle malformed JSON gracefully without crashing
      expect(result.gitCommits).toHaveLength(0);
    });

    it('should handle empty response choices', async () => {
      const mockResponse = {
        id: 'chat-empty',
        object: 'chat.completion',
        created: Date.now(),
        model: 'kimi-k2.5',
        choices: [],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 0,
          total_tokens: 100,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        json: async () => mockResponse,
      });

      const config: AgentExecutionConfig = {
        prompt: 'Do something',
        context: createMockContext(),
      };

      const result = await executor.execute(config);

      expect(result.success).toBe(true);
      expect(result.gitCommits).toHaveLength(0);
      expect(result.files).toHaveLength(0);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy when API responds successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({
          'x-ratelimit-limit': '100',
          'x-ratelimit-remaining': '95',
          'x-ratelimit-reset': '1234567890',
        }),
        json: async () => ({
          id: 'chat-health',
          object: 'chat.completion',
          created: Date.now(),
          model: 'kimi-k2.5',
          choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      });

      const health = await executor.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.provider).toBe('kimi-k25-api');
      expect(health.latency).toBeGreaterThanOrEqual(0);
      expect(health.error).toBeUndefined();
    });

    it('should return unhealthy on authentication error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
        text: async () => 'Invalid API key',
      });

      const health = await executor.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.provider).toBe('kimi-k25-api');
      expect(health.error).toBe('Invalid API key');
    });

    it('should return unhealthy on rate limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({
          'retry-after': '120',
        }),
        text: async () => 'Rate limited',
      });

      const health = await executor.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toContain('Rate limited');
    });

    it('should handle network errors in health check', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const health = await executor.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toBe('Connection refused');
    });

    it('should store rate limit info after health check', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({
          'x-ratelimit-limit': '100',
          'x-ratelimit-remaining': '50',
          'x-ratelimit-reset': '1234567890',
        }),
        json: async () => ({
          id: 'chat-health',
          object: 'chat.completion',
          created: Date.now(),
          model: 'kimi-k2.5',
          choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      });

      await executor.healthCheck();

      const rateLimitInfo = executor.getRateLimitInfo();
      expect(rateLimitInfo).toBeDefined();
      expect(rateLimitInfo?.limit).toBe(100);
      expect(rateLimitInfo?.remaining).toBe(50);
      expect(rateLimitInfo?.reset).toBe(1234567890);
    });
  });

  describe('getMetadata', () => {
    it('should return complete metadata', () => {
      const metadata = executor.getMetadata();

      expect(metadata.name).toBe('Kimi API Executor');
      expect(metadata.type).toBe('kimi-k25-api');
      expect(metadata.version).toBe('1.0.0');
      expect(metadata.supportedModels).toEqual(['kimi-k2.5', 'kimi-k2.6']);
      expect(metadata.features).toContain('tool_calls');
      expect(metadata.features).toContain('git_operations');
      expect(metadata.features).toContain('file_operations');
      expect(metadata.features).toContain('rate_limit_handling');
      expect(metadata.features).toContain('openai_compatible');
    });

    it('should not return empty metadata', () => {
      const metadata = executor.getMetadata();
      
      // All fields should be populated
      expect(metadata.name).toBeTruthy();
      expect(metadata.type).toBeTruthy();
      expect(metadata.version).toBeTruthy();
      expect(metadata.supportedModels).toBeInstanceOf(Array);
      expect(metadata.supportedModels.length).toBeGreaterThan(0);
      expect(metadata.features).toBeInstanceOf(Array);
      expect(metadata.features.length).toBeGreaterThan(0);
    });
  });

  describe('verifyResult', () => {
    it('should verify execution result with git commits and correct issue ID', () => {
      const context = createExecutionContext({
        worktreePath: '/tmp/test',
        sessionId: 'test-123',
        issueId: 'ROM-366',
        baselineCommit: 'baseline-sha',
        timeoutMs: 30000,
      });

      const result = {
        success: true,
        files: ['test.txt'],
        gitCommits: [
          {
            sha: 'new-sha-123',
            message: 'feat: ROM-366 add feature',
            author: 'Kimi Agent',
            date: new Date(),
            issueId: 'ROM-366',
          },
        ],
        output: 'Done',
        duration: 1000,
      };

      const verification = executor.verifyResult(result, context);

      // Git verification should pass (we have commits with issue ID)
      expect(verification.gitVerified).toBe(true);
      // Files verification fails because test.txt doesn't actually exist
      expect(verification.filesVerified).toBe(false);
      // Overall fails due to file verification
      expect(verification.passed).toBe(false);
    });

    it('should fail verification when no git commits', () => {
      const context = createExecutionContext({
        worktreePath: '/tmp/test',
        sessionId: 'test-123',
        issueId: 'ROM-366',
        baselineCommit: 'baseline-sha',
        timeoutMs: 30000,
      });

      const result = {
        success: true,
        files: ['test.txt'],
        gitCommits: [],
        output: 'Done',
        duration: 1000,
      };

      const verification = executor.verifyResult(result, context);

      expect(verification.passed).toBe(false);
      expect(verification.gitVerified).toBe(false);
      expect(verification.failures).toContain('No git commits found in execution result');
    });

    it('should handle edit_file tool calls', async () => {
      const mockResponse = {
        id: 'chat-edit',
        object: 'chat.completion',
        created: Date.now(),
        model: 'kimi-k2.5',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'edit_file',
                    arguments: JSON.stringify({
                      path: 'src/existing.ts',
                      oldString: 'const x = 1;',
                      newString: 'const x = 2;',
                    }),
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        json: async () => mockResponse,
      });

      const config: AgentExecutionConfig = {
        prompt: 'Edit a file',
        context: createExecutionContext({
          worktreePath: '/tmp/test-worktree',
          sessionId: 'test-session-123',
          issueId: 'ROM-366',
          timeoutMs: 30000,
        }),
      };

      const result = await executor.execute(config);

      expect(result.success).toBe(true);
      expect(result.files).toContain('src/existing.ts');
    });
  });

  describe('getRateLimitInfo', () => {
    it('should return undefined before any API calls', () => {
      const rateLimitInfo = executor.getRateLimitInfo();
      expect(rateLimitInfo).toBeUndefined();
    });

    it('should store rate limit info after API call', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({
          'x-ratelimit-limit': '200',
          'x-ratelimit-remaining': '180',
          'x-ratelimit-reset': '1234567890',
          'retry-after': '30',
        }),
        json: async () => ({
          id: 'chat-123',
          object: 'chat.completion',
          created: Date.now(),
          model: 'kimi-k2.5',
          choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });

      const config: AgentExecutionConfig = {
        prompt: 'Test',
        context: createExecutionContext({
          worktreePath: '/tmp/test',
          sessionId: 'test-123',
          issueId: 'ROM-366',
          timeoutMs: 30000,
        }),
      };

      await executor.execute(config);

      const rateLimitInfo = executor.getRateLimitInfo();
      expect(rateLimitInfo).toBeDefined();
      expect(rateLimitInfo?.limit).toBe(200);
      expect(rateLimitInfo?.remaining).toBe(180);
      expect(rateLimitInfo?.retryAfter).toBe(30);
    });
  });

  describe('createKimiExecutorFromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should create executor when KIMI_API_KEY is set', () => {
      process.env.KIMI_API_KEY = 'env-api-key';
      
      const envExecutor = createKimiExecutorFromEnv();
      
      expect(envExecutor).toBeDefined();
      expect(envExecutor).toBeInstanceOf(KimiExecutor);
    });

    it('should return undefined when KIMI_API_KEY is not set', () => {
      delete process.env.KIMI_API_KEY;
      
      const envExecutor = createKimiExecutorFromEnv();
      
      expect(envExecutor).toBeUndefined();
    });

    it('should use KIMI_MODEL from environment', () => {
      process.env.KIMI_API_KEY = 'env-api-key';
      process.env.KIMI_MODEL = 'kimi-k2.6';
      
      const envExecutor = createKimiExecutorFromEnv();
      
      expect(envExecutor).toBeDefined();
    });

    it('should use KIMI_TIMEOUT_MS from environment', () => {
      process.env.KIMI_API_KEY = 'env-api-key';
      process.env.KIMI_TIMEOUT_MS = '600000';
      
      const envExecutor = createKimiExecutorFromEnv();
      
      expect(envExecutor).toBeDefined();
    });
  });

  describe('system prompt building', () => {
    it('should include execution context in system prompt', async () => {
      const mockResponse = {
        id: 'chat-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'kimi-k2.5',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        json: async () => mockResponse,
      });

      const config: AgentExecutionConfig = {
        prompt: 'Test',
        context: createExecutionContext({
          worktreePath: '/tmp/custom-worktree',
          sessionId: 'custom-session-456',
          issueId: 'ROM-123',
          timeoutMs: 60000,
        }),
      };

      await executor.execute(config);

      // Verify the fetch was called with correct system prompt context
      const fetchCall = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      
      expect(requestBody.messages).toHaveLength(2);
      expect(requestBody.messages[0].role).toBe('system');
      expect(requestBody.messages[0].content).toContain('ROM-123');
      expect(requestBody.messages[0].content).toContain('custom-session-456');
      expect(requestBody.messages[0].content).toContain('/tmp/custom-worktree');
      expect(requestBody.messages[1].role).toBe('user');
      expect(requestBody.messages[1].content).toBe('Test');
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenCodeExecutor, createExecutionContext } from '../../../src/executors/opencode.js';
import type { AgentExecutionConfig, ExecutionContext } from '../../../src/executors/types.js';

// Mock the @opencode-ai/sdk module
vi.mock('@opencode-ai/sdk', () => {
  return {
    createOpencode: vi.fn(),
  };
});

describe('OpenCodeExecutor', () => {
  let executor: OpenCodeExecutor;
  let mockClient: {
    session: {
      create: ReturnType<typeof vi.fn>;
      prompt: ReturnType<typeof vi.fn>;
      abort: ReturnType<typeof vi.fn>;
      list: ReturnType<typeof vi.fn>;
      status: ReturnType<typeof vi.fn>;
    };
    event: {
      subscribe: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get the mock functions from the mocked module
    const { createOpencode } = await import('@opencode-ai/sdk');

    // Setup mock to return the proper structure
    vi.mocked(createOpencode).mockResolvedValue({
      client: {
        session: {
          create: vi.fn(),
          prompt: vi.fn(),
          abort: vi.fn(),
          list: vi.fn(),
          status: vi.fn(),
        },
        event: {
          subscribe: vi.fn(),
        },
      } as any,
      server: {
        url: 'http://127.0.0.1:4096',
        close: vi.fn(),
      },
    });

    // Use the async factory method
    executor = await OpenCodeExecutor.create({
      timeoutMs: 30000,
      baseUrl: 'http://localhost:4096',
    });

    // Get the mock result
    const mockResult = await vi.mocked(createOpencode).mock.results[0]?.value;
    mockClient = mockResult?.client as typeof mockClient;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct provider type', () => {
      expect(executor.providerType).toBe('opencode-glm47');
    });

    it('should have supported models', () => {
      expect(executor.supportedModels).toContain('kimi-k2.5');
      expect(executor.supportedModels).toContain('kimi-k2.6');
    });

    it('should use default port and hostname when creating server', async () => {
      const { createOpencode } = await import('@opencode-ai/sdk');

      // Reset mock to capture the new call
      vi.mocked(createOpencode).mockClear();

      await OpenCodeExecutor.create({
        timeoutMs: 30000,
      });

      expect(createOpencode).toHaveBeenLastCalledWith({
        hostname: '127.0.0.1',
        port: 4096,
        timeout: 30000,
      });
    });

    it('should use provided timeoutMs', async () => {
      const { createOpencode } = await import('@opencode-ai/sdk');

      // Reset mock to capture the new call
      vi.mocked(createOpencode).mockClear();

      await OpenCodeExecutor.create({
        timeoutMs: 60000,
        baseUrl: 'http://custom:8080',
      });

      expect(createOpencode).toHaveBeenLastCalledWith({
        hostname: '127.0.0.1',
        port: 4096,
        timeout: 60000,
      });
    });
  });

  describe('execute', () => {
    const createMockContext = (): ExecutionContext =>
      createExecutionContext({
        worktreePath: '/tmp/test-worktree',
        sessionId: 'test-session-123',
        issueId: 'ROM-362',
        baselineCommit: 'abc123',
        timeoutMs: 30000,
      });

    it('should successfully execute a prompt', async () => {
      const mockEvents = [
        { type: 'session.created', sessionID: 'session-123', properties: {} },
        { type: 'file.edited', sessionID: 'session-123', properties: { file: 'test.txt' } },
        { type: 'session.idle', sessionID: 'session-123', properties: { status: { type: 'idle' } } },
      ];

      async function* eventGenerator() {
        for (const event of mockEvents) {
          yield event;
        }
      }

      mockClient.event.subscribe.mockResolvedValue({
        stream: eventGenerator(),
      });

      mockClient.session.create.mockResolvedValue({
        data: { id: 'session-123' },
        error: undefined,
      });

      mockClient.session.prompt.mockResolvedValue({
        data: { id: 'message-123' },
        error: undefined,
      });

      const config: AgentExecutionConfig = {
        prompt: 'Create a test file',
        context: createMockContext(),
        model: 'kimi-k2.5',
      };

      const result = await executor.execute(config);

      expect(result.success).toBe(true);
      expect(result.files).toContain('test.txt');
      expect(mockClient.event.subscribe).toHaveBeenCalled();
      expect(mockClient.session.create).toHaveBeenCalled();
      expect(mockClient.session.prompt).toHaveBeenCalledWith({
        path: { id: 'session-123' },
        body: {
          model: { providerID: 'anthropic', modelID: 'kimi-k2.5' },
          parts: [{ type: 'text', text: 'Create a test file' }],
        },
      });
    });

    it('should handle session creation failure', async () => {
      mockClient.session.create.mockResolvedValue({
        data: undefined,
        error: { errors: [{ message: 'Invalid API key' }] },
      });

      mockClient.event.subscribe.mockResolvedValue({
        stream: (async function* () {})(),
      });

      const config: AgentExecutionConfig = {
        prompt: 'Create a test file',
        context: createMockContext(),
      };

      const result = await executor.execute(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create session');
    });

    it('should handle prompt sending failure', async () => {
      mockClient.session.create.mockResolvedValue({
        data: { id: 'session-123' },
        error: undefined,
      });

      mockClient.session.prompt.mockResolvedValue({
        data: undefined,
        error: { errors: [{ message: 'Rate limit exceeded' }] },
      });

      mockClient.event.subscribe.mockResolvedValue({
        stream: (async function* () {})(),
      });

      const config: AgentExecutionConfig = {
        prompt: 'Create a test file',
        context: createMockContext(),
      };

      const result = await executor.execute(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to send prompt');
    });

    it('should handle timeout', async () => {
      const slowEvents = [
        { type: 'session.created', sessionID: 'session-123', properties: {} },
      ];

      async function* slowEventGenerator() {
        for (const event of slowEvents) {
          yield event;
        }
        // Never yield completion - simulating hanging session
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }

      mockClient.event.subscribe.mockResolvedValue({
        stream: slowEventGenerator(),
      });

      mockClient.session.create.mockResolvedValue({
        data: { id: 'session-123' },
        error: undefined,
      });

      mockClient.session.prompt.mockResolvedValue({
        data: { id: 'message-123' },
        error: undefined,
      });

      const config: AgentExecutionConfig = {
        prompt: 'Create a test file',
        context: createExecutionContext({
          worktreePath: '/tmp/test-worktree',
          sessionId: 'test-session-123',
          issueId: 'ROM-362',
          timeoutMs: 100, // Very short timeout for testing
        }),
      };

      const result = await executor.execute(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('TIMEOUT');
      expect(mockClient.session.abort).toHaveBeenCalledWith({
        path: { id: 'session-123' },
      });
    });

    it('should handle session failure events', async () => {
      const failureEvents = [
        { type: 'session.created', sessionID: 'session-123', properties: {} },
        { type: 'session.failed', sessionID: 'session-123', properties: { error: 'Something went wrong' } },
      ];

      async function* eventGenerator() {
        for (const event of failureEvents) {
          yield event;
        }
      }

      mockClient.event.subscribe.mockResolvedValue({
        stream: eventGenerator(),
      });

      mockClient.session.create.mockResolvedValue({
        data: { id: 'session-123' },
        error: undefined,
      });

      mockClient.session.prompt.mockResolvedValue({
        data: { id: 'message-123' },
        error: undefined,
      });

      const config: AgentExecutionConfig = {
        prompt: 'Create a test file',
        context: createMockContext(),
      };

      const result = await executor.execute(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('SESSION_FAILED');
    });

    it('should parse git commits from tool.call events', async () => {
      const eventsWithGitCommit = [
        { type: 'session.created', sessionID: 'session-123', properties: {} },
        {
          type: 'tool.call',
          sessionID: 'session-123',
          properties: {
            tool: 'git_commit',
            arguments: {
              message: 'feat: add new feature',
              sha: 'abc123def456',
            },
          },
        },
        { type: 'session.idle', sessionID: 'session-123', properties: { status: { type: 'idle' } } },
      ];

      async function* eventGenerator() {
        for (const event of eventsWithGitCommit) {
          yield event;
        }
      }

      mockClient.event.subscribe.mockResolvedValue({
        stream: eventGenerator(),
      });

      mockClient.session.create.mockResolvedValue({
        data: { id: 'session-123' },
        error: undefined,
      });

      mockClient.session.prompt.mockResolvedValue({
        data: { id: 'message-123' },
        error: undefined,
      });

      const config: AgentExecutionConfig = {
        prompt: 'Commit the changes',
        context: createMockContext(),
      };

      const result = await executor.execute(config);

      expect(result.success).toBe(true);
      expect(result.gitCommits).toHaveLength(1);
      expect(result.gitCommits[0].sha).toBe('abc123def456');
      expect(result.gitCommits[0].message).toBe('feat: add new feature');
      expect(result.gitCommits[0].issueId).toBe('ROM-362');
    });

    it('should parse bash git commands', async () => {
      const eventsWithBash = [
        { type: 'session.created', sessionID: 'session-123', properties: {} },
        {
          type: 'tool.call',
          sessionID: 'session-123',
          properties: {
            tool: 'bash',
            arguments: {
              command: 'git commit -m "feat: add feature"',
            },
            result: '[main abc1234] feat: add feature',
          },
        },
        { type: 'session.idle', sessionID: 'session-123', properties: { status: { type: 'idle' } } },
      ];

      async function* eventGenerator() {
        for (const event of eventsWithBash) {
          yield event;
        }
      }

      mockClient.event.subscribe.mockResolvedValue({
        stream: eventGenerator(),
      });

      mockClient.session.create.mockResolvedValue({
        data: { id: 'session-123' },
        error: undefined,
      });

      mockClient.session.prompt.mockResolvedValue({
        data: { id: 'message-123' },
        error: undefined,
      });

      const config: AgentExecutionConfig = {
        prompt: 'Commit changes',
        context: createMockContext(),
      };

      const result = await executor.execute(config);

      expect(result.success).toBe(true);
      expect(result.gitCommits).toHaveLength(1);
      expect(result.gitCommits[0].sha).toBe('abc1234');
      expect(result.gitCommits[0].message).toBe('feat: add feature');
    });

    it('should handle message.updated events with diffs', async () => {
      const eventsWithDiffs = [
        { type: 'session.created', sessionID: 'session-123', properties: {} },
        {
          type: 'message.updated',
          sessionID: 'session-123',
          properties: {
            info: {
              role: 'assistant',
              summary: {
                diffs: [{ file: 'src/index.ts' }, { file: 'src/utils.ts' }],
              },
            },
          },
        },
        { type: 'session.idle', sessionID: 'session-123', properties: { status: { type: 'idle' } } },
      ];

      async function* eventGenerator() {
        for (const event of eventsWithDiffs) {
          yield event;
        }
      }

      mockClient.event.subscribe.mockResolvedValue({
        stream: eventGenerator(),
      });

      mockClient.session.create.mockResolvedValue({
        data: { id: 'session-123' },
        error: undefined,
      });

      mockClient.session.prompt.mockResolvedValue({
        data: { id: 'message-123' },
        error: undefined,
      });

      const config: AgentExecutionConfig = {
        prompt: 'Update files',
        context: createMockContext(),
      };

      const result = await executor.execute(config);

      expect(result.success).toBe(true);
      expect(result.files).toContain('src/index.ts');
      expect(result.files).toContain('src/utils.ts');
    });

    it('should only collect events for the target session', async () => {
      const mixedEvents = [
        { type: 'session.created', sessionID: 'other-session', properties: {} },
        { type: 'session.created', sessionID: 'session-123', properties: {} },
        { type: 'file.edited', sessionID: 'other-session', properties: { file: 'other.txt' } },
        { type: 'file.edited', sessionID: 'session-123', properties: { file: 'target.txt' } },
        { type: 'session.idle', sessionID: 'session-123', properties: { status: { type: 'idle' } } },
      ];

      async function* eventGenerator() {
        for (const event of mixedEvents) {
          yield event;
        }
      }

      mockClient.event.subscribe.mockResolvedValue({
        stream: eventGenerator(),
      });

      mockClient.session.create.mockResolvedValue({
        data: { id: 'session-123' },
        error: undefined,
      });

      mockClient.session.prompt.mockResolvedValue({
        data: { id: 'message-123' },
        error: undefined,
      });

      const config: AgentExecutionConfig = {
        prompt: 'Create file',
        context: createMockContext(),
      };

      const result = await executor.execute(config);

      expect(result.success).toBe(true);
      expect(result.files).toContain('target.txt');
      expect(result.files).not.toContain('other.txt');
    });

    it('should handle SSE stream errors with automatic reconnection', async () => {
      let callCount = 0;

      // Mock subscribe to return different streams on each call
      mockClient.event.subscribe.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First stream throws error after yielding some events
          async function* firstStream() {
            yield { type: 'session.created', sessionID: 'session-123', properties: {} };
            yield { type: 'file.edited', sessionID: 'session-123', properties: { file: 'test1.txt' } };
            throw new Error('SSE stream connection dropped');
          }
          return Promise.resolve({ stream: firstStream() });
        } else {
          // Reconnected stream continues and completes
          async function* secondStream() {
            yield { type: 'file.edited', sessionID: 'session-123', properties: { file: 'test2.txt' } };
            yield { type: 'session.idle', sessionID: 'session-123', properties: { status: { type: 'idle' } } };
          }
          return Promise.resolve({ stream: secondStream() });
        }
      });

      // Mock session status to return busy (not idle) so reconnection continues
      mockClient.session.status.mockResolvedValue({
        data: { 'session-123': { type: 'busy' } },
        error: undefined,
      });

      mockClient.session.create.mockResolvedValue({
        data: { id: 'session-123' },
        error: undefined,
      });

      mockClient.session.prompt.mockResolvedValue({
        data: { id: 'message-123' },
        error: undefined,
      });

      const config: AgentExecutionConfig = {
        prompt: 'Create test files',
        context: createMockContext(),
      };

      const result = await executor.execute(config);

      expect(result.success).toBe(true);
      expect(result.files).toContain('test1.txt');
      expect(result.files).toContain('test2.txt');
      expect(callCount).toBeGreaterThan(1); // Should have reconnected
    });

    it('should fail gracefully after max SSE reconnection attempts', { timeout: 15000 }, async () => {
      // Always failing stream on every subscribe
      mockClient.event.subscribe.mockImplementation(() => {
        async function* alwaysFailingStream() {
          yield { type: 'session.created', sessionID: 'session-123', properties: {} };
          throw new Error('Persistent SSE stream error');
        }
        return Promise.resolve({ stream: alwaysFailingStream() });
      });

      // Mock session status to always return busy (session not complete)
      mockClient.session.status.mockResolvedValue({
        data: { 'session-123': { type: 'busy' } },
        error: undefined,
      });

      mockClient.session.create.mockResolvedValue({
        data: { id: 'session-123' },
        error: undefined,
      });

      mockClient.session.prompt.mockResolvedValue({
        data: { id: 'message-123' },
        error: undefined,
      });

      const config: AgentExecutionConfig = {
        prompt: 'Create test file',
        context: createExecutionContext({
          worktreePath: '/tmp/test-worktree',
          sessionId: 'test-session-123',
          issueId: 'ROM-362',
          baselineCommit: 'abc123',
          timeoutMs: 60000,
        }),
      };

      const result = await executor.execute(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('SESSION_FAILED');
    });

    it('should execute without optional model parameter', async () => {
      const mockEvents = [
        { type: 'session.created', sessionID: 'session-123', properties: {} },
        { type: 'session.idle', sessionID: 'session-123', properties: { status: { type: 'idle' } } },
      ];

      async function* eventGenerator() {
        for (const event of mockEvents) {
          yield event;
        }
      }

      mockClient.event.subscribe.mockResolvedValue({
        stream: eventGenerator(),
      });

      mockClient.session.create.mockResolvedValue({
        data: { id: 'session-123' },
        error: undefined,
      });

      mockClient.session.prompt.mockResolvedValue({
        data: { id: 'message-123' },
        error: undefined,
      });

      const config: AgentExecutionConfig = {
        prompt: 'Create a test file',
        context: createMockContext(),
        // No model specified
      };

      const result = await executor.execute(config);

      expect(result.success).toBe(true);
      // Verify prompt was sent without model override
      expect(mockClient.session.prompt).toHaveBeenCalledWith({
        path: { id: 'session-123' },
        body: {
          model: undefined,
          parts: [{ type: 'text', text: 'Create a test file' }],
        },
      });
    });
  });

  describe('healthCheck', () => {
    it('should return healthy when session list succeeds', async () => {
      mockClient.session.list.mockResolvedValue({
        data: [],
        error: undefined,
      });

      const health = await executor.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.provider).toBe('opencode-glm47');
      expect(health.latency).toBeGreaterThanOrEqual(0);
      expect(health.error).toBeUndefined();
    });

    it('should return unhealthy when session list fails', async () => {
      mockClient.session.list.mockResolvedValue({
        data: undefined,
        error: { errors: [{ message: 'Connection refused' }] },
      });

      const health = await executor.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.provider).toBe('opencode-glm47');
      expect(health.error).toBeDefined();
    });

    it('should handle exceptions during health check', async () => {
      mockClient.session.list.mockRejectedValue(new Error('Network error'));

      const health = await executor.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toContain('Network error');
    });
  });

  describe('getMetadata', () => {
    it('should return correct metadata', () => {
      const metadata = executor.getMetadata();

      expect(metadata.name).toBe('OpenCode');
      expect(metadata.type).toBe('opencode-glm47');
      expect(metadata.version).toBe('1.1.51');
      expect(metadata.supportedModels).toEqual(['kimi-k2.5', 'kimi-k2.6', 'gpt-4o', 'glm-4']);
      expect(metadata.features).toContain('sse-events');
      expect(metadata.features).toContain('tool-calls');
      expect(metadata.features).toContain('git-integration');
    });
  });

  describe('verifyResult', () => {
    it('should verify execution result with git commits and correct issue ID', () => {
      const context = createExecutionContext({
        worktreePath: '/tmp/test',
        sessionId: 'test-123',
        issueId: 'ROM-362',
        baselineCommit: 'baseline-sha',
        timeoutMs: 30000,
      });

      // Result with commits containing issue ID - verification should check commit messages
      const result = {
        success: true,
        files: ['test.txt'],
        gitCommits: [
          {
            sha: 'new-sha-123',
            message: 'feat: ROM-362 add feature',
            author: 'test',
            date: new Date(),
            issueId: 'ROM-362',
          },
        ],
        output: 'Done',
        duration: 1000,
      };

      // Note: verifyResult is inherited from base class and checks:
      // 1. Git commits exist (passes - we have 1)
      // 2. Files exist (will fail since files don't actually exist in filesystem)
      // 3. Issue ID in commit message (passes - "ROM-362" is in message)
      // Since files don't exist, the test verifies the logic works but may not pass fully
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
        issueId: 'ROM-362',
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
  });
});

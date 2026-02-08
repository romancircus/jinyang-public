import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentExecutor, createExecutionContext, createExecutionConfig } from '../../../src/executors/base.js';
import type {
  AgentProvider,
  ExecutionContext,
  ExecutionResult,
  AgentExecutionConfig,
  GitCommit,
  ProviderMetadata,
} from '../../../src/executors/types.js';
import type { HealthStatus } from '../../../src/types/index.js';

// Mock implementations for testing
class MockExecutor extends AgentExecutor {
  readonly providerType: AgentProvider = 'opencode-glm47';
  readonly supportedModels: string[] = ['kimi-k2.5', 'kimi-k2.6'];

  async execute(config: AgentExecutionConfig): Promise<ExecutionResult> {
    const startTime = this.startTimer();
    
    // Simulate successful execution
    const commits: GitCommit[] = [
      {
        sha: 'abc123def456',
        message: `feat: test commit for ${config.context.issueId}`,
        author: 'Test Author',
        date: new Date(),
        issueId: config.context.issueId,
      },
    ];

    return this.createSuccessResult(
      'Mock execution completed',
      ['src/test.ts'],
      commits,
      this.elapsedMs(startTime)
    );
  }

  async healthCheck(): Promise<HealthStatus> {
    return {
      provider: this.providerType,
      healthy: true,
      latency: 100,
    };
  }

  getMetadata(): ProviderMetadata {
    return {
      name: 'Mock Executor',
      type: this.providerType,
      version: '1.0.0',
      supportedModels: this.supportedModels,
      features: ['git', 'files', 'streaming'],
    };
  }
}

class FailingExecutor extends AgentExecutor {
  readonly providerType: AgentProvider = 'kimi-k25-api';
  readonly supportedModels: string[] = ['kimi-k2.5'];

  async execute(config: AgentExecutionConfig): Promise<ExecutionResult> {
    const startTime = this.startTimer();
    return this.createErrorResult(
      'SESSION_FAILED',
      'Mock session failure',
      this.elapsedMs(startTime),
      new Error('Test error')
    );
  }

  async healthCheck(): Promise<HealthStatus> {
    return {
      provider: this.providerType,
      healthy: false,
      error: 'Provider unavailable',
    };
  }

  getMetadata(): ProviderMetadata {
    return {
      name: 'Failing Executor',
      type: this.providerType,
      version: '1.0.0',
      supportedModels: this.supportedModels,
      features: [],
    };
  }
}

class NoCommitExecutor extends AgentExecutor {
  readonly providerType: AgentProvider = 'opencode-glm47';
  readonly supportedModels: string[] = ['kimi-k2.5'];

  async execute(config: AgentExecutionConfig): Promise<ExecutionResult> {
    const startTime = this.startTimer();
    
    // Return result without any commits
    return this.createSuccessResult(
      'Mock execution without commits',
      ['src/test.ts'],
      [], // No commits
      this.elapsedMs(startTime)
    );
  }

  async healthCheck(): Promise<HealthStatus> {
    return {
      provider: this.providerType,
      healthy: true,
    };
  }

  getMetadata(): ProviderMetadata {
    return {
      name: 'No Commit Executor',
      type: this.providerType,
      version: '1.0.0',
      supportedModels: this.supportedModels,
      features: ['files'],
    };
  }
}

describe('AgentExecutor', () => {
  let mockExecutor: MockExecutor;
  let failingExecutor: FailingExecutor;
  let noCommitExecutor: NoCommitExecutor;
  let baseContext: ExecutionContext;

  beforeEach(() => {
    mockExecutor = new MockExecutor();
    failingExecutor = new FailingExecutor();
    noCommitExecutor = new NoCommitExecutor();
    baseContext = createExecutionContext({
      worktreePath: '/tmp/test-worktree',
      sessionId: 'test-session-123',
      issueId: 'ROM-356',
      baselineCommit: 'baseline123',
      timeoutMs: 300000,
    });
  });

  describe('Interface Compliance', () => {
    it('should have required abstract properties', () => {
      expect(mockExecutor.providerType).toBe('opencode-glm47');
      expect(mockExecutor.supportedModels).toEqual(['kimi-k2.5', 'kimi-k2.6']);
    });

    it('should implement execute method', async () => {
      const config = createExecutionConfig('Test prompt', baseContext);
      const result = await mockExecutor.execute(config);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should implement healthCheck method', async () => {
      const status = await mockExecutor.healthCheck();
      
      expect(status).toBeDefined();
      expect(status.provider).toBe('opencode-glm47');
    });

    it('should implement getMetadata method', () => {
      const metadata = mockExecutor.getMetadata();
      
      expect(metadata).toBeDefined();
      expect(metadata.name).toBe('Mock Executor');
      expect(metadata.type).toBe('opencode-glm47');
      expect(metadata.supportedModels).toEqual(['kimi-k2.5', 'kimi-k2.6']);
    });
  });

  describe('Execution Result Creation', () => {
    it('should create success result with proper structure', async () => {
      const config = createExecutionConfig('Test prompt', baseContext);
      const result = await mockExecutor.execute(config);

      expect(result.success).toBe(true);
      expect(result.files).toContain('src/test.ts');
      expect(result.gitCommits).toHaveLength(1);
      expect(result.output).toBe('Mock execution completed');
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    it('should create error result with proper structure', async () => {
      const config = createExecutionConfig('Test prompt', baseContext);
      const result = await failingExecutor.execute(config);

      expect(result.success).toBe(false);
      expect(result.files).toEqual([]);
      expect(result.gitCommits).toEqual([]);
      expect(result.output).toBe('');
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.error).toContain('SESSION_FAILED');
      expect(result.error).toContain('Mock session failure');
    });

    it('should include git commits in result', async () => {
      const config = createExecutionConfig('Test prompt', baseContext);
      const result = await mockExecutor.execute(config);

      expect(result.gitCommits).toHaveLength(1);
      expect(result.gitCommits[0].sha).toBe('abc123def456');
      expect(result.gitCommits[0].message).toContain('ROM-356');
      expect(result.gitCommits[0].issueId).toBe('ROM-356');
    });
  });

  describe('Health Checking', () => {
    it('should return healthy status for working provider', async () => {
      const status = await mockExecutor.healthCheck();

      expect(status.healthy).toBe(true);
      expect(status.latency).toBe(100);
      expect(status.error).toBeUndefined();
    });

    it('should return unhealthy status for failing provider', async () => {
      const status = await failingExecutor.healthCheck();

      expect(status.healthy).toBe(false);
      expect(status.error).toBe('Provider unavailable');
    });
  });

  describe('Result Verification', () => {
    it('should verify successful execution', async () => {
      const config = createExecutionConfig('Test prompt', baseContext);
      const result = await mockExecutor.execute(config);
      
      // We can't fully test verification without a real git repo
      // but we can test the structure is correct
      expect(result.gitCommits.length).toBeGreaterThan(0);
    });

    it('should identify missing git commits', async () => {
      const config = createExecutionConfig('Test prompt', baseContext);
      const result = await noCommitExecutor.execute(config);

      expect(result.success).toBe(true);
      expect(result.gitCommits).toHaveLength(0);
    });
  });

  describe('Factory Functions', () => {
    it('should create execution context with defaults', () => {
      const context = createExecutionContext({
        worktreePath: '/worktree',
        sessionId: 'session-1',
        issueId: 'ROM-100',
      });

      expect(context.worktreePath).toBe('/worktree');
      expect(context.sessionId).toBe('session-1');
      expect(context.issueId).toBe('ROM-100');
      expect(context.timeoutMs).toBe(300000); // Default
      expect(context.baselineCommit).toBeUndefined();
    });

    it('should create execution context with custom values', () => {
      const context = createExecutionContext({
        worktreePath: '/worktree',
        sessionId: 'session-1',
        issueId: 'ROM-100',
        baselineCommit: 'abc123',
        timeoutMs: 60000,
        repository: 'my-repo',
        modelOverride: 'kimi-k2.6',
      });

      expect(context.baselineCommit).toBe('abc123');
      expect(context.timeoutMs).toBe(60000);
      expect(context.repository).toBe('my-repo');
      expect(context.modelOverride).toBe('kimi-k2.6');
    });

    it('should create execution config with defaults', () => {
      const context = createExecutionContext({
        worktreePath: '/worktree',
        sessionId: 'session-1',
        issueId: 'ROM-100',
      });
      const config = createExecutionConfig('Test prompt', context);

      expect(config.prompt).toBe('Test prompt');
      expect(config.context).toBe(context);
      expect(config.agent).toBe('build');
      expect(config.streaming).toBe(true);
    });

    it('should create execution config with custom options', () => {
      const context = createExecutionContext({
        worktreePath: '/worktree',
        sessionId: 'session-1',
        issueId: 'ROM-100',
      });
      const config = createExecutionConfig('Test prompt', context, {
        model: 'kimi-k2.6',
        agent: 'plan',
        streaming: false,
      });

      expect(config.model).toBe('kimi-k2.6');
      expect(config.agent).toBe('plan');
      expect(config.streaming).toBe(false);
    });
  });

  describe('Timer Functions', () => {
    it('should measure execution time', async () => {
      const executor = new MockExecutor();
      const config = createExecutionConfig('Test', baseContext);
      
      const result = await executor.execute(config);
      
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.duration).toBeLessThan(1000); // Should be very fast in mock
    });
  });

  describe('Abstract Class Contract', () => {
    it('should not be instantiable directly', () => {
      // TypeScript would prevent this at compile time
      // This test verifies the class structure
      expect(AgentExecutor).toBeDefined();
      expect(typeof AgentExecutor).toBe('function');
    });

    it('should require implementation of abstract methods', () => {
      // Verify that a minimal implementation works
      class MinimalExecutor extends AgentExecutor {
        readonly providerType: AgentProvider = 'claude-code';
        readonly supportedModels: string[] = [];

        async execute(): Promise<ExecutionResult> {
          return this.createSuccessResult('', [], [], 0);
        }

        async healthCheck(): Promise<HealthStatus> {
          return { provider: this.providerType, healthy: true };
        }

        getMetadata(): ProviderMetadata {
          return {
            name: 'Minimal',
            type: this.providerType,
            version: '0.0.1',
            supportedModels: [],
            features: [],
          };
        }
      }

      const minimal = new MinimalExecutor();
      expect(minimal.providerType).toBe('claude-code');
      expect(minimal.supportedModels).toEqual([]);
    });
  });
});

describe('AgentExecutor Error Handling', () => {
  it('should handle timeout errors', async () => {
    class TimeoutExecutor extends AgentExecutor {
      readonly providerType: AgentProvider = 'opencode-glm47';
      readonly supportedModels: string[] = ['kimi-k2.5'];

      async execute(_config: AgentExecutionConfig): Promise<ExecutionResult> {
        const startTime = this.startTimer();
        return this.createErrorResult(
          'TIMEOUT',
          'Execution timed out after 300000ms',
          300000,
          new Error('Timeout')
        );
      }

      async healthCheck(): Promise<HealthStatus> {
        return { provider: this.providerType, healthy: false, error: 'Timeout' };
      }

      getMetadata(): ProviderMetadata {
        return {
          name: 'Timeout Executor',
          type: this.providerType,
          version: '1.0.0',
          supportedModels: this.supportedModels,
          features: [],
        };
      }
    }

    const executor = new TimeoutExecutor();
    const context = createExecutionContext({
      worktreePath: '/tmp',
      sessionId: 'timeout-test',
      issueId: 'ROM-999',
    });
    const config = createExecutionConfig('Test', context);
    
    const result = await executor.execute(config);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('TIMEOUT');
    expect(result.duration).toBe(300000);
  });

  it('should handle git verification failures', async () => {
    class GitFailureExecutor extends AgentExecutor {
      readonly providerType: AgentProvider = 'claude-code';
      readonly supportedModels: string[] = ['claude-3-5-sonnet'];

      async execute(_config: AgentExecutionConfig): Promise<ExecutionResult> {
        const startTime = this.startTimer();
        return this.createErrorResult(
          'GIT_VERIFICATION_FAILED',
          'No git commit created',
          this.elapsedMs(startTime)
        );
      }

      async healthCheck(): Promise<HealthStatus> {
        return { provider: this.providerType, healthy: true };
      }

      getMetadata(): ProviderMetadata {
        return {
          name: 'Git Failure Executor',
          type: this.providerType,
          version: '1.0.0',
          supportedModels: this.supportedModels,
          features: [],
        };
      }
    }

    const executor = new GitFailureExecutor();
    const context = createExecutionContext({
      worktreePath: '/tmp',
      sessionId: 'git-test',
      issueId: 'ROM-998',
    });
    const config = createExecutionConfig('Test', context);
    
    const result = await executor.execute(config);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('GIT_VERIFICATION_FAILED');
  });
});

describe('AgentExecutor Provider Metadata', () => {
  it('should return complete metadata for OpenCode provider', () => {
    class OpenCodeExecutor extends AgentExecutor {
      readonly providerType: AgentProvider = 'opencode-glm47';
      readonly supportedModels: string[] = ['kimi-k2.5', 'kimi-k2.6', 'glm-4-9b'];

      async execute(): Promise<ExecutionResult> {
        return this.createSuccessResult('', [], [], 0);
      }

      async healthCheck(): Promise<HealthStatus> {
        return { provider: this.providerType, healthy: true, latency: 50 };
      }

      getMetadata(): ProviderMetadata {
        return {
          name: 'OpenCode Executor',
          type: this.providerType,
          version: '2.0.0',
          supportedModels: this.supportedModels,
          features: ['streaming', 'tool_calls', 'git_verification', 'sse_events'],
        };
      }
    }

    const executor = new OpenCodeExecutor();
    const metadata = executor.getMetadata();

    expect(metadata.name).toBe('OpenCode Executor');
    expect(metadata.type).toBe('opencode-glm47');
    expect(metadata.version).toBe('2.0.0');
    expect(metadata.supportedModels).toHaveLength(3);
    expect(metadata.features).toContain('streaming');
    expect(metadata.features).toContain('tool_calls');
  });

  it('should return complete metadata for Kimi provider', () => {
    class KimiExecutor extends AgentExecutor {
      readonly providerType: AgentProvider = 'kimi-k25-api';
      readonly supportedModels: string[] = ['kimi-k2.5'];

      async execute(): Promise<ExecutionResult> {
        return this.createSuccessResult('', [], [], 0);
      }

      async healthCheck(): Promise<HealthStatus> {
        return { provider: this.providerType, healthy: true };
      }

      getMetadata(): ProviderMetadata {
        return {
          name: 'Kimi API Executor',
          type: this.providerType,
          version: '1.0.0',
          supportedModels: this.supportedModels,
          features: ['cli_mode', 'stdio_parsing'],
        };
      }
    }

    const executor = new KimiExecutor();
    const metadata = executor.getMetadata();

    expect(metadata.name).toBe('Kimi API Executor');
    expect(metadata.type).toBe('kimi-k25-api');
    expect(metadata.features).toContain('cli_mode');
  });
});

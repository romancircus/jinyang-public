import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ExecutorFactory,
  UnknownProviderError,
  ConfigValidationError,
  ClaudeCodeAPIExecutor,
} from '../../../src/executors/factory.js';
import { OpenCodeExecutor } from '../../../src/executors/opencode.js';
import { KimiExecutor } from '../../../src/executors/kimi.js';
import type { ProviderConfig } from '../../../src/types/index.js';

// Mock the executor modules
vi.mock('../../../src/executors/opencode.js', () => {
  return {
    OpenCodeExecutor: {
      create: vi.fn().mockImplementation((config) => Promise.resolve({
        providerType: 'opencode-glm47',
        supportedModels: ['kimi-k2.5', 'kimi-k2.6'],
        config,
        execute: vi.fn(),
        healthCheck: vi.fn(),
        getMetadata: vi.fn().mockReturnValue({
          name: 'OpenCode',
          type: 'opencode-glm47',
          version: '1.1.51',
          supportedModels: ['kimi-k2.5', 'kimi-k2.6'],
          features: ['sse-events', 'tool-calls'],
        }),
      })),
    },
    createExecutionContext: vi.fn(),
    createExecutionConfig: vi.fn(),
  };
});

vi.mock('../../../src/executors/kimi.js', () => {
  return {
    KimiExecutor: vi.fn().mockImplementation((config) => ({
      providerType: 'kimi-k25-api',
      supportedModels: ['kimi-k2.5', 'kimi-k2.6'],
      config,
      execute: vi.fn(),
      healthCheck: vi.fn(),
      getMetadata: vi.fn().mockReturnValue({
        name: 'Kimi Executor',
        type: 'kimi-k25-api',
        version: '1.0.0',
        supportedModels: ['kimi-k2.5', 'kimi-k2.6'],
        features: ['tool_calls', 'api_mode'],
      }),
    })),
    createKimiExecutorFromEnv: vi.fn(),
  };
});

describe('ExecutorFactory', () => {
  let factory: ExecutorFactory;

  beforeEach(async () => {
    factory = new ExecutorFactory();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should register built-in providers on construction', () => {
      const providers = factory.getAvailableProviders();
      
      expect(providers).toContain('opencode');
      expect(providers).toContain('kimi');
      expect(providers).toContain('claude-code-api');
      expect(providers).toHaveLength(3);
    });
  });

  describe('createExecutor', () => {
    it('should create OpenCodeExecutor for opencode provider', async () => {
      const config: ProviderConfig = {
        type: 'opencode-glm47',
        name: 'opencode',
        priority: 1,
        enabled: true,
        apiKey: 'test-api-key',
        endpoint: 'http://localhost:4096',
      };

      const executor = await factory.createExecutor('opencode', config);

      expect(OpenCodeExecutor.create).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        timeoutMs: 300000,
        baseUrl: 'http://localhost:4096',
      });
      expect(executor.providerType).toBe('opencode-glm47');
    });

    it('should create KimiExecutor for kimi provider', async () => {
      const config: ProviderConfig = {
        type: 'kimi-k25-api',
        name: 'kimi',
        priority: 2,
        enabled: true,
        apiKey: 'sk-test-key',
        endpoint: 'https://api.moonshot.cn/v1',
      };

      const executor = await factory.createExecutor('kimi', config);

      expect(KimiExecutor).toHaveBeenCalledWith({
        apiKey: 'sk-test-key',
        timeoutMs: 300000,
        baseUrl: 'https://api.moonshot.cn/v1',
      });
      expect(executor.providerType).toBe('kimi-k25-api');
    });

    it('should create ClaudeCodeAPIExecutor for claude-code-api provider', async () => {
      const config: ProviderConfig = {
        type: 'claude-code-api',
        name: 'claude-code-api',
        priority: 3,
        enabled: true,
      };

      const executor = await factory.createExecutor('claude-code-api', config);

      expect(executor).toBeInstanceOf(ClaudeCodeAPIExecutor);
      expect(executor.providerType).toBe('claude-code-api');
    });

    it('should throw UnknownProviderError for unknown provider', async () => {
      const config: ProviderConfig = {
        type: 'opencode-glm47',
        name: 'unknown',
        priority: 1,
        enabled: true,
      };

      await expect(factory.createExecutor('unknown-provider', config)).rejects.toThrow(
        UnknownProviderError
      );
      await expect(factory.createExecutor('unknown-provider', config)).rejects.toThrow(
        'Unknown provider: unknown-provider'
      );
    });

    it('should include available providers in UnknownProviderError', async () => {
      const config: ProviderConfig = {
        type: 'opencode-glm47',
        name: 'unknown',
        priority: 1,
        enabled: true,
      };

      try {
        await factory.createExecutor('unknown-provider', config);
        expect.fail('Should have thrown UnknownProviderError');
      } catch (error) {
        expect(error).toBeInstanceOf(UnknownProviderError);
        if (error instanceof UnknownProviderError) {
          expect(error.provider).toBe('unknown-provider');
          expect(error.availableProviders).toContain('opencode');
          expect(error.availableProviders).toContain('kimi');
          expect(error.availableProviders).toContain('claude-code-api');
        }
      }
    });

    it('should throw ConfigValidationError for null config', async () => {
      await expect(factory.createExecutor('opencode', null as unknown as ProviderConfig)).rejects.toThrow(
        ConfigValidationError
      );
    });

    it('should throw ConfigValidationError for non-object config', async () => {
      await expect(factory.createExecutor('opencode', 'invalid' as unknown as ProviderConfig)).rejects.toThrow(
        ConfigValidationError
      );
    });

    it('should throw ConfigValidationError when Kimi config missing apiKey', async () => {
      const config: ProviderConfig = {
        type: 'kimi-k25-api',
        name: 'kimi',
        priority: 2,
        enabled: true,
        // apiKey is missing
      };

      await expect(factory.createExecutor('kimi', config)).rejects.toThrow(
        ConfigValidationError
      );
      await expect(factory.createExecutor('kimi', config)).rejects.toThrow(
        'API key is required for Kimi provider'
      );
    });

    it('should throw ConfigValidationError for invalid endpoint URL in OpenCode config', async () => {
      const config: ProviderConfig = {
        type: 'opencode-glm47',
        name: 'opencode',
        priority: 1,
        enabled: true,
        endpoint: 'not-a-valid-url',
      };

      await expect(factory.createExecutor('opencode', config)).rejects.toThrow(
        ConfigValidationError
      );
      await expect(factory.createExecutor('opencode', config)).rejects.toThrow(
        'Invalid endpoint URL'
      );
    });

    it('should throw ConfigValidationError for invalid endpoint URL in Kimi config', async () => {
      const config: ProviderConfig = {
        type: 'kimi-k25-api',
        name: 'kimi',
        priority: 2,
        enabled: true,
        apiKey: 'sk-test',
        endpoint: 'invalid-url',
      };

      await expect(factory.createExecutor('kimi', config)).rejects.toThrow(
        ConfigValidationError
      );
    });

    it('should work without apiKey for OpenCode (uses local server)', async () => {
      const config: ProviderConfig = {
        type: 'opencode-glm47',
        name: 'opencode',
        priority: 1,
        enabled: true,
        // no apiKey needed for local server
      };

      await expect(factory.createExecutor('opencode', config)).resolves.not.toThrow();
    });

    it('should work without endpoint (uses defaults)', async () => {
      const config: ProviderConfig = {
        type: 'opencode-glm47',
        name: 'opencode',
        priority: 1,
        enabled: true,
        // no endpoint - will use default
      };

      const executor = await factory.createExecutor('opencode', config);

      expect(OpenCodeExecutor.create).toHaveBeenCalledWith({
        apiKey: undefined,
        timeoutMs: 300000,
        baseUrl: undefined,
      });
    });
  });

  describe('registerProvider', () => {
    it('should register a new custom provider', async () => {
      const mockExecutor = {
        providerType: 'opencode-glm47',
        execute: vi.fn(),
        healthCheck: vi.fn(),
        getMetadata: vi.fn(),
      };

      const customFactory = vi.fn().mockReturnValue(mockExecutor);
      
      factory.registerProvider('custom', customFactory);
      
      const config: ProviderConfig = {
        type: 'opencode-glm47',
        name: 'custom',
        priority: 1,
        enabled: true,
      };

      const executor = await factory.createExecutor('custom', config);

      expect(customFactory).toHaveBeenCalledWith(config);
      expect(executor).toBe(mockExecutor);
    });

    it('should override existing provider registration', async () => {
      const mockExecutor = {
        providerType: 'custom-opencode',
        execute: vi.fn(),
        healthCheck: vi.fn(),
        getMetadata: vi.fn(),
      };

      const customFactory = vi.fn().mockReturnValue(mockExecutor);
      
      // Override the built-in opencode provider
      factory.registerProvider('opencode', customFactory);
      
      const config: ProviderConfig = {
        type: 'opencode-glm47',
        name: 'opencode',
        priority: 1,
        enabled: true,
      };

      const executor = await factory.createExecutor('opencode', config);

      // Should use the custom factory, not the built-in one
      expect(customFactory).toHaveBeenCalled();
      expect(OpenCodeExecutor.create).not.toHaveBeenCalled();
      expect(executor).toBe(mockExecutor);
    });

    it('should add provider to available providers list', () => {
      const customFactory = vi.fn().mockReturnValue({
        providerType: 'custom',
        execute: vi.fn(),
      });

      factory.registerProvider('my-provider', customFactory);

      const providers = factory.getAvailableProviders();
      expect(providers).toContain('my-provider');
    });
  });

  describe('getAvailableProviders', () => {
    it('should return all registered providers', () => {
      const providers = factory.getAvailableProviders();

      expect(providers).toHaveLength(3);
      expect(providers).toContain('opencode');
      expect(providers).toContain('kimi');
      expect(providers).toContain('claude-code-api');
    });

    it('should return updated list after registering new provider', () => {
      factory.registerProvider('test-provider', () => ({}) as unknown as import('../../../src/executors/base.js').AgentExecutor);

      const providers = factory.getAvailableProviders();

      expect(providers).toHaveLength(4);
      expect(providers).toContain('test-provider');
    });

    it('should return array (not reference to internal map)', () => {
      const providers1 = factory.getAvailableProviders();
      factory.registerProvider('new-one', () => ({}) as unknown as import('../../../src/executors/base.js').AgentExecutor);
      const providers2 = factory.getAvailableProviders();

      // Original array should not be modified
      expect(providers1).toHaveLength(3);
      expect(providers2).toHaveLength(4);
    });
  });

  describe('ClaudeCodeAPIExecutor stub', () => {
    it('should return stub metadata', async () => {
      const config: ProviderConfig = {
        type: 'claude-code-api',
        name: 'claude-code-api',
        priority: 3,
        enabled: true,
      };

      const executor = await factory.createExecutor('claude-code-api', config);
      const metadata = executor.getMetadata();

      expect(metadata.name).toBe('Claude Code API Executor');
      expect(metadata.type).toBe('claude-code-api');
      expect(metadata.version).toBe('0.0.1-stub');
      expect(metadata.supportedModels).toContain('claude-3-5-sonnet');
      expect(metadata.features).toContain('stub');
    });

    it('should return unhealthy status', async () => {
      const config: ProviderConfig = {
        type: 'claude-code-api',
        name: 'claude-code-api',
        priority: 3,
        enabled: true,
      };

      const executor = await factory.createExecutor('claude-code-api', config);
      const health = await executor.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toContain('stub implementation');
    });

    it('should return error result on execute', async () => {
      const config: ProviderConfig = {
        type: 'claude-code-api',
        name: 'claude-code-api',
        priority: 3,
        enabled: true,
      };

      const executor = await factory.createExecutor('claude-code-api', config);
      const result = await executor.execute({
        prompt: 'test',
        context: {
          worktreePath: '/tmp',
          sessionId: 'test',
          issueId: 'ROM-123',
          timeoutMs: 30000,
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('stub implementation');
    });
  });

  describe('ProviderConfig handling', () => {
    it('should pass through all config fields to factory', async () => {
      const mockFactory = vi.fn().mockReturnValue({
        providerType: 'test',
        execute: vi.fn(),
        healthCheck: vi.fn(),
        getMetadata: vi.fn(),
      });

      factory.registerProvider('test', mockFactory);

      const config: ProviderConfig = {
        type: 'opencode-glm47',
        name: 'Test Provider',
        priority: 5,
        enabled: true,
        apiKey: 'secret-key',
        endpoint: 'http://test.com',
        tokenSource: 'oauth',
        headers: {
          'X-Custom': 'header-value',
        },
      };

      await factory.createExecutor('test', config);

      expect(mockFactory).toHaveBeenCalledWith(config);
    });
  });
});

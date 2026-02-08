import type { ProviderConfig } from '../types/index.js';
import { AgentExecutor } from './base.js';
import { OpenCodeExecutor, type OpenCodeConfig } from './opencode.js';
import { KimiExecutor, type KimiConfig } from './kimi.js';
import type { AgentExecutionConfig, ExecutionResult, ProviderMetadata } from './types.js';
import type { HealthStatus } from '../types/index.js';

  /**
   * Factory function type for creating executors
   */
export type ExecutorFactoryFn = (config: ProviderConfig) => AgentExecutor | Promise<AgentExecutor>;

/**
 * Configuration validation error
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public provider: string,
    public field?: string
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Unknown provider error
 */
export class UnknownProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public availableProviders: string[]
  ) {
    super(message);
    this.name = 'UnknownProviderError';
  }
}

/**
 * Claude Code API Executor (stub implementation)
 *
 * Placeholder for future Claude Code API provider implementation.
 * Currently throws errors when used.
 */
class ClaudeCodeAPIExecutor extends AgentExecutor {
  readonly providerType = 'claude-code-api' as const;
  readonly supportedModels: string[] = ['claude-3-5-sonnet', 'claude-3-opus'];

  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    super();
    this.config = config;
  }

  async execute(_config: AgentExecutionConfig): Promise<ExecutionResult> {
    return this.createErrorResult(
      'PROVIDER_UNAVAILABLE',
      'ClaudeCodeAPIExecutor is a stub implementation. Not yet available.',
      0
    );
  }

  async healthCheck(): Promise<HealthStatus> {
    return {
      provider: this.providerType,
      healthy: false,
      error: 'ClaudeCodeAPIExecutor is a stub implementation',
    };
  }

  getMetadata(): ProviderMetadata {
    return {
      name: 'Claude Code API Executor',
      type: this.providerType,
      version: '0.0.1-stub',
      supportedModels: this.supportedModels,
      features: ['stub'],
    };
  }
}

/**
 * Factory for creating AgentExecutor instances by provider ID.
 *
 * The ExecutorFactory provides:
 * - Provider registration and discovery
 * - Configuration validation
 * - Type-safe executor instantiation
 *
 * @example
 * ```typescript
 * const factory = new ExecutorFactory();
 * const executor = factory.createExecutor('opencode', {
 *   apiKey: process.env.OPENCODE_API_KEY,
 *   timeoutMs: 300000
 * });
 * ```
 */
export class ExecutorFactory {
  private providers: Map<string, ExecutorFactoryFn> = new Map();

  constructor() {
    // Register built-in providers
    this.registerBuiltInProviders();
  }

  /**
   * Register built-in provider implementations
   */
  private registerBuiltInProviders(): void {
    // OpenCode provider factory function
    const openCodeFactory = async (config: ProviderConfig) => {
      this.validateOpenCodeConfig(config);
      const openCodeConfig: OpenCodeConfig = {
        apiKey: config.apiKey,
        timeoutMs: 300000,
        baseUrl: config.endpoint,
      };
      return await OpenCodeExecutor.create(openCodeConfig);
    };

    // Register OpenCode with all possible aliases
    this.registerProvider('opencode', openCodeFactory);
    this.registerProvider('opencode-glm47', openCodeFactory);

    // Kimi provider factory function
    const kimiFactory = (config: ProviderConfig) => {
      this.validateKimiConfig(config);
      const kimiConfig: KimiConfig = {
        apiKey: config.apiKey!,
        timeoutMs: 300000,
        baseUrl: config.endpoint,
      };
      return new KimiExecutor(kimiConfig);
    };

    // Register Kimi with all possible aliases
    this.registerProvider('kimi', kimiFactory);
    this.registerProvider('kimi-k25-oauth', kimiFactory);
    this.registerProvider('kimi-k25-api', kimiFactory);

    // Claude Code API provider (stub) - TODO: Implement proper Claude Code spawning
    const claudeCodeFactory = (config: ProviderConfig) => {
      return new ClaudeCodeAPIExecutor(config);
    };

    this.registerProvider('claude-code', claudeCodeFactory);
    this.registerProvider('claude-code-api', claudeCodeFactory);
  }

  /**
   * Create an executor for the specified provider.
   *
   * @param provider - Provider ID (e.g., 'opencode', 'kimi', 'claude-code-api')
   * @param config - Provider configuration
   * @returns Promise resolving to AgentExecutor instance
   * @throws UnknownProviderError if provider not registered
   * @throws ConfigValidationError if configuration invalid
   */
  async createExecutor(provider: string, config: ProviderConfig): Promise<AgentExecutor> {
    const factoryFn = this.providers.get(provider);

    if (!factoryFn) {
      throw new UnknownProviderError(
        `Unknown provider: ${provider}`,
        provider,
        this.getAvailableProviders()
      );
    }

    // Validate common config requirements
    this.validateCommonConfig(config, provider);

    return await factoryFn(config);
  }

  /**
   * Register a custom provider factory.
   *
   * @param provider - Unique provider identifier
   * @param factory - Factory function that creates the executor
   */
  registerProvider(provider: string, factory: ExecutorFactoryFn): void {
    this.providers.set(provider, factory);
  }

  /**
   * Get list of all available provider IDs.
   *
   * @returns Array of registered provider identifiers
   */
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Validate common configuration requirements.
   */
  private validateCommonConfig(config: ProviderConfig, provider: string): void {
    if (!config) {
      throw new ConfigValidationError(
        'Configuration is required',
        provider,
        'config'
      );
    }

    if (typeof config !== 'object') {
      throw new ConfigValidationError(
        'Configuration must be an object',
        provider,
        'config'
      );
    }
  }

  /**
   * Validate OpenCode-specific configuration.
   */
  private validateOpenCodeConfig(config: ProviderConfig): void {
    // OpenCode can work without API key (uses local server)
    // But endpoint should be valid if provided
    if (config.endpoint) {
      try {
        new URL(config.endpoint);
      } catch {
        throw new ConfigValidationError(
          `Invalid endpoint URL: ${config.endpoint}`,
          'opencode',
          'endpoint'
        );
      }
    }
  }

  /**
   * Validate Kimi-specific configuration.
   */
  private validateKimiConfig(config: ProviderConfig): void {
    if (!config.apiKey) {
      throw new ConfigValidationError(
        'API key is required for Kimi provider',
        'kimi',
        'apiKey'
      );
    }

    if (config.endpoint) {
      try {
        new URL(config.endpoint);
      } catch {
        throw new ConfigValidationError(
          `Invalid endpoint URL: ${config.endpoint}`,
          'kimi',
          'endpoint'
        );
      }
    }
  }
}

export { OpenCodeExecutor, KimiExecutor, ClaudeCodeAPIExecutor };
export type { OpenCodeConfig, KimiConfig };

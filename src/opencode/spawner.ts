import { clientManager } from './client.js';
import { pollSessionStatus } from './session-poller.js';
import { promptBuilder, OpenCodePromptContext } from './prompt-builder.js';
import { CircuitBreaker } from '../provider/circuit-breaker.js';
import { ProviderRouter } from '../provider/router.js';
import { ProviderType, ProviderSelection, ModelOverride } from '../types/index.js';

export interface SpawnOptions {
  apiKey?: string;
  onProgress?: (status: 'queued' | 'started' | 'in_progress' | 'done' | 'error', data?: any) => void;
  timeout?: number;
  provider?: ProviderType;
  maxRetries?: number;
}

export interface SpawnResult {
  sessionId: string;
  status: 'queued' | 'started' | 'in_progress' | 'done' | 'error';
  output?: any;
  error?: string;
  providerUsed?: ProviderType;
  attemptNumber?: number;
  totalRetries?: number;
  filesCreated?: string[];
}

export interface ProviderPromptConfig {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

const PROVIDER_PROMPT_CONFIGS: Record<ProviderType, ProviderPromptConfig> = {
  'claude-code': {
    systemPrompt: 'You are a helpful AI assistant.',
    temperature: 0.7,
    maxTokens: 4096
  },
  'opencode-glm47': {
    systemPrompt: 'You are a helpful AI assistant.',
    temperature: 0.8,
    maxTokens: 4096
  },
  'claude-code-api': {
    systemPrompt: 'You are a helpful AI assistant.',
    temperature: 0.7,
    maxTokens: 4096
  },
  'kimi-k25-oauth': {
    systemPrompt: 'You are a helpful AI assistant.',
    temperature: 0.7,
    maxTokens: 4096
  },
  'kimi-k25-api': {
    systemPrompt: 'You are a helpful AI assistant.',
    temperature: 0.7,
    maxTokens: 4096
  }
};

export class OpenCodeSpawner {
  private providerRouter: ProviderRouter;
  private circuitBreakers: Map<ProviderType, CircuitBreaker>;
  private initialized: boolean = false;

  constructor() {
    this.providerRouter = new ProviderRouter();
    this.circuitBreakers = new Map();
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.initializeCircuitBreakers();
    this.initialized = true;
    this.log('Circuit breakers initialized', 'info');
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private async initializeCircuitBreakers(): Promise<void> {
    const providers = this.providerRouter.getEnabledProviders();
    const loadPromises: Promise<void>[] = [];
    
    for (const provider of providers) {
      if (!this.circuitBreakers.has(provider.type)) {
        const breaker = new CircuitBreaker(provider.type);
        loadPromises.push(breaker.loadState());
        this.circuitBreakers.set(provider.type, breaker);
      }
    }
    
    await Promise.all(loadPromises);
  }

  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [OpenCodeSpawner] ${level.toUpperCase()}: ${message}`);
  }

  private formatPromptForProvider(prompt: string, provider: ProviderType): string {
    const config = PROVIDER_PROMPT_CONFIGS[provider];

    let formatted = '';
    if (config?.systemPrompt) {
      formatted += `${config.systemPrompt}\n\n`;
    }

    formatted += prompt;

    return formatted;
  }

  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.includes('429') ||
             error.message.includes('rate limit') ||
             error.message.includes('too many requests');
    }
    return false;
  }

  private async executeOpenCodePrompt(
    prompt: string,
    directory: string,
    providerSelection?: ProviderSelection,
    modelOverride?: string
  ): Promise<string> {
    // Ensure OpenCode is initialized
    if (!clientManager.isInitialized()) {
      await clientManager.initialize();
    }
    
    const opencodeClient = clientManager.getClient();

    console.log(`[OpenCode] Creating session for directory: ${directory}`);
    
    let sessionCreateResult;
    try {
      sessionCreateResult = await opencodeClient.session.create({
        query: { directory }
      });
    } catch (error: any) {
      console.error('[OpenCode] Session create API error:', error.message);
      console.error('[OpenCode] Error details:', error.response?.data || error);
      throw new Error(`Session creation API error: ${error.message}`);
    }
    
    console.log('[OpenCode] Session create response:', JSON.stringify(sessionCreateResult, null, 2));
    
    if (!sessionCreateResult.data) {
      throw new Error('Failed to create session - no data in response');
    }

    const sessionId = sessionCreateResult.data?.id;
    if (!sessionId) {
      throw new Error(`Failed to create session - no session ID returned. Response data: ${JSON.stringify(sessionCreateResult.data)}`);
    }

    const body: any = {
      parts: [{ type: 'text', text: prompt }]
    };

    if (modelOverride && providerSelection) {
      // Map internal provider types to OpenCode provider IDs and model IDs
      const providerConfigMap: Record<ProviderType, { providerID: string; modelID: string }> = {
        'kimi-k25-oauth': { providerID: 'opencode', modelID: 'kimi-k2.5' },
        'kimi-k25-api': { providerID: 'opencode', modelID: 'kimi-k2.5' },
        'opencode-glm47': { providerID: 'opencode', modelID: 'glm-4.7' },
        'claude-code': { providerID: 'anthropic', modelID: 'claude-3-5-sonnet-20241022' },
        'claude-code-api': { providerID: 'anthropic', modelID: 'claude-3-5-sonnet-20241022' }
      };

      const config = providerConfigMap[providerSelection.provider.type];
      if (config) {
        body.model = {
          providerID: config.providerID,
          modelID: config.modelID
        };
        this.log(`Using OpenCode model: ${config.providerID}/${config.modelID}`, 'info');
      }

      this.log(`Using model override: ${body.model.providerID}/${modelOverride}`, 'info');
    }

    await opencodeClient.session.prompt({
      path: { id: sessionId },
      body
    });

    return sessionId;
  }

  async spawnIssueExecution(
    context: OpenCodePromptContext,
    options: SpawnOptions = {}
  ): Promise<SpawnResult> {
    await this.ensureInitialized();
    this.log(`Starting issue execution with ${options.provider ? 'requested provider: ' + options.provider : 'auto-selection'}`, 'info');

    let attempts = 0;
    const maxAttempts = options.maxRetries ?? 3;

    while (attempts < maxAttempts) {
      attempts++;

      try {
        const availableProviders = this.providerRouter.getEnabledProviders();

        if (availableProviders.length === 0) {
          throw new Error('No enabled providers available');
        }

        let targetProviderType = options.provider;
        let providerSelection: ProviderSelection | null = null;
        let modelOverride: string | undefined = undefined;

        // Check for model override from context
        if (context.modelOverride) {
          const providerMap: Record<string, ProviderType> = {
            'kimi': context.modelOverride.source === 'api' ? 'kimi-k25-api' : 'kimi-k25-oauth',
            'opencode': 'opencode-glm47',
            'anthropic': 'claude-code',
            'claude': 'claude-code'
          };

          const mappedProviderType = providerMap[context.modelOverride.provider];
          if (mappedProviderType) {
            this.log(`Model override requested: ${context.modelOverride.provider}/${context.modelOverride.model}`, 'info');
            modelOverride = context.modelOverride.model;

            // Try to find the matching provider
            const requestedProvider = availableProviders.find(p => p.type === mappedProviderType);
            if (requestedProvider) {
              const breaker = this.circuitBreakers.get(requestedProvider.type);
              const isAllowed = await breaker?.allowRequest();
              if (isAllowed) {
                providerSelection = { provider: requestedProvider, status: { provider: requestedProvider.type, healthy: true } };
                targetProviderType = mappedProviderType;
                this.log(`Override provider ${mappedProviderType} selected`, 'info');
              } else {
                this.log(`Override provider ${mappedProviderType} circuit breaker is open, falling back to default routing`, 'warn');
              }
            } else {
              this.log(`Override provider ${mappedProviderType} not available, falling back to default routing`, 'warn');
            }
          } else {
            this.log(`Unknown provider in model override: ${context.modelOverride.provider}`, 'warn');
          }
        }

        if (targetProviderType) {
          const requestedProvider = availableProviders.find(p => p.type === targetProviderType);
          if (!requestedProvider) {
            this.log(`Requested provider ${targetProviderType} not found, falling back to auto-selection`, 'warn');
            targetProviderType = undefined;
          } else {
            const breaker = this.circuitBreakers.get(requestedProvider.type);
            const isAllowed = await breaker?.allowRequest();
            if (isAllowed) {
              providerSelection = { provider: requestedProvider, status: { provider: requestedProvider.type, healthy: true } };
            } else {
              this.log(`Requested provider ${targetProviderType} circuit breaker is open, falling back to auto-selection`, 'warn');
              targetProviderType = undefined;
            }
          }
        }

        if (!targetProviderType || !providerSelection) {
          providerSelection = await this.providerRouter.selectProvider();
          targetProviderType = providerSelection.provider.type;
        }

        this.log(`Selected provider: ${providerSelection.provider.name}`, 'info');

        const prompt = promptBuilder.buildIssueExecutionPrompt(context);
        const directory = context.worktreePath || context.repository.repositoryPath;

        const sessionId = await this.executeOpenCodePrompt(prompt, directory, providerSelection, modelOverride);

        if (options.onProgress) {
          options.onProgress('started', { sessionId, provider: providerSelection.provider.type });
        }

        const status = await pollSessionStatus(
          sessionId,
          (status) => {
            if (options.onProgress) {
              options.onProgress(status.status as any, status);
            }
          },
          options.timeout ? options.timeout / 1000 : 600
        );

        await this.circuitBreakers.get(targetProviderType!)?.recordSuccess();
        this.log(`Success with provider: ${providerSelection.provider.name}`, 'info');

        return {
          sessionId,
          status: status.status,
          output: status.output,
          error: status.error,
          providerUsed: providerSelection.provider.type,
          attemptNumber: attempts,
          totalRetries: attempts - 1
        };

      } catch (error: any) {
        const isRateLimit = this.isRateLimitError(error);

        if (isRateLimit) {
          this.log(`Attempt ${attempts} failed due to rate limit, will try next provider`, 'warn');
        } else {
          this.log(`Attempt ${attempts} failed: ${error}`, 'error');
        }

        if (attempts >= maxAttempts) {
          this.log(`Max attempts (${maxAttempts}) reached, giving up`, 'error');
          if (error.response?.data?.error) {
            throw new Error(`OpenCode API error: ${error.response.data.error}`);
          }
          if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            throw new Error('Failed to connect to OpenCode service');
          }
          throw error;
        }

        await this.providerRouter.forceHealthRefresh();
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }

    throw new Error('No providers available');
  }

  async spawnQuickAction(
    action: string,
    context: string,
    options: SpawnOptions = {}
  ): Promise<SpawnResult> {
    await this.ensureInitialized();
    this.log(`Starting quick action with ${options.provider ? 'requested provider: ' + options.provider : 'auto-selection'}`, 'info');

    let attempts = 0;
    const maxAttempts = options.maxRetries ?? 3;

    while (attempts < maxAttempts) {
      attempts++;

      try {
        const availableProviders = this.providerRouter.getEnabledProviders();

        if (availableProviders.length === 0) {
          throw new Error('No enabled providers available');
        }

        let targetProviderType = options.provider;
        let providerSelection: ProviderSelection | null = null;

        if (targetProviderType) {
          const requestedProvider = availableProviders.find(p => p.type === targetProviderType);
          if (!requestedProvider) {
            this.log(`Requested provider ${targetProviderType} not found, falling back to auto-selection`, 'warn');
            targetProviderType = undefined;
          } else {
            const breaker = this.circuitBreakers.get(requestedProvider.type);
            const isAllowed = await breaker?.allowRequest();
            if (isAllowed) {
              providerSelection = { provider: requestedProvider, status: { provider: requestedProvider.type, healthy: true } };
            } else {
              this.log(`Requested provider ${targetProviderType} circuit breaker is open, falling back to auto-selection`, 'warn');
              targetProviderType = undefined;
            }
          }
        }

        if (!targetProviderType || !providerSelection) {
          providerSelection = await this.providerRouter.selectProvider();
          targetProviderType = providerSelection.provider.type;
        }

        this.log(`Selected provider: ${providerSelection.provider.name}`, 'info');

        const prompt = promptBuilder.buildQuickActionPrompt(action, context);
        const directory = (options as any).directory || process.cwd();

        const sessionId = await this.executeOpenCodePrompt(prompt, directory);

        if (options.onProgress) {
          options.onProgress('started', { sessionId, provider: providerSelection.provider.type });
        }

        const status = await pollSessionStatus(
          sessionId,
          (status) => {
            if (options.onProgress) {
              options.onProgress(status.status as any, status);
            }
          },
          600
        );

        await this.circuitBreakers.get(targetProviderType!)?.recordSuccess();
        this.log(`Success with provider: ${providerSelection.provider.name}`, 'info');

        return {
          sessionId,
          status: status.status,
          output: status.output,
          error: status.error,
          providerUsed: providerSelection.provider.type,
          attemptNumber: attempts,
          totalRetries: attempts - 1
        };

      } catch (error: any) {
        const isRateLimit = this.isRateLimitError(error);

        if (isRateLimit) {
          this.log(`Attempt ${attempts} failed due to rate limit, will try next provider`, 'warn');
        } else {
          this.log(`Attempt ${attempts} failed: ${error}`, 'error');
        }

        if (attempts >= maxAttempts) {
          this.log(`Max attempts (${maxAttempts}) reached, giving up`, 'error');
          if (error.response?.data?.error) {
            throw new Error(`OpenCode API error: ${error.response.data.error}`);
          }
          if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            throw new Error('Failed to connect to OpenCode service');
          }
          throw error;
        }

        await this.providerRouter.forceHealthRefresh();
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }

    throw new Error('No providers available');
  }

  fireAndForget(
    context: OpenCodePromptContext,
    options: Omit<SpawnOptions, 'onProgress' | 'timeout'> = {}
  ): void {
    this.spawnIssueExecution(context, {
      ...options,
      onProgress: (status, data) => {
        console.log(`[OpenCode] Session ${data?.sessionId}: ${status}`);
      }
    }).catch(error => {
      console.error(`[OpenCode] Fire-and-forget failed:`, error.message);
    });
  }

  getCircuitBreakerStates(): Record<string, any> {
    const states: Record<string, any> = {};
    for (const [type, breaker] of this.circuitBreakers) {
      states[type] = breaker.getState();
    }
    return states;
  }

  async refreshProviders(): Promise<void> {
    await this.providerRouter.reloadProviders();
    await this.initializeCircuitBreakers();
    this.log('Providers and circuit breakers refreshed', 'info');
  }
}

export const spawner = new OpenCodeSpawner();
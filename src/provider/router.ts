import { ProviderConfig, ProviderType, HealthStatus, ProviderSelection, ProviderError } from '../types/index.js';
import { tokenManager } from './token-manager.js';

const PROVIDER_ENDPOINTS: Record<ProviderType, string> = {
  'claude-code': 'https://api.anthropic.com/v1/messages',
  'opencode-glm47': 'https://api.opencode.ai/v1/chat/completions',
  'claude-code-api': 'https://api.anthropic.com/v1/messages',
  'kimi-k25-oauth': 'https://kimi.com/api/v1',
  'kimi-k25-api': 'https://kimi.com/api/v1'
};

const PROVIDER_TIMEOUT_MS = 5000;

export class ProviderRouter {
  private providers: ProviderConfig[];
  private healthCache: Map<ProviderType, HealthStatus> = new Map();
  private cacheTTL = 30000;
  private lastCacheUpdate = 0;

  constructor() {
    this.providers = [];
    // Initialize token manager before loading providers
    tokenManager.initialize().then(() => {
      this.loadProviders().then(providers => {
        this.providers = providers;
      });
    });
  }

  private async loadProviders(): Promise<ProviderConfig[]> {
    const claudeToken = process.env.CLAUDE_CODE_ACCESS_TOKEN || null;
    const opencodeToken = process.env.OPENCODE_API_KEY || null;
    const claudeApiToken = process.env.CLAUDE_CODE_API_KEY || null;

    // Load Kimi tokens from TokenManager
    const kimiOAuthToken = await tokenManager.getKimiOAuthToken();
    const kimiApiKey = await tokenManager.getKimiApiKey();

    // Priority order: OpenCode first (cheapest), then Claude, then Kimi
    const allProviders: ProviderConfig[] = [
      {
        type: 'opencode-glm47',
        name: 'OpenCode GLM-47 (Primary - Cheapest)',
        priority: 1,
        accessToken: opencodeToken,
        enabled: !!opencodeToken
      } as ProviderConfig,
      {
        type: 'claude-code',
        name: 'Claude Code (Fallback)',
        priority: 2,
        accessToken: claudeToken,
        enabled: !!claudeToken
      } as ProviderConfig,
      {
        type: 'kimi-k25-oauth',
        name: 'Kimi K2.5 (Subscription - OAuth)',
        priority: 3,
        accessToken: kimiOAuthToken,
        tokenSource: 'oauth',
        enabled: !!kimiOAuthToken,
        endpoint: 'https://kimi.com/api/v1'
      } as ProviderConfig,
      {
        type: 'kimi-k25-api',
        name: 'Kimi K2.5 (API Key Fallback)',
        priority: 3.5,
        apiKey: kimiApiKey,
        accessToken: kimiApiKey, // Use apiKey as accessToken for compatibility
        tokenSource: 'api',
        enabled: !!kimiApiKey,
        endpoint: 'https://kimi.com/api/v1'
      } as ProviderConfig,
      {
        type: 'claude-code-api',
        name: 'Claude Code API (Last Resort)',
        priority: 4,
        accessToken: claudeApiToken,
        enabled: !!claudeApiToken
      } as ProviderConfig
    ];

    return allProviders.filter(p => p.enabled).sort((a, b) => a.priority - b.priority);
  }

  async selectProvider(): Promise<ProviderSelection> {
    await this.refreshHealthStatus();

    for (const provider of this.providers) {
      const status = this.healthCache.get(provider.type);
      if (status?.healthy) {
        return { provider, status };
      }
    }

    throw new ProviderError('No healthy providers available', this.providers[0]?.type || 'claude-code');
  }

  private async refreshHealthStatus(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCacheUpdate < this.cacheTTL && this.healthCache.size > 0) {
      return;
    }

    const healthChecks = this.providers.map(p => this.checkProviderHealth(p));
    const results = await Promise.allSettled(healthChecks);

    results.forEach((result, index) => {
      const provider = this.providers[index];
      if (result.status === 'fulfilled') {
        this.healthCache.set(provider.type, result.value);
      } else {
        this.healthCache.set(provider.type, {
          provider: provider.type,
          healthy: false,
          error: result.reason?.message || 'Unknown error'
        });
      }
    });

    this.lastCacheUpdate = now;
  }

  private async checkProviderHealth(provider: ProviderConfig): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      if (!provider.accessToken) {
        throw new Error('No access token configured');
      }

      const endpoint = PROVIDER_ENDPOINTS[provider.type];
      const baseHeaders: Record<string, string> = {
        'Authorization': `Bearer ${provider.accessToken}`,
        'Content-Type': 'application/json'
      };

      // Merge provider-specific headers if available
      const headers = provider.headers
        ? { ...baseHeaders, ...provider.headers }
        : baseHeaders;

      const response = await fetch(endpoint, {
        method: 'HEAD',
        headers,
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
      });

      const latency = Date.now() - startTime;
      const healthy = response.status < 500;

      return {
        provider: provider.type,
        healthy,
        latency: healthy ? latency : undefined,
        error: healthy ? undefined : `HTTP ${response.status}`
      };
    } catch (error) {
      return {
        provider: provider.type,
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  getEnabledProviders(): ProviderConfig[] {
    return [...this.providers];
  }

  async getHealthStatus(): Promise<HealthStatus[]> {
    await this.refreshHealthStatus();
    return Array.from(this.healthCache.values());
  }

  forceHealthRefresh(): void {
    this.healthCache.clear();
    this.lastCacheUpdate = 0;
  }

  async reloadProviders(): Promise<void> {
    this.providers = await this.loadProviders();
    this.forceHealthRefresh();
  }

  /**
   * Cleanup resources on shutdown
   * Stops token manager refresh timers
   */
  cleanup(): void {
    tokenManager.cleanup();
    console.log('[ProviderRouter] Cleaned up');
  }
}

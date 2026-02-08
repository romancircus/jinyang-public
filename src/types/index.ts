export interface Repository {
  id: string;
  name: string;
  repositoryPath: string;
  baseBranch: string;
  workspaceBaseDir: string;
  isActive: boolean;
  linearWorkspaceId: string;
  linearWorkspaceName: string;
  routingLabels?: string[];
  projectKeys?: string[];
  linearToken?: string;
  linearRefreshToken?: string;
}

export interface Config {
  repositories: Repository[];
}

export interface RoutingContext {
  labels?: string[];
  projectName?: string;
  description?: string;
}

export interface RoutingResult {
  repository: Repository;
  method: 'label' | 'project' | 'description' | 'fallback';
}

export interface RoutingError extends Error {
  code: 'NO_CONFIG' | 'NO_MATCH';
}

export type ProviderType =
  | 'claude-code'
  | 'kimi-k25-oauth'    // Subscription credits (PRIMARY)
  | 'kimi-k25-api'      // API key fallback
  | 'opencode-glm47'
  | 'claude-code-api';

export interface ModelOverride {
  provider: string;
  model: string;
  source?: 'oauth' | 'api' | 'subscription';
}

export interface ProviderConfig {
  type: ProviderType;
  name: string;
  priority: number;
  accessToken?: string;
  apiKey?: string;              // For API key auth
  tokenSource?: 'oauth' | 'api'; // Track auth source
  endpoint?: string;
  headers?: Record<string, string>;
  enabled: boolean;
}

export interface OpenCodePromptContext {
  repository: Repository;
  issueId: string;
  issueTitle: string;
  issueDescription?: string;
  modelOverride?: ModelOverride;
}

export interface HealthStatus {
  provider: ProviderType;
  healthy: boolean;
  latency?: number;
  error?: string;
}

export interface ProviderSelection {
  provider: ProviderConfig;
  status: HealthStatus;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public provider: ProviderType,
    public cause?: Error
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface WorktreeConfig {
  repositoryPath: string;
  worktreeDir: string;
  branchName: string;
  baseBranch?: string;
}

export interface WorktreeResult {
  worktreePath: string;
  branchName: string;
  success: boolean;
}

export interface SymlinkConfig {
  worktreeDir: string;
  symlinkName: string;
  targetPath: string;
}

export interface SymlinkResult {
  symlinkPath: string;
  success: boolean;
  error?: string;
}

export interface TokenState {
  access: string;
  refresh: string;
  expires: number;
}

export interface ProviderHealthInfo {
  name: string;
  healthy: boolean;
  circuitBreakerState: 'closed' | 'open' | 'half-open';
  lastCheck: string;
  consecutiveErrors: number;
  lastError?: string;
  latency?: number;
}

export interface ProviderHealthResponse {
  providers: ProviderHealthInfo[];
  timestamp: string;
  total: number;
  healthy: number;
  unhealthy: number;
}

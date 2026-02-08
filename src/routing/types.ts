import { Repository } from '../types/index.js';

export type ProviderType =
  | 'claude-code'
  | 'kimi-k25-oauth'
  | 'kimi-k25-api'
  | 'opencode-glm47'
  | 'claude-code-api';

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  state: {
    name: string;
  };
  project?: {
    name: string;
  };
  labels: {
    nodes: Array<{
      name: string;
    }>;
  };
  team?: {
    name: string;
  };
}

export interface RouteResult {
  repository: string;
  provider: ProviderType;
  autoExecute: boolean;
  worktreeMode: WorktreeMode;
}

export type WorktreeMode = 'fresh' | 'reuse' | 'branch-per-issue';

export interface RepositoryConfig {
  id: string;
  name: string;
  localPath: string;
  baseBranch: string;
  workspaceBaseDir: string;
  linearProject?: string;
  linearTeam?: string;
  routingLabels: string[];
  provider?: ProviderType;
  autoExecuteLabels: string[];
  manualExecuteLabels: string[];
}

export interface RoutingConfig {
  defaultProvider: ProviderType;
  defaultWorktreeMode: WorktreeMode;
  repositories: RepositoryConfig[];
  labelRules: {
    autoExecute: string[];
    manualExecute: string[];
  };
}

export interface RoutingEngine {
  route(issue: LinearIssue): Promise<RouteResult>;
  shouldAutoExecute(issue: LinearIssue): boolean;
  getRepositoryConfig(issue: LinearIssue): RepositoryConfig | null;
}

export class RoutingError extends Error {
  constructor(
    message: string,
    public code: 'NO_CONFIG' | 'NO_MATCH' | 'INVALID_ISSUE'
  ) {
    super(message);
    this.name = 'RoutingError';
  }
}

import { ProviderType } from '../types/index.js';

export interface JinyangRepository {
  id: string;
  name: string;
  repositoryPath: string;
  baseBranch: string;
  worktreeBaseDir: string;
  isActive: boolean;
  linearWorkspaceId: string;
  linearWorkspaceName: string;
  routingLabels?: string[];
  projectKeys?: string[];
  linearToken?: string;
  linearRefreshToken?: string;
}

export interface JinyangProviderConfig {
  type: ProviderType;
  name: string;
  priority: number;
  accessToken?: string;
  apiKey?: string;
  tokenSource?: 'oauth' | 'api';
  endpoint?: string;
  headers?: Record<string, string>;
  enabled: boolean;
}

export interface JinyangLinearConfig {
  clientId?: string;
  clientSecret?: string;
  webhookSecret?: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface JinyangPathConfig {
  worktreeBase: string;
  sessionBase: string;
  logPath: string;
}

export interface JinyangConfig {
  version: string;
  repositories: JinyangRepository[];
  providers: JinyangProviderConfig[];
  linear: JinyangLinearConfig;
  paths: JinyangPathConfig;
  defaultProvider: ProviderType;
  defaultWorktreeMode: 'fresh' | 'reuse' | 'branch-per-issue';
  labelRules: {
    autoExecute: string[];
    manualExecute: string[];
  };
}

export function createDefaultJinyangConfig(homeDir: string = process.env.HOME || '/tmp'): JinyangConfig {
  return {
    version: '1.0.0',
    repositories: [],
    providers: [
      {
        type: 'opencode-glm47',
        name: 'opencode-glm47',
        priority: 1,
        enabled: true,
      },
    ],
    linear: {
      clientId: process.env.LINEAR_CLIENT_ID,
      clientSecret: process.env.LINEAR_CLIENT_SECRET,
      webhookSecret: process.env.LINEAR_WEBHOOK_SECRET,
      accessToken: process.env.LINEAR_ACCESS_TOKEN,
      refreshToken: process.env.LINEAR_REFRESH_TOKEN,
    },
    paths: {
      worktreeBase: `${homeDir}/.jinyang/worktrees`,
      sessionBase: `${homeDir}/.jinyang/sessions`,
      logPath: `${homeDir}/.jinyang/logs`,
    },
    defaultProvider: 'opencode-glm47',
    defaultWorktreeMode: 'branch-per-issue',
    labelRules: {
      autoExecute: ['jinyang:auto'],
      manualExecute: ['jinyang:manual'],
    },
  };
}

export function validateJinyangConfig(config: JinyangConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.version) {
    errors.push('Config version is required');
  }

  if (!Array.isArray(config.repositories)) {
    errors.push('Repositories must be an array');
  }

  if (!Array.isArray(config.providers)) {
    errors.push('Providers must be an array');
  }

  if (!config.paths?.worktreeBase) {
    errors.push('Worktree base path is required');
  }

  if (!config.paths?.sessionBase) {
    errors.push('Session base path is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

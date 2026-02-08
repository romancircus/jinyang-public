import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import { Config, Repository } from '../types/index.js';
import { RepositoryConfig, RoutingConfig, WorktreeMode, ProviderType } from './types.js';
import { JinyangConfig, createDefaultJinyangConfig } from '../config/jinyang.js';

const JINYANG_CONFIG_PATH = path.join(process.env.HOME || '/tmp', '.jinyang/config.json');
const LOCAL_CONFIG_PATH = path.join(process.cwd(), 'config/default.json');

export async function loadJinyangConfig(): Promise<JinyangConfig> {
  const content = await fs.readFile(JINYANG_CONFIG_PATH, 'utf-8');
  return JSON.parse(content);
}

/**
 * Detect if a repository is a jinyang repository
 */
export function isJinyangRepository(repo: Repository): boolean {
  // Check by ID
  if (repo.id === 'jinyang') return true;

  // Check by routing labels
  if (repo.routingLabels?.some(label =>
    label.toLowerCase().includes('jinyang') ||
    label.toLowerCase().includes('lingling')
  )) {
    return true;
  }

  // Check by project keys
  if (repo.projectKeys?.some(key =>
    key.toLowerCase().includes('jinyang') ||
    key.toLowerCase().includes('lingling')
  )) {
    return true;
  }

  // Check by name
  if (repo.name.toLowerCase().includes('jinyang') ||
      repo.name.toLowerCase().includes('lingling')) {
    return true;
  }

  return false;
}

/**
 * Get the worktree base directory for jinyang repositories
 */
export function getJinyangWorktreeBase(): string {
  // Check for environment variable override first
  if (process.env.JINYANG_WORKTREE_BASE) {
    return process.env.JINYANG_WORKTREE_BASE;
  }

  // Default to ~/.jinyang/worktrees
  return path.join(homedir(), '.jinyang', 'worktrees');
}

export async function loadRoutingConfig(): Promise<RoutingConfig> {
  try {
    const jinyangConfig = await loadJinyangConfig();
    return convertJinyangConfig(jinyangConfig);
  } catch (error) {
    console.warn(`Failed to load config, using defaults: ${error}`);
    return getDefaultRoutingConfig();
  }
}

export function convertJinyangConfig(jinyangConfig: JinyangConfig): RoutingConfig {
  const repositories: RepositoryConfig[] = jinyangConfig.repositories
    .filter((repo) => repo.isActive)
    .map((repo) => ({
      id: repo.id,
      name: repo.name,
      localPath: repo.repositoryPath,
      baseBranch: repo.baseBranch,
      workspaceBaseDir: repo.worktreeBaseDir,
      linearProject: repo.projectKeys?.[0],
      routingLabels: repo.routingLabels || [],
      provider: jinyangConfig.providers?.find(p => p.enabled)?.type,
      autoExecuteLabels: jinyangConfig.labelRules?.autoExecute || ['jinyang:auto'],
      manualExecuteLabels: jinyangConfig.labelRules?.manualExecute || ['jinyang:manual'],
    }));

  return {
    defaultProvider: jinyangConfig.defaultProvider || 'opencode-glm47',
    defaultWorktreeMode: jinyangConfig.defaultWorktreeMode || 'branch-per-issue',
    repositories,
    labelRules: {
      autoExecute: jinyangConfig.labelRules?.autoExecute || ['jinyang:auto'],
      manualExecute: jinyangConfig.labelRules?.manualExecute || ['jinyang:manual'],
    },
  };
}

export function getDefaultRoutingConfig(): RoutingConfig {
  return {
    defaultProvider: 'opencode-glm47',
    defaultWorktreeMode: 'branch-per-issue',
    repositories: [],
    labelRules: {
      autoExecute: ['jinyang:auto'],
      manualExecute: ['jinyang:manual'],
    },
  };
}

export function convertRepository(repo: Repository): RepositoryConfig {
  const isJinyang = isJinyangRepository(repo);
  const jinyangWorktreeBase = getJinyangWorktreeBase();

  // Override workspaceBaseDir for jinyang repositories
  const workspaceBaseDir = isJinyang
    ? path.join(jinyangWorktreeBase, repo.id)
    : repo.workspaceBaseDir;

  return {
    id: repo.id,
    name: repo.name,
    localPath: repo.repositoryPath,
    baseBranch: repo.baseBranch,
    workspaceBaseDir,
    linearProject: repo.projectKeys?.[0],
    routingLabels: repo.routingLabels || [],
    provider: undefined,
    autoExecuteLabels: ['jinyang:auto'],
    manualExecuteLabels: ['jinyang:manual'],
  };
}

/**
 * Get jinyang-specific paths from config or defaults
 */
export function getJinyangPaths(jinyangConfig?: JinyangConfig): {
  worktreeBase: string;
  sessionBase: string;
  logPath: string;
} {
  if (jinyangConfig?.paths) {
    return jinyangConfig.paths;
  }

  const homeDir = process.env.HOME || '/tmp';
  return {
    worktreeBase: process.env.JINYANG_WORKTREE_BASE || `${homeDir}/.jinyang/worktrees`,
    sessionBase: process.env.JINYANG_SESSION_BASE || `${homeDir}/.jinyang/sessions`,
    logPath: process.env.JINYANG_LOG_PATH || `${homeDir}/.jinyang/logs`,
  };
}

/**
 * Save jinyang config to disk
 */
export async function saveJinyangConfig(config: JinyangConfig): Promise<void> {
  const configDir = path.dirname(JINYANG_CONFIG_PATH);
  try {
    await fs.mkdir(configDir, { recursive: true });
  } catch {
    // Directory might already exist
  }
  await fs.writeFile(JINYANG_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Ensure jinyang config exists, create default if not
 */
export async function ensureJinyangConfig(): Promise<JinyangConfig> {
  try {
    return await loadJinyangConfig();
  } catch {
    // Create default jinyang config
    const defaultConfig = createDefaultJinyangConfig();
    await saveJinyangConfig(defaultConfig);
    return defaultConfig;
  }
}

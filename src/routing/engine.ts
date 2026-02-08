import * as path from 'path';
import {
  LinearIssue,
  RouteResult,
  RepositoryConfig,
  RoutingConfig,
  WorktreeMode,
  ProviderType,
  RoutingError,
} from './types.js';
import { loadRoutingConfig, convertRepository } from './config.js';
import { Config, Repository } from '../types/index.js';
import { loadConfig as loadLegacyConfig } from './config-loader.js';

const FALLBACK_PATH = process.env.HOME
  ? path.join(process.env.HOME, 'Applications')
  : '/tmp/Applications';
const DEFAULT_PROVIDER: ProviderType = 'opencode-glm47';
const DEFAULT_WORKTREE_MODE: WorktreeMode = 'branch-per-issue';
const AUTO_EXECUTE_LABEL = 'jinyang:auto';
const MANUAL_EXECUTE_LABEL = 'jinyang:manual';

export class RoutingEngine {
  private config: RoutingConfig | null = null;
  private legacyRepositories: Repository[] = [];

  // O(1) lookup caches for optimized routing
  private labelToRepoMap: Map<string, Repository> = new Map();
  private projectToRepoMap: Map<string, Repository> = new Map();
  private descriptionTagToRepoMap: Map<string, Repository> = new Map();
  private routeCache: Map<string, RouteResult> = new Map();
  private cacheEnabled: boolean = true;

  async initialize(): Promise<void> {
    try {
      this.config = await loadRoutingConfig();
      const legacyConfig = await loadLegacyConfig();
      this.legacyRepositories = legacyConfig.repositories.filter((r: Repository) => r.isActive);
      this.buildLookupCaches();
    } catch (error) {
      console.warn('Failed to load routing config, using defaults:', error);
      this.config = this.getDefaultConfig();
      this.legacyRepositories = [];
      this.clearCaches();
    }
  }

  async reload(): Promise<void> {
    this.clearCaches();
    await this.initialize();
  }

  private clearCaches(): void {
    this.labelToRepoMap.clear();
    this.projectToRepoMap.clear();
    this.descriptionTagToRepoMap.clear();
    this.routeCache.clear();
  }

  private buildLookupCaches(): void {
    // Build label -> repo map: O(R × L) once, then O(1) lookups
    for (const repo of this.legacyRepositories) {
      const repoLabels = repo.routingLabels || [];
      for (const label of repoLabels) {
        if (!this.labelToRepoMap.has(label)) {
          this.labelToRepoMap.set(label, repo);
        }
      }

      // Also index by project keys: O(R × P) once
      const projectKeys = repo.projectKeys || [];
      for (const key of projectKeys) {
        const keyLower = key.toLowerCase();
        if (!this.projectToRepoMap.has(keyLower)) {
          this.projectToRepoMap.set(keyLower, repo);
        }
        // Store original case too for exact matching
        if (!this.projectToRepoMap.has(key)) {
          this.projectToRepoMap.set(key, repo);
        }
      }

      // Index by description tags: O(R) once
      const nameLower = repo.name.toLowerCase();
      const idLower = repo.id.toLowerCase();
      this.descriptionTagToRepoMap.set(nameLower, repo);
      this.descriptionTagToRepoMap.set(idLower, repo);
    }
  }

  private getCacheKey(issue: LinearIssue): string {
    return `${issue.id}:${issue.identifier}`;
  }

  enableCache(enabled: boolean): void {
    this.cacheEnabled = enabled;
    if (!enabled) {
      this.routeCache.clear();
    }
  }

  async route(issue: LinearIssue): Promise<RouteResult> {
    if (!issue || !issue.id) {
      throw new RoutingError('Invalid issue: missing id', 'INVALID_ISSUE');
    }

    // Check cache first: O(1)
    const cacheKey = this.getCacheKey(issue);
    if (this.cacheEnabled && this.routeCache.has(cacheKey)) {
      return this.routeCache.get(cacheKey)!;
    }

    const repoConfig = this.getRepositoryConfig(issue);
    if (!repoConfig) {
      throw new RoutingError(
        `No repository configured for issue ${issue.identifier}`,
        'NO_MATCH'
      );
    }

    const provider = this.determineProvider(issue, repoConfig);
    const autoExecute = this.shouldAutoExecute(issue);
    const worktreeMode = this.determineWorktreeMode(issue, repoConfig);

    const result: RouteResult = {
      repository: repoConfig.localPath,
      provider,
      autoExecute,
      worktreeMode,
    };

    // Cache the result: O(1)
    if (this.cacheEnabled) {
      this.routeCache.set(cacheKey, result);
    }

    return result;
  }

  shouldAutoExecute(issue: LinearIssue): boolean {
    const labels = this.extractLabels(issue);

    // Explicit manual label takes precedence
    if (labels.includes(MANUAL_EXECUTE_LABEL)) {
      return false;
    }

    // Auto label enables auto-execution
    if (labels.includes(AUTO_EXECUTE_LABEL)) {
      return true;
    }

    // Default to manual (safe)
    return false;
  }

  getRepositoryConfig(issue: LinearIssue): RepositoryConfig | null {
    const labels = this.extractLabels(issue);
    const projectName = issue.project?.name;
    const teamName = issue.team?.name;

    // Try routing by label first (highest priority)
    const byLabel = this.findRepoByLabels(labels);
    if (byLabel) return byLabel;

    // Try routing by project
    if (projectName) {
      const byProject = this.findRepoByProject(projectName);
      if (byProject) return byProject;
    }

    // Try routing by team
    if (teamName) {
      const byTeam = this.findRepoByTeam(teamName);
      if (byTeam) return byTeam;
    }

    // Try routing by description tag
    if (issue.description) {
      const byTag = this.findRepoByDescriptionTag(issue.description);
      if (byTag) return byTag;
    }

    return null;
  }

  getAllRepositories(): RepositoryConfig[] {
    if (!this.config) {
      return [];
    }
    return [...this.config.repositories];
  }

  getRepositoryById(id: string): RepositoryConfig | null {
    if (!this.config) {
      return null;
    }
    return this.config.repositories.find(r => r.id === id) || null;
  }

  private extractLabels(issue: LinearIssue): string[] {
    if (!issue.labels || !issue.labels.nodes) {
      return [];
    }
    return issue.labels.nodes.map(l => l.name);
  }

  private findRepoByLabels(labels: string[]): RepositoryConfig | null {
    // O(L) instead of O(R × L) using pre-built Map lookup
    const flatLabels = labels.flatMap(l => l.split(',').map(s => s.trim()));

    for (const label of flatLabels) {
      const repo = this.labelToRepoMap.get(label);
      if (repo) {
        return convertRepository(repo);
      }
    }
    return null;
  }

  private findRepoByProject(projectName: string): RepositoryConfig | null {
    // O(P) instead of O(R × P) using pre-built Map lookup with substring matching
    const projectLower = projectName.toLowerCase();

    // First try exact match: O(1)
    const exactMatch = this.projectToRepoMap.get(projectName) || this.projectToRepoMap.get(projectLower);
    if (exactMatch) {
      return convertRepository(exactMatch);
    }

    // Then try substring match: O(P) where P = number of cached project keys
    for (const [key, repo] of this.projectToRepoMap) {
      const keyLower = key.toLowerCase();
      if (keyLower.includes(projectLower) || projectLower.includes(keyLower)) {
        return convertRepository(repo);
      }
    }
    return null;
  }

  private findRepoByTeam(teamName: string): RepositoryConfig | null {
    // Team-based routing can use similar logic to project routing
    // or could have specific team mappings in config
    return null;
  }

  private findRepoByDescriptionTag(description: string): RepositoryConfig | null {
    const tagMatch = description.match(/\[repo=([^\]]+)\]/i);
    if (!tagMatch) return null;

    const tag = tagMatch[1].toLowerCase();

    // O(1) lookup using pre-built Map
    const exactMatch = this.descriptionTagToRepoMap.get(tag);
    if (exactMatch) {
      return convertRepository(exactMatch);
    }

    // Fallback: O(R) substring match only if exact match fails
    for (const [key, repo] of this.descriptionTagToRepoMap) {
      if (key.includes(tag) || tag.includes(key)) {
        return convertRepository(repo);
      }
    }
    return null;
  }

  private determineProvider(issue: LinearIssue, repoConfig: RepositoryConfig): ProviderType {
    // Check for provider override in labels
    const labels = this.extractLabels(issue);

    for (const label of labels) {
      if (label.startsWith('provider:')) {
        const providerName = label.replace('provider:', '').trim();
        const validProvider = this.validateProvider(providerName);
        if (validProvider) {
          return validProvider;
        }
      }
    }

    // Use repository default if set
    if (repoConfig.provider) {
      return repoConfig.provider;
    }

    // Fall back to global default
    if (this.config?.defaultProvider) {
      return this.config.defaultProvider;
    }

    return DEFAULT_PROVIDER;
  }

  private determineWorktreeMode(issue: LinearIssue, repoConfig: RepositoryConfig): WorktreeMode {
    // Check for worktree mode override in labels
    const labels = this.extractLabels(issue);

    if (labels.includes('worktree:fresh')) {
      return 'fresh';
    }
    if (labels.includes('worktree:reuse')) {
      return 'reuse';
    }

    // Use config default
    if (this.config?.defaultWorktreeMode) {
      return this.config.defaultWorktreeMode;
    }

    return DEFAULT_WORKTREE_MODE;
  }

  private validateProvider(name: string): ProviderType | null {
    const validProviders: ProviderType[] = [
      'claude-code',
      'kimi-k25-oauth',
      'kimi-k25-api',
      'opencode-glm47',
      'claude-code-api',
    ];

    return validProviders.find(p => p.toLowerCase() === name.toLowerCase()) || null;
  }

  private getDefaultConfig(): RoutingConfig {
    return {
      defaultProvider: DEFAULT_PROVIDER,
      defaultWorktreeMode: DEFAULT_WORKTREE_MODE,
      repositories: [],
      labelRules: {
        autoExecute: [AUTO_EXECUTE_LABEL],
        manualExecute: [MANUAL_EXECUTE_LABEL],
      },
    };
  }
}

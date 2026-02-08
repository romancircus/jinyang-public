import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RoutingEngine } from '../../../src/routing/engine.js';
import { LinearIssue, RouteResult, RepositoryConfig, RoutingError } from '../../../src/routing/types.js';

// Mock the config modules
vi.mock('../../../src/routing/config.js', async () => {
  const isJinyangRepo = (repo: any) => {
    if (repo.id === 'jinyang') return true;
    if (repo.routingLabels?.some((l: string) => l.toLowerCase().includes('jinyang') || l.toLowerCase().includes('lingling'))) return true;
    if (repo.projectKeys?.some((k: string) => k.toLowerCase().includes('jinyang') || k.toLowerCase().includes('lingling'))) return true;
    if (repo.name.toLowerCase().includes('jinyang') || repo.name.toLowerCase().includes('lingling')) return true;
    return false;
  };

  return {
    loadRoutingConfig: vi.fn(),
    convertRepository: vi.fn((repo: any) => {
      const isJinyang = isJinyangRepo(repo);
      const workspaceBaseDir = isJinyang
        ? `/tmp/.jinyang/worktrees/${repo.id}`
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
    }),
    isJinyangRepository: vi.fn((repo: any) => isJinyangRepo(repo)),
    getJinyangWorktreeBase: vi.fn(() => '/tmp/.jinyang/worktrees'),
  };
});

vi.mock('../../../src/routing/config-loader.js', async () => {
  return {
    loadConfig: vi.fn(),
  };
});

import { loadRoutingConfig } from '../../../src/routing/config.js';
import { loadConfig as loadLegacyConfig } from '../../../src/routing/config-loader.js';

describe('RoutingEngine', () => {
  let engine: RoutingEngine;

  const mockLegacyConfig = {
    repositories: [
      {
        id: 'pokedex-generator',
        name: 'pokedex-generator',
        repositoryPath: '/tmp/Applications/pokedex-generator',
        baseBranch: 'main',
        workspaceBaseDir: '/tmp/.jinyang/worktrees/pokedex-generator',
        isActive: true,
        linearWorkspaceId: 'test-workspace-id',
        linearWorkspaceName: 'test-workspace',
        routingLabels: ['repo:pokedex'],
        projectKeys: ['Pokedex: Shiny 151'],
      },
      {
        id: 'kdh-automation',
        name: 'KDH-Automation',
        repositoryPath: '/tmp/Applications/KDH-Automation',
        baseBranch: 'main',
        workspaceBaseDir: '/tmp/.jinyang/worktrees/KDH-Automation',
        isActive: true,
        linearWorkspaceId: 'test-workspace-id',
        linearWorkspaceName: 'test-workspace',
        routingLabels: ['repo:kdh'],
        projectKeys: ['KDH: Viral Shorts', 'KDH: 3D Music Videos'],
      },
      {
        id: 'jinyang',
        name: 'jinyang',
        repositoryPath: '/tmp/Applications/jinyang',
        baseBranch: 'master',
        workspaceBaseDir: '/tmp/.jinyang/worktrees/jinyang',
        isActive: true,
        linearWorkspaceId: 'test-workspace-id',
        linearWorkspaceName: 'test-workspace',
        routingLabels: ['repo:jinyang', 'repo:lingling'],
        projectKeys: ['jinyang'],
      },
      {
        id: 'inactive-repo',
        name: 'Inactive Repository',
        repositoryPath: '/tmp/Applications/inactive',
        baseBranch: 'main',
        workspaceBaseDir: '/tmp/.jinyang/worktrees/inactive',
        isActive: false,
        linearWorkspaceId: 'test-workspace-id',
        linearWorkspaceName: 'test-workspace',
        routingLabels: ['repo:inactive'],
        projectKeys: ['Inactive Project'],
      },
    ],
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup default mocks
    vi.mocked(loadLegacyConfig).mockResolvedValue(mockLegacyConfig);
    vi.mocked(loadRoutingConfig).mockResolvedValue({
      defaultProvider: 'opencode-glm47',
      defaultWorktreeMode: 'branch-per-issue',
      repositories: [],
      labelRules: {
        autoExecute: ['jinyang:auto'],
        manualExecute: ['jinyang:manual'],
      },
    });

    engine = new RoutingEngine();
    await engine.initialize();
  });

  describe('Repository Matching', () => {
    it('should route by label match', async () => {
      const issue: LinearIssue = {
        id: 'ROM-123',
        identifier: 'ROM-123',
        title: 'Test Issue',
        state: { name: 'Todo' },
        labels: {
          nodes: [
            { name: 'repo:pokedex' },
            { name: 'bug' },
          ],
        },
      };

      const result = await engine.route(issue);
      expect(result.repository).toBe('/tmp/Applications/pokedex-generator');
    });

    it('should route by multiple labels', async () => {
      const issue: LinearIssue = {
        id: 'ROM-124',
        identifier: 'ROM-124',
        title: 'Another Test',
        state: { name: 'Todo' },
        labels: {
          nodes: [
            { name: 'repo:jinyang' },
            { name: 'feature' },
          ],
        },
      };

      const result = await engine.route(issue);
      expect(result.repository).toBe('/tmp/Applications/jinyang');
    });

    it('should route by project name', async () => {
      const issue: LinearIssue = {
        id: 'ROM-125',
        identifier: 'ROM-125',
        title: 'Project Issue',
        state: { name: 'Todo' },
        project: { name: 'KDH: Viral Shorts' },
        labels: { nodes: [] },
      };

      const result = await engine.route(issue);
      expect(result.repository).toBe('/tmp/Applications/KDH-Automation');
    });

    it('should route by project name partial match', async () => {
      const issue: LinearIssue = {
        id: 'ROM-126',
        identifier: 'ROM-126',
        title: 'Project Issue',
        state: { name: 'Todo' },
        project: { name: 'Viral Shorts' },
        labels: { nodes: [] },
      };

      const result = await engine.route(issue);
      expect(result.repository).toBe('/tmp/Applications/KDH-Automation');
    });

    it('should route by description tag', async () => {
      const issue: LinearIssue = {
        id: 'ROM-127',
        identifier: 'ROM-127',
        title: 'Tagged Issue',
        description: 'This is about [repo=pokedex] stuff',
        state: { name: 'Todo' },
        labels: { nodes: [] },
      };

      const result = await engine.route(issue);
      expect(result.repository).toBe('/tmp/Applications/pokedex-generator');
    });

    it('should prioritize labels over project', async () => {
      const issue: LinearIssue = {
        id: 'ROM-128',
        identifier: 'ROM-128',
        title: 'Conflicting Routing',
        state: { name: 'Todo' },
        project: { name: 'KDH: Viral Shorts' },
        labels: {
          nodes: [
            { name: 'repo:pokedex' },
          ],
        },
      };

      const result = await engine.route(issue);
      // Label should take precedence
      expect(result.repository).toBe('/tmp/Applications/pokedex-generator');
    });

    it('should throw error when no repository matches', async () => {
      const issue: LinearIssue = {
        id: 'ROM-129',
        identifier: 'ROM-129',
        title: 'Unknown Project',
        state: { name: 'Todo' },
        project: { name: 'Unknown Project' },
        labels: { nodes: [{ name: 'unknown:label' }] },
      };

      await expect(engine.route(issue)).rejects.toThrow(RoutingError);
      await expect(engine.route(issue)).rejects.toThrow('No repository configured');
    });

    it('should handle inactive repositories', async () => {
      const issue: LinearIssue = {
        id: 'ROM-130',
        identifier: 'ROM-130',
        title: 'Inactive Test',
        state: { name: 'Todo' },
        labels: { nodes: [{ name: 'repo:inactive' }] },
      };

      // Should throw because inactive repos are filtered out
      await expect(engine.route(issue)).rejects.toThrow(RoutingError);
    });
  });

  describe('Label Detection - Auto/Manual Execution', () => {
    it('should return autoExecute=true when jinyang:auto label present', () => {
      const issue: LinearIssue = {
        id: 'ROM-200',
        identifier: 'ROM-200',
        title: 'Auto Execute Issue',
        state: { name: 'Todo' },
        labels: {
          nodes: [
            { name: 'jinyang:auto' },
            { name: 'feature' },
          ],
        },
      };

      expect(engine.shouldAutoExecute(issue)).toBe(true);
    });

    it('should return autoExecute=false when jinyang:manual label present', () => {
      const issue: LinearIssue = {
        id: 'ROM-201',
        identifier: 'ROM-201',
        title: 'Manual Execute Issue',
        state: { name: 'Todo' },
        labels: {
          nodes: [
            { name: 'jinyang:manual' },
            { name: 'bug' },
          ],
        },
      };

      expect(engine.shouldAutoExecute(issue)).toBe(false);
    });

    it('should return autoExecute=false by default (safe)', () => {
      const issue: LinearIssue = {
        id: 'ROM-202',
        identifier: 'ROM-202',
        title: 'No Label Issue',
        state: { name: 'Todo' },
        labels: { nodes: [{ name: 'bug' }, { name: 'urgent' }] },
      };

      expect(engine.shouldAutoExecute(issue)).toBe(false);
    });

    it('should prioritize manual over auto when both present', () => {
      const issue: LinearIssue = {
        id: 'ROM-203',
        identifier: 'ROM-203',
        title: 'Conflicting Labels',
        state: { name: 'Todo' },
        labels: {
          nodes: [
            { name: 'jinyang:auto' },
            { name: 'jinyang:manual' },
          ],
        },
      };

      expect(engine.shouldAutoExecute(issue)).toBe(false);
    });

    it('should handle empty labels', () => {
      const issue: LinearIssue = {
        id: 'ROM-204',
        identifier: 'ROM-204',
        title: 'Empty Labels',
        state: { name: 'Todo' },
        labels: { nodes: [] },
      };

      expect(engine.shouldAutoExecute(issue)).toBe(false);
    });

    it('should handle undefined labels', () => {
      const issue: LinearIssue = {
        id: 'ROM-205',
        identifier: 'ROM-205',
        title: 'No Labels',
        state: { name: 'Todo' },
        labels: { nodes: [] },
      };

      expect(engine.shouldAutoExecute(issue)).toBe(false);
    });
  });

  describe('Provider Selection', () => {
    it('should use default provider when no override', async () => {
      const issue: LinearIssue = {
        id: 'ROM-300',
        identifier: 'ROM-300',
        title: 'Default Provider',
        state: { name: 'Todo' },
        project: { name: 'Pokedex: Shiny 151' },
        labels: { nodes: [] },
      };

      const result = await engine.route(issue);
      expect(result.provider).toBe('opencode-glm47');
    });

    it('should use provider from label override', async () => {
      const issue: LinearIssue = {
        id: 'ROM-301',
        identifier: 'ROM-301',
        title: 'Provider Override',
        state: { name: 'Todo' },
        project: { name: 'Pokedex: Shiny 151' },
        labels: {
          nodes: [
            { name: 'provider:kimi-k25-oauth' },
          ],
        },
      };

      const result = await engine.route(issue);
      expect(result.provider).toBe('kimi-k25-oauth');
    });

    it('should handle case-insensitive provider names', async () => {
      const issue: LinearIssue = {
        id: 'ROM-302',
        identifier: 'ROM-302',
        title: 'Case Test',
        state: { name: 'Todo' },
        project: { name: 'Pokedex: Shiny 151' },
        labels: {
          nodes: [
            { name: 'provider:Kimi-K25-API' },
          ],
        },
      };

      const result = await engine.route(issue);
      expect(result.provider).toBe('kimi-k25-api');
    });

    it('should fall back to default on invalid provider', async () => {
      const issue: LinearIssue = {
        id: 'ROM-303',
        identifier: 'ROM-303',
        title: 'Invalid Provider',
        state: { name: 'Todo' },
        project: { name: 'Pokedex: Shiny 151' },
        labels: {
          nodes: [
            { name: 'provider:invalid-provider' },
          ],
        },
      };

      const result = await engine.route(issue);
      expect(result.provider).toBe('opencode-glm47');
    });
  });

  describe('Worktree Mode Selection', () => {
    it('should use default worktree mode', async () => {
      const issue: LinearIssue = {
        id: 'ROM-400',
        identifier: 'ROM-400',
        title: 'Default Worktree',
        state: { name: 'Todo' },
        project: { name: 'Pokedex: Shiny 151' },
        labels: { nodes: [] },
      };

      const result = await engine.route(issue);
      expect(result.worktreeMode).toBe('branch-per-issue');
    });

    it('should use fresh mode from label', async () => {
      const issue: LinearIssue = {
        id: 'ROM-401',
        identifier: 'ROM-401',
        title: 'Fresh Worktree',
        state: { name: 'Todo' },
        project: { name: 'Pokedex: Shiny 151' },
        labels: {
          nodes: [
            { name: 'worktree:fresh' },
          ],
        },
      };

      const result = await engine.route(issue);
      expect(result.worktreeMode).toBe('fresh');
    });

    it('should use reuse mode from label', async () => {
      const issue: LinearIssue = {
        id: 'ROM-402',
        identifier: 'ROM-402',
        title: 'Reuse Worktree',
        state: { name: 'Todo' },
        project: { name: 'Pokedex: Shiny 151' },
        labels: {
          nodes: [
            { name: 'worktree:reuse' },
          ],
        },
      };

      const result = await engine.route(issue);
      expect(result.worktreeMode).toBe('reuse');
    });
  });

  describe('Edge Cases', () => {
    it('should throw error for invalid issue (no id)', async () => {
      const issue = {
        id: '',
        identifier: 'ROM-500',
        title: 'Invalid',
        state: { name: 'Todo' },
        labels: { nodes: [] },
      } as LinearIssue;

      await expect(engine.route(issue)).rejects.toThrow(RoutingError);
      await expect(engine.route(issue)).rejects.toThrow('Invalid issue');
    });

    it('should handle description with multiple tags', async () => {
      const issue: LinearIssue = {
        id: 'ROM-501',
        identifier: 'ROM-501',
        title: 'Multi Tag',
        description: 'First [repo=kdh] then [repo=pokedex]',
        state: { name: 'Todo' },
        labels: { nodes: [] },
      };

      // Should use first tag found
      const result = await engine.route(issue);
      expect(result.repository).toBe('/tmp/Applications/KDH-Automation');
    });

    it('should handle label with commas', async () => {
      const issue: LinearIssue = {
        id: 'ROM-502',
        identifier: 'ROM-502',
        title: 'Comma Labels',
        state: { name: 'Todo' },
        labels: {
          nodes: [
            { name: 'repo:pokedex,bug,urgent' },
          ],
        },
      };

      const result = await engine.route(issue);
      expect(result.repository).toBe('/tmp/Applications/pokedex-generator');
    });

    it('should get repository config without full route', () => {
      const issue: LinearIssue = {
        id: 'ROM-503',
        identifier: 'ROM-503',
        title: 'Get Config',
        state: { name: 'Todo' },
        project: { name: 'Pokedex: Shiny 151' },
        labels: { nodes: [] },
      };

      const config = engine.getRepositoryConfig(issue);
      expect(config).not.toBeNull();
      expect(config?.id).toBe('pokedex-generator');
      expect(config?.localPath).toBe('/tmp/Applications/pokedex-generator');
    });

    it('should return null for unknown repository', () => {
      const issue: LinearIssue = {
        id: 'ROM-504',
        identifier: 'ROM-504',
        title: 'Unknown',
        state: { name: 'Todo' },
        labels: { nodes: [{ name: 'unknown:repo' }] },
      };

      const config = engine.getRepositoryConfig(issue);
      expect(config).toBeNull();
    });
  });

  describe('Repository Helpers', () => {
    it('should return all repositories', () => {
      const repos = engine.getAllRepositories();
      // Should be empty since we didn't populate routing config
      expect(repos).toEqual([]);
    });

    it('should get repository by id', () => {
      // Should return null since we didn't populate routing config
      const repo = engine.getRepositoryById('pokedex-generator');
      expect(repo).toBeNull();
    });
  });

  describe('Config Reloading', () => {
    it('should reload configuration', async () => {
      // Just verify it doesn't throw
      await expect(engine.reload()).resolves.not.toThrow();
    });
  });

  describe('Jinyang Worktree Path Override', () => {
    it('should use jinyang worktree path for jinyang repo (by ID)', async () => {
      const issue: LinearIssue = {
        id: 'ROM-600',
        identifier: 'ROM-600',
        title: 'Jinyang Issue',
        state: { name: 'Todo' },
        labels: {
          nodes: [
            { name: 'repo:jinyang' },
          ],
        },
      };

      const config = engine.getRepositoryConfig(issue);
      expect(config).not.toBeNull();
      expect(config?.workspaceBaseDir).toBe('/tmp/.jinyang/worktrees/jinyang');
    });

    it('should use jinyang worktree path for lingling repo (by routingLabels)', async () => {
      const issue: LinearIssue = {
        id: 'ROM-601',
        identifier: 'ROM-601',
        title: 'Lingling Issue',
        state: { name: 'Todo' },
        labels: {
          nodes: [
            { name: 'repo:lingling' },
          ],
        },
      };

      const config = engine.getRepositoryConfig(issue);
      expect(config).not.toBeNull();
      expect(config?.workspaceBaseDir).toBe('/tmp/.jinyang/worktrees/jinyang');
    });

    it('should use default worktree path for non-jinyang repos', async () => {
      const issue: LinearIssue = {
        id: 'ROM-602',
        identifier: 'ROM-602',
        title: 'Pokedex Issue',
        state: { name: 'Todo' },
        labels: {
          nodes: [
            { name: 'repo:pokedex' },
          ],
        },
      };

      const config = engine.getRepositoryConfig(issue);
      expect(config).not.toBeNull();
      expect(config?.workspaceBaseDir).toBe('/tmp/.jinyang/worktrees/pokedex-generator');
    });

    it('should use default worktree path for KDH repos', async () => {
      const issue: LinearIssue = {
        id: 'ROM-603',
        identifier: 'ROM-603',
        title: 'KDH Issue',
        state: { name: 'Todo' },
        labels: {
          nodes: [
            { name: 'repo:kdh' },
          ],
        },
      };

      const config = engine.getRepositoryConfig(issue);
      expect(config).not.toBeNull();
      expect(config?.workspaceBaseDir).toBe('/tmp/.jinyang/worktrees/KDH-Automation');
    });
  });
});

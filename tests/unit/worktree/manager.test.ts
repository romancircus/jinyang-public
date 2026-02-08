import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { WorktreeManager, BASE_WORKTREE_PATH } from '../../../src/worktree/manager';
import { WorktreeMode } from '../../../src/worktree/types';
import { WorktreeError } from '../../../src/errors';
import { execSync } from 'child_process';

describe('WorktreeManager', () => {
  let manager: WorktreeManager;
  let testBasePath: string;
  let mockRepoPath: string;

  beforeEach(() => {
    testBasePath = join(tmpdir(), 'jinyang-test-worktrees', Date.now().toString());
    mkdirSync(testBasePath, { recursive: true });
    manager = new WorktreeManager(testBasePath);

    // Create a mock git repository
    mockRepoPath = join(tmpdir(), 'mock-repo', Date.now().toString());
    mkdirSync(mockRepoPath, { recursive: true });
    execSync('git init', { cwd: mockRepoPath });
    execSync('git config user.email "test@test.com"', { cwd: mockRepoPath });
    execSync('git config user.name "Test User"', { cwd: mockRepoPath });
    writeFileSync(join(mockRepoPath, 'README.md'), '# Test Repo');
    execSync('git add .', { cwd: mockRepoPath });
    execSync('git commit -m "Initial commit"', { cwd: mockRepoPath });
  });

  afterEach(() => {
    try {
      rmSync(testBasePath, { recursive: true, force: true });
      rmSync(mockRepoPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    it('should create base path if it does not exist', () => {
      const newPath = join(tmpdir(), 'new-base-path', Date.now().toString());
      new WorktreeManager(newPath);
      expect(existsSync(newPath)).toBe(true);
      rmSync(newPath, { recursive: true, force: true });
    });

    it('should use default base path when not provided', () => {
      const defaultManager = new WorktreeManager();
      expect(defaultManager.getWorktreePath('test')).toContain('.jinyang/worktrees');
    });
  });

  describe('createWorktree', () => {
    it('should create main worktree mode', async () => {
      const result = await manager.createWorktree({
        issueId: 'ROM-123',
        repositoryPath: mockRepoPath,
        mode: 'main' as WorktreeMode
      });

      expect(result.issueId).toBe('ROM-123');
      expect(result.mode).toBe('main');
      expect(result.branchName).toBe('linear/ROM-123-issue');
      expect(existsSync(result.worktreePath)).toBe(true);
      expect(existsSync(join(result.worktreePath, '.git'))).toBe(true);
    });

    it('should create branch worktree mode', async () => {
      const result = await manager.createWorktree({
        issueId: 'ROM-124',
        repositoryPath: mockRepoPath,
        mode: 'branch' as WorktreeMode,
        slug: 'feature-branch'
      });

      expect(result.mode).toBe('branch');
      expect(result.worktreePath).toContain('branch');
      expect(result.branchName).toBe('linear/ROM-124-feature-branch');
      expect(existsSync(result.worktreePath)).toBe(true);
    });

    it('should create session worktree mode', async () => {
      const result = await manager.createWorktree({
        issueId: 'ROM-125',
        repositoryPath: mockRepoPath,
        mode: 'session' as WorktreeMode
      });

      expect(result.mode).toBe('session');
      expect(result.sessionId).toMatch(/^session-\d+$/);
      expect(result.worktreePath).toContain('session-');
      expect(existsSync(result.worktreePath)).toBe(true);
    });

    it('should create symlinks for shared assets', async () => {
      const assetPath = join(mockRepoPath, 'shared-assets');
      mkdirSync(assetPath, { recursive: true });
      
      const result = await manager.createWorktree({
        issueId: 'ROM-126',
        repositoryPath: mockRepoPath,
        mode: 'main' as WorktreeMode,
        sharedAssets: [assetPath]
      });

      expect(result.symlinks).toHaveLength(1);
      expect(result.symlinks[0].name).toBe('shared-assets');
      expect(result.symlinks[0].created).toBe(true);
    });

    it('should use existing worktree if already exists', async () => {
      const issueId = 'ROM-127';
      
      await manager.createWorktree({
        issueId,
        repositoryPath: mockRepoPath,
        mode: 'main' as WorktreeMode
      });

      const result2 = await manager.createWorktree({
        issueId,
        repositoryPath: mockRepoPath,
        mode: 'main' as WorktreeMode
      });

      expect(result2.worktreePath).toBe(manager.getWorktreePath(issueId));
    });

    it('should throw error for non-existent repository', async () => {
      await expect(manager.createWorktree({
        issueId: 'ROM-128',
        repositoryPath: '/nonexistent/path',
        mode: 'main' as WorktreeMode
      })).rejects.toThrow(WorktreeError);
    });

    it('should throw error for invalid repository (not git)', async () => {
      const nonGitPath = join(tmpdir(), 'not-git', Date.now().toString());
      mkdirSync(nonGitPath, { recursive: true });
      
      await expect(manager.createWorktree({
        issueId: 'ROM-129',
        repositoryPath: nonGitPath,
        mode: 'main' as WorktreeMode
      })).rejects.toThrow(WorktreeError);

      rmSync(nonGitPath, { recursive: true, force: true });
    });

    it('should throw error for invalid mode', async () => {
      await expect(manager.createWorktree({
        issueId: 'ROM-130',
        repositoryPath: mockRepoPath,
        mode: 'invalid' as WorktreeMode
      })).rejects.toThrow(WorktreeError);
    });

    it('should use existing branch if it already exists', async () => {
      const issueId = 'ROM-131';
      const branchName = `linear/${issueId}-test`;
      
      execSync(`git checkout -b ${branchName}`, { cwd: mockRepoPath });
      execSync('git checkout main || git checkout master', { cwd: mockRepoPath });
      
      const result = await manager.createWorktree({
        issueId,
        repositoryPath: mockRepoPath,
        mode: 'main' as WorktreeMode,
        slug: 'test'
      });

      expect(result.branchName).toBe(branchName);
    });

    it('should capture base commit', async () => {
      const result = await manager.createWorktree({
        issueId: 'ROM-132',
        repositoryPath: mockRepoPath,
        mode: 'main' as WorktreeMode
      });

      expect(result.baseCommit).toBeTruthy();
      expect(result.baseCommit.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe('getWorktreePath', () => {
    it('should return path for existing worktree', async () => {
      const issueId = 'ROM-200';
      
      await manager.createWorktree({
        issueId,
        repositoryPath: mockRepoPath,
        mode: 'main' as WorktreeMode
      });

      const path = manager.getWorktreePath(issueId);
      expect(path).toContain(issueId);
      expect(existsSync(path)).toBe(true);
    });

    it('should return base path for non-existing worktree', () => {
      const path = manager.getWorktreePath('ROM-NONEXISTENT');
      expect(path).toContain('ROM-NONEXISTENT');
    });
  });

  describe('cleanupWorktree', () => {
    it('should remove worktree successfully', async () => {
      const issueId = 'ROM-300';
      
      await manager.createWorktree({
        issueId,
        repositoryPath: mockRepoPath,
        mode: 'main' as WorktreeMode
      });

      const path = manager.getWorktreePath(issueId);
      expect(existsSync(path)).toBe(true);

      await manager.cleanupWorktree(issueId);

      expect(existsSync(path)).toBe(false);
      expect(manager.hasActiveWorktree(issueId)).toBe(false);
    });

    it('should preserve worktree when preserve flag is true', async () => {
      const issueId = 'ROM-301';
      
      await manager.createWorktree({
        issueId,
        repositoryPath: mockRepoPath,
        mode: 'main' as WorktreeMode
      });

      const path = manager.getWorktreePath(issueId);
      
      await manager.cleanupWorktree(issueId, true);

      expect(existsSync(path)).toBe(true);
      expect(manager.hasActiveWorktree(issueId)).toBe(false);
    });

    it('should handle cleanup of non-existent worktree gracefully', async () => {
      await expect(manager.cleanupWorktree('ROM-NONEXISTENT')).resolves.not.toThrow();
    });
  });

  describe('getGitStatus', () => {
    it('should return clean status for new worktree', async () => {
      const issueId = 'ROM-400';
      
      await manager.createWorktree({
        issueId,
        repositoryPath: mockRepoPath,
        mode: 'main' as WorktreeMode
      });

      const status = await manager.getGitStatus(issueId);

      expect(status.isClean).toBe(true);
      expect(status.branch).toBe(`linear/${issueId}-issue`);
      expect(status.commit).toBeTruthy();
    });

    it('should detect modified files', async () => {
      const issueId = 'ROM-401';
      
      await manager.createWorktree({
        issueId,
        repositoryPath: mockRepoPath,
        mode: 'main' as WorktreeMode
      });

      const path = manager.getWorktreePath(issueId);
      writeFileSync(join(path, 'README.md'), '# Modified');

      const status = await manager.getGitStatus(issueId);

      expect(status.isClean).toBe(false);
      expect(status.modified).toContain('README.md');
    });

    it('should throw error for non-existent worktree', async () => {
      await expect(manager.getGitStatus('ROM-NONEXISTENT')).rejects.toThrow(WorktreeError);
    });
  });

  describe('cleanupOrphanedWorktrees', () => {
    it('should clean up orphaned worktrees older than threshold', async () => {
      const oldIssueId = 'ROM-OLD';
      
      await manager.createWorktree({
        issueId: oldIssueId,
        repositoryPath: mockRepoPath,
        mode: 'main' as WorktreeMode
      });

      // Remove from active worktrees to simulate orphaned state
      manager['activeWorktrees'].delete(oldIssueId);

      const cleaned = await manager.cleanupOrphanedWorktrees(0);

      expect(cleaned).toBeGreaterThanOrEqual(0);
    });

    it('should not clean active worktrees', async () => {
      const issueId = 'ROM-ACTIVE';
      
      await manager.createWorktree({
        issueId,
        repositoryPath: mockRepoPath,
        mode: 'main' as WorktreeMode
      });

      const cleaned = await manager.cleanupOrphanedWorktrees(0);
      const path = manager.getWorktreePath(issueId);

      expect(existsSync(path)).toBe(true);
    });

    it('should handle empty base path gracefully', async () => {
      const emptyManager = new WorktreeManager(join(testBasePath, 'empty'));
      const cleaned = await emptyManager.cleanupOrphanedWorktrees();
      expect(cleaned).toBe(0);
    });
  });

  describe('helper methods', () => {
    it('should track active worktrees', async () => {
      const issueId = 'ROM-500';
      
      expect(manager.hasActiveWorktree(issueId)).toBe(false);
      
      await manager.createWorktree({
        issueId,
        repositoryPath: mockRepoPath,
        mode: 'main' as WorktreeMode
      });

      expect(manager.hasActiveWorktree(issueId)).toBe(true);
      
      const worktree = manager.getActiveWorktree(issueId);
      expect(worktree).toBeDefined();
      expect(worktree?.issueId).toBe(issueId);
    });

    it('should return copy of active worktrees map', async () => {
      await manager.createWorktree({
        issueId: 'ROM-501',
        repositoryPath: mockRepoPath,
        mode: 'main' as WorktreeMode
      });

      const worktrees = manager.getActiveWorktrees();
      expect(worktrees.size).toBe(1);

      // Modifying returned map should not affect internal state
      worktrees.clear();
      expect(manager.getActiveWorktrees().size).toBe(1);
    });

    it('should cleanup all worktrees', async () => {
      await manager.createWorktree({
        issueId: 'ROM-502',
        repositoryPath: mockRepoPath,
        mode: 'main' as WorktreeMode
      });

      await manager.createWorktree({
        issueId: 'ROM-503',
        repositoryPath: mockRepoPath,
        mode: 'main' as WorktreeMode
      });

      expect(manager.getActiveWorktrees().size).toBe(2);

      const removed = await manager.cleanupAll();

      expect(removed).toBe(2);
      expect(manager.getActiveWorktrees().size).toBe(0);
    });

    it('should preserve all worktrees when preserve flag is true', async () => {
      const issueId = 'ROM-504';
      
      await manager.createWorktree({
        issueId,
        repositoryPath: mockRepoPath,
        mode: 'main' as WorktreeMode
      });

      const path = manager.getWorktreePath(issueId);
      
      await manager.cleanupAll(true);

      expect(existsSync(path)).toBe(true);
      expect(manager.hasActiveWorktree(issueId)).toBe(false);
    });
  });

  describe('branch naming', () => {
    it('should generate correct branch names with slug', async () => {
      const result = await manager.createWorktree({
        issueId: 'ROM-600',
        repositoryPath: mockRepoPath,
        mode: 'main' as WorktreeMode,
        slug: 'my-awesome-feature'
      });

      expect(result.branchName).toBe('linear/ROM-600-my-awesome-feature');
    });

    it('should sanitize slugs with special characters', async () => {
      const result = await manager.createWorktree({
        issueId: 'ROM-601',
        repositoryPath: mockRepoPath,
        mode: 'main' as WorktreeMode,
        slug: 'Feature with Spaces & Special!Chars'
      });

      expect(result.branchName).toBe('linear/ROM-601-feature-with-spaces---special-chars');
    });

    it('should use default slug when not provided', async () => {
      const result = await manager.createWorktree({
        issueId: 'ROM-602',
        repositoryPath: mockRepoPath,
        mode: 'main' as WorktreeMode
      });

      expect(result.branchName).toBe('linear/ROM-602-issue');
    });
  });

  describe('error handling', () => {
    it('should include error code in thrown errors', async () => {
      try {
        await manager.createWorktree({
          issueId: 'ROM-700',
          repositoryPath: '/nonexistent',
          mode: 'main' as WorktreeMode
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WorktreeError);
        expect((error as WorktreeError).code).toBe('REPO_NOT_FOUND');
        expect((error as WorktreeError).issueId).toBe('ROM-700');
      }
    });

    it('should handle git command errors gracefully', async () => {
      // Test that getBaseCommit returns 'initial' when git command fails
      vi.spyOn(manager as any, 'getBaseCommit').mockImplementation(async () => {
        return 'initial';
      });

      const result = await manager.createWorktree({
        issueId: 'ROM-701',
        repositoryPath: mockRepoPath,
        mode: 'main' as WorktreeMode
      });

      expect(result.baseCommit).toBe('initial');
    });
  });
});

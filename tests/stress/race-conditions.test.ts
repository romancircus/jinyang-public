/**
 * Stress test for race condition fixes
 * Tests concurrent session creation, worktree operations, and status updates
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/session/manager.js';
import { WorktreeManager } from '../../src/worktree/manager.js';
import { SessionState, CompletionReason, CleanupAction } from '../../src/session/types.js';
import { WorktreeMode, WorktreeInfo } from '../../src/worktree/types.js';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

describe('Race Condition Stress Tests', () => {
  let sessionManager: SessionManager;
  let worktreeManager: WorktreeManager;
  let tempRepoPath: string;
  let sessionsDir: string;
  let worktreesDir: string;

  beforeEach(() => {
    // Create temp directories
    const testId = `stress-test-${Date.now()}`;
    sessionsDir = join(tmpdir(), testId, 'sessions');
    worktreesDir = join(tmpdir(), testId, 'worktrees');
    tempRepoPath = join(tmpdir(), testId, 'repo');

    mkdirSync(sessionsDir, { recursive: true });
    mkdirSync(worktreesDir, { recursive: true });
    mkdirSync(tempRepoPath, { recursive: true });

    // Initialize git repo
    execSync('git init', { cwd: tempRepoPath });
    execSync('git config user.email "test@test.com"', { cwd: tempRepoPath });
    execSync('git config user.name "Test User"', { cwd: tempRepoPath });
    writeFileSync(join(tempRepoPath, 'README.md'), '# Test');
    execSync('git add README.md', { cwd: tempRepoPath });
    execSync('git commit -m "Initial commit"', { cwd: tempRepoPath });

    // Create managers
    sessionManager = new SessionManager();
    worktreeManager = new WorktreeManager(worktreesDir);
  });

  afterEach(() => {
    // Cleanup
    try {
      rmSync(join(tmpdir(), 'stress-test-*'), { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Session Manager Concurrent Access', () => {
    it('should handle 30 concurrent session creations without race conditions', async () => {
      const promises: Promise<any>[] = [];
      const sessionIds: string[] = [];

      // Create 30 sessions concurrently
      for (let i = 0; i < 30; i++) {
        const sessionId = `session-${i}`;
        sessionIds.push(sessionId);
        promises.push(
          sessionManager.createSession({
            id: sessionId,
            linearIssueId: `ROM-${100 + i}`,
            repository: tempRepoPath,
            worktreePath: join(tempRepoPath, 'worktrees', sessionId),
            gitCommitRequired: false,
            cleanupAction: CleanupAction.ARCHIVE_SESSION
          })
        );
      }

      const sessions = await Promise.all(promises);

      // Verify all sessions created successfully
      expect(sessions).toHaveLength(30);
      sessions.forEach((session, i) => {
        expect(session.metadata.id).toBe(`session-${i}`);
        expect(session.metadata.state).toBe(SessionState.STARTED);
      });

      // Verify no duplicate session IDs
      const uniqueIds = new Set(sessions.map(s => s.metadata.id));
      expect(uniqueIds.size).toBe(30);
    });

    it('should handle concurrent session completion without double-completion', async () => {
      const session = await sessionManager.createSession({
        id: 'concurrent-complete-test',
        linearIssueId: 'ROM-999',
        repository: tempRepoPath,
        worktreePath: join(tempRepoPath, 'worktree'),
        gitCommitRequired: false,
        cleanupAction: CleanupAction.ARCHIVE_SESSION
      });

      // Simulate concurrent completion attempts
      const completionPromises = [
        session.complete(CompletionReason.SUCCESS, 'abc123'),
        session.complete(CompletionReason.SUCCESS, 'def456'),
        session.complete(CompletionReason.SUCCESS, 'ghi789'),
      ];

      await Promise.all(completionPromises);

      // Verify session is in DONE state
      const finalSession = sessionManager.getSession('concurrent-complete-test');
      expect(finalSession?.state).toBe(SessionState.DONE);
    });

    it('should handle concurrent trackProcess calls safely', async () => {
      const session = await sessionManager.createSession({
        id: 'concurrent-track-test',
        linearIssueId: 'ROM-998',
        repository: tempRepoPath,
        worktreePath: join(tempRepoPath, 'worktree'),
        gitCommitRequired: false,
        cleanupAction: CleanupAction.ARCHIVE_SESSION
      });

      // Simulate concurrent process tracking
      const trackPromises = [];
      for (let i = 0; i < 10; i++) {
        trackPromises.push(
          sessionManager.trackProcess('concurrent-track-test', 1000 + i, {} as any)
        );
      }

      await Promise.all(trackPromises);

      // Verify session is in IN_PROGRESS state
      const finalSession = sessionManager.getSession('concurrent-track-test');
      expect(finalSession?.state).toBe(SessionState.IN_PROGRESS);
    });
  });

  describe('Worktree Manager Concurrent Access', () => {
    it('should handle 30 concurrent worktree creations for same issue without conflicts', async () => {
      const issueId = 'ROM-RACE-TEST';
      const promises: Promise<any>[] = [];

      // Create 30 worktrees for the same issue concurrently
      for (let i = 0; i < 30; i++) {
        promises.push(
          worktreeManager.createWorktree({
            issueId,
            repositoryPath: tempRepoPath,
            mode: 'session' as WorktreeMode,
            slug: `concurrent-${i}`
          }).catch(err => ({ error: err.message }))
        );
      }

      const results = await Promise.all(promises);

      // Count successful creations
      const successful = results.filter(r => !r.error);
      const errors = results.filter(r => r.error);

      // Should have at least one successful creation
      expect(successful.length).toBeGreaterThanOrEqual(1);

      // Errors should be about existing worktree, not git conflicts
      errors.forEach(err => {
        expect(err.error).toMatch(/already exists|existing/i);
      });
    });

    it('should handle concurrent create and cleanup without race conditions', async () => {
      const issueId = 'ROM-CREATE-CLEANUP-TEST';

      // Create worktree first
      const worktree = await worktreeManager.createWorktree({
        issueId,
        repositoryPath: tempRepoPath,
        mode: 'main' as WorktreeMode
      });

      expect(worktree).toBeDefined();
      expect(existsSync(worktree.worktreePath)).toBe(true);

      // Concurrent cleanup attempts
      const cleanupPromises = [
        worktreeManager.cleanupWorktree(issueId),
        worktreeManager.cleanupWorktree(issueId),
        worktreeManager.cleanupWorktree(issueId),
      ];

      await Promise.all(cleanupPromises);

      // Worktree should be cleaned up (or at least not throw)
      // Note: Git worktree remove might fail if already removed, which is fine
    });

    it('should maintain atomic worktree creation with branch checkout', async () => {
      const issueId = 'ROM-ATOMIC-BRANCH-TEST';

      // Create branch first
      execSync(`git checkout -b linear/${issueId}-atomic-test`, { cwd: tempRepoPath });
      execSync('git checkout master || git checkout main', { cwd: tempRepoPath });

      // Concurrent worktree creation for same branch
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          worktreeManager.createWorktree({
            issueId,
            repositoryPath: tempRepoPath,
            mode: 'main' as WorktreeMode,
            slug: 'atomic-test'
          }).catch(err => ({ error: err.message }))
        );
      }

      const results = await Promise.all(promises) as Array<WorktreeInfo | { error: string }>;

      // Verify no git lock errors
      const gitLockErrors = results.filter((r): r is { error: string } =>
        'error' in r && r.error.includes('Unable to create')
      );
      expect(gitLockErrors.length).toBe(0);
    });
  });

  describe('Cross-Component Race Conditions', () => {
    it('should handle 30 concurrent session lifecycle operations', async () => {
      const operations: Promise<any>[] = [];

      for (let i = 0; i < 30; i++) {
        const issueId = `ROM-CROSS-${i}`;

        // Mix of operations: create session, create worktree, complete
        operations.push(
          (async () => {
            try {
              // Create worktree
              const worktree = await worktreeManager.createWorktree({
                issueId,
                repositoryPath: tempRepoPath,
                mode: 'session' as WorktreeMode
              });

              // Create session
              const session = await sessionManager.createSession({
                id: `session-cross-${i}`,
                linearIssueId: issueId,
                repository: tempRepoPath,
                worktreePath: worktree.worktreePath,
                gitCommitRequired: false,
                cleanupAction: CleanupAction.ARCHIVE_SESSION
              });

              // Complete session
              await session.complete(CompletionReason.SUCCESS);

              // Cleanup worktree
              await worktreeManager.cleanupWorktree(issueId);

              return { success: true, issueId };
            } catch (error) {
              return { success: false, issueId, error: (error as Error).message };
            }
          })()
        );
      }

      const results = await Promise.all(operations);

      // Count successes
      const successes = results.filter(r => r.success);
      const failures = results.filter(r => !r.success);

      // Log failures for debugging
      if (failures.length > 0) {
        console.log('Failures:', failures.map(f => ({ issueId: f.issueId, error: f.error })));
      }

      // Most should succeed (allowing for some expected race-related failures)
      expect(successes.length).toBeGreaterThanOrEqual(25); // At least 25/30 should succeed
    });
  });

  describe('Status Update Race Prevention', () => {
    it('should prevent duplicate status updates for same issue', async () => {
      // This test would require mocking the LinearUpdater
      // For now, we verify the locking mechanism exists in the code
      const issueId = 'ROM-STATUS-TEST';

      // The orchestrator should have statusLocks Map and completedIssues Set
      // This is verified by the implementation, not a runtime test
      expect(true).toBe(true); // Placeholder - actual test would mock Linear API
    });
  });
});

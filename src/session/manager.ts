import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawn, ChildProcess } from 'child_process';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Mutex } from 'async-mutex';

import {
  SessionState,
  CompletionReason,
  CleanupAction,
  SessionMetadata,
  SessionConfig,
  Session,
  SessionError
} from './types.js';
import {
  ensureSessionsDir,
  loadSession,
  hasActiveSession,
  saveSession as persistSession,
  archiveSession as persistArchive,
  cleanupOldSessions
} from './persistence.js';
import { GitService } from '../worktree/GitService.js';

const execFileAsync = promisify(execFile);

const SESSIONS_DIR = join(homedir(), '.jinyang', 'sessions');

export class SessionManager {
  private sessions: Map<string, SessionMetadata> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private sessionLocks: Map<string, Mutex> = new Map();
  private globalLock = new Mutex();
  private gitService = new GitService();

  /**
   * Get or create a mutex for a specific session
   */
  private getSessionLock(sessionId: string): Mutex {
    let lock = this.sessionLocks.get(sessionId);
    if (!lock) {
      lock = new Mutex();
      this.sessionLocks.set(sessionId, lock);
    }
    return lock;
  }

  /**
   * Execute a function with exclusive lock on a session
   */
  private async withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const lock = this.getSessionLock(sessionId);
    return await lock.runExclusive(fn);
  }

  /**
   * Execute a function with global lock (for operations affecting multiple sessions)
   */
  private async withGlobalLock<T>(fn: () => Promise<T>): Promise<T> {
    return await this.globalLock.runExclusive(fn);
  }

  async createSession(config: SessionConfig): Promise<Session> {
    return await this.withGlobalLock(async () => {
      // Ensure sessions directory exists
      await ensureSessionsDir();

      // Check for active session (deduplication)
      if (hasActiveSession(config.linearIssueId)) {
        const existingSession = await loadSession(config.linearIssueId);
        if (existingSession) {
          throw new SessionError(
            `Active session already exists for issue ${config.linearIssueId} (PID: ${existingSession.pid})`,
            config.id
          );
        }
      }

      const metadata: SessionMetadata = {
        id: config.id,
        linearIssueId: config.linearIssueId,
        repository: config.repository,
        worktreePath: config.worktreePath,
        state: SessionState.STARTED,
        createdAt: new Date(),
        updatedAt: new Date(),
        cleanupAction: config.cleanupAction
      };

      this.sessions.set(config.id, metadata);

      // Persist to disk with deduplication format
      await persistSession({
        issueId: config.linearIssueId,
        status: 'started',
        worktreePath: config.worktreePath,
        pid: process.pid,
        startedAt: new Date().toISOString()
      });

      await this.saveSession(metadata);

      return {
        metadata,
        cleanup: async () => this.performCleanup(config.id),
        complete: async (reason: CompletionReason, commitSha?: string) => {
          await this.completeSession(config.id, reason, commitSha);
        },
        fail: async (error: Error) => {
          await this.failSession(config.id, error);
        }
      };
    });
  }

  async trackProcess(sessionId: string, pid: number, process: ChildProcess): Promise<void> {
    return await this.withSessionLock(sessionId, async () => {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new SessionError(`Session ${sessionId} not found`, sessionId);
      }

      session.pid = pid;
      session.state = SessionState.IN_PROGRESS;
      session.updatedAt = new Date();

      this.processes.set(sessionId, process);

      // Update persisted session status
      await persistSession({
        issueId: session.linearIssueId,
        status: 'in_progress',
        worktreePath: session.worktreePath,
        pid: pid,
        startedAt: session.createdAt.toISOString()
      });

      await this.saveSession(session);
    });
  }

  async completeSession(
    sessionId: string,
    reason: CompletionReason,
    commitSha?: string
  ): Promise<void> {
    return await this.withSessionLock(sessionId, async () => {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new SessionError(`Session ${sessionId} not found`, sessionId);
      }

      // Prevent concurrent completion
      if (session.state === SessionState.DONE || session.state === SessionState.ERROR) {
        console.log(`[SessionManager] Session ${sessionId} already finalized, skipping completion`);
        return;
      }

      // Validate commit: must contain issue ID in message, or record null
      const verifiedCommitSha = await this.validateAndGetCommitSha(
        session.worktreePath,
        session.linearIssueId,
        commitSha
      );

      session.state = SessionState.DONE;
      session.completionReason = reason;
      session.completedAt = new Date();
      session.updatedAt = new Date();
      session.commitSha = verifiedCommitSha ?? undefined;

      // Update persisted session to done
      await persistSession({
        issueId: session.linearIssueId,
        status: 'done',
        worktreePath: session.worktreePath,
        pid: session.pid || process.pid,
        startedAt: session.createdAt.toISOString(),
        completedAt: new Date().toISOString()
      });

      await this.saveSession(session);

      // Perform cleanup, keeping worktree if verification suspicious (no valid commit)
      const verificationSuspicious = verifiedCommitSha === null;
      await this.performCleanupInternal(sessionId, verificationSuspicious);
    });
  }

  private async failSession(sessionId: string, error: Error): Promise<void> {
    return await this.withSessionLock(sessionId, async () => {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new SessionError(`Session ${sessionId} not found`, sessionId);
      }

      // Prevent concurrent failure handling
      if (session.state === SessionState.DONE || session.state === SessionState.ERROR) {
        console.log(`[SessionManager] Session ${sessionId} already finalized, skipping fail`);
        return;
      }

      session.state = SessionState.ERROR;
      session.completionReason = CompletionReason.FAILURE;
      session.errorMessage = error.message;
      session.completedAt = new Date();
      session.updatedAt = new Date();

      // Update persisted session to error
      await persistSession({
        issueId: session.linearIssueId,
        status: 'error',
        worktreePath: session.worktreePath,
        pid: session.pid || process.pid,
        startedAt: session.createdAt.toISOString(),
        completedAt: new Date().toISOString(),
        error: error.message
      });

      await this.saveSession(session);
      await this.performCleanupInternal(sessionId);
    });
  }

  private async performCleanup(sessionId: string, keepForInspection?: boolean): Promise<void> {
    return await this.withSessionLock(sessionId, async () => {
      await this.performCleanupInternal(sessionId, keepForInspection);
    });
  }

  private async performCleanupInternal(sessionId: string, keepForInspection?: boolean): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionError(`Session ${sessionId} not found`, sessionId);
    }

    try {
      const process = this.processes.get(sessionId);
      if (process && !process.killed) {
        process.kill('SIGTERM');
        this.processes.delete(sessionId);
      }

      // ENFORCE COMMIT: Check for uncommitted changes before cleanup
      if (!keepForInspection && session.state !== SessionState.ERROR) {
        try {
          const hasChanges = await this.gitService.hasUncommittedChanges(session.worktreePath);

          if (hasChanges) {
            console.log(`[SessionManager] Uncommitted changes detected in ${sessionId}, attempting auto-commit`);

            try {
              const commitSha = await this.gitService.commit(session.worktreePath, {
                message: `jinyang: Session completion - ${session.linearIssueId}`,
                noVerify: true
              });

              if (commitSha) {
                console.log(`[SessionManager] Auto-committed changes for ${sessionId}: ${commitSha.substring(0, 8)}`);
                // Update session with new commit SHA
                session.commitSha = commitSha;
              } else {
                console.error(`[SessionManager] Auto-commit failed for ${sessionId}: no commit SHA returned`);
                // Keep worktree for inspection since we couldn't commit
                keepForInspection = true;
              }
            } catch (commitError) {
              const errorMsg = commitError instanceof Error ? commitError.message : String(commitError);
              console.error(`[SessionManager] Failed to auto-commit changes for ${sessionId}:`, errorMsg);
              // Keep worktree for inspection since we couldn't commit
              keepForInspection = true;
            }
          }
        } catch (checkError) {
          const errorMsg = checkError instanceof Error ? checkError.message : String(checkError);
          console.error(`[SessionManager] Failed to check uncommitted changes for ${sessionId}:`, errorMsg);
          // If we can't check, keep worktree for inspection to be safe
          keepForInspection = true;
        }
      }

      // Determine if we should keep worktree for inspection
      const shouldKeep = keepForInspection ||
                         session.state === SessionState.ERROR ||
                         session.commitSha === null ||
                         session.commitSha === undefined;

      if (shouldKeep) {
        console.log(`Keeping worktree for inspection: ${session.worktreePath}`);
      } else if (session.cleanupAction === CleanupAction.DELETE_WORKTREE) {
        await this.deleteDirectory(session.worktreePath);
      }

      await this.archiveSession(session.id);
    } catch (error) {
      console.error(`Cleanup failed for session ${sessionId}:`, error);
    } finally {
      this.sessions.delete(sessionId);
      this.sessionLocks.delete(sessionId);
    }
  }

  /**
   * Validates and returns commit SHA, ensuring it was created by this session.
   * Returns null if no valid commit with issue ID in message is found.
   * Uses GitService for all git operations.
   */
  private async validateAndGetCommitSha(
    worktreePath: string,
    linearIssueId: string,
    providedSha?: string
  ): Promise<string | null> {
    try {
      // If SHA provided externally, validate it
      if (providedSha) {
        const isValid = await this.gitService.verifyCommitMessageContainsIssueId(worktreePath, providedSha, linearIssueId);
        return isValid ? providedSha : null;
      }

      // Check HEAD commit using GitService
      const headSha = await this.gitService.getCurrentCommit(worktreePath);

      if (!headSha || headSha === '' || headSha.length !== 40) {
        return null;
      }

      // Verify commit message contains issue ID (e.g., "feat(ROM-XXX):" or "ROM-XXX")
      const hasIssueId = await this.gitService.verifyCommitMessageContainsIssueId(worktreePath, headSha, linearIssueId);

      if (!hasIssueId) {
        console.log(`[SessionManager] HEAD ${headSha.substring(0, 8)} does not contain ${linearIssueId} in message - recording as no-commit`);
        return null;
      }

      return headSha;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[SessionManager] Commit validation failed:`, errorMessage);
      return null;
    }
  }

  /**
   * Check if there are uncommitted changes before cleanup
   * @param worktreePath - Path to the git worktree
   * @returns true if there are uncommitted changes
   */
  async hasUncommittedChanges(worktreePath: string): Promise<boolean> {
    return await this.gitService.hasUncommittedChanges(worktreePath);
  }

  /**
   * Verify git commit exists and return SHA using GitService
   * @param worktreePath - Path to the git worktree
   * @returns The commit SHA
   */
  async verifyGitCommit(worktreePath: string): Promise<string> {
    try {
      const commitSha = await this.gitService.getCurrentCommit(worktreePath);

      if (!commitSha || commitSha === '' || commitSha.length !== 40) {
        throw new Error('Invalid commit SHA');
      }

      return commitSha;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new SessionError(
        `Git commit verification failed: ${errorMessage}`,
        '',
        error instanceof Error ? error : new Error(errorMessage)
      );
    }
  }

  getSession(sessionId: string): SessionMetadata | undefined {
    // Read-only operation - safe without lock
    return this.sessions.get(sessionId);
  }

  getAllSessions(): SessionMetadata[] {
    // Read-only operation - safe without lock
    return Array.from(this.sessions.values());
  }

  getActiveSessions(): SessionMetadata[] {
    // Read-only operation - safe without lock
    return this.getAllSessions().filter(
      s => s.state === SessionState.IN_PROGRESS || s.state === SessionState.STARTED
    );
  }

  private async saveSession(metadata: SessionMetadata): Promise<void> {
    const sessionPath = join(SESSIONS_DIR, `${metadata.id}.json`);
    await fs.writeFile(sessionPath, JSON.stringify(metadata, null, 2), 'utf8');
  }

  private async archiveSession(sessionId: string): Promise<void> {
    const metadata = this.sessions.get(sessionId);
    if (metadata) {
      // Archive the deduplication format session
      await persistArchive(metadata.linearIssueId);

      // Archive the detailed metadata session file
      const sessionPath = join(SESSIONS_DIR, `${sessionId}.json`);
      const archivePath = join(SESSIONS_DIR, 'archive', `${metadata.id}_detailed.json`);
      try {
        await fs.rename(sessionPath, archivePath);
      } catch (error) {
        // Session file might not exist if never saved
        console.log(`[SessionManager] Could not archive detailed session ${sessionId}:`, error);
      }
    }
  }

  private async deleteDirectory(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to delete directory ${dirPath}:`, error);
    }
  }

  async cleanup(): Promise<void> {
    return await this.withGlobalLock(async () => {
      // Cleanup old archived sessions (older than 7 days)
      await cleanupOldSessions();

      const sessions = this.getAllSessions();
      for (const session of sessions) {
        if (session.state === SessionState.IN_PROGRESS) {
          const elapsed = Date.now() - session.updatedAt.getTime();
          const TIMEOUT_MS = 24 * 60 * 60 * 1000;

          if (elapsed > TIMEOUT_MS) {
            console.log(`Terminating stale session: ${session.id}`);
            await this.failSession(session.id, new Error('Session timeout'));
          }
        }
      }
    });
  }
}

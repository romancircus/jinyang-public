import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, readdirSync, statSync, rmSync, statfsSync } from 'fs';
import { dirname, join, resolve, basename } from 'path';
import { homedir } from 'os';
import { Mutex } from 'async-mutex';
import {
  WorktreeInfo,
  WorktreeOptions,
  WorktreeMode,
  GitStatus,
  SymlinkInfo,
  WorktreeManagerInterface,
} from './types.js';
import { SymlinkFactory } from './symlink-factory.js';
import { WorktreeError } from '../errors/index.js';
import { getLogger } from '../logging/index.js';
import { GitService } from './GitService.js';

const execAsync = promisify(exec);

const BASE_WORKTREE_PATH = join(homedir(), '.jinyang', 'worktrees');
const ORPHANED_WORKTREE_THRESHOLD_HOURS = 24;
const MIN_FREE_SPACE_MB = 100; // Minimum free space required in MB

export class WorktreeManager implements WorktreeManagerInterface {
  private activeWorktrees = new Map<string, WorktreeInfo>();
  private symlinkFactory = new SymlinkFactory();
  private logger = getLogger();
  private worktreeLocks = new Map<string, Mutex>();
  private gitService = new GitService();

  constructor(private basePath: string = BASE_WORKTREE_PATH) {
    this.ensureBasePath();
  }

  /**
   * Get or create a mutex for a specific issue's worktree operations
   */
  private getWorktreeLock(issueId: string): Mutex {
    let lock = this.worktreeLocks.get(issueId);
    if (!lock) {
      lock = new Mutex();
      this.worktreeLocks.set(issueId, lock);
    }
    return lock;
  }

  private ensureBasePath(): void {
    if (!existsSync(this.basePath)) {
      try {
        mkdirSync(this.basePath, { recursive: true });
      } catch (error) {
        this.logger.error(`Failed to create worktree base path: ${this.basePath}`, { error });
        throw new WorktreeError(
          `Failed to create worktree base path: ${this.basePath}`,
          'PERMISSION_DENIED',
          undefined,
          this.basePath
        );
      }
    }
  }

  private generateBranchName(issueId: string, slug?: string): string {
    const cleanSlug = slug?.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase() || 'issue';
    return `linear/${issueId}-${cleanSlug}`;
  }

  private getWorktreeBasePath(issueId: string): string {
    return join(this.basePath, issueId);
  }

  private async getBaseCommit(repoPath: string): Promise<string> {
    try {
      const { stdout } = await execAsync('git rev-parse HEAD', { cwd: repoPath });
      return stdout.trim();
    } catch {
      return 'initial';
    }
  }

  private async branchExists(repoPath: string, branchName: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`git branch --list ${branchName}`, { cwd: repoPath });
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  private async worktreeExists(worktreePath: string): Promise<boolean> {
    return existsSync(join(worktreePath, '.git'));
  }

  /**
   * Check if there's sufficient disk space for worktree operations
   */
  private checkDiskSpace(path: string): { sufficient: boolean; freeMB: number } {
    try {
      const stats = statfsSync(path);
      const freeBytes = stats.bfree * stats.bsize;
      const freeMB = Math.floor(freeBytes / (1024 * 1024));
      return { sufficient: freeMB >= MIN_FREE_SPACE_MB, freeMB };
    } catch (error) {
      this.logger.warn(`Could not check disk space at ${path}`, { error });
      return { sufficient: true, freeMB: -1 }; // Assume sufficient if we can't check
    }
  }

  async createWorktree(options: WorktreeOptions): Promise<WorktreeInfo> {
    const { issueId, repositoryPath, mode, slug, baseBranch, sharedAssets } = options;

    // Acquire exclusive lock for this issue's worktree operations
    const lock = this.getWorktreeLock(issueId);
    return await lock.runExclusive(async () => {
      return await this.createWorktreeLocked(options);
    });
  }

  /**
   * Internal method to create worktree with lock already held
   */
  private async createWorktreeLocked(options: WorktreeOptions): Promise<WorktreeInfo> {
    const { issueId, repositoryPath, mode, slug, baseBranch, sharedAssets } = options;

    // Validate repository exists
    if (!existsSync(repositoryPath)) {
      throw new WorktreeError(
        `Repository not found: ${repositoryPath}`,
        'REPO_NOT_FOUND',
        issueId,
        undefined,
        { repositoryPath }
      );
    }

    // Validate it's a git repository
    if (!existsSync(join(repositoryPath, '.git'))) {
      throw new WorktreeError(
        `Not a git repository: ${repositoryPath}`,
        'REPO_NOT_FOUND',
        issueId,
        undefined,
        { repositoryPath }
      );
    }

    // Check disk space
    const diskSpace = this.checkDiskSpace(this.basePath);
    if (!diskSpace.sufficient) {
      throw new WorktreeError(
        `Insufficient disk space: ${diskSpace.freeMB}MB available, ${MIN_FREE_SPACE_MB}MB required`,
        'DISK_SPACE',
        issueId,
        undefined,
        { freeSpaceMB: diskSpace.freeMB, requiredSpaceMB: MIN_FREE_SPACE_MB }
      );
    }

    const branchName = this.generateBranchName(issueId, slug);
    const issueBasePath = this.getWorktreeBasePath(issueId);

    let worktreePath: string;
    let sessionId: string | undefined;

    switch (mode) {
      case 'main':
        worktreePath = issueBasePath;
        break;
      case 'branch':
        worktreePath = join(issueBasePath, 'branch');
        break;
      case 'session':
        sessionId = `session-${Date.now()}`;
        worktreePath = join(issueBasePath, sessionId);
        break;
      default:
        throw new WorktreeError(
          `Invalid worktree mode: ${mode}`,
          'INVALID_MODE',
          issueId,
          undefined,
          { mode }
        );
    }

    const baseCommit = await this.getBaseCommit(repositoryPath);
    const symlinks: SymlinkInfo[] = [];

    try {
      mkdirSync(dirname(worktreePath), { recursive: true });

      // ATOMIC CHECK: Check both branch and worktree existence together under lock
      const existingBranch = await this.branchExists(repositoryPath, branchName);
      const existingWorktree = await this.worktreeExists(worktreePath);

      // If worktree already exists in active map, return it immediately
      const activeWorktree = this.activeWorktrees.get(issueId);
      if (activeWorktree && activeWorktree.worktreePath === worktreePath) {
        this.logger.info(`Returning existing active worktree for ${issueId}`, { issueId });
        return activeWorktree;
      }

      if (existingWorktree) {
        this.logger.info(`Using existing worktree at ${worktreePath}`, { issueId });
      } else {
        const args = ['worktree', 'add'];

        if (!existingBranch) {
          args.push('-b', branchName);
        } else {
          // Branch exists but worktree doesn't - use force to recreate
          args.push('-f');
        }

        args.push(worktreePath);

        if (baseBranch) {
          args.push(baseBranch);
        } else if (existingBranch) {
          args.push(branchName);
        }

        try {
          // ATOMIC OPERATION: Create worktree and checkout branch together
          await execAsync(`git ${args.join(' ')}`, { cwd: repositoryPath });
          this.logger.logWorktree('create', issueId, worktreePath, true);
        } catch (gitError) {
          const errorMsg = gitError instanceof Error ? gitError.message : String(gitError);
          this.handleGitError(errorMsg, issueId, repositoryPath, worktreePath);
        }
      }

      // ATOMIC CHECK: Only checkout if we just created the worktree (not existing)
      // This prevents race condition where another concurrent call already checked out
      if (existingBranch && !existingWorktree) {
        try {
          // Double-check we're on the right branch under lock
          const { stdout: currentBranch } = await execAsync('git branch --show-current', { cwd: worktreePath });
          if (currentBranch.trim() !== branchName) {
            await execAsync(`git checkout ${branchName}`, { cwd: worktreePath });
            this.logger.info(`Switched to existing branch ${branchName}`, { issueId });
          } else {
            this.logger.info(`Already on correct branch ${branchName}`, { issueId });
          }
        } catch (checkoutError) {
          this.logger.warn(`Failed to checkout branch ${branchName}`, { issueId, error: checkoutError });
          // Don't throw - worktree is created, just couldn't checkout
        }
      }

      // Create symlinks for shared assets
      if (sharedAssets && sharedAssets.length > 0) {
        for (const assetPath of sharedAssets) {
          if (existsSync(assetPath)) {
            try {
              const name = basename(assetPath);
              const result = this.symlinkFactory.createSymlink({
                worktreeDir: worktreePath,
                symlinkName: name,
                targetPath: assetPath
              });

              symlinks.push({
                name,
                sourcePath: assetPath,
                targetPath: result.symlinkPath,
                created: result.success
              });
            } catch (symlinkError) {
              this.logger.warn(`Failed to create symlink for ${assetPath}`, { issueId, error: symlinkError });
              // Don't throw - worktree is functional without symlinks
            }
          }
        }
      }

      const worktreeInfo: WorktreeInfo = {
        issueId,
        worktreePath,
        repositoryPath,
        branchName,
        mode,
        sessionId,
        baseCommit,
        createdAt: new Date(),
        symlinks
      };

      this.activeWorktrees.set(issueId, worktreeInfo);
      this.logger.info(`Worktree created successfully`, { issueId, worktreePath, branchName });
      return worktreeInfo;

    } catch (error) {
      // Log the error before rethrowing
      this.logger.logError(error, issueId);
      throw error;
    }
  }

  /**
   * Handle git errors and classify them appropriately
   */
  private handleGitError(
    errorMsg: string,
    issueId: string,
    repositoryPath: string,
    worktreePath: string
  ): never {
    if (errorMsg.includes('Permission denied')) {
      throw new WorktreeError(
        `Permission denied accessing repository: ${repositoryPath}`,
        'PERMISSION_DENIED',
        issueId,
        worktreePath,
        { repositoryPath, errorMessage: errorMsg }
      );
    }

    if (errorMsg.includes('No space left on device')) {
      throw new WorktreeError(
        `Disk full: cannot create worktree`,
        'DISK_SPACE',
        issueId,
        worktreePath,
        { errorMessage: errorMsg }
      );
    }

    if (errorMsg.includes('already exists')) {
      throw new WorktreeError(
        `Worktree already exists: ${worktreePath}`,
        'WORKTREE_EXISTS',
        issueId,
        worktreePath
      );
    }

    throw new WorktreeError(
      `Git command failed: ${errorMsg}`,
      'GIT_ERROR',
      issueId,
      worktreePath,
      { errorMessage: errorMsg, command: 'git worktree add' }
    );
  }

  getWorktreePath(issueId: string): string {
    const worktreeInfo = this.activeWorktrees.get(issueId);
    if (worktreeInfo) {
      return worktreeInfo.worktreePath;
    }
    return this.getWorktreeBasePath(issueId);
  }

  async cleanupWorktree(issueId: string, preserve = false): Promise<void> {
    // Acquire exclusive lock for this issue's worktree operations
    const lock = this.worktreeLocks.get(issueId);
    if (lock) {
      await lock.runExclusive(async () => {
        await this.cleanupWorktreeLocked(issueId, preserve);
      });
    } else {
      // No lock exists, just cleanup
      await this.cleanupWorktreeLocked(issueId, preserve);
    }
  }

  /**
   * Internal method to cleanup worktree with lock already held
   * Enforces commit before cleanup if there are uncommitted changes
   */
  private async cleanupWorktreeLocked(issueId: string, preserve = false): Promise<void> {
    const worktreeInfo = this.activeWorktrees.get(issueId);

    if (!worktreeInfo) {
      this.logger.debug(`No active worktree found for issue ${issueId}`);
      return;
    }

    if (preserve) {
      this.logger.logWorktree('preserve', issueId, worktreeInfo.worktreePath, true);
      this.activeWorktrees.delete(issueId);
      this.worktreeLocks.delete(issueId);
      return;
    }

    // ENFORCEMENT: Check for uncommitted changes before cleanup
    try {
      const hasChanges = await this.gitService.hasUncommittedChanges(worktreeInfo.worktreePath);

      if (hasChanges) {
        this.logger.warn(`Uncommitted changes detected in ${issueId}, attempting auto-commit`, { issueId });

        try {
          // Stage all changes and auto-commit with default message
          const commitSha = await this.gitService.commit(worktreeInfo.worktreePath, {
            message: `jinyang: Session completion - ${issueId}`,
            noVerify: true,
            stageAll: true
          });

          if (commitSha) {
            this.logger.info(`Auto-committed changes for ${issueId}: ${commitSha.substring(0, 8)}`);
          } else {
            throw new WorktreeError(
              `Failed to auto-commit uncommitted changes in ${issueId}`,
              'GIT_ERROR',
              issueId,
              worktreeInfo.worktreePath,
              { reason: 'Auto-commit returned no SHA' }
            );
          }
        } catch (commitError) {
          const errorMsg = commitError instanceof Error ? commitError.message : String(commitError);
          this.logger.error(`Failed to auto-commit changes for ${issueId}`, { error: errorMsg });

          // BLOCK CLEANUP: Do not proceed if we can't commit
          throw new WorktreeError(
            `Cannot cleanup worktree: uncommitted changes exist and auto-commit failed: ${errorMsg}`,
            'GIT_ERROR',
            issueId,
            worktreeInfo.worktreePath,
            { errorMessage: errorMsg }
          );
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      // If it's already a WorktreeError, re-throw it
      if (error instanceof WorktreeError) {
        throw error;
      }
      this.logger.error(`Failed to check uncommitted changes for ${issueId}`, { error: errorMsg });
      throw new WorktreeError(
        `Failed to check uncommitted changes: ${errorMsg}`,
        'GIT_ERROR',
        issueId,
        worktreeInfo.worktreePath,
        { errorMessage: errorMsg }
      );
    }

    try {
      await execAsync(`git worktree remove ${worktreeInfo.worktreePath}`, {
        cwd: worktreeInfo.repositoryPath
      });
      this.logger.logWorktree('cleanup', issueId, worktreeInfo.worktreePath, true);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (!errorMsg.includes('not a working tree')) {
        this.logger.logWorktree('cleanup', issueId, worktreeInfo.worktreePath, false, errorMsg);

        // Attempt force removal
        try {
          rmSync(worktreeInfo.worktreePath, { recursive: true, force: true });
          this.logger.info(`Force removed worktree directory`, { issueId, worktreePath: worktreeInfo.worktreePath });
        } catch (cleanupError) {
          const cleanupMsg = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
          this.logger.error(`Failed to force remove worktree`, { issueId, error: cleanupMsg });

          // If force removal also failed, log but don't throw - this is cleanup
          if (cleanupMsg.includes('Permission denied')) {
            this.logger.warn(`Permission denied removing worktree - may need manual cleanup`, { issueId, worktreePath: worktreeInfo.worktreePath });
          }
        }
      }
    }

    this.activeWorktrees.delete(issueId);
    this.worktreeLocks.delete(issueId);
  }

  async getGitStatus(issueId: string): Promise<GitStatus> {
    const worktreeInfo = this.activeWorktrees.get(issueId);

    if (!worktreeInfo) {
      throw new WorktreeError(
        `No active worktree for issue ${issueId}`,
        'GIT_ERROR',
        issueId,
        undefined
      );
    }

    try {
      return await this.gitService.getStatus(worktreeInfo.worktreePath);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new WorktreeError(
        `Failed to get git status: ${errorMsg}`,
        'GIT_ERROR',
        issueId,
        worktreeInfo.worktreePath,
        { errorMessage: errorMsg }
      );
    }
  }

  /**
   * Check if worktree has uncommitted changes
   * @param issueId - The Linear issue ID
   * @returns true if there are uncommitted changes
   */
  async hasUncommittedChanges(issueId: string): Promise<boolean> {
    const worktreeInfo = this.activeWorktrees.get(issueId);

    if (!worktreeInfo) {
      return false;
    }

    return await this.gitService.hasUncommittedChanges(worktreeInfo.worktreePath);
  }

  /**
   * Commit any uncommitted changes in the worktree
   * @param issueId - The Linear issue ID
   * @param message - Commit message
   * @returns The commit SHA or undefined if failed
   */
  async commitChanges(issueId: string, message: string): Promise<string | undefined> {
    const worktreeInfo = this.activeWorktrees.get(issueId);

    if (!worktreeInfo) {
      throw new WorktreeError(
        `No active worktree for issue ${issueId}`,
        'GIT_ERROR',
        issueId,
        undefined
      );
    }

    // Check if there are changes to commit
    const hasChanges = await this.gitService.hasUncommittedChanges(worktreeInfo.worktreePath);

    if (!hasChanges) {
      this.logger.info(`No uncommitted changes to commit for ${issueId}`);
      return undefined;
    }

    try {
      const sha = await this.gitService.commit(worktreeInfo.worktreePath, {
        message,
        noVerify: true
      });

      this.logger.info(`Committed changes for ${issueId}: ${sha?.substring(0, 8)}`);
      return sha;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new WorktreeError(
        `Failed to commit changes: ${errorMsg}`,
        'GIT_ERROR',
        issueId,
        worktreeInfo.worktreePath,
        { errorMessage: errorMsg }
      );
    }
  }

  async cleanupOrphanedWorktrees(maxAgeHours = ORPHANED_WORKTREE_THRESHOLD_HOURS): Promise<number> {
    let cleaned = 0;
    let failed = 0;
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

    try {
      if (!existsSync(this.basePath)) {
        return 0;
      }

      const issueDirs = readdirSync(this.basePath);
      this.logger.info(`Checking ${issueDirs.length} directories for orphaned worktrees`);

      for (const issueId of issueDirs) {
        // Skip active worktrees - they should not be cleaned up
        if (this.activeWorktrees.has(issueId)) {
          continue;
        }

        const issuePath = join(this.basePath, issueId);

        try {
          const stat = statSync(issuePath);
          const age = now - stat.mtimeMs;

          if (age > maxAgeMs) {
            try {
              rmSync(issuePath, { recursive: true, force: true });
              this.logger.logWorktree('cleanup_orphaned', issueId, issuePath, true);
              cleaned++;
            } catch (cleanupError) {
              const errorMsg = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
              this.logger.logWorktree('cleanup_orphaned', issueId, issuePath, false, errorMsg);
              failed++;
            }
          }
        } catch (statError) {
          const errorMsg = statError instanceof Error ? statError.message : String(statError);
          this.logger.warn(`Failed to stat directory ${issuePath}`, { error: errorMsg });
          failed++;
        }
      }

      if (failed > 0) {
        this.logger.warn(`Failed to clean up ${failed} orphaned worktrees`, { cleaned, failed });
      } else {
        this.logger.info(`Successfully cleaned up ${cleaned} orphaned worktrees`);
      }

      return cleaned;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to cleanup orphaned worktrees`, { error: errorMsg });

      throw new WorktreeError(
        `Failed to cleanup orphaned worktrees: ${errorMsg}`,
        'ORPHANED_CLEANUP_FAILED',
        undefined,
        this.basePath,
        { cleanedCount: cleaned, failedCount: failed }
      );
    }
  }

  hasActiveWorktree(issueId: string): boolean {
    return this.activeWorktrees.has(issueId);
  }

  getActiveWorktree(issueId: string): WorktreeInfo | undefined {
    return this.activeWorktrees.get(issueId);
  }

  getActiveWorktrees(): Map<string, WorktreeInfo> {
    return new Map(this.activeWorktrees);
  }

  async cleanupAll(preserve = false): Promise<number> {
    let removed = 0;
    const errors: Array<{ issueId: string; error: string }> = [];

    for (const [issueId] of this.activeWorktrees) {
      try {
        await this.cleanupWorktree(issueId, preserve);
        removed++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push({ issueId, error: errorMsg });
        this.logger.error(`Failed to cleanup worktree for ${issueId}`, { error: errorMsg });
      }
    }

    if (errors.length > 0) {
      this.logger.warn(`Failed to cleanup ${errors.length} worktrees`, { errors });
    }

    return removed;
  }
}

export { BASE_WORKTREE_PATH, ORPHANED_WORKTREE_THRESHOLD_HOURS };

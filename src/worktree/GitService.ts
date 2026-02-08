import { exec, execSync } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GitStatus {
  isClean: boolean;
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
  commit: string;
  branch: string;
}

export interface GitCommitOptions {
  message: string;
  allowEmpty?: boolean;
  noVerify?: boolean;
  /** Run git add -A before commit to stage all changes */
  stageAll?: boolean;
}

export class GitService {
  /**
   * Stage all changes (tracked + untracked) in the worktree
   * @param worktreePath - Path to the git worktree
   * @returns true if staging succeeded
   */
  async stageAll(worktreePath: string): Promise<boolean> {
    try {
      await execAsync('git add -A', { cwd: worktreePath });
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Git stage failed: ${errorMsg}`);
    }
  }

  /**
   * Execute git commit with the specified message
   * @param worktreePath - Path to the git worktree
   * @param options - Commit options
   * @returns The commit SHA or undefined if failed
   */
  async commit(worktreePath: string, options: GitCommitOptions): Promise<string | undefined> {
    try {
      // Stage all changes before commit if stageAll is requested
      if (options.stageAll) {
        await this.stageAll(worktreePath);
      }

      const args = ['commit', '-m', options.message];

      if (options.allowEmpty) {
        args.push('--allow-empty');
      }

      if (options.noVerify) {
        args.push('--no-verify');
      }

      await execAsync(`git ${args.join(' ')}`, { cwd: worktreePath });

      // Return the new commit SHA
      return await this.getCurrentCommit(worktreePath);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Git commit failed: ${errorMsg}`);
    }
  }

  /**
   * Push commits to the remote repository
   * @param worktreePath - Path to the git worktree
   * @param branchName - Optional branch name (uses current branch if not provided)
   * @returns true if push succeeded
   */
  async push(worktreePath: string, branchName?: string): Promise<boolean> {
    try {
      const targetBranch = branchName || await this.getCurrentBranch(worktreePath);
      await execAsync(`git push origin ${targetBranch}`, { cwd: worktreePath });
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Git push failed: ${errorMsg}`);
    }
  }

  /**
   * Push HEAD to a specific remote ref (e.g., push worktree branch to master)
   * @param worktreePath - Path to the git worktree
   * @param targetRef - Remote ref to push to (e.g., 'master')
   * @returns true if push succeeded
   */
  async pushToRef(worktreePath: string, targetRef: string): Promise<boolean> {
    try {
      await execAsync(`git push origin HEAD:${targetRef}`, { cwd: worktreePath });
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Git push to ${targetRef} failed: ${errorMsg}`);
    }
  }

  /**
   * Sync worktree to latest remote ref (fetch + reset)
   * Ensures the worktree starts from the latest remote commit
   * @param worktreePath - Path to the git worktree
   * @param remoteBranch - Remote branch to sync to (e.g., 'master')
   */
  async syncToRemote(worktreePath: string, remoteBranch: string): Promise<void> {
    try {
      await execAsync(`git fetch origin ${remoteBranch}`, { cwd: worktreePath });
      await execAsync(`git reset --hard origin/${remoteBranch}`, { cwd: worktreePath });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Git sync to origin/${remoteBranch} failed: ${errorMsg}`);
    }
  }

  /**
   * Stash any uncommitted changes
   * @param worktreePath - Path to the git worktree
   * @param message - Optional stash message
   * @returns true if stash succeeded
   */
  async stash(worktreePath: string, message?: string): Promise<boolean> {
    try {
      const args = ['stash'];
      if (message) {
        args.push('push', '-m', message);
      }
      await execAsync(`git ${args.join(' ')}`, { cwd: worktreePath });
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Git stash failed: ${errorMsg}`);
    }
  }

  /**
   * Check if there are uncommitted changes in the worktree
   * @param worktreePath - Path to the git worktree
   * @returns true if there are uncommitted changes
   */
  async hasUncommittedChanges(worktreePath: string): Promise<boolean> {
    try {
      const status = await this.getStatus(worktreePath);
      return !status.isClean;
    } catch {
      return false;
    }
  }

  /**
   * Get current git status for a worktree
   * @param worktreePath - Path to the git worktree
   * @returns GitStatus object
   */
  async getStatus(worktreePath: string): Promise<GitStatus> {
    try {
      const { stdout: statusOutput } = await execAsync('git status --porcelain', {
        cwd: worktreePath
      });

      const { stdout: branchOutput } = await execAsync('git branch --show-current', {
        cwd: worktreePath
      });

      const { stdout: commitOutput } = await execAsync('git rev-parse HEAD', {
        cwd: worktreePath
      });

      const modified: string[] = [];
      const added: string[] = [];
      const deleted: string[] = [];
      const untracked: string[] = [];

      statusOutput.split('\n').forEach(line => {
        if (line.length < 3) return;

        const status = line.substring(0, 2);
        const file = line.substring(3).trim();

        if (status[0] === 'M' || status[1] === 'M') modified.push(file);
        if (status[0] === 'A') added.push(file);
        if (status[0] === 'D' || status[1] === 'D') deleted.push(file);
        if (status === '??') untracked.push(file);
      });

      return {
        isClean: statusOutput.trim().length === 0,
        modified,
        added,
        deleted,
        untracked,
        commit: commitOutput.trim(),
        branch: branchOutput.trim()
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get git status: ${errorMsg}`);
    }
  }

  /**
   * Get the current commit SHA
   * @param worktreePath - Path to the git worktree
   * @returns The current commit SHA or undefined
   */
  async getCurrentCommit(worktreePath: string): Promise<string | undefined> {
    try {
      const { stdout } = await execAsync('git rev-parse HEAD', { cwd: worktreePath });
      const sha = stdout.trim();
      return sha.length === 40 ? sha : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Get the current branch name
   * @param worktreePath - Path to the git worktree
   * @returns The current branch name or undefined
   */
  async getCurrentBranch(worktreePath: string): Promise<string | undefined> {
    try {
      const { stdout } = await execAsync('git branch --show-current', { cwd: worktreePath });
      return stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Get commit message for a specific SHA
   * @param worktreePath - Path to the git worktree
   * @param commitSha - The commit SHA
   * @returns The commit message or undefined
   */
  async getCommitMessage(worktreePath: string, commitSha: string): Promise<string | undefined> {
    try {
      const { stdout } = await execAsync(`git log -1 --format=%B ${commitSha}`, {
        cwd: worktreePath
      });
      return stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Verify a commit exists and is valid
   * @param worktreePath - Path to the git worktree
   * @param commitSha - The commit SHA to verify
   * @returns true if the commit is valid
   */
  async verifyCommit(worktreePath: string, commitSha: string): Promise<boolean> {
    try {
      await execAsync(`git cat-file -t ${commitSha}`, { cwd: worktreePath });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if commit message contains the issue ID
   * @param worktreePath - Path to the git worktree
   * @param commitSha - The commit SHA
   * @param issueId - The Linear issue ID
   * @returns true if the commit message contains the issue ID
   */
  async verifyCommitMessageContainsIssueId(
    worktreePath: string,
    commitSha: string,
    issueId: string
  ): Promise<boolean> {
    try {
      const message = await this.getCommitMessage(worktreePath, commitSha);
      if (!message) return false;

      // Check for patterns: "feat(ROM-XXX):" or "ROM-XXX" in message
      const issuePattern = new RegExp(`${issueId}\\b|\\(${issueId}\\):`);
      return issuePattern.test(message);
    } catch {
      return false;
    }
  }

  /**
   * Sync version that commits and returns the SHA synchronously
   * @param worktreePath - Path to the git worktree
   * @param message - Commit message
   * @returns The commit SHA
   */
  commitSync(worktreePath: string, message: string): string | undefined {
    try {
      execSync(`git commit -m "${message}" --no-verify`, {
        cwd: worktreePath,
        stdio: 'pipe'
      });
      return this.getCurrentCommitSync(worktreePath);
    } catch {
      return undefined;
    }
  }

  /**
   * Sync version of getCurrentCommit
   * @param worktreePath - Path to the git worktree
   * @returns The current commit SHA
   */
  getCurrentCommitSync(worktreePath: string): string | undefined {
    try {
      const sha = execSync('git rev-parse HEAD', {
        cwd: worktreePath,
        encoding: 'utf8'
      }).trim();
      return sha.length === 40 ? sha : undefined;
    } catch {
      return undefined;
    }
  }
}

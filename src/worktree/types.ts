/**
 * Worktree types for jinyang
 * Provides isolated execution environments per issue
 */

export type WorktreeMode = 'main' | 'branch' | 'session';

export interface WorktreeInfo {
  issueId: string;
  worktreePath: string;
  repositoryPath: string;
  branchName: string;
  mode: WorktreeMode;
  sessionId?: string;
  baseCommit: string;
  createdAt: Date;
  symlinks: SymlinkInfo[];
}

export interface SymlinkInfo {
  name: string;
  sourcePath: string;
  targetPath: string;
  created: boolean;
}

export interface GitStatus {
  isClean: boolean;
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
  commit?: string;
  branch: string;
}

export interface WorktreeOptions {
  issueId: string;
  repositoryPath: string;
  mode: WorktreeMode;
  slug?: string;
  baseBranch?: string;
  sharedAssets?: string[];
}

export interface WorktreeManagerInterface {
  createWorktree(options: WorktreeOptions): Promise<WorktreeInfo>;
  getWorktreePath(issueId: string): string;
  cleanupWorktree(issueId: string, preserve?: boolean): Promise<void>;
  getGitStatus(issueId: string): Promise<GitStatus>;
  cleanupOrphanedWorktrees(maxAgeHours?: number): Promise<number>;
}

export interface WorktreeError extends Error {
  code: 'REPO_NOT_FOUND' | 'BRANCH_EXISTS' | 'WORKTREE_EXISTS' | 'GIT_ERROR' | 'PERMISSION_DENIED' | 'INVALID_MODE';
  issueId?: string;
}

export class WorktreeManagerError extends Error implements WorktreeError {
  code: WorktreeError['code'];
  issueId?: string;

  constructor(code: WorktreeError['code'], message: string, issueId?: string) {
    super(message);
    this.name = 'WorktreeManagerError';
    this.code = code;
    this.issueId = issueId;
  }
}

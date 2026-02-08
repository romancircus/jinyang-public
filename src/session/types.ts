export enum SessionState {
  STARTED = 'started',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
  ERROR = 'error'
}

export enum CompletionReason {
  SUCCESS = 'success',
  FAILURE = 'failure',
  CANCELLED = 'cancelled',
  TIMEOUT = 'timeout'
}

export enum CleanupAction {
  DELETE_WORKTREE = 'delete_worktree',
  ARCHIVE_SESSION = 'archive_session',
  RETAIN_SESSION = 'retain_session'
}

export interface SessionMetadata {
  id: string;
  linearIssueId: string;
  repository: string;
  worktreePath: string;
  state: SessionState;
  pid?: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  completionReason?: CompletionReason;
  commitSha?: string | null;
  errorMessage?: string;
  cleanupAction?: CleanupAction;
}

export interface SessionConfig {
  id: string;
  linearIssueId: string;
  repository: string;
  worktreePath: string;
  gitCommitRequired: boolean;
  cleanupAction: CleanupAction;
}

export interface Session {
  metadata: SessionMetadata;
  cleanup: () => Promise<void>;
  complete: (reason: CompletionReason, commitSha?: string) => Promise<void>;
  fail: (error: Error) => Promise<void>;
}

export class SessionError extends Error {
  constructor(
    message: string,
    public sessionId: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'SessionError';
  }
}
import { LinearClient, IssueState } from './client.js';

export interface SpawnResult {
  success: boolean;
  exitCode: number;
  output?: string;
  error?: string;
  duration?: number;
  filesChanged?: string[];
  commitHash?: string;
  gitCommits?: Array<{
    sha: string;
    message: string;
    author?: string;
    timestamp?: string;
  }>;
  provider?: string;
}

export interface ExecutionContext {
  provider: string;
  issueId: string;
  worktreePath?: string;
}

export class LinearUpdater {
  private client: LinearClient;

  constructor(configPath?: string) {
    this.client = new LinearClient(configPath);
  }

  async onSessionStarted(issueId: string): Promise<void> {
    try {
      await this.client.updateIssueState(issueId, 'in_progress');
      console.log(`[LinearUpdater] Issue ${issueId} marked as In Progress`);
    } catch (error) {
      console.error(
        `[LinearUpdater] Failed to mark issue ${issueId} as In Progress:`,
        error
      );
      throw error;
    }
  }

  async onSessionCompleted(
    issueId: string,
    result: SpawnResult,
    context?: ExecutionContext
  ): Promise<void> {
    try {
      // State update must succeed first
      await this.client.updateIssueState(issueId, 'done');

      // Label + comment are independent — run in parallel
      const comment = this.formatSuccessComment(result, context);
      const [labelResult, commentResult] = await Promise.allSettled([
        this.client.addLabel(issueId, 'jinyang:executed'),
        this.client.postComment(issueId, comment),
      ]);

      // Log failures but don't throw — state update (the important part) already succeeded
      if (labelResult.status === 'rejected') {
        console.error(`[LinearUpdater] Failed to add label to ${issueId}:`, labelResult.reason);
      }
      if (commentResult.status === 'rejected') {
        console.error(`[LinearUpdater] Failed to post comment to ${issueId}:`, commentResult.reason);
      }

      console.log(
        `[LinearUpdater] Issue ${issueId} marked as Done with success comment`
      );
    } catch (error) {
      console.error(
        `[LinearUpdater] Failed to complete issue ${issueId}:`,
        error
      );
      throw error;
    }
  }

  async onSessionFailed(
    issueId: string,
    error: Error,
    context?: ExecutionContext
  ): Promise<void> {
    try {
      // State update must succeed first
      await this.client.updateIssueState(issueId, 'canceled');

      // Label + comment are independent — run in parallel
      const comment = this.formatFailureComment(error, context);
      const [labelResult, commentResult] = await Promise.allSettled([
        this.client.addLabel(issueId, 'jinyang:failed'),
        this.client.postComment(issueId, comment),
      ]);

      if (labelResult.status === 'rejected') {
        console.error(`[LinearUpdater] Failed to add label to ${issueId}:`, labelResult.reason);
      }
      if (commentResult.status === 'rejected') {
        console.error(`[LinearUpdater] Failed to post comment to ${issueId}:`, commentResult.reason);
      }

      console.log(
        `[LinearUpdater] Issue ${issueId} marked as Canceled with error comment`
      );
    } catch (err) {
      console.error(
        `[LinearUpdater] Failed to mark issue ${issueId} as Canceled:`,
        err
      );
      throw err;
    }
  }

  /**
   * Format success comment according to PRD specification
   */
  private formatSuccessComment(
    result: SpawnResult,
    context?: ExecutionContext
  ): string {
    const lines: string[] = ['## Execution Complete ✅', ''];

    lines.push(`**Status:** Success`);

    if (result.duration !== undefined) {
      lines.push(`**Duration:** ${this.formatDuration(result.duration)}`);
    }

    if (context?.provider) {
      lines.push(`**Provider:** ${context.provider}`);
    }

    // Git Commits section
    const commits = result.gitCommits || [];
    if (commits.length > 0 || result.commitHash) {
      lines.push('', '**Git Commits:**');
      if (commits.length > 0) {
        for (const commit of commits) {
          lines.push(`- \`${commit.sha.slice(0, 7)}\` ${commit.message}`);
        }
      } else if (result.commitHash) {
        lines.push(`- \`${result.commitHash.slice(0, 7)}\` ${result.commitHash}`);
      }
    }

    // Files Changed section
    if (result.filesChanged && result.filesChanged.length > 0) {
      lines.push('', '**Files Modified:**');
      for (const file of result.filesChanged) {
        lines.push(`- ${file}`);
      }
    }

    // Worktree info
    if (context?.worktreePath) {
      lines.push('', `**Worktree:** \`${context.worktreePath}\``);
    }

    return lines.join('\n');
  }

  /**
   * Format failure comment according to PRD specification
   */
  private formatFailureComment(
    error: Error,
    context?: ExecutionContext
  ): string {
    const lines: string[] = ['## Execution Failed ❌', ''];

    lines.push(`**Status:** Failed`);
    lines.push(`**Error:** ${error.message}`);

    if (context?.provider) {
      lines.push(`**Provider:** ${context.provider}`);
    }

    if (error.stack) {
      lines.push('', '**Error Details:**');
      lines.push('```');
      lines.push(error.stack.slice(0, 1500));
      if (error.stack.length > 1500) {
        lines.push('...(truncated)');
      }
      lines.push('```');
    }

    if (context?.worktreePath) {
      lines.push(
        '',
        `**Worktree preserved at:** \`${context.worktreePath}\``
      );
      lines.push('*Review the error and retry if needed.*');
    }

    return lines.join('\n');
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}m ${minutes % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  // Public API methods
  async postComment(issueId: string, message: string): Promise<void> {
    return this.client.postComment(issueId, message);
  }

  async updateState(issueId: string, state: IssueState): Promise<void> {
    return this.client.updateIssueState(issueId, state);
  }

  async addLabel(issueId: string, label: string): Promise<void> {
    return this.client.addLabel(issueId, label);
  }

  async getIssue(issueId: string) {
    return this.client.getIssue(issueId);
  }
}

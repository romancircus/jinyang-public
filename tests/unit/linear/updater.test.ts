import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LinearUpdater, SpawnResult, ExecutionContext } from '../../../src/linear/updater.js';

// Create a mock client factory
const createMockClient = () => ({
  updateIssueState: vi.fn(),
  postComment: vi.fn(),
  addLabel: vi.fn(),
  getIssue: vi.fn(),
});

describe('LinearUpdater', () => {
  let updater: LinearUpdater;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Create mock client
    mockClient = createMockClient();
    
    // Create updater and inject mock client
    updater = new LinearUpdater();
    (updater as any).client = mockClient;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('onSessionStarted', () => {
    it('should update issue state to in_progress', async () => {
      mockClient.updateIssueState.mockResolvedValue(undefined);

      await updater.onSessionStarted('ROM-373');

      expect(mockClient.updateIssueState).toHaveBeenCalledWith(
        'ROM-373',
        'in_progress'
      );
    });

    it('should throw error when state update fails', async () => {
      const error = new Error('API Error');
      mockClient.updateIssueState.mockRejectedValue(error);

      await expect(updater.onSessionStarted('ROM-373')).rejects.toThrow('API Error');
    });
  });

  describe('onSessionCompleted', () => {
    it('should update state to done and add executed label', async () => {
      mockClient.updateIssueState.mockResolvedValue(undefined);
      mockClient.addLabel.mockResolvedValue(undefined);
      mockClient.postComment.mockResolvedValue(undefined);

      const result: SpawnResult = {
        success: true,
        exitCode: 0,
        duration: 154000,
        filesChanged: ['src/auth/login.ts', 'src/auth/types.ts'],
        gitCommits: [
          { sha: 'a1b2c3d4e5f6', message: 'feat: add user authentication' },
          { sha: 'e4f5g6h7i8j9', message: 'fix: handle edge case' },
        ],
      };

      const context: ExecutionContext = {
        provider: 'opencode',
        issueId: 'ROM-373',
      };

      await updater.onSessionCompleted('ROM-373', result, context);

      expect(mockClient.updateIssueState).toHaveBeenCalledWith('ROM-373', 'done');
      expect(mockClient.addLabel).toHaveBeenCalledWith('ROM-373', 'jinyang:executed');
      expect(mockClient.postComment).toHaveBeenCalled();
    });

    it('should format success comment with PRD spec', async () => {
      mockClient.updateIssueState.mockResolvedValue(undefined);
      mockClient.addLabel.mockResolvedValue(undefined);
      mockClient.postComment.mockResolvedValue(undefined);

      const result: SpawnResult = {
        success: true,
        exitCode: 0,
        duration: 154000,
        filesChanged: ['src/auth/login.ts', 'src/auth/types.ts'],
        gitCommits: [
          { sha: 'a1b2c3d4e5f6', message: 'feat: add user authentication' },
          { sha: 'e4f5g6h7i8j9', message: 'fix: handle edge case' },
        ],
      };

      const context: ExecutionContext = {
        provider: 'opencode',
        issueId: 'ROM-373',
        worktreePath: '/tmp/worktrees/ROM-373',
      };

      await updater.onSessionCompleted('ROM-373', result, context);

      const commentArg = mockClient.postComment.mock.calls[0][1];
      expect(commentArg).toContain('## Execution Complete ✅');
      expect(commentArg).toContain('**Status:** Success');
      expect(commentArg).toContain('**Duration:** 2m 34s');
      expect(commentArg).toContain('**Provider:** opencode');
      expect(commentArg).toContain('**Git Commits:**');
      expect(commentArg).toContain('`a1b2c3d` feat: add user authentication');
      expect(commentArg).toContain('`e4f5g6h` fix: handle edge case');
      expect(commentArg).toContain('**Files Modified:**');
      expect(commentArg).toContain('- src/auth/login.ts');
      expect(commentArg).toContain('- src/auth/types.ts');
      expect(commentArg).toContain('**Worktree:** `/tmp/worktrees/ROM-373`');
    });

    it('should handle missing optional fields gracefully', async () => {
      mockClient.updateIssueState.mockResolvedValue(undefined);
      mockClient.addLabel.mockResolvedValue(undefined);
      mockClient.postComment.mockResolvedValue(undefined);

      const result: SpawnResult = {
        success: true,
        exitCode: 0,
      };

      await updater.onSessionCompleted('ROM-373', result);

      const commentArg = mockClient.postComment.mock.calls[0][1];
      expect(commentArg).toContain('## Execution Complete ✅');
      expect(commentArg).not.toContain('Duration');
      expect(commentArg).not.toContain('Provider');
    });

    it('should format duration correctly for different time ranges', async () => {
      mockClient.updateIssueState.mockResolvedValue(undefined);
      mockClient.addLabel.mockResolvedValue(undefined);
      mockClient.postComment.mockResolvedValue(undefined);

      const testCases = [
        { duration: 45000, expected: '45s' },
        { duration: 154000, expected: '2m 34s' },
        { duration: 3661000, expected: '1m 1s' },  // 1h 1m 1s -> shows as h m format
      ];

      for (const { duration, expected } of testCases) {
        vi.clearAllMocks();
        mockClient.updateIssueState.mockResolvedValue(undefined);
        mockClient.addLabel.mockResolvedValue(undefined);
        mockClient.postComment.mockResolvedValue(undefined);
        
        const result: SpawnResult = { success: true, exitCode: 0, duration };
        await updater.onSessionCompleted('ROM-373', result);
        const commentArg = mockClient.postComment.mock.calls[0][1];
        expect(commentArg).toContain(`**Duration:** ${expected}`);
      }
    });

    it('should throw error when completion update fails', async () => {
      const error = new Error('API Error');
      mockClient.updateIssueState.mockRejectedValue(error);

      const result: SpawnResult = { success: true, exitCode: 0 };

      await expect(updater.onSessionCompleted('ROM-373', result)).rejects.toThrow(
        'API Error'
      );
    });
  });

  describe('onSessionFailed', () => {
    it('should update state to canceled and add failed label', async () => {
      mockClient.updateIssueState.mockResolvedValue(undefined);
      mockClient.addLabel.mockResolvedValue(undefined);
      mockClient.postComment.mockResolvedValue(undefined);

      const error = new Error('Task execution failed');
      const context: ExecutionContext = {
        provider: 'opencode',
        issueId: 'ROM-373',
        worktreePath: '/tmp/worktrees/ROM-373',
      };

      await updater.onSessionFailed('ROM-373', error, context);

      expect(mockClient.updateIssueState).toHaveBeenCalledWith('ROM-373', 'canceled');
      expect(mockClient.addLabel).toHaveBeenCalledWith('ROM-373', 'jinyang:failed');
      expect(mockClient.postComment).toHaveBeenCalled();
    });

    it('should format failure comment with PRD spec', async () => {
      mockClient.updateIssueState.mockResolvedValue(undefined);
      mockClient.addLabel.mockResolvedValue(undefined);
      mockClient.postComment.mockResolvedValue(undefined);

      const error = new Error('Task execution failed');
      error.stack = 'Error: Task execution failed\n    at Test.method (test.ts:1:1)';

      const context: ExecutionContext = {
        provider: 'opencode',
        issueId: 'ROM-373',
        worktreePath: '/tmp/worktrees/ROM-373',
      };

      await updater.onSessionFailed('ROM-373', error, context);

      const commentArg = mockClient.postComment.mock.calls[0][1];
      expect(commentArg).toContain('## Execution Failed ❌');
      expect(commentArg).toContain('**Status:** Failed');
      expect(commentArg).toContain('**Error:** Task execution failed');
      expect(commentArg).toContain('**Provider:** opencode');
      expect(commentArg).toContain('**Error Details:**');
      expect(commentArg).toContain('```');
      expect(commentArg).toContain('**Worktree preserved at:** `/tmp/worktrees/ROM-373`');
      expect(commentArg).toContain('*Review the error and retry if needed.*');
    });

    it('should truncate long stack traces', async () => {
      mockClient.updateIssueState.mockResolvedValue(undefined);
      mockClient.addLabel.mockResolvedValue(undefined);
      mockClient.postComment.mockResolvedValue(undefined);

      const error = new Error('Task execution failed');
      // Create a stack trace larger than 1500 chars to trigger truncation
      error.stack = 'Error: Task execution failed\n' + '    at SomeVeryLongClassName.someVeryLongMethodName (some/very/long/path/to/file.ts:123:45)\n'.repeat(50);

      await updater.onSessionFailed('ROM-373', error);

      const commentArg = mockClient.postComment.mock.calls[0][1];
      expect(commentArg).toContain('...(truncated)');
      expect(commentArg.length).toBeLessThan(3000);
    });

    it('should handle error without stack trace', async () => {
      mockClient.updateIssueState.mockResolvedValue(undefined);
      mockClient.addLabel.mockResolvedValue(undefined);
      mockClient.postComment.mockResolvedValue(undefined);

      const error = new Error('Simple error');
      delete error.stack;

      await updater.onSessionFailed('ROM-373', error);

      const commentArg = mockClient.postComment.mock.calls[0][1];
      expect(commentArg).toContain('## Execution Failed ❌');
      expect(commentArg).toContain('**Status:** Failed');
      expect(commentArg).not.toContain('**Error Details:**');
    });

    it('should throw error when failure update fails', async () => {
      const error = new Error('API Error');
      mockClient.updateIssueState.mockRejectedValue(error);

      await expect(updater.onSessionFailed('ROM-373', new Error('Task failed'))).rejects.toThrow(
        'API Error'
      );
    });
  });

  describe('public API methods', () => {
    it('should delegate postComment to client', async () => {
      mockClient.postComment.mockResolvedValue(undefined);

      await updater.postComment('ROM-373', 'Test comment');

      expect(mockClient.postComment).toHaveBeenCalledWith('ROM-373', 'Test comment');
    });

    it('should delegate updateState to client', async () => {
      mockClient.updateIssueState.mockResolvedValue(undefined);

      await updater.updateState('ROM-373', 'done');

      expect(mockClient.updateIssueState).toHaveBeenCalledWith('ROM-373', 'done');
    });

    it('should delegate addLabel to client', async () => {
      mockClient.addLabel.mockResolvedValue(undefined);

      await updater.addLabel('ROM-373', 'jinyang:executed');

      expect(mockClient.addLabel).toHaveBeenCalledWith('ROM-373', 'jinyang:executed');
    });

    it('should delegate getIssue to client', async () => {
      const mockIssue = {
        id: 'issue-123',
        identifier: 'ROM-373',
        title: 'Test Issue',
        state: { id: 'state-1', name: 'In Progress' },
        url: 'https://linear.app/issue/ROM-373',
        labels: ['jinyang:auto'],
      };
      mockClient.getIssue.mockResolvedValue(mockIssue);

      const result = await updater.getIssue('ROM-373');

      expect(mockClient.getIssue).toHaveBeenCalledWith('ROM-373');
      expect(result).toEqual(mockIssue);
    });
  });

  describe('comment format edge cases', () => {
    it('should handle commit hash fallback when gitCommits is empty', async () => {
      mockClient.updateIssueState.mockResolvedValue(undefined);
      mockClient.addLabel.mockResolvedValue(undefined);
      mockClient.postComment.mockResolvedValue(undefined);

      const result: SpawnResult = {
        success: true,
        exitCode: 0,
        commitHash: 'abc123def456',
        gitCommits: [],
      };

      await updater.onSessionCompleted('ROM-373', result);

      const commentArg = mockClient.postComment.mock.calls[0][1];
      expect(commentArg).toContain('**Git Commits:**');
      expect(commentArg).toContain('`abc123d` abc123def456');
    });

    it('should handle no files changed', async () => {
      mockClient.updateIssueState.mockResolvedValue(undefined);
      mockClient.addLabel.mockResolvedValue(undefined);
      mockClient.postComment.mockResolvedValue(undefined);

      const result: SpawnResult = {
        success: true,
        exitCode: 0,
        filesChanged: [],
      };

      await updater.onSessionCompleted('ROM-373', result);

      const commentArg = mockClient.postComment.mock.calls[0][1];
      expect(commentArg).not.toContain('**Files Modified:**');
    });

    it('should handle undefined filesChanged', async () => {
      mockClient.updateIssueState.mockResolvedValue(undefined);
      mockClient.addLabel.mockResolvedValue(undefined);
      mockClient.postComment.mockResolvedValue(undefined);

      const result: SpawnResult = {
        success: true,
        exitCode: 0,
      };

      await updater.onSessionCompleted('ROM-373', result);

      const commentArg = mockClient.postComment.mock.calls[0][1];
      expect(commentArg).not.toContain('**Files Modified:**');
    });
  });
});

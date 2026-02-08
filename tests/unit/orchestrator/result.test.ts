/**
 * Unit tests for ResultOrchestrator
 * @module tests/unit/orchestrator/result.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFile, ExecFileException } from 'child_process';
import { readdir, stat } from 'fs/promises';
import {
  ResultOrchestrator,
  createResultOrchestrator
} from '../../../src/orchestrator/result.js';
import {
  ExecutionEvent,
  VerificationStatus,
  VerificationError
} from '../../../src/orchestrator/types.js';

// Mock child_process
vi.mock('child_process', () => ({
  execFile: vi.fn()
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  stat: vi.fn()
}));

// Type-safe mock helpers
const mockExecFile = (execFile as unknown as ReturnType<typeof vi.fn>);
const mockReaddir = (readdir as unknown as ReturnType<typeof vi.fn>);
const mockStat = (stat as unknown as ReturnType<typeof vi.fn>);

describe('ResultOrchestrator', () => {
  let orchestrator: ResultOrchestrator;

  beforeEach(() => {
    orchestrator = new ResultOrchestrator();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseExecutionResult', () => {
    it('should parse git_commit tool calls', () => {
      const events: ExecutionEvent[] = [
        {
          type: 'tool_calls',
          tool_calls: [
            {
              function: {
                name: 'git_commit',
                arguments: {
                  hash: 'abc123def456',
                  message: 'feat: Add feature ROM-123'
                }
              }
            }
          ]
        }
      ];

      const result = orchestrator.parseExecutionResult(events);

      expect(result.gitCommits).toHaveLength(1);
      expect(result.gitCommits[0]).toEqual({
        sha: 'abc123def456',
        message: 'feat: Add feature ROM-123'
      });
    });

    it('should parse multiple git commits', () => {
      const events: ExecutionEvent[] = [
        {
          type: 'tool_calls',
          tool_calls: [
            {
              function: {
                name: 'git_commit',
                arguments: { hash: 'commit1', message: 'First commit' }
              }
            },
            {
              function: {
                name: 'git_commit',
                arguments: { hash: 'commit2', message: 'Second commit' }
              }
            }
          ]
        }
      ];

      const result = orchestrator.parseExecutionResult(events);

      expect(result.gitCommits).toHaveLength(2);
      expect(result.gitCommits[0].sha).toBe('commit1');
      expect(result.gitCommits[1].sha).toBe('commit2');
    });

    it('should parse write_file tool calls', () => {
      const events: ExecutionEvent[] = [
        {
          type: 'tool_calls',
          tool_calls: [
            {
              function: {
                name: 'write_file',
                arguments: { file_path: '/path/to/file.ts' }
              }
            }
          ]
        }
      ];

      const result = orchestrator.parseExecutionResult(events);

      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toBe('/path/to/file.ts');
    });

    it('should parse edit_file tool calls', () => {
      const events: ExecutionEvent[] = [
        {
          type: 'tool_calls',
          tool_calls: [
            {
              function: {
                name: 'edit_file',
                arguments: { file_path: '/path/to/existing.ts' }
              }
            }
          ]
        }
      ];

      const result = orchestrator.parseExecutionResult(events);

      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toBe('/path/to/existing.ts');
    });

    it('should handle mixed tool calls', () => {
      const events: ExecutionEvent[] = [
        {
          type: 'tool_calls',
          tool_calls: [
            {
              function: {
                name: 'write_file',
                arguments: { file_path: 'src/new.ts' }
              }
            },
            {
              function: {
                name: 'edit_file',
                arguments: { file_path: 'src/existing.ts' }
              }
            },
            {
              function: {
                name: 'git_commit',
                arguments: { hash: 'abc123', message: 'Add and edit files' }
              }
            }
          ]
        }
      ];

      const result = orchestrator.parseExecutionResult(events);

      expect(result.files).toHaveLength(2);
      expect(result.gitCommits).toHaveLength(1);
    });

    it('should remove duplicate files', () => {
      const events: ExecutionEvent[] = [
        {
          type: 'tool_calls',
          tool_calls: [
            {
              function: {
                name: 'write_file',
                arguments: { file_path: 'src/file.ts' }
              }
            },
            {
              function: {
                name: 'edit_file',
                arguments: { file_path: 'src/file.ts' }
              }
            }
          ]
        }
      ];

      const result = orchestrator.parseExecutionResult(events);

      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toBe('src/file.ts');
    });

    it('should capture error events', () => {
      const events: ExecutionEvent[] = [
        {
          type: 'session_failed',
          error: 'Execution failed'
        }
      ];

      const result = orchestrator.parseExecutionResult(events);

      expect(result.errors).toContain('Execution failed');
      expect(result.status).toBe('failure');
    });

    it('should handle empty events array', () => {
      const result = orchestrator.parseExecutionResult([]);

      expect(result.status).toBe('incomplete');
      expect(result.gitCommits).toHaveLength(0);
      expect(result.files).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle malformed events gracefully', () => {
      const events: ExecutionEvent[] = [
        {
          type: 'tool_calls',
          tool_calls: [
            {
              function: {
                name: 'git_commit',
                arguments: { hash: 'abc123' } // Missing message
              }
            },
            {
              function: {
                name: 'write_file',
                arguments: { content: 'test' } // Missing file_path
              }
            },
            {
              function: {} as any // No name
            }
          ]
        }
      ];

      const result = orchestrator.parseExecutionResult(events);

      expect(result.gitCommits).toHaveLength(0); // Missing message, so not added
      expect(result.files).toHaveLength(0); // Missing file_path, so not added
    });

    it('should mark status as success when commits and files exist', () => {
      const events: ExecutionEvent[] = [
        {
          type: 'tool_calls',
          tool_calls: [
            {
              function: {
                name: 'git_commit',
                arguments: { hash: 'abc123', message: 'Test' }
              }
            }
          ]
        }
      ];

      const result = orchestrator.parseExecutionResult(events);

      expect(result.status).toBe('success');
    });
  });

  describe('parseEventIncremental', () => {
    it('should accumulate results from multiple events', () => {
      const event1: ExecutionEvent = {
        type: 'tool_calls',
        tool_calls: [
          {
            function: {
              name: 'write_file',
              arguments: { file_path: 'file1.ts' }
            }
          }
        ]
      };

      const event2: ExecutionEvent = {
        type: 'tool_calls',
        tool_calls: [
          {
            function: {
              name: 'write_file',
              arguments: { file_path: 'file2.ts' }
            }
          }
        ]
      };

      let result = orchestrator.parseEventIncremental(event1);
      result = orchestrator.parseEventIncremental(event2, result);

      expect(result.files).toHaveLength(2);
      expect(result.files).toContain('file1.ts');
      expect(result.files).toContain('file2.ts');
    });

    it('should start fresh when no accumulator provided', () => {
      const event: ExecutionEvent = {
        type: 'tool_calls',
        tool_calls: [
          {
            function: {
              name: 'git_commit',
              arguments: { hash: 'abc123', message: 'Test' }
            }
          }
        ]
      };

      const result = orchestrator.parseEventIncremental(event);

      expect(result.gitCommits).toHaveLength(1);
      expect(result.files).toHaveLength(0);
    });
  });

  describe('verify', () => {
    const worktreePath = '/test/worktree';
    const baselineCommit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const issueId = 'ROM-364';
    const newCommit = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    function setupGitMocks(
      headCommit: string,
      catFileResult: string | null,
      logMessage: string
    ): void {
      let callIndex = 0;
      mockExecFile.mockImplementation(
        (
          _file: string,
          args: readonly string[] | null | undefined,
          _options: object,
          callback: ((error: ExecFileException | null, result: { stdout: string; stderr: string }) => void) | undefined
        ) => {
          if (!callback) return undefined;
          
          const arg0 = args?.[0];
          
          if (arg0 === 'rev-parse') {
            if (headCommit === 'error') {
              callback(new Error('fatal: not a git repository') as ExecFileException, { stdout: '', stderr: '' });
            } else {
              callback(null, { stdout: headCommit, stderr: '' });
            }
          } else if (arg0 === 'cat-file') {
            if (catFileResult === null) {
              callback(new Error('Not a valid object') as ExecFileException, { stdout: '', stderr: '' });
            } else {
              callback(null, { stdout: catFileResult, stderr: '' });
            }
          } else if (arg0 === 'log') {
            callback(null, { stdout: logMessage, stderr: '' });
          } else {
            callback(null, { stdout: '', stderr: '' });
          }
          
          callIndex++;
          return undefined;
        }
      );
    }

    it('should pass verification with valid new commit', async () => {
      setupGitMocks(newCommit, 'commit', `feat(ROM-364): test commit`);

      mockReaddir.mockResolvedValue([
        { name: 'file.ts', isDirectory: () => false, isFile: () => true } as any
      ]);
      mockStat.mockResolvedValue({ isFile: () => true } as any);

      const report = await orchestrator.verify(worktreePath, baselineCommit, issueId);

      expect(report.success).toBe(true);
      expect(report.currentCommit).toBe(newCommit);
      expect(report.checks.some(c => c.name === 'git_commit' && c.status === VerificationStatus.PASS)).toBe(true);
    });

    it('should fail if commit SHA is unchanged from baseline', async () => {
      setupGitMocks(baselineCommit, 'commit', 'Some commit message');

      await expect(orchestrator.verify(worktreePath, baselineCommit, issueId)).rejects.toThrow(VerificationError);
    });

    it('should fail if commit message does not contain issue ID', async () => {
      setupGitMocks(newCommit, 'commit', 'feat: some feature without issue ID');

      await expect(orchestrator.verify(worktreePath, baselineCommit, issueId)).rejects.toThrow(VerificationError);
    });

    it('should fail if no git commit exists', async () => {
      setupGitMocks('error', null, '');

      await expect(orchestrator.verify(worktreePath, baselineCommit, issueId)).rejects.toThrow(VerificationError);
    });

    it('should handle empty baseline commit', async () => {
      setupGitMocks(newCommit, 'commit', `feat(${issueId}): test commit`);

      mockReaddir.mockResolvedValue([
        { name: 'file.ts', isDirectory: () => false, isFile: () => true } as any
      ]);
      mockStat.mockResolvedValue({ isFile: () => true } as any);

      const report = await orchestrator.verify(worktreePath, undefined, issueId);

      expect(report.success).toBe(true);
      expect(report.baselineCommit).toBeUndefined();
    });

    it('should verify files exist in worktree', async () => {
      setupGitMocks(newCommit, 'commit', `feat(${issueId}): test commit`);

      let callCount = 0;
      mockReaddir.mockImplementation(async (path: string) => {
        callCount++;
        if (callCount === 1) {
          return [
            { name: 'src', isDirectory: () => true, isFile: () => false } as any,
            { name: 'file.ts', isDirectory: () => false, isFile: () => true } as any
          ];
        }
        return [];
      });

      mockStat.mockResolvedValue({ isFile: () => true } as any);

      const report = await orchestrator.verify(worktreePath, baselineCommit, issueId);

      expect(report.filesVerified.length).toBeGreaterThan(0);
      expect(report.checks.some(c => c.name === 'files_exist' && c.status === VerificationStatus.PASS)).toBe(true);
    });

    it('should fail if no files exist in worktree', async () => {
      setupGitMocks(newCommit, 'commit', `feat(${issueId}): test commit`);

      mockReaddir.mockResolvedValue([]);

      await expect(orchestrator.verify(worktreePath, baselineCommit, issueId)).rejects.toThrow(VerificationError);
    });

    it('should exclude .git directory from file verification', async () => {
      setupGitMocks(newCommit, 'commit', `feat(${issueId}): test commit`);

      let callCount = 0;
      mockReaddir.mockImplementation(async (path: string) => {
        callCount++;
        if (callCount === 1) {
          return [
            { name: '.git', isDirectory: () => true, isFile: () => false } as any,
            { name: 'src', isDirectory: () => true, isFile: () => false } as any
          ];
        }
        // Second call for src directory
        return [{ name: 'file.ts', isDirectory: () => false, isFile: () => true } as any];
      });

      mockStat.mockResolvedValue({ isFile: () => true } as any);

      const report = await orchestrator.verify(worktreePath, baselineCommit, issueId);

      expect(report.filesVerified.every(f => !f.includes('.git'))).toBe(true);
    });
  });

  describe('config management', () => {
    it('should use default config', () => {
      const orch = new ResultOrchestrator();
      const config = orch.getConfig();

      expect(config.requireGitCommit).toBe(true);
      expect(config.requireFileVerification).toBe(true);
      expect(config.excludePatterns).toContain('.git');
    });

    it('should allow custom config', () => {
      const orch = new ResultOrchestrator({
        requireGitCommit: false,
        excludePatterns: ['.git', 'node_modules']
      });
      const config = orch.getConfig();

      expect(config.requireGitCommit).toBe(false);
      expect(config.excludePatterns).toContain('node_modules');
    });

    it('should update config', () => {
      orchestrator.updateConfig({ requireGitCommit: false });
      const config = orchestrator.getConfig();

      expect(config.requireGitCommit).toBe(false);
    });
  });

  describe('createResultOrchestrator', () => {
    it('should create instance with default config', () => {
      const orch = createResultOrchestrator();
      expect(orch).toBeInstanceOf(ResultOrchestrator);
    });

    it('should create instance with custom config', () => {
      const orch = createResultOrchestrator({
        requireGitCommit: false
      });
      expect(orch.getConfig().requireGitCommit).toBe(false);
    });
  });

  describe('edge cases', () => {
    const worktreePath = '/test/worktree';
    const baselineCommit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const issueId = 'ROM-364';

    it('should handle events without tool_calls', () => {
      const events: ExecutionEvent[] = [
        { type: 'message', message: 'Hello' },
        { type: 'thinking', message: 'Thinking...' }
      ];

      const result = orchestrator.parseExecutionResult(events);

      expect(result.status).toBe('incomplete');
      expect(result.gitCommits).toHaveLength(0);
      expect(result.files).toHaveLength(0);
    });

    it('should handle tool_calls without function property', () => {
      const events: ExecutionEvent[] = [
        {
          type: 'tool_calls',
          tool_calls: [
            {} as any // No function property
          ]
        }
      ];

      const result = orchestrator.parseExecutionResult(events);

      expect(result.gitCommits).toHaveLength(0);
      expect(result.files).toHaveLength(0);
    });

    it('should handle invalid commit SHA length', async () => {
      mockExecFile.mockImplementation(
        (
          _file: string,
          args: readonly string[] | null | undefined,
          _options: object,
          callback: ((error: ExecFileException | null, result: { stdout: string; stderr: string }) => void) | undefined
        ) => {
          if (!callback) return undefined;
          
          const arg0 = args?.[0];
          
          if (arg0 === 'rev-parse') {
            callback(null, { stdout: 'short', stderr: '' }); // Invalid length
          }
          
          return undefined;
        }
      );

      await expect(orchestrator.verify(worktreePath, baselineCommit, issueId)).rejects.toThrow(VerificationError);
    });
  });
});

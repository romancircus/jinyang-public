/**
 * ResultOrchestrator - Verifies agent execution outcomes
 * @module src/orchestrator/result
 * @description Parses execution events and verifies git commits, file operations
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import {
  ExecutionEvent,
  ExecutionResult,
  GitCommit,
  FileOperation,
  ToolCall,
  VerificationReport,
  VerificationCheck,
  VerificationStatus,
  VerificationConfig,
  DEFAULT_VERIFICATION_CONFIG,
  VerificationError,
  ResultOrchestratorInterface
} from './types.js';

const execFileAsync = promisify(execFile);

/**
 * ResultOrchestrator parses agent execution events and verifies outcomes
 * 
 * Key verification rules:
 * - Git SHA must be DIFFERENT from baseline
 * - Commit message MUST contain issue ID (e.g., "ROM-123")
 * - Files MUST exist in worktree (excluding .git)
 * - Any failure = mark as FAILED with detailed error
 */
export class ResultOrchestrator implements ResultOrchestratorInterface {
  private config: VerificationConfig;

  constructor(config?: Partial<VerificationConfig>) {
    this.config = { ...DEFAULT_VERIFICATION_CONFIG, ...config };
  }

  /**
   * Parse execution events from OpenCode SSE stream
   * Extracts tool calls (git_commit, write_file, edit_file)
   * 
   * @param events - Array of execution events
   * @returns Parsed execution result with commits and files
   */
  parseExecutionResult(events: ExecutionEvent[]): ExecutionResult {
    const gitCommits: GitCommit[] = [];
    const files: string[] = [];
    const errors: string[] = [];

    for (const event of events) {
      // Parse tool_calls if present
      if (event.tool_calls && Array.isArray(event.tool_calls)) {
        for (const call of event.tool_calls) {
          this.parseToolCall(call, gitCommits, files);
        }
      }

      // Parse error messages
      if (event.error) {
        errors.push(event.error);
      }

      // Parse session failure events
      if (event.type === 'session_failed' || event.type === 'error') {
        const errorMsg = event.message || event.error || 'Unknown error';
        if (!errors.includes(errorMsg)) {
          errors.push(errorMsg);
        }
      }
    }

    // Determine status
    let status: ExecutionResult['status'] = 'incomplete';
    if (errors.length > 0) {
      status = 'failure';
    } else if (gitCommits.length > 0 || files.length > 0) {
      status = 'success';
    }

    return {
      status,
      gitCommits,
      files: [...new Set(files)], // Remove duplicates
      errors,
      rawEvents: events
    };
  }

  /**
   * Parse a single tool call and extract relevant data
   * 
   * @param call - Tool call object
   * @param gitCommits - Array to append commits to
   * @param files - Array to append file paths to
   */
  private parseToolCall(
    call: ToolCall,
    gitCommits: GitCommit[],
    files: string[]
  ): void {
    if (!call.function || !call.function.name) {
      return;
    }

    const functionName = call.function.name;
    const args = call.function.arguments || {};

    // Parse git_commit tool calls
    if (functionName === 'git_commit') {
      const sha = this.extractStringArg(args, 'hash');
      const message = this.extractStringArg(args, 'message');

      if (sha && message) {
        gitCommits.push({ sha, message });
      }
    }

    // Parse write_file tool calls
    if (functionName === 'write_file') {
      const filePath = this.extractStringArg(args, 'file_path');
      if (filePath) {
        files.push(filePath);
      }
    }

    // Parse edit_file tool calls
    if (functionName === 'edit_file') {
      const filePath = this.extractStringArg(args, 'file_path');
      if (filePath) {
        files.push(filePath);
      }
    }
  }

  /**
   * Extract string argument from tool call arguments
   * Handles both direct strings and nested objects
   * 
   * @param args - Arguments object
   * @param key - Key to extract
   * @returns String value or undefined
   */
  private extractStringArg(args: Record<string, unknown>, key: string): string | undefined {
    const value = args[key];
    if (typeof value === 'string') {
      return value;
    }
    return undefined;
  }

  /**
   * Parse events incrementally during streaming
   * Useful for real-time result tracking
   * 
   * @param event - Single execution event
   * @param accumulator - Current accumulated result
   * @returns Updated execution result accumulator
   */
  parseEventIncremental(
    event: ExecutionEvent,
    accumulator?: Partial<ExecutionResult>
  ): Partial<ExecutionResult> {
    const result: Partial<ExecutionResult> = accumulator || {
      gitCommits: [],
      files: [],
      errors: [],
      status: 'incomplete'
    };

    // Parse tool_calls
    if (event.tool_calls && Array.isArray(event.tool_calls)) {
      for (const call of event.tool_calls) {
        this.parseToolCall(
          call,
          result.gitCommits || [],
          result.files || []
        );
      }
    }

    // Capture errors
    if (event.error) {
      (result.errors ||= []).push(event.error);
    }

    if (event.type === 'session_failed' || event.type === 'error') {
      const errorMsg = event.message || event.error || 'Unknown error';
      if (!(result.errors || []).includes(errorMsg)) {
        (result.errors ||= []).push(errorMsg);
      }
    }

    return result;
  }

  /**
   * Verify execution results against worktree state
   * 
   * Verification pipeline:
   * 1. Verify git commit exists and is new
   * 2. Verify commit message contains issue ID
   * 3. Verify files exist in worktree
   * 4. Mark completion status
   * 
   * @param worktreePath - Path to the git worktree
   * @param baselineCommit - Baseline commit SHA (before execution)
   * @param issueId - Linear issue ID for validation
   * @returns Verification report
   * @throws VerificationError if verification fails
   */
  async verify(
    worktreePath: string,
    baselineCommit: string | undefined,
    issueId: string
  ): Promise<VerificationReport> {
    const checks: VerificationCheck[] = [];
    const errors: string[] = [];

    // Step 1: Verify git commit
    const gitCheck = await this.verifyGitCommit(worktreePath, baselineCommit, issueId);
    checks.push(gitCheck);

    if (gitCheck.status === VerificationStatus.FAIL) {
      errors.push(gitCheck.message || 'Git commit verification failed');
    }

    // Extract current commit SHA from git check
    const currentCommit = (gitCheck.details?.commitSha as string) || undefined;

    // Step 2: Verify files
    let filesVerified: string[] = [];
    let filesMissing: string[] = [];
    
    const filesCheck = await this.verifyFiles(worktreePath);
    checks.push(filesCheck);

    if (filesCheck.status === VerificationStatus.FAIL) {
      errors.push(filesCheck.message || 'File verification failed');
    }

    filesVerified = (filesCheck.details?.files as string[]) || [];
    filesMissing = (filesCheck.details?.missing as string[]) || [];

    // Determine overall success
    const success = errors.length === 0;
    const summary = success
      ? `Verification passed: ${filesVerified.length} files verified, commit ${currentCommit?.substring(0, 8)}`
      : `Verification failed: ${errors.join('; ')}`;

    const report: VerificationReport = {
      success,
      issueId,
      baselineCommit,
      currentCommit,
      checks,
      filesVerified,
      filesMissing,
      errors,
      summary
    };

    if (!success) {
      throw new VerificationError(
        `Verification failed for issue ${issueId}: ${errors.join('; ')}`,
        report
      );
    }

    return report;
  }

  /**
   * Verify git commit exists and is new (different from baseline)
   * Also checks that commit message contains issue ID
   * 
   * @param worktreePath - Path to git worktree
   * @param baselineCommit - Baseline commit SHA
   * @param issueId - Expected issue ID in commit message
   * @returns Verification check result
   */
  private async verifyGitCommit(
    worktreePath: string,
    baselineCommit: string | undefined,
    issueId: string
  ): Promise<VerificationCheck> {
    try {
      // Get current HEAD
      const { stdout: headStdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
        cwd: worktreePath,
        encoding: 'utf8'
      });
      const currentCommit = headStdout.trim();

      if (!currentCommit || currentCommit.length !== 40) {
        return {
          name: 'git_commit_exists',
          status: VerificationStatus.FAIL,
          message: `Invalid commit SHA: ${currentCommit}`
        };
      }

      // Verify it's a valid commit object
      try {
        await execFileAsync('git', ['cat-file', '-t', currentCommit], {
          cwd: worktreePath,
          encoding: 'utf8'
        });
      } catch {
        return {
          name: 'git_commit_valid',
          status: VerificationStatus.FAIL,
          message: `Not a valid commit object: ${currentCommit}`
        };
      }

      // STRICT: Verify commit is NEW (different from baseline)
      if (baselineCommit && currentCommit === baselineCommit) {
        return {
          name: 'git_commit_new',
          status: VerificationStatus.FAIL,
          message: `Commit SHA unchanged from baseline: ${currentCommit.substring(0, 8)}. Agent must create a new git commit.`,
          details: { baselineCommit, currentCommit }
        };
      }

      // Get commit message
      const { stdout: msgStdout } = await execFileAsync(
        'git',
        ['log', '-1', '--format=%s', currentCommit],
        { cwd: worktreePath, encoding: 'utf8' }
      );
      const commitMessage = msgStdout.trim();

      // Verify commit message contains issue ID
      const issueIdPattern = new RegExp(issueId, 'i');
      if (!issueIdPattern.test(commitMessage)) {
        return {
          name: 'git_commit_message',
          status: VerificationStatus.FAIL,
          message: `Commit message does not contain issue ID ${issueId}: "${commitMessage}"`,
          details: { commitSha: currentCommit, commitMessage }
        };
      }

      return {
        name: 'git_commit',
        status: VerificationStatus.PASS,
        message: `Valid new commit: ${currentCommit.substring(0, 8)} - "${commitMessage}"`,
        details: { commitSha: currentCommit, commitMessage }
      };
    } catch (error) {
      return {
        name: 'git_commit',
        status: VerificationStatus.FAIL,
        message: `Git verification failed: ${(error as Error).message}`,
        details: { error: (error as Error).message }
      };
    }
  }

  /**
   * Verify files exist in worktree (excluding .git directory)
   * 
   * @param worktreePath - Path to worktree
   * @returns Verification check result
   */
  private async verifyFiles(worktreePath: string): Promise<VerificationCheck> {
    const files: string[] = [];
    const missing: string[] = [];

    try {
      // List all files in worktree (excluding .git and other excluded patterns)
      const worktreeFiles = await this.listFilesRecursively(worktreePath);

      if (worktreeFiles.length === 0) {
        return {
          name: 'files_exist',
          status: VerificationStatus.FAIL,
          message: 'No files found in worktree (excluding .git)',
          details: { worktreePath, files: [], missing: [] }
        };
      }

      // Verify each file exists
      for (const file of worktreeFiles) {
        const fullPath = join(worktreePath, file);
        try {
          const fileStat = await stat(fullPath);
          if (fileStat.isFile()) {
            files.push(file);
          }
        } catch {
          missing.push(file);
        }
      }

      if (files.length === 0) {
        return {
          name: 'files_exist',
          status: VerificationStatus.FAIL,
          message: 'No deliverable files found in worktree',
          details: { worktreePath, files, missing }
        };
      }

      return {
        name: 'files_exist',
        status: VerificationStatus.PASS,
        message: `${files.length} files verified in worktree`,
        details: { worktreePath, files, missing }
      };
    } catch (error) {
      return {
        name: 'files_exist',
        status: VerificationStatus.FAIL,
        message: `File verification failed: ${(error as Error).message}`,
        details: { error: (error as Error).message }
      };
    }
  }

  /**
   * Recursively list all files in worktree, excluding configured patterns
   * 
   * @param dir - Directory to scan
   * @param basePath - Base path for calculating relative paths
   * @returns Array of relative file paths
   */
  private async listFilesRecursively(
    dir: string,
    basePath: string = dir
  ): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relativePath = fullPath.replace(basePath + '/', '');

        // Skip excluded directories
        if (this.isExcluded(entry.name)) {
          continue;
        }

        if (entry.isDirectory()) {
          const subFiles = await this.listFilesRecursively(fullPath, basePath);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          files.push(relativePath);
        }
      }
    } catch (error) {
      // Directory may not exist or be accessible
      console.warn(`[ResultOrchestrator] Failed to read directory ${dir}: ${(error as Error).message}`);
    }

    return files;
  }

  /**
   * Check if a path should be excluded based on config patterns
   * 
   * @param path - Path to check
   * @returns True if should be excluded
   */
  private isExcluded(name: string): boolean {
    const excludePatterns = this.config.excludePatterns || [];
    return excludePatterns.some(pattern => {
      if (pattern.startsWith('*')) {
        return name.endsWith(pattern.slice(1));
      }
      return name === pattern || name.startsWith(pattern + '/');
    });
  }

  /**
   * Update verification configuration
   * 
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<VerificationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current verification configuration
   * 
   * @returns Current configuration
   */
  getConfig(): VerificationConfig {
    return { ...this.config };
  }
}

/**
 * Factory function to create a ResultOrchestrator instance
 * 
 * @param config - Optional verification configuration
 * @returns ResultOrchestrator instance
 */
export function createResultOrchestrator(config?: Partial<VerificationConfig>): ResultOrchestrator {
  return new ResultOrchestrator(config);
}

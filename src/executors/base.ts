import { execSync } from 'child_process';
import { existsSync, statSync, readdirSync } from 'fs';
import { join } from 'path';
import type {
  AgentProvider,
  ExecutionContext,
  ExecutionResult,
  GitCommit,
  ProviderMetadata,
  VerificationStatus,
  VerificationOptions,
  AgentExecutionConfig,
} from './types.js';
import type { HealthStatus } from '../types/index.js';
import {
  DEFAULT_VERIFICATION_OPTIONS,
  type ExecutionError,
  type ExecutionErrorType,
} from './types.js';

/**
 * Abstract base class for all agent executors.
 * 
 * This class provides:
 * - Common verification logic (git commits, file existence)
 * - Standardized result parsing from tool calls
 * - Health checking framework
 * - Provider metadata interface
 * 
 * All concrete executors (OpenCode, Kimi, etc.) must extend this class
 * and implement the abstract methods.
 * 
 * @abstract
 */
export abstract class AgentExecutor {
  /**
   * Provider type identifier (e.g., 'opencode-glm47', 'kimi-k25-api')
   */
  abstract readonly providerType: AgentProvider;

  /**
   * List of supported model identifiers
   */
  abstract readonly supportedModels: string[];

  /**
   * Execute a prompt in the given context and return the result.
   * 
   * This is the main entry point for agent execution. Implementations must:
   * 1. Subscribe to events BEFORE sending the prompt (critical for OpenCode)
   * 2. Send the prompt to the agent/provider
   * 3. Collect all execution events until completion/failure
   * 4. Parse results for git commits, file operations, errors
   * 5. Return structured ExecutionResult
   * 
   * @param config - Execution configuration containing prompt and context
   * @returns Promise resolving to execution result
   * @abstract
   */
  abstract execute(config: AgentExecutionConfig): Promise<ExecutionResult>;

  /**
   * Check if the provider is healthy and available.
   * 
   * Implementations should perform a lightweight check to verify:
   * - Provider is responsive
   * - Authentication is valid
   * - Basic operations can be performed
   * 
   * @returns Promise resolving to health status
   * @abstract
   */
  abstract healthCheck(): Promise<HealthStatus>;

  /**
   * Get metadata about this provider.
   * 
   * @returns Provider metadata including name, version, supported models
   * @abstract
   */
  abstract getMetadata(): ProviderMetadata;

  /**
   * Verify execution results against baseline.
   * 
   * Performs the following verifications:
   * 1. Git commit verification (new commit exists, different from baseline)
   * 2. File existence verification (all reported files exist in worktree)
   * 3. Issue ID in commit message (if configured)
   * 
   * @param result - The execution result to verify
   * @param context - Original execution context with baseline info
   * @param options - Verification options
   * @returns Verification status with pass/fail details
   */
  verifyResult(
    result: ExecutionResult,
    context: ExecutionContext,
    options: VerificationOptions = DEFAULT_VERIFICATION_OPTIONS
  ): VerificationStatus {
    const failures: string[] = [];
    const baselineSha = context.baselineCommit;
    const finalSha = this.getCurrentGitSha(context.worktreePath);

    // Git commit verification
    let gitVerified = true;
    if (options.requireGitCommit) {
      if (result.gitCommits.length === 0) {
        failures.push('No git commits found in execution result');
        gitVerified = false;
      } else if (baselineSha && finalSha === baselineSha) {
        failures.push(`No new git commit created (still at ${baselineSha})`);
        gitVerified = false;
      }
    }

    // Check commit messages contain issue ID
    if (options.requireIssueIdInCommit && result.gitCommits.length > 0) {
      const issueId = context.issueId;
      const commitsWithoutIssueId = result.gitCommits.filter(
        (commit) => !commit.message.includes(issueId)
      );
      if (commitsWithoutIssueId.length > 0) {
        failures.push(
          `Commit(s) missing issue ID ${issueId}: ${commitsWithoutIssueId
            .map((c) => c.sha.substring(0, 7))
            .join(', ')}`
        );
      }
    }

    // File existence verification
    let filesVerified = true;
    if (options.requireFilesExist && result.files.length > 0) {
      const missingFiles = result.files.filter((filePath) => {
        const fullPath = join(context.worktreePath, filePath);
        return !this.fileExists(fullPath, options.excludePatterns);
      });

      if (missingFiles.length > 0) {
        failures.push(`Files not found in worktree: ${missingFiles.join(', ')}`);
        filesVerified = false;
      }
    }

    const passed = failures.length === 0;

    return {
      gitVerified,
      filesVerified,
      passed,
      failures,
      baselineSha,
      finalSha,
    };
  }

  /**
   * Get the current git SHA for a worktree.
   * 
   * @param worktreePath - Path to the git worktree
   * @returns The current commit SHA or undefined if not a git repo
   */
  protected getCurrentGitSha(worktreePath: string): string | undefined {
    try {
      const sha = execSync('git rev-parse HEAD', {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      return sha;
    } catch {
      return undefined;
    }
  }

  /**
   * Check if a file exists, excluding certain patterns.
   * 
   * @param filePath - Full path to the file
   * @param excludePatterns - Patterns to exclude (e.g., '.git', 'node_modules')
   * @returns True if file exists and is not excluded
   */
  protected fileExists(filePath: string, excludePatterns: string[]): boolean {
    // Check if path contains excluded patterns
    for (const pattern of excludePatterns) {
      if (filePath.includes(`/${pattern}/`) || filePath.endsWith(`/${pattern}`)) {
        return false;
      }
    }

    try {
      return existsSync(filePath) && statSync(filePath).isFile();
    } catch {
      return false;
    }
  }

  /**
   * List files in a directory, excluding certain patterns.
   * 
   * @param dirPath - Directory path
   * @param excludePatterns - Patterns to exclude
   * @returns Array of file paths relative to dirPath
   */
  protected listFiles(dirPath: string, excludePatterns: string[]): string[] {
    const files: string[] = [];

    const traverse = (currentPath: string, relativePrefix: string) => {
      try {
        const entries = readdirSync(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          const relativePath = relativePrefix
            ? `${relativePrefix}/${entry.name}`
            : entry.name;

          // Skip excluded patterns
          if (excludePatterns.some((p) => entry.name === p || relativePath.includes(`/${p}/`))) {
            continue;
          }

          const fullPath = join(currentPath, entry.name);

          if (entry.isDirectory()) {
            traverse(fullPath, relativePath);
          } else if (entry.isFile()) {
            files.push(relativePath);
          }
        }
      } catch {
        // Ignore errors reading directory
      }
    };

    traverse(dirPath, '');
    return files;
  }

  /**
   * Parse tool calls from execution output to extract git commits and file operations.
   * 
   * Implementations should override this to parse their specific output format.
   * 
   * @param output - Raw execution output
   * @param worktreePath - Path to the worktree for relative file resolution
   * @returns Parsed git commits and files
   */
  protected parseToolCalls(
    output: string,
    worktreePath: string
  ): { commits: GitCommit[]; files: string[] } {
    // Base implementation - subclasses should override
    return { commits: [], files: [] };
  }

  /**
   * Create a standardized error result.
   * 
   * @param type - Error type
   * @param message - Error message
   * @param duration - Execution duration in milliseconds
   * @param cause - Original error cause
   * @returns ExecutionResult with error details
   */
  protected createErrorResult(
    type: ExecutionErrorType,
    message: string,
    duration: number,
    cause?: Error
  ): ExecutionResult {
    const error: ExecutionError = {
      type,
      message,
      cause,
    };

    return {
      success: false,
      files: [],
      gitCommits: [],
      output: '',
      duration,
      error: `${type}: ${message}`,
    };
  }

  /**
   * Create a success result with parsed data.
   * 
   * @param output - Raw execution output
   * @param files - List of files affected
   * @param commits - List of git commits
   * @param duration - Execution duration in milliseconds
   * @returns ExecutionResult with success details
   */
  protected createSuccessResult(
    output: string,
    files: string[],
    commits: GitCommit[],
    duration: number
  ): ExecutionResult {
    return {
      success: true,
      files,
      gitCommits: commits,
      output,
      duration,
    };
  }

  /**
   * Measure execution time using high-resolution timer.
   * 
   * @returns Start time in milliseconds
   */
  protected startTimer(): number {
    return Date.now();
  }

  /**
   * Calculate elapsed time from start timer.
   * 
   * @param startTime - Start time from startTimer()
   * @returns Elapsed milliseconds
   */
  protected elapsedMs(startTime: number): number {
    return Date.now() - startTime;
  }
}

/**
 * Factory function to create execution context.
 * 
 * @param params - Context parameters
 * @returns ExecutionContext with defaults applied
 */
export function createExecutionContext(params: {
  worktreePath: string;
  sessionId: string;
  issueId: string;
  baselineCommit?: string;
  timeoutMs?: number;
  repository?: string;
  modelOverride?: string;
}): ExecutionContext {
  return {
    worktreePath: params.worktreePath,
    sessionId: params.sessionId,
    issueId: params.issueId,
    baselineCommit: params.baselineCommit,
    timeoutMs: params.timeoutMs ?? 300000, // Default 5 minutes
    repository: params.repository,
    modelOverride: params.modelOverride,
  };
}

/**
 * Factory function to create agent execution config.
 * 
 * @param prompt - The prompt to execute
 * @param context - Execution context
 * @param options - Optional configuration
 * @returns AgentExecutionConfig
 */
export function createExecutionConfig(
  prompt: string,
  context: ExecutionContext,
  options?: {
    model?: string;
    agent?: string;
    streaming?: boolean;
  }
): AgentExecutionConfig {
  return {
    prompt,
    context,
    model: options?.model,
    agent: options?.agent ?? 'build',
    streaming: options?.streaming ?? true,
  };
}

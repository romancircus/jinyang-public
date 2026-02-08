/**
 * Verification types for ResultOrchestrator
 * @module src/orchestrator/types
 */

/**
 * Represents a parsed git commit from agent execution events
 */
export interface GitCommit {
  sha: string;
  message: string;
}

/**
 * Represents a file operation (write or edit) from agent execution
 */
export interface FileOperation {
  path: string;
  type: 'write' | 'edit';
}

/**
 * Represents a tool call from OpenCode execution events
 */
export interface ToolCall {
  function: {
    name: string;
    arguments?: Record<string, unknown>;
  };
}

/**
 * Represents an execution event from OpenCode SSE stream
 */
export interface ExecutionEvent {
  type: string;
  tool_calls?: ToolCall[];
  message?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Parsed execution result from agent messages
 */
export interface ExecutionResult {
  status: 'success' | 'failure' | 'incomplete';
  gitCommits: GitCommit[];
  files: string[];
  errors: string[];
  rawEvents: ExecutionEvent[];
}

/**
 * Verification status for individual checks
 */
export enum VerificationStatus {
  PASS = 'pass',
  FAIL = 'fail',
  SKIP = 'skip',
  PENDING = 'pending'
}

/**
 * Individual verification check result
 */
export interface VerificationCheck {
  name: string;
  status: VerificationStatus;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Complete verification report
 */
export interface VerificationReport {
  success: boolean;
  issueId: string;
  baselineCommit?: string;
  currentCommit?: string;
  checks: VerificationCheck[];
  filesVerified: string[];
  filesMissing: string[];
  errors: string[];
  summary: string;
}

/**
 * Configuration for verification
 */
export interface VerificationConfig {
  requireGitCommit: boolean;
  requireFileVerification: boolean;
  issueIdPattern?: RegExp;
  excludePatterns?: string[];
}

/**
 * Default verification configuration
 */
export const DEFAULT_VERIFICATION_CONFIG: VerificationConfig = {
  requireGitCommit: true,
  requireFileVerification: true,
  issueIdPattern: /^[A-Z]+-\d+$/,
  excludePatterns: ['.git', 'node_modules', '.cache', '.tmp']
};

/**
 * Error thrown when verification fails
 */
export class VerificationError extends Error {
  constructor(
    message: string,
    public report: VerificationReport,
    public cause?: Error
  ) {
    super(message);
    this.name = 'VerificationError';
  }
}

/**
 * Interface for the ResultOrchestrator
 */
export interface ResultOrchestratorInterface {
  /**
   * Verify execution results against worktree state
   * @param worktreePath - Path to the git worktree
   * @param baselineCommit - Baseline commit SHA (before execution)
   * @param issueId - Linear issue ID for validation
   * @returns Verification report
   */
  verify(
    worktreePath: string,
    baselineCommit: string | undefined,
    issueId: string
  ): Promise<VerificationReport>;

  /**
   * Parse execution events from OpenCode SSE stream
   * @param events - Array of execution events
   * @returns Parsed execution result
   */
  parseExecutionResult(events: ExecutionEvent[]): ExecutionResult;

  /**
   * Parse events incrementally during streaming
   * @param event - Single execution event
   * @param accumulator - Current accumulated result (optional)
   * @returns Updated execution result
   */
  parseEventIncremental(
    event: ExecutionEvent,
    accumulator?: Partial<ExecutionResult>
  ): Partial<ExecutionResult>;
}

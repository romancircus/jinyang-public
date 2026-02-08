import type { ProviderType, HealthStatus } from '../types/index.js';

/**
 * Provider type for agent executors
 */
export type AgentProvider = ProviderType;

/**
 * Git commit information extracted from execution
 */
export interface GitCommit {
  sha: string;
  message: string;
  author: string;
  date: Date;
  issueId?: string;
}

/**
 * File operation information from tool calls
 */
export interface FileOperation {
  operation: 'create' | 'modify' | 'delete';
  path: string;
  content?: string;
}

/**
 * Execution context for agent operations
 */
export interface ExecutionContext {
  /** Path to the git worktree */
  worktreePath: string;
  /** Unique session identifier */
  sessionId: string;
  /** Linear issue identifier */
  issueId: string;
  /** Git SHA before execution started (for comparison) */
  baselineCommit?: string;
  /** Maximum execution time in milliseconds */
  timeoutMs: number;
  /** Repository configuration */
  repository?: string;
  /** Model override configuration */
  modelOverride?: string;
}

/**
 * Result of agent execution
 */
export interface ExecutionResult {
  /** Whether execution completed successfully */
  success: boolean;
  /** List of files created/modified/deleted */
  files: string[];
  /** Git commits made during execution */
  gitCommits: GitCommit[];
  /** Raw output from the agent */
  output: string;
  /** Execution duration in milliseconds */
  duration: number;
  /** Error message if execution failed */
  error?: string;
  /** Verification status */
  verificationStatus?: VerificationStatus;
}

/**
 * Verification status for execution results
 */
export interface VerificationStatus {
  /** Whether git verification passed */
  gitVerified: boolean;
  /** Whether all files exist as reported */
  filesVerified: boolean;
  /** Overall verification passed */
  passed: boolean;
  /** List of verification failures */
  failures: string[];
  /** Baseline SHA before execution */
  baselineSha?: string;
  /** Final SHA after execution */
  finalSha?: string;
}

/**
 * Metadata for a provider
 */
export interface ProviderMetadata {
  name: string;
  type: AgentProvider;
  version: string;
  supportedModels: string[];
  features: string[];
}

/**
 * Event types for SSE subscription
 */
export type AgentEventType = 
  | 'session_created'
  | 'session_prompt_sent'
  | 'tool_call_started'
  | 'tool_call_completed'
  | 'session_completed'
  | 'session_failed'
  | 'session_cancelled'
  | 'error';

/**
 * Agent execution event from SSE stream
 */
export interface AgentEvent {
  type: AgentEventType;
  timestamp: Date;
  sessionId: string;
  data?: unknown;
}

/**
 * Tool call event data
 */
export interface ToolCallEvent {
  tool: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

/**
 * Configuration for agent execution
 */
export interface AgentExecutionConfig {
  prompt: string;
  context: ExecutionContext;
  model?: string;
  agent?: string;
  streaming?: boolean;
}

/**
 * Event subscriber interface for SSE
 */
export interface EventSubscriber {
  subscribe(sessionId: string): AsyncIterable<AgentEvent>;
  unsubscribe(sessionId: string): void;
}

/**
 * Verification options
 */
export interface VerificationOptions {
  /** Require at least one git commit */
  requireGitCommit: boolean;
  /** Require all files to exist */
  requireFilesExist: boolean;
  /** Require commit message to contain issue ID */
  requireIssueIdInCommit: boolean;
  /** Patterns for files to exclude from verification (e.g., .git, node_modules) */
  excludePatterns: string[];
}

/**
 * Default verification options
 */
export const DEFAULT_VERIFICATION_OPTIONS: VerificationOptions = {
  requireGitCommit: true,
  requireFilesExist: true,
  requireIssueIdInCommit: true,
  excludePatterns: ['.git', 'node_modules', 'dist', '.jinyang', '.env'],
};

/**
 * Execution error types
 */
export type ExecutionErrorType =
  | 'TIMEOUT'
  | 'GIT_VERIFICATION_FAILED'
  | 'FILE_VERIFICATION_FAILED'
  | 'SESSION_FAILED'
  | 'PROVIDER_UNAVAILABLE'
  | 'UNKNOWN';

/**
 * Execution error with type information
 */
export interface ExecutionError {
  type: ExecutionErrorType;
  message: string;
  cause?: Error;
}

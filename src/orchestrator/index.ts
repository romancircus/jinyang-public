import { RoutingEngine } from '../routing/engine.js';
import type { LinearIssue as RoutingLinearIssue, RouteResult, RepositoryConfig } from '../routing/types.js';
import { WorktreeManager } from '../worktree/manager.js';
import type { WorktreeInfo } from '../worktree/types.js';
import { ExecutorFactory } from '../executors/factory.js';
import { ResultOrchestrator } from './result.js';
import { LinearUpdater, SpawnResult as LinearSpawnResult } from '../linear/updater.js';
import { ProviderRouter } from '../provider/router.js';
import { AgentExecutor } from '../executors/base.js';
import type { AgentExecutionConfig, ExecutionResult as AgentExecutionResult, ExecutionContext } from '../executors/types.js';
import { OpenCodePromptContext } from '../opencode/prompt-builder.js';
import { modelParser } from '../opencode/model-parser.js';
import type { VerificationReport } from './types.js';
import { ProviderConfig, Repository } from '../types/index.js';
import { withRetry, createRetryConfig, RetryResult, NonRetryableError } from '../utils/retry.js';
import { OrchestratorError, isRetryableError, isJinyangError, WorktreeError, RoutingError, ProviderError } from '../errors/index.js';
import { getLogger } from '../logging/index.js';
import { Mutex } from 'async-mutex';
import { GitService } from '../worktree/GitService.js';

/**
 * Minimal repository info for prompt context
 * Contains only the fields needed by OpenCodePromptContext
 */
interface RepositoryInfo {
  name: string;
  baseBranch: string;
  workspaceBaseDir: string;
}

/**
 * Result of issue execution
 */
export interface OrchestratorExecutionResult {
  success: boolean;
  issueId: string;
  commitSha?: string;
  filesCreated: string[];
  error?: string;
  duration: number;
  worktreePath: string;
  verificationReport?: VerificationReport;
}

/**
 * Linear issue input for orchestration
 */
export interface OrchestratorLinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  labels?: string[];
  projectName?: string;
  state?: string;
}

/**
 * Retry configuration for orchestrator operations
 */
const ORCHESTRATOR_RETRY_CONFIG = createRetryConfig({
  maxRetries: 2, // Fewer retries for orchestrator as we also have executor-level retries
  baseDelayMs: 2000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'TIMEOUT',
    'WORKTREE_FAILURE',
    'rate limit',
    '429',
    '503',
    '504',
  ],
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
});

/**
 * Main Orchestrator class that coordinates all components with intelligent retry logic.
 *
 * Responsibilities:
 * 1. Receive webhook event
 * 2. Route to correct repository
 * 3. Create/select worktree
 * 4. Spawn executor with provider
 * 5. Execute agent prompt (with retry for transient failures)
 * 6. Verify results
 * 7. Post updates to Linear
 * 8. Handle fallback provider on failure
 *
 * @example
 * ```typescript
 * const orchestrator = new Orchestrator(
 *   routingEngine,
 *   worktreeManager,
 *   executorFactory,
 *   resultOrchestrator,
 *   linearUpdater,
 *   providerRouter
 * );
 *
 * const result = await orchestrator.processIssue(issue);
 * ```
 */
export class Orchestrator {
  private logger = getLogger();
  private statusLocks = new Map<string, Mutex>();
  private completedIssues = new Set<string>(); // Track completed issues to prevent duplicate updates
  private gitService = new GitService();

  /**
   * Get or create a mutex for a specific issue's status updates
   */
  private getStatusLock(issueId: string): Mutex {
    let lock = this.statusLocks.get(issueId);
    if (!lock) {
      lock = new Mutex();
      this.statusLocks.set(issueId, lock);
    }
    return lock;
  }

  constructor(
    private routingEngine: RoutingEngine,
    private worktreeManager: WorktreeManager,
    private executorFactory: ExecutorFactory,
    private resultOrchestrator: ResultOrchestrator,
    private linearUpdater: LinearUpdater,
    private providerRouter: ProviderRouter
  ) {}

  /**
   * Initialize the orchestrator and its dependencies.
   */
  async initialize(): Promise<void> {
    await this.routingEngine.initialize();
  }

  /**
   * Process a Linear issue through the full execution pipeline.
   *
   * Execution Flow:
   * 1. Route to repository
   * 2. Create/select worktree
   * 3. Get baseline commit
   * 4. Get executor from provider router
   * 5. Build and execute prompt
   * 6. Verify results
   * 7. Update Linear
   *
   * @param issue - Linear issue to process
   * @returns Execution result with success/failure details
   * @throws Error if execution fails (after updating Linear with failure)
   */
  async processIssue(issue: OrchestratorLinearIssue): Promise<OrchestratorExecutionResult> {
    const startTime = Date.now();
    let routeResult: RouteResult | undefined;
    let worktreeInfo: WorktreeInfo | undefined;
    let baselineCommit: string | undefined;
    let executor: AgentExecutor | undefined;
    let repoConfig: RepositoryConfig | null = null;

    try {
      // Convert issue format for routing engine
      const routingIssue: RoutingLinearIssue = {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        state: { name: issue.state || 'Todo' },
        labels: { nodes: (issue.labels || []).map(name => ({ name })) },
        project: issue.projectName ? { name: issue.projectName } : undefined
      };

      // 1. Route to repository
      routeResult = await this.routingEngine.route(routingIssue);

      // Get repository config
      repoConfig = this.routingEngine.getRepositoryConfig(routingIssue);
      if (!repoConfig) {
        throw new Error(`No repository configured for issue ${issue.identifier}`);
      }

      console.log(`[Orchestrator] Routing issue ${issue.identifier} to: ${repoConfig.name}`);

      // 2. Create/select worktree
      worktreeInfo = await this.worktreeManager.createWorktree({
        issueId: issue.identifier,
        repositoryPath: repoConfig.localPath,
        mode: this.mapWorktreeMode(routeResult.worktreeMode),
        baseBranch: repoConfig.baseBranch
      });

      console.log(`[Orchestrator] Worktree created at: ${worktreeInfo.worktreePath}`);

      // 2.5. Sync worktree to latest remote base branch (prevents push rejection)
      const targetBranchForSync = repoConfig.baseBranch || 'master';
      try {
        await this.gitService.syncToRemote(worktreeInfo.worktreePath, targetBranchForSync);
        console.log(`[Orchestrator] Worktree synced to origin/${targetBranchForSync}`);
      } catch (syncError) {
        console.warn(`[Orchestrator] Worktree sync failed (non-fatal): ${(syncError as Error).message}`);
      }

      // 3. Get baseline commit
      baselineCommit = await this.getCurrentCommit(worktreeInfo.worktreePath);
      console.log(`[Orchestrator] Baseline commit: ${baselineCommit?.substring(0, 8) || 'none (new repo)'}`);

      // 4. Update Linear status to In Progress
      await this.updateLinearStatus('started', issue.id, issue.identifier);

      // 5. Get executor from provider router
      const providerSelection = await this.providerRouter.selectProvider();
      executor = await this.executorFactory.createExecutor(providerSelection.provider.type, providerSelection.provider);

      // Set provider router on executor for circuit breaker integration
      if ('setProviderRouter' in executor) {
        (executor as { setProviderRouter: (r: ProviderRouter) => void }).setProviderRouter(this.providerRouter);
      }

      console.log(`[Orchestrator] Using provider: ${providerSelection.provider.name}`);

      // 6. Build execution context and prompt
      const executionContext = this.buildExecutionContext(
        issue,
        worktreeInfo,
        repoConfig,
        baselineCommit
      );

      const executionConfig = this.buildExecutionConfig(issue, executionContext, repoConfig);

      // 7. Execute agent prompt
      console.log(`[Orchestrator] Executing agent for ${issue.identifier}`);
      const agentResult = await executor.execute(executionConfig);

      // 8. Verify results
      console.log(`[Orchestrator] Verifying results for ${issue.identifier}`);
      const verificationReport = await this.resultOrchestrator.verify(
        worktreeInfo.worktreePath,
        baselineCommit,
        issue.identifier
      );

      // 9. Get final commit SHA
      const finalCommitSha = await this.getCurrentCommit(worktreeInfo.worktreePath);

      // 10. Build execution result
      const result: OrchestratorExecutionResult = {
        success: agentResult.success && verificationReport.success,
        issueId: issue.identifier,
        commitSha: finalCommitSha,
        filesCreated: verificationReport.filesVerified,
        error: agentResult.error,
        duration: Date.now() - startTime,
        worktreePath: worktreeInfo.worktreePath,
        verificationReport
      };

      // 11. ENFORCE COMMIT before completion
      const enforcedCommitSha = await this.enforceCommitBeforeCompletion(worktreeInfo.worktreePath, issue.identifier);
      const finalCommitToReport = enforcedCommitSha || finalCommitSha;

      // 12. Push to remote before cleanup (commits are lost if worktree is deleted without push)
      // Push HEAD to the base branch (worktree uses a local branch like linear/ROM-XXX-issue)
      const targetBranch = repoConfig.baseBranch || 'master';
      console.log(`[Orchestrator] Pushing commits to origin/${targetBranch} for ${issue.identifier}`);
      try {
        await this.gitService.pushToRef(worktreeInfo.worktreePath, targetBranch);
        console.log(`[Orchestrator] Successfully pushed ${issue.identifier} to origin/${targetBranch}`);
      } catch (pushError) {
        const pushMsg = (pushError as Error).message;
        console.error(`[Orchestrator] Push failed for ${issue.identifier}: ${pushMsg}`);
        // Don't fail the whole execution - commit exists locally, push can be retried
        this.logger.warn(`Push failed but commit exists locally`, { issueId: issue.identifier, error: pushMsg });
      }

      // 13. Update Linear with result
      if (result.success) {
        await this.updateLinearStatus('completed', issue.id, issue.identifier, {
          success: true,
          exitCode: 0,
          commitHash: finalCommitToReport,
          filesChanged: result.filesCreated,
          duration: result.duration
        });

        // Cleanup worktree on success (commit is enforced in cleanupWorktree)
        await this.worktreeManager.cleanupWorktree(issue.identifier, false);

        console.log(`[Orchestrator] Successfully completed ${issue.identifier}`);
      } else {
        throw new Error(agentResult.error || 'Execution failed verification');
      }

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      console.error(`[Orchestrator] Failed to process issue ${issue.identifier}:`, errorMessage);

      // Update Linear with failure
      await this.updateLinearStatus('failed', issue.id, issue.identifier, {
        success: false,
        exitCode: 1,
        error: errorMessage,
        duration
      });

      // Keep worktree on failure for debugging
      if (worktreeInfo) {
        console.log(`[Orchestrator] Preserving worktree for debugging: ${worktreeInfo.worktreePath}`);
        await this.worktreeManager.cleanupWorktree(issue.identifier, true);
      }

      // Attempt retry with fallback provider if primary failed
      if (executor && routeResult && worktreeInfo && repoConfig) {
        console.log(`[Orchestrator] Attempting retry with fallback provider for ${issue.identifier}`);
        try {
          const fallbackResult = await this.retryWithFallback(
            issue,
            repoConfig,
            worktreeInfo,
            baselineCommit,
            errorMessage
          );
          return fallbackResult;
        } catch (fallbackError) {
          console.error(`[Orchestrator] Fallback also failed for ${issue.identifier}:`, fallbackError);
        }
      }

      // Return failure result
      return {
        success: false,
        issueId: issue.identifier,
        commitSha: undefined,
        filesCreated: [],
        error: errorMessage,
        duration,
        worktreePath: worktreeInfo?.worktreePath || ''
      };
    }
  }

  /**
   * Retry execution with a fallback provider using intelligent retry logic.
   *
   * This method:
   * 1. Iterates through available providers (skipping the failed one)
   * 2. Uses retry logic with exponential backoff for each provider
   * 3. Adds context about previous failures to the prompt
   * 4. Returns the first successful result
   *
   * @param issue - Original Linear issue
   * @param repoConfig - Repository configuration
   * @param worktreeInfo - Active worktree info
   * @param baselineCommit - Baseline commit SHA
   * @param previousError - Error from previous attempt
   * @returns Execution result from fallback provider
   */
  private async retryWithFallback(
    issue: OrchestratorLinearIssue,
    repoConfig: RepositoryConfig,
    worktreeInfo: WorktreeInfo,
    baselineCommit: string | undefined,
    previousError: string
  ): Promise<OrchestratorExecutionResult> {
    const startTime = Date.now();

    // Get next available provider (skip the one that failed)
    const availableProviders = this.providerRouter.getEnabledProviders();

    for (const providerConfig of availableProviders.slice(1)) {
      // Check provider health
      const healthStatus = await this.providerRouter.getHealthStatus();
      const providerHealth = healthStatus.find(h => h.provider === providerConfig.type);

      if (!providerHealth?.healthy) {
        console.log(`[Orchestrator] Skipping unhealthy provider: ${providerConfig.name}`);
        continue;
      }

      console.log(`[Orchestrator] Attempting fallback with provider: ${providerConfig.name}`);

      try {
        // Build execution context and config with previous error context
        const executionContext = this.buildExecutionContext(
          issue,
          worktreeInfo,
          repoConfig,
          baselineCommit
        );

        const executionConfig = this.buildExecutionConfig(issue, executionContext, repoConfig);

        // Add context about previous failure
        executionConfig.prompt = `[Previous attempt failed with: ${previousError}]\n\n${executionConfig.prompt}`;

        // Create executor and set provider router for circuit breaker
        const fallbackExecutor = await this.executorFactory.createExecutor(providerConfig.type, providerConfig);
        if ('setProviderRouter' in fallbackExecutor) {
          (fallbackExecutor as { setProviderRouter: (r: ProviderRouter) => void }).setProviderRouter(this.providerRouter);
        }

        // Execute with retry logic at orchestrator level too
        const retryResult = await withRetry(
          () => this.executeWithFallback(fallbackExecutor, executionConfig, worktreeInfo, baselineCommit, issue),
          ORCHESTRATOR_RETRY_CONFIG,
          {
            issueId: issue.identifier,
            operation: 'Orchestrator.fallback-execution',
            provider: providerConfig.type,
          },
          this.providerRouter
        );

        if (retryResult.success && retryResult.data) {
          const result = retryResult.data;

          if (result.success) {
            // Push before cleanup (push HEAD to base branch)
            try {
              const fallbackTargetBranch = repoConfig.baseBranch || 'master';
              await this.gitService.pushToRef(worktreeInfo.worktreePath, fallbackTargetBranch);
              console.log(`[Orchestrator] Pushed fallback result for ${issue.identifier}`);
            } catch (pushError) {
              this.logger.warn(`Fallback push failed`, { issueId: issue.identifier, error: (pushError as Error).message });
            }

            await this.updateLinearStatus('completed', issue.id, issue.identifier, {
              success: true,
              exitCode: 0,
              commitHash: result.commitSha,
              filesChanged: result.filesCreated,
              duration: result.duration
            });

            await this.worktreeManager.cleanupWorktree(issue.identifier, false);

            console.log(`[Orchestrator] Fallback execution successful for ${issue.identifier} using ${providerConfig.name}`);
            return result;
          }
        }

        console.log(`[Orchestrator] Fallback provider ${providerConfig.name} returned unsuccessful result, trying next...`);
      } catch (fallbackError) {
        console.error(`[Orchestrator] Fallback provider ${providerConfig.name} failed:`, fallbackError);
        continue;
      }
    }

    throw new Error('All fallback providers exhausted after retry attempts');
  }

  /**
   * Execute with a fallback provider and return orchestrator result.
   */
  private async executeWithFallback(
    executor: AgentExecutor,
    executionConfig: AgentExecutionConfig,
    worktreeInfo: WorktreeInfo,
    baselineCommit: string | undefined,
    issue: OrchestratorLinearIssue
  ): Promise<OrchestratorExecutionResult> {
    const agentResult = await executor.execute(executionConfig);

    const verificationReport = await this.resultOrchestrator.verify(
      worktreeInfo.worktreePath,
      baselineCommit,
      issue.identifier
    );

    const finalCommitSha = await this.getCurrentCommit(worktreeInfo.worktreePath);

    return {
      success: agentResult.success && verificationReport.success,
      issueId: issue.identifier,
      commitSha: finalCommitSha,
      filesCreated: verificationReport.filesVerified,
      error: agentResult.error,
      duration: agentResult.duration,
      worktreePath: worktreeInfo.worktreePath,
      verificationReport
    };
  }

  /**
   * Map routing worktree mode to worktree manager mode.
   */
  private mapWorktreeMode(mode: string): 'main' | 'branch' | 'session' {
    switch (mode) {
      case 'fresh':
        return 'main';
      case 'reuse':
        return 'branch';
      case 'branch-per-issue':
      default:
        return 'main';
    }
  }

  /**
   * Get current git commit SHA for a worktree using GitService.
   *
   * @param worktreePath - Path to the git worktree
   * @returns Current commit SHA or undefined if not available
   */
  private async getCurrentCommit(worktreePath: string): Promise<string | undefined> {
    return await this.gitService.getCurrentCommit(worktreePath);
  }

  /**
   * Enforce commit before completion by checking for uncommitted changes
   * and auto-committing if necessary.
   *
   * @param worktreePath - Path to the git worktree
   * @param issueId - The Linear issue identifier
   * @returns The commit SHA or undefined if no changes to commit
   */
  private async enforceCommitBeforeCompletion(worktreePath: string, issueId: string): Promise<string | undefined> {
    try {
      // Check if there are uncommitted changes
      const hasChanges = await this.gitService.hasUncommittedChanges(worktreePath);

      if (!hasChanges) {
        this.logger.info(`No uncommitted changes in ${issueId}, commit already exists`);
        return await this.gitService.getCurrentCommit(worktreePath);
      }

      this.logger.warn(`Uncommitted changes detected before completion for ${issueId}, auto-committing`);

      // Stage all changes and auto-commit with default message
      const commitSha = await this.gitService.commit(worktreePath, {
        message: `jinyang: Session completion - ${issueId}`,
        noVerify: true,
        stageAll: true
      });

      if (commitSha) {
        this.logger.info(`Auto-committed changes for ${issueId}: ${commitSha.substring(0, 8)}`);
        return commitSha;
      } else {
        throw new Error(`Auto-commit failed for ${issueId}: no commit SHA returned`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Commit enforcement failed for ${issueId}: ${errorMsg}`);
    }
  }

  /**
   * Build execution context for agent execution.
   *
   * @param issue - Linear issue
   * @param worktreeInfo - Worktree information
   * @param repoConfig - Repository configuration
   * @param baselineCommit - Baseline commit SHA
   * @returns Execution context
   */
  private buildExecutionContext(
    issue: OrchestratorLinearIssue,
    worktreeInfo: WorktreeInfo,
    repoConfig: RepositoryConfig,
    baselineCommit: string | undefined
  ): ExecutionContext {
    return {
      worktreePath: worktreeInfo.worktreePath,
      sessionId: issue.id,
      issueId: issue.identifier,
      baselineCommit,
      timeoutMs: 300000, // 5 minutes default
      repository: repoConfig.name
    };
  }

  /**
   * Build execution configuration for agent execution.
   *
   * @param issue - Linear issue
   * @param context - Execution context
   * @param repoConfig - Repository configuration
   * @returns Agent execution configuration
   */
  private buildExecutionConfig(issue: OrchestratorLinearIssue, context: ExecutionContext, repoConfig: RepositoryConfig): AgentExecutionConfig {
    // Parse model override from description
    const modelOverride = modelParser.parse(issue.description);

    // Build prompt context with proper Repository type
    const promptContext: OpenCodePromptContext = {
      repository: {
        id: repoConfig.name,
        name: repoConfig.name,
        repositoryPath: repoConfig.localPath,
        baseBranch: repoConfig.baseBranch,
        workspaceBaseDir: repoConfig.localPath,
        isActive: true,
        linearWorkspaceId: '',
        linearWorkspaceName: ''
      },
      issueId: issue.identifier,
      issueTitle: issue.title,
      issueDescription: issue.description || '',
      labels: issue.labels,
      projectName: issue.projectName,
      modelOverride: modelOverride || undefined,
      worktreePath: context.worktreePath
    };

    // Build the actual prompt
    const prompt = this.buildPrompt(promptContext);

    return {
      prompt,
      context,
      model: modelOverride?.model,
      agent: 'build',
      streaming: true
    };
  }

  /**
   * Build agent prompt from context.
   *
   * @param context - OpenCode prompt context
   * @returns Formatted prompt string
   */
  private buildPrompt(context: OpenCodePromptContext): string {
    const lines: string[] = [
      `# Task: ${context.issueId}`,
      '',
      `## Title: ${context.issueTitle}`,
      ''
    ];

    if (context.issueDescription) {
      lines.push('## Description');
      lines.push(context.issueDescription);
      lines.push('');
    }

    if (context.labels && context.labels.length > 0) {
      lines.push(`## Labels: ${context.labels.join(', ')}`);
      lines.push('');
    }

    lines.push(`## Working Directory: ${context.worktreePath}`);
    lines.push('IMPORTANT: All file operations and git commands MUST be executed in this directory.');
    lines.push('');
    lines.push('## Instructions');
    lines.push('1. Read the task description carefully');
    lines.push('2. Implement the required changes in the working directory above');
    lines.push('3. Write tests if applicable');
    lines.push('4. Run any linting or type checking commands');
    lines.push(`5. Create a git commit with [${context.issueId}] in the message`);
    lines.push('6. Mark the task as complete');

    if (context.modelOverride) {
      lines.push('');
      lines.push(`Using model: ${context.modelOverride.provider}/${context.modelOverride.model}`);
    }

    return lines.join('\n');
  }

  /**
   * Update Linear issue status with atomic locking to prevent race conditions.
   *
   * This method ensures:
   * 1. Only one status update per issue at a time
   * 2. Final states (completed/failed) are idempotent - subsequent calls are ignored
   * 3. Updates happen atomically within the lock
   *
   * @param type - Update type
   * @param issueId - Linear issue ID
   * @param issueIdentifier - Human-readable issue identifier
   * @param data - Optional result data
   */
  private async updateLinearStatus(
    type: 'started' | 'completed' | 'failed',
    issueId: string,
    issueIdentifier: string,
    data?: LinearSpawnResult
  ): Promise<void> {
    const lock = this.getStatusLock(issueId);

    await lock.runExclusive(async () => {
      try {
        // Check if already in final state - prevent duplicate updates
        if (this.completedIssues.has(issueId) && type !== 'started') {
          console.log(`[Orchestrator] Issue ${issueIdentifier} already finalized, skipping ${type} update`);
          return;
        }

        switch (type) {
          case 'started':
            await this.linearUpdater.onSessionStarted(issueId);
            break;
          case 'completed':
            if (data) {
              await this.linearUpdater.onSessionCompleted(issueId, data);
              // Mark as completed to prevent duplicate updates
              this.completedIssues.add(issueId);
              // Clean up lock after completion
              this.statusLocks.delete(issueId);
            }
            break;
          case 'failed':
            const error = data?.error ? new Error(data.error) : new Error('Execution failed');
            await this.linearUpdater.onSessionFailed(issueId, error);
            // Mark as completed (in error state) to prevent duplicate updates
            this.completedIssues.add(issueId);
            // Clean up lock after failure
            this.statusLocks.delete(issueId);
            break;
        }
      } catch (error) {
        // Log but don't throw - Linear updates shouldn't break execution
        console.error(`[Orchestrator] Failed to update Linear status for ${issueIdentifier}:`, error);
      }
    });
  }
}

/**
 * Factory function to create an Orchestrator with default dependencies.
 *
 * @returns Orchestrator instance with initialized dependencies
 */
export function createOrchestrator(): Orchestrator {
  const routingEngine = new RoutingEngine();
  const worktreeManager = new WorktreeManager();
  const executorFactory = new ExecutorFactory();
  const resultOrchestrator = new ResultOrchestrator();
  const linearUpdater = new LinearUpdater();
  const providerRouter = new ProviderRouter();

  return new Orchestrator(
    routingEngine,
    worktreeManager,
    executorFactory,
    resultOrchestrator,
    linearUpdater,
    providerRouter
  );
}

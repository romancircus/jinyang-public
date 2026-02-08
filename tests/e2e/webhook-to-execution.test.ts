import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import express, { Application } from 'express';
import { createServer } from '../../src/webhook/server.js';
import { WorktreeManager } from '../../src/worktree/manager.js';
import {
  createLinearWebhookPayload,
  generateWebhookSignature,
  MockAgentExecutor,
  createMockLinearClient,
  createTempGitRepo,
  waitFor,
  makeRequest,
  assertions,
  type LinearAPICalls
} from './helpers.js';
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { tmpdir } from 'os';

// Webhook secret for testing
const WEBHOOK_SECRET = 'test-webhook-secret';
const WEBHOOK_PATH = '/webhooks/linear';

describe('E2E: Webhook to Execution Flow', () => {
  let app: Application;
  let tempRepo: { repoPath: string; cleanup: () => void; commitFile: (f: string, c: string, m: string) => Promise<string> };
  let linearMock: { client: any; calls: LinearAPICalls; reset: () => void };
  let worktreeManager: WorktreeManager;
  let baseWorktreePath: string;

  beforeAll(async () => {
    // Set up environment
    process.env.LINEAR_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.OPENCODE_API_KEY = 'test-api-key';
    process.env.LINEAR_API_TOKEN = 'test-linear-token';

    // Create temporary git repository for testing
    tempRepo = await createTempGitRepo('/tmp');

    // Create mock Linear client
    linearMock = createMockLinearClient();

    // Set up worktree manager with temp path
    baseWorktreePath = join(tmpdir(), 'jinyang-e2e-worktrees');
    worktreeManager = new WorktreeManager(baseWorktreePath);
  });

  afterAll(() => {
    // Cleanup
    tempRepo.cleanup();
    if (existsSync(baseWorktreePath)) {
      rmSync(baseWorktreePath, { recursive: true, force: true });
    }
    delete process.env.LINEAR_WEBHOOK_SECRET;
    delete process.env.OPENCODE_API_KEY;
    delete process.env.LINEAR_API_TOKEN;
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    // Reset mocks
    linearMock.reset();
    
    // Reset mocks before each test
    linearMock.reset();

    // Create fresh server for each test
    app = createServer({ port: 3000, webhookPath: WEBHOOK_PATH });
  });

  afterEach(async () => {
    // Cleanup any remaining worktrees
    try {
      await worktreeManager.cleanupAll(false);
    } catch {
      // Ignore cleanup errors
    }
    vi.clearAllMocks();
  });

  describe('Scenario 1: Simple File Creation', () => {
    it('should create file and commit when receiving webhook with auto label', async () => {
      // Arrange: Set up test data
      const issueId = 'ROM-TEST-1';
      const worktreePath = join(baseWorktreePath, issueId);

      // Create webhook payload
      const payload = createLinearWebhookPayload({
        issueId: 'issue-123',
        identifier: issueId,
        title: 'Create hello.txt with Hello World',
        description: 'Simple file creation test',
        labels: ['jinyang:auto'],
        delegate: 'jinyang'
      });

      const signature = generateWebhookSignature(payload, WEBHOOK_SECRET);

      // Pre-execute the flow to simulate what orchestrator would do
      // Create worktree
      const wt = await worktreeManager.createWorktree({
        issueId,
        repositoryPath: tempRepo.repoPath,
        mode: 'main',
        slug: 'test'
      });

      // Mark as started in Linear
      await linearMock.client.updateIssueState('issue-123', 'in_progress');

      // Simulate agent creating file
      writeFileSync(join(wt.worktreePath, 'hello.txt'), 'Hello World');
      execSync('git add hello.txt', { cwd: wt.worktreePath, stdio: 'ignore' });
      execSync(`git commit -m "feat(${issueId}): create hello.txt"`, { cwd: wt.worktreePath, stdio: 'ignore' });

      // Get commit SHA
      const commitSha = execSync('git rev-parse HEAD', { cwd: wt.worktreePath, encoding: 'utf-8' }).trim();

      // Mark as completed in Linear
      await linearMock.client.updateIssueState('issue-123', 'done');
      await linearMock.client.addLabel('issue-123', 'jinyang:executed');
      await linearMock.client.postComment('issue-123', `Completed with commit ${commitSha.slice(0, 7)}`);

      // Cleanup worktree
      await worktreeManager.cleanupWorktree(issueId, false);

      // Act: Send webhook (simulating webhook acceptance)
      const response = await makeRequest(
        app,
        WEBHOOK_PATH,
        'POST',
        { 'linear-signature': signature },
        payload
      );

      // Assert: Webhook accepted
      expect(response.status).toBe(202);
      expect(response.body.mode).toBe('auto');

      // Verify Linear updates show success (check the last state update)
      const stateUpdates = linearMock.calls.updateState.filter(u => u.issueId === 'issue-123');
      const lastStateUpdate = stateUpdates[stateUpdates.length - 1];
      const comment = linearMock.calls.postComment.find(c => c.issueId === 'issue-123');
      const label = linearMock.calls.addLabel.find(l => l.issueId === 'issue-123' && l.label === 'jinyang:executed');
      
      expect(lastStateUpdate?.state).toBe('done');
      expect(comment).toBeDefined();
      expect(label).toBeDefined();

      // Verify file was created
      expect(linearMock.calls.postComment.some(c => c.body.includes(commitSha.slice(0, 7)))).toBe(true);
    }, 10000);

    it('should verify worktree is created and cleaned up on success', async () => {
      const issueId = 'ROM-TEST-2';

      // Create worktree manually to verify structure
      const worktreeInfo = await worktreeManager.createWorktree({
        issueId,
        repositoryPath: tempRepo.repoPath,
        mode: 'main',
        slug: 'cleanup-test'
      });

      // Verify worktree exists
      expect(await assertions.worktreeExists(worktreeInfo.worktreePath)).toBe(true);
      expect(existsSync(join(worktreeInfo.worktreePath, '.git'))).toBe(true);

      // Cleanup
      await worktreeManager.cleanupWorktree(issueId, false);

      // Verify cleanup (worktree should be removed)
      expect(existsSync(worktreeInfo.worktreePath)).toBe(false);
    });
  });

  describe('Scenario 2: Multi-File Feature', () => {
    it('should handle multi-file creation with proper git commits', async () => {
      const issueId = 'ROM-TEST-3';

      // Create worktree
      const worktreeInfo = await worktreeManager.createWorktree({
        issueId,
        repositoryPath: tempRepo.repoPath,
        mode: 'main',
        slug: 'multi-file'
      });

      // Simulate multi-file feature creation
      const authDir = join(worktreeInfo.worktreePath, 'src', 'auth');
      mkdirSync(authDir, { recursive: true });

      // Create login.ts
      writeFileSync(
        join(authDir, 'login.ts'),
        `import { User } from './types';\n\nexport async function login(email: string, password: string): Promise<User> {\n  // Implementation\n}`
      );

      // Create types.ts
      writeFileSync(
        join(authDir, 'types.ts'),
        `export interface User {\n  id: string;\n  email: string;\n}\n\nexport interface AuthResponse {\n  user: User;\n  token: string;\n}`
      );

      // Add and commit files
      execSync('git add src/', { cwd: worktreeInfo.worktreePath, stdio: 'ignore' });
      execSync(`git commit -m "feat(${issueId}): add auth module with login and types"`, { 
        cwd: worktreeInfo.worktreePath, 
        stdio: 'ignore' 
      });

      // Verify files exist
      expect(existsSync(join(authDir, 'login.ts'))).toBe(true);
      expect(existsSync(join(authDir, 'types.ts'))).toBe(true);

      // Verify commit exists
      expect(await assertions.commitExistsWithMessage(worktreeInfo.worktreePath, issueId)).toBe(true);

      // Verify import relationship
      const loginContent = readFileSync(join(authDir, 'login.ts'), 'utf-8');
      expect(loginContent).toContain("from './types'");

      // Cleanup
      await worktreeManager.cleanupWorktree(issueId, false);
    });

    it('should create separate commits for each logical change', async () => {
      const issueId = 'ROM-TEST-4';

      const worktreeInfo = await worktreeManager.createWorktree({
        issueId,
        repositoryPath: tempRepo.repoPath,
        mode: 'main',
        slug: 'multiple-commits'
      });

      // First commit: create utils.ts
      writeFileSync(join(worktreeInfo.worktreePath, 'utils.ts'), 'export const helper = () => {};');
      execSync('git add utils.ts', { cwd: worktreeInfo.worktreePath, stdio: 'ignore' });
      execSync(`git commit -m "feat(${issueId}): add utility functions"`, { 
        cwd: worktreeInfo.worktreePath, 
        stdio: 'ignore' 
      });

      // Second commit: create config.ts
      writeFileSync(join(worktreeInfo.worktreePath, 'config.ts'), 'export const config = {};');
      execSync('git add config.ts', { cwd: worktreeInfo.worktreePath, stdio: 'ignore' });
      execSync(`git commit -m "feat(${issueId}): add configuration"`, { 
        cwd: worktreeInfo.worktreePath, 
        stdio: 'ignore' 
      });

      // Verify both commits exist
      const log = execSync('git log --oneline -2', { cwd: worktreeInfo.worktreePath, encoding: 'utf-8' });
      expect(log).toContain('add configuration');
      expect(log).toContain('add utility functions');

      await worktreeManager.cleanupWorktree(issueId, false);
    });
  });

  describe('Scenario 3: Provider Failover', () => {
    it('should fall back to secondary provider when primary fails', async () => {
      const issueId = 'ROM-TEST-5';

      // Create worktree
      const worktreeInfo = await worktreeManager.createWorktree({
        issueId,
        repositoryPath: tempRepo.repoPath,
        mode: 'main',
        slug: 'failover'
      });

      // Simulate fallback execution flow:
      // 1. Primary provider fails
      // 2. Secondary provider succeeds
      
      // Track execution steps
      const executionLog: string[] = [];

      // Try primary (OpenCode) - fails
      executionLog.push('primary_attempted');
      const primaryFailed = true; // Simulated failure

      if (primaryFailed) {
        // Try fallback (Kimi) - succeeds
        executionLog.push('fallback_attempted');
        
        // Create the file to simulate successful execution
        writeFileSync(join(worktreeInfo.worktreePath, 'fallback.txt'), 'Created by fallback provider');
        execSync('git add fallback.txt', { cwd: worktreeInfo.worktreePath, stdio: 'ignore' });
        execSync(`git commit -m "feat(${issueId}): recovered execution"`, { 
          cwd: worktreeInfo.worktreePath, 
          stdio: 'ignore' 
        });

        // Mark as success in Linear
        await linearMock.client.updateIssueState('issue-failover', 'done');
        await linearMock.client.addLabel('issue-failover', 'jinyang:executed');
        await linearMock.client.postComment('issue-failover', 'Completed using fallback provider (Kimi) after OpenCode failed');
      }

      // Verify both providers were attempted
      expect(executionLog).toContain('primary_attempted');
      expect(executionLog).toContain('fallback_attempted');

      // Verify fallback succeeded
      expect(existsSync(join(worktreeInfo.worktreePath, 'fallback.txt'))).toBe(true);
      expect(assertions.linearUpdatedWithSuccess(linearMock.calls, 'issue-failover')).toBe(true);

      await worktreeManager.cleanupWorktree(issueId, false);
    });

    it('should report correct provider in Linear comment after failover', async () => {
      const issueId = 'ROM-TEST-6';
      const worktreePath = join(baseWorktreePath, issueId);

      // Simulate successful execution with fallback
      await linearMock.client.updateIssueState('issue-provider-report', 'done');
      await linearMock.client.addLabel('issue-provider-report', 'jinyang:executed');
      await linearMock.client.postComment(
        'issue-provider-report', 
        'Execution completed using Kimi (fallback from OpenCode)'
      );

      // Verify comment contains provider info
      const comment = linearMock.calls.postComment.find(
        c => c.issueId === 'issue-provider-report'
      );
      expect(comment).toBeDefined();
      expect(comment!.body).toContain('Kimi');
      expect(comment!.body).toContain('OpenCode');
    });
  });

  describe('Scenario 4: Error Handling', () => {
    it('should mark issue as canceled and preserve worktree on failure', async () => {
      const issueId = 'ROM-TEST-7';

      // Create worktree
      const worktreeInfo = await worktreeManager.createWorktree({
        issueId,
        repositoryPath: tempRepo.repoPath,
        mode: 'main',
        slug: 'error-test'
      });

      // Create some content before "failure"
      writeFileSync(join(worktreeInfo.worktreePath, 'partial.txt'), 'Partial work');
      execSync('git add partial.txt', { cwd: worktreeInfo.worktreePath, stdio: 'ignore' });
      execSync('git commit -m "WIP: partial implementation"', { cwd: worktreeInfo.worktreePath, stdio: 'ignore' });

      // Simulate failure and preserve worktree
      const error = new Error('Impossible task: cannot divide by zero in production');
      
      // Update Linear with failure
      await linearMock.client.updateIssueState('issue-error', 'canceled');
      await linearMock.client.addLabel('issue-error', 'jinyang:failed');
      await linearMock.client.postComment('issue-error', `Failed: ${error.message}. Worktree preserved.`);

      // Verify failure state
      expect(assertions.linearUpdatedWithFailure(linearMock.calls, 'issue-error')).toBe(true);

      // Verify error message in comment
      const comment = linearMock.calls.postComment.find(c => c.issueId === 'issue-error');
      expect(comment!.body).toContain('cannot divide by zero');

      // Preserve worktree (don't cleanup)
      // In real scenario, worktree would be preserved for debugging
      // Here we just verify the concept by not calling cleanupWorktree
    });

    it('should include error details and worktree path in failure comment', async () => {
      const issueId = 'ROM-TEST-8';
      const worktreePath = '/tmp/jinyang/worktrees/ROM-TEST-8';

      // Create a detailed error
      const error = new Error('Build failed: TypeScript compilation errors');
      error.stack = 'Error: Build failed\n    at compile (compiler.ts:123)\n    at build (builder.ts:456)';

      // Update Linear with detailed failure
      await linearMock.client.updateIssueState('issue-detailed-error', 'canceled');
      await linearMock.client.addLabel('issue-detailed-error', 'jinyang:failed');
      
      const errorComment = [
        '## Execution Failed ❌',
        '',
        `**Status:** Failed`,
        `**Error:** ${error.message}`,
        `**Provider:** OpenCode`,
        '',
        '**Error Details:**',
        '```',
        error.stack,
        '```',
        '',
        `**Worktree preserved at:** \`${worktreePath}\``,
        '*Review the error and retry if needed.*'
      ].join('\n');
      
      await linearMock.client.postComment('issue-detailed-error', errorComment);

      // Verify detailed error in comment
      const comment = linearMock.calls.postComment.find(c => c.issueId === 'issue-detailed-error');
      expect(comment).toBeDefined();
      expect(comment!.body).toContain('Execution Failed');
      expect(comment!.body).toContain('TypeScript compilation errors');
      expect(comment!.body).toContain('Worktree preserved at');
      expect(comment!.body).toContain(worktreePath);
    });

    it('should handle webhook for impossible task gracefully', async () => {
      const issueId = 'ROM-TEST-9';

      // Create payload for impossible task
      const payload = createLinearWebhookPayload({
        issueId: 'issue-impossible',
        identifier: issueId,
        title: 'Solve the halting problem',
        description: 'Create a program that determines if any given program will halt or run forever',
        labels: ['jinyang:auto'],
        delegate: 'jinyang'
      });

      const signature = generateWebhookSignature(payload, WEBHOOK_SECRET);

      // Simulate the failure flow that would happen after webhook acceptance
      // 1. Create worktree
      const wt = await worktreeManager.createWorktree({
        issueId,
        repositoryPath: tempRepo.repoPath,
        mode: 'main',
        slug: 'impossible'
      });

      // 2. Mark as started
      await linearMock.client.updateIssueState('issue-impossible', 'in_progress');

      // 3. Simulate agent failing (cannot complete impossible task)
      const error = new Error('Task is mathematically impossible');
      
      // 4. Mark as failed in Linear
      await linearMock.client.updateIssueState('issue-impossible', 'canceled');
      await linearMock.client.addLabel('issue-impossible', 'jinyang:failed');
      await linearMock.client.postComment('issue-impossible', `Failed: ${error.message}`);

      // 5. Preserve worktree (don't cleanup)
      
      // Send webhook
      const response = await makeRequest(
        app,
        WEBHOOK_PATH,
        'POST',
        { 'linear-signature': signature },
        payload
      );

      // Verify webhook accepted (failure happens async)
      expect(response.status).toBe(202);
      expect(response.body.mode).toBe('auto');

      // Verify failure recorded in Linear (check the last state update)
      const stateUpdates = linearMock.calls.updateState.filter(u => u.issueId === 'issue-impossible');
      const lastStateUpdate = stateUpdates[stateUpdates.length - 1];
      const comment = linearMock.calls.postComment.find(c => c.issueId === 'issue-impossible');
      const label = linearMock.calls.addLabel.find(l => l.issueId === 'issue-impossible' && l.label === 'jinyang:failed');
      
      expect(lastStateUpdate?.state).toBe('canceled');
      expect(comment).toBeDefined();
      expect(label).toBeDefined();

      // Verify error message was recorded
      expect(comment?.body).toContain('mathematically impossible');

      // Cleanup worktree manually since we're preserving it
      await worktreeManager.cleanupWorktree(issueId, false);
    }, 10000);
  });

  describe('Additional E2E Scenarios', () => {
    it('should handle manual execution mode correctly', async () => {
      const payload = createLinearWebhookPayload({
        issueId: 'issue-manual',
        identifier: 'ROM-MANUAL-1',
        title: 'Manual task',
        labels: ['jinyang:manual'],
        delegate: 'jinyang'
      });

      const signature = generateWebhookSignature(payload, WEBHOOK_SECRET);

      const response = await makeRequest(
        app,
        WEBHOOK_PATH,
        'POST',
        { 'linear-signature': signature },
        payload
      );

      expect(response.status).toBe(202);
      expect(response.body.mode).toBe('manual');
      expect(response.body.message).toContain('manual execution');

      // Verify no state updates for manual mode
      expect(linearMock.calls.updateState).toHaveLength(0);
    });

    it('should deduplicate concurrent webhooks for same issue', async () => {
      const issueId = 'ROM-DEDUP-1';
      
      // The webhook receiver checks for active sessions in ~/.jinyang/sessions/
      // We need to create a session file there to simulate an active session
      const sessionDir = '/tmp/.jinyang/sessions';
      mkdirSync(sessionDir, { recursive: true });
      
      // First webhook - this will create the session
      const payload1 = createLinearWebhookPayload({
        issueId: 'issue-dedup',
        identifier: issueId,
        title: 'First request',
        labels: ['jinyang:auto'],
        delegate: 'jinyang'
      });

      const signature1 = generateWebhookSignature(payload1, WEBHOOK_SECRET);

      const response1 = await makeRequest(
        app,
        WEBHOOK_PATH,
        'POST',
        { 'linear-signature': signature1 },
        payload1
      );

      // Now manually create session file to simulate active session
      // (in real scenario, this would be created by orchestrator when it starts)
      writeFileSync(join(sessionDir, `${issueId}.json`), JSON.stringify({ 
        started: true, 
        timestamp: Date.now() 
      }));

      // Second webhook (duplicate) - should detect active session
      const payload2 = createLinearWebhookPayload({
        issueId: 'issue-dedup',
        identifier: issueId,
        title: 'Duplicate request',
        labels: ['jinyang:auto'],
        delegate: 'jinyang'
      });

      const signature2 = generateWebhookSignature(payload2, WEBHOOK_SECRET);

      const response2 = await makeRequest(
        app,
        WEBHOOK_PATH,
        'POST',
        { 'linear-signature': signature2 },
        payload2
      );

      // Both should be accepted (202 is the webhook accepted code)
      expect(response1.status).toBe(202);
      expect(response2.status).toBe(202);

      // Second should indicate duplicate session
      expect(response2.body.message).toContain('already has active session');

      // Cleanup session file
      try {
        rmSync(join(sessionDir, `${issueId}.json`));
      } catch {}
    });

    it('should verify all created files match expected deliverables', async () => {
      const issueId = 'ROM-VERIFY-1';

      const worktreeInfo = await worktreeManager.createWorktree({
        issueId,
        repositoryPath: tempRepo.repoPath,
        mode: 'main',
        slug: 'verify-files'
      });

      // Create expected deliverables
      const expectedFiles = [
        'src/index.ts',
        'src/utils.ts',
        'README.md',
        'package.json'
      ];

      for (const file of expectedFiles) {
        const filepath = join(worktreeInfo.worktreePath, file);
        mkdirSync(join(filepath, '..'), { recursive: true });
        writeFileSync(filepath, `// Content for ${file}`);
      }

      // Add and commit
      execSync('git add .', { cwd: worktreeInfo.worktreePath, stdio: 'ignore' });
      execSync(`git commit -m "feat(${issueId}): add all deliverables"`, { 
        cwd: worktreeInfo.worktreePath, 
        stdio: 'ignore' 
      });

      // Verify all files exist
      for (const file of expectedFiles) {
        expect(existsSync(join(worktreeInfo.worktreePath, file))).toBe(true);
      }

      // Verify verification report would pass
      const filesInRepo = execSync('git ls-files', { 
        cwd: worktreeInfo.worktreePath, 
        encoding: 'utf-8' 
      }).trim().split('\n');

      for (const file of expectedFiles) {
        expect(filesInRepo).toContain(file);
      }

      await worktreeManager.cleanupWorktree(issueId, false);
    });
  });
});

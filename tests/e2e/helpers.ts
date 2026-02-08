import { vi } from 'vitest';
import type { AgentExecutionConfig, ExecutionResult, ProviderMetadata } from '../../src/executors/types.js';
import type { HealthStatus } from '../../src/types/index.js';
import { AgentExecutor } from '../../src/executors/base.js';
import type { ProviderConfig } from '../../src/types/index.js';

/**
 * Creates a realistic Linear webhook payload
 */
export function createLinearWebhookPayload(options: {
  action?: 'create' | 'update';
  issueId: string;
  identifier: string;
  title: string;
  description?: string;
  labels?: string[];
  delegate?: string;
  previousDelegate?: string | null;
  project?: string;
}): any {
  const {
    action = 'create',
    issueId,
    identifier,
    title,
    description = '',
    labels = [],
    delegate = 'jinyang',
    previousDelegate = null,
    project = 'Test Project'
  } = options;

  const payload: any = {
    action,
    type: 'Issue',
    data: {
      id: issueId,
      identifier,
      title,
      description,
      state: { name: 'Todo' },
      labels: { nodes: labels.map(name => ({ name })) },
      project: { name: project },
      delegate: { name: delegate }
    }
  };

  if (action === 'update' && previousDelegate !== undefined) {
    payload.updatedFrom = {
      delegate: previousDelegate ? { name: previousDelegate } : null
    };
  }

  return payload;
}

/**
 * Generates HMAC signature for webhook payload
 */
export function generateWebhookSignature(payload: any, secret: string): string {
  const crypto = require('crypto');
  const bodyString = JSON.stringify(payload);
  return crypto
    .createHmac('sha256', secret)
    .update(bodyString)
    .digest('hex');
}

/**
 * Mock AgentExecutor for testing
 */
export class MockAgentExecutor extends AgentExecutor {
  readonly providerType: import('../../src/types/index.js').ProviderType = 'opencode-glm47';
  readonly supportedModels = ['mock-model'];
  private providerName: string;

  private mockResult: ExecutionResult;
  private shouldFail: boolean;

  constructor(options: { 
    shouldFail?: boolean; 
    errorMessage?: string; 
    files?: string[]; 
    commits?: any[];
    providerName?: string;
  } = {}) {
    super();
    this.shouldFail = options.shouldFail ?? false;
    this.providerName = options.providerName ?? 'Mock';
    this.mockResult = {
      success: !this.shouldFail,
      files: options.files ?? [],
      gitCommits: options.commits ?? [],
      output: this.shouldFail ? (options.errorMessage ?? 'Mock execution failed') : 'Mock execution succeeded',
      duration: 1000,
      error: this.shouldFail ? (options.errorMessage ?? 'Mock execution failed') : undefined
    };
  }

  async execute(_config: AgentExecutionConfig): Promise<ExecutionResult> {
    // Simulate async execution
    await new Promise(resolve => setTimeout(resolve, 10));
    return this.mockResult;
  }

  async healthCheck(): Promise<HealthStatus> {
    return {
      provider: this.providerType,
      healthy: true,
      latency: 100
    };
  }

  getMetadata(): ProviderMetadata {
    return {
      name: `${this.providerName} Executor`,
      type: this.providerType,
      version: '1.0.0',
      supportedModels: this.supportedModels,
      features: ['mock']
    };
  }

  setMockResult(result: ExecutionResult): void {
    this.mockResult = result;
  }
}

/**
 * Mock ExecutorFactory that returns configured executors
 */
export class MockExecutorFactory {
  private executors: Map<string, AgentExecutor> = new Map();

  registerExecutor(provider: string, executor: AgentExecutor): void {
    this.executors.set(provider, executor);
  }

  createExecutor(provider: string, _config: ProviderConfig): AgentExecutor {
    const executor = this.executors.get(provider);
    if (!executor) {
      throw new Error(`No mock executor registered for provider: ${provider}`);
    }
    return executor;
  }

  getAvailableProviders(): string[] {
    return Array.from(this.executors.keys());
  }
}

/**
 * Track Linear API calls for verification
 */
export interface LinearAPICalls {
  updateState: Array<{ issueId: string; state: string }>;
  postComment: Array<{ issueId: string; body: string }>;
  addLabel: Array<{ issueId: string; label: string }>;
}

/**
 * Creates a mock Linear client that tracks all API calls
 */
export function createMockLinearClient(): {
  client: any;
  calls: LinearAPICalls;
  reset: () => void;
} {
  const calls: LinearAPICalls = {
    updateState: [],
    postComment: [],
    addLabel: []
  };

  const client = {
    updateIssueState: vi.fn().mockImplementation(async (issueId: string, state: string) => {
      calls.updateState.push({ issueId, state });
    }),
    postComment: vi.fn().mockImplementation(async (issueId: string, body: string) => {
      calls.postComment.push({ issueId, body });
    }),
    addLabel: vi.fn().mockImplementation(async (issueId: string, label: string) => {
      calls.addLabel.push({ issueId, label });
    }),
    getIssue: vi.fn().mockResolvedValue({
      id: 'mock-issue-id',
      identifier: 'ROM-TEST',
      title: 'Mock Issue',
      state: { name: 'Todo' }
    })
  };

  const reset = () => {
    calls.updateState = [];
    calls.postComment = [];
    calls.addLabel = [];
    vi.clearAllMocks();
  };

  return { client, calls, reset };
}

/**
 * Creates a temporary git repository for testing
 */
export async function createTempGitRepo(basePath: string): Promise<{
  repoPath: string;
  cleanup: () => void;
  commitFile: (filename: string, content: string, message: string) => Promise<string>;
}> {
  const { execSync } = require('child_process');
  const { mkdtempSync, writeFileSync, mkdirSync } = require('fs');
  const { join } = require('path');
  const { tmpdir } = require('os');

  const repoPath = mkdtempSync(join(tmpdir(), 'jinyang-e2e-'));

  // Initialize git repo
  execSync('git init', { cwd: repoPath, stdio: 'ignore' });
  execSync('git config user.email "test@jinyang.local"', { cwd: repoPath, stdio: 'ignore' });
  execSync('git config user.name "Test User"', { cwd: repoPath, stdio: 'ignore' });

  // Create initial commit
  writeFileSync(join(repoPath, 'README.md'), '# Test Repository\n');
  execSync('git add README.md', { cwd: repoPath, stdio: 'ignore' });
  execSync('git commit -m "Initial commit"', { cwd: repoPath, stdio: 'ignore' });

  const commitFile = async (filename: string, content: string, message: string): Promise<string> => {
    const filepath = join(repoPath, filename);
    const dir = require('path').dirname(filepath);
    if (dir !== repoPath) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filepath, content);
    execSync(`git add "${filename}"`, { cwd: repoPath, stdio: 'ignore' });
    execSync(`git commit -m "${message}"`, { cwd: repoPath, stdio: 'ignore' });
    
    return execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();
  };

  const cleanup = () => {
    try {
      require('fs').rmSync(repoPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  };

  return { repoPath, cleanup, commitFile };
}

/**
 * Waits for a condition to be true within a timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 5000,
  intervalMs: number = 100
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  return false;
}

/**
 * Helper to make HTTP requests in tests
 */
export async function makeRequest(
  app: any,
  path: string,
  method: string = 'GET',
  headers: Record<string, string> = {},
  body?: any
): Promise<{ status: number; body: any }> {
  const http = require('http');
  
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const options: any = {
        hostname: 'localhost',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };

      const req = http.request(options, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => data += chunk);
        res.on('end', () => {
          server.close();
          try {
            const parsedBody = data ? JSON.parse(data) : {};
            resolve({ status: res.statusCode || 0, body: parsedBody });
          } catch {
            resolve({ status: res.statusCode || 0, body: data });
          }
        });
      });

      req.on('error', (err: Error) => {
        server.close();
        reject(err);
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  });
}

/**
 * Assertion helpers for E2E tests
 */
export const assertions = {
  /**
   * Assert that a worktree exists at the given path
   */
  async worktreeExists(worktreePath: string): Promise<boolean> {
    const { existsSync } = require('fs');
    const { join } = require('path');
    return existsSync(join(worktreePath, '.git'));
  },

  /**
   * Assert that a file exists with specific content
   */
  fileExistsWithContent(filePath: string, expectedContent: string): boolean {
    const { existsSync, readFileSync } = require('fs');
    if (!existsSync(filePath)) return false;
    const content = readFileSync(filePath, 'utf-8');
    return content.includes(expectedContent);
  },

  /**
   * Assert that a git commit exists with the given message
   */
  async commitExistsWithMessage(repoPath: string, messagePattern: string | RegExp): Promise<boolean> {
    const { execSync } = require('child_process');
    try {
      const log = execSync('git log --oneline', { cwd: repoPath, encoding: 'utf-8' });
      if (typeof messagePattern === 'string') {
        return log.includes(messagePattern);
      }
      return messagePattern.test(log);
    } catch {
      return false;
    }
  },

  /**
   * Assert Linear was updated with success state
   */
  linearUpdatedWithSuccess(calls: LinearAPICalls, issueId: string): boolean {
    const stateUpdate = calls.updateState.find(u => u.issueId === issueId);
    const comment = calls.postComment.find(c => c.issueId === issueId);
    const label = calls.addLabel.find(l => l.issueId === issueId && l.label === 'jinyang:executed');
    
    return stateUpdate?.state === 'done' && 
           comment !== undefined && 
           label !== undefined;
  },

  /**
   * Assert Linear was updated with failure state
   */
  linearUpdatedWithFailure(calls: LinearAPICalls, issueId: string): boolean {
    const stateUpdate = calls.updateState.find(u => u.issueId === issueId);
    const comment = calls.postComment.find(c => c.issueId === issueId);
    const label = calls.addLabel.find(l => l.issueId === issueId && l.label === 'jinyang:failed');
    
    return (stateUpdate?.state === 'canceled' || stateUpdate?.state === 'failed') && 
           comment !== undefined && 
           label !== undefined;
  }
};

export default {
  createLinearWebhookPayload,
  generateWebhookSignature,
  MockAgentExecutor,
  MockExecutorFactory,
  createMockLinearClient,
  createTempGitRepo,
  waitFor,
  makeRequest,
  assertions
};

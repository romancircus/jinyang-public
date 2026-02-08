import { LinearClient as LinearSDKClient } from '@linear/sdk';
import { readFileSync } from 'fs';
import { resolve, join } from 'path';
import { homedir } from 'os';
import { Config } from '../types/index.js';

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  state: {
    id: string;
    name: string;
  };
  url: string;
  labels?: string[];
}

export type IssueState = 'backlog' | 'in_progress' | 'done' | 'canceled';

export interface IssueFilter {
  labels?: string[];
  state?: IssueState;
  states?: IssueState[];
}

/**
 * Custom error for rate limiting
 * Allows consumers to handle rate limits appropriately
 */
export class RateLimitError extends Error {
  public readonly resetTime: number | null;
  public readonly retryAfterMs: number;

  constructor(message: string, resetTime?: number) {
    super(message);
    this.name = 'RateLimitError';
    this.resetTime = resetTime ?? null;
    if (resetTime) {
      this.retryAfterMs = Math.max(0, resetTime - Date.now());
    } else {
      this.retryAfterMs = 60 * 1000;
    }
  }
}

export class LinearClient {
  private client: LinearSDKClient;
  private apiKey: string;
  private config: Config | null = null;
  private maxRetries = 3;
  private retryDelay = 1000;
  private timeoutMs = 30000;

  // Rate limit state - shared across all operations
  private static rateLimitResetTime: number | null = null;
  private static isRateLimited = false;

  // Request budget tracking - sliding window counter
  private static requestLog: number[] = [];
  private static readonly RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
  private static readonly RATE_LIMIT_BUDGET = 4500; // 500 buffer from 5000

  // Workflow state cache - states are static config, cache for 30 minutes
  private static stateCache: Map<string, { id: string; name: string }> | null = null;
  private static stateCacheExpiry = 0;
  private static readonly STATE_CACHE_TTL = 30 * 60 * 1000;

  // Label cache per team - labels don't change often
  private static labelCache: Map<string, Map<string, string>> = new Map();
  private static labelCacheExpiry: Map<string, number> = new Map();
  private static readonly LABEL_CACHE_TTL = 30 * 60 * 1000;

  constructor(configPath: string = './config/default.json') {
    const token = this.getLinearToken(configPath);
    this.apiKey = token;
    this.client = new LinearSDKClient({
      apiKey: token,
    });
  }

  // --- Request Budget Tracking ---

  private static trackRequest(): void {
    LinearClient.requestLog.push(Date.now());
    // Prune old entries every 100 requests
    if (LinearClient.requestLog.length % 100 === 0) {
      LinearClient.pruneRequestLog();
    }
  }

  private static pruneRequestLog(): void {
    const windowStart = Date.now() - LinearClient.RATE_LIMIT_WINDOW;
    LinearClient.requestLog = LinearClient.requestLog.filter(t => t > windowStart);
  }

  /**
   * Get number of requests made in the current 1-hour window
   */
  public static getRequestsInWindow(): number {
    LinearClient.pruneRequestLog();
    return LinearClient.requestLog.length;
  }

  /**
   * Get remaining request budget before approaching rate limit
   */
  public static getRemainingBudget(): number {
    return Math.max(0, LinearClient.RATE_LIMIT_BUDGET - LinearClient.getRequestsInWindow());
  }

  /**
   * Check if we're approaching the rate limit (budget-based)
   */
  public static isApproachingRateLimit(): boolean {
    return LinearClient.getRequestsInWindow() >= LinearClient.RATE_LIMIT_BUDGET;
  }

  // --- Rate Limit Status ---

  public static checkRateLimitStatus(): { isLimited: boolean; resetTime: number | null; retryInMs: number } {
    if (!LinearClient.isRateLimited) {
      return { isLimited: false, resetTime: null, retryInMs: 0 };
    }

    const now = Date.now();
    if (LinearClient.rateLimitResetTime && now >= LinearClient.rateLimitResetTime) {
      LinearClient.isRateLimited = false;
      LinearClient.rateLimitResetTime = null;
      return { isLimited: false, resetTime: null, retryInMs: 0 };
    }

    const retryInMs = LinearClient.rateLimitResetTime
      ? Math.max(0, LinearClient.rateLimitResetTime - now)
      : 60 * 1000;

    return { isLimited: true, resetTime: LinearClient.rateLimitResetTime, retryInMs };
  }

  public static clearRateLimitStatus(): void {
    LinearClient.isRateLimited = false;
    LinearClient.rateLimitResetTime = null;
  }

  public static clearCaches(): void {
    LinearClient.stateCache = null;
    LinearClient.stateCacheExpiry = 0;
    LinearClient.labelCache.clear();
    LinearClient.labelCacheExpiry.clear();
  }

  public static clearRequestLog(): void {
    LinearClient.requestLog = [];
  }

  // --- Raw GraphQL (eliminates N+1 queries) ---

  /**
   * Execute a raw GraphQL query against the Linear API.
   * Tracks the request in the budget counter and handles rate limit responses.
   */
  private async graphql<T = any>(query: string, variables?: Record<string, any>): Promise<T> {
    LinearClient.trackRequest();

    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Authorization': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (response.status === 429) {
      const resetTime = Date.now() + 60 * 60 * 1000;
      this.setRateLimited(resetTime);
      throw new RateLimitError('Rate limit exceeded (HTTP 429)', resetTime);
    }

    const json = await response.json() as any;

    if (json.errors) {
      const rlError = json.errors.find((e: any) =>
        e.extensions?.code === 'RATELIMITED' ||
        e.message?.toLowerCase().includes('rate limit')
      );
      if (rlError) {
        const resetTime = Date.now() + 60 * 60 * 1000;
        this.setRateLimited(resetTime);
        throw new RateLimitError(`Rate limit exceeded: ${rlError.message}`, resetTime);
      }
      throw new Error(`GraphQL error: ${json.errors[0].message}`);
    }

    return json.data as T;
  }

  // --- Internals ---

  private async withTimeout<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        const error = new Error(`Operation timed out after ${this.timeoutMs}ms`);
        error.name = 'AbortError';
        reject(error);
      }, this.timeoutMs);
    });

    return Promise.race([operation(), timeoutPromise]);
  }

  private loadConfig(configPath: string): Config | null {
    const home = homedir();
    const pathsToTry = [
      configPath,
      resolve(process.cwd(), configPath),
      resolve(join(home, 'Applications', 'jinyang'), 'config/default.json'),
      resolve(join(home, '.jinyang'), 'config.json'),
    ];

    for (const path of pathsToTry) {
      try {
        const configData = JSON.parse(readFileSync(path, 'utf-8')) as Config;
        console.log(`[Linear] Loaded config from: ${path}`);
        return configData;
      } catch {
        // Continue to next path
      }
    }

    return null;
  }

  private getLinearToken(configPath: string): string {
    const envToken = process.env.LINEAR_API_TOKEN || process.env.LINEAR_TOKEN;
    if (envToken) {
      console.log('[Linear] Using token from environment variable');
      return envToken;
    }

    this.config = this.loadConfig(configPath);

    if (this.config) {
      const generalRepo = this.config.repositories?.find(
        (r) => r.id === 'general'
      );
      if (generalRepo?.linearToken) {
        console.log(`[Linear] Using token from general repo in config`);
        return generalRepo.linearToken;
      }

      const firstActive = this.config.repositories?.find(
        (r) => r.isActive && r.linearToken
      );
      if (firstActive?.linearToken) {
        console.log(`[Linear] Using token from ${firstActive.id} repo in config`);
        return firstActive.linearToken;
      }
    }

    throw new Error(
      'No Linear token found. Set LINEAR_API_TOKEN environment variable or add linearToken to config/default.json'
    );
  }

  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes('rate limit') || message.includes('ratelimited')) {
        return true;
      }
    }
    if (typeof error === 'object' && error !== null) {
      const anyError = error as any;
      if (anyError.extensions?.code === 'RATELIMITED') return true;
      if (anyError.errors?.some((e: any) => e.extensions?.code === 'RATELIMITED')) return true;
    }
    return false;
  }

  private extractResetTime(error: unknown): number | undefined {
    if (error instanceof Error) {
      const match = error.message.match(/reset[^0-9]*(\d{13})/i);
      if (match) return parseInt(match[1], 10);
    }
    return Date.now() + 60 * 60 * 1000;
  }

  private setRateLimited(resetTime?: number): void {
    LinearClient.isRateLimited = true;
    LinearClient.rateLimitResetTime = resetTime ?? (Date.now() + 60 * 60 * 1000);
    console.log(`[Linear] Rate limited until ${new Date(LinearClient.rateLimitResetTime).toISOString()}`);
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    // Check reactive rate limit
    const rateLimitStatus = LinearClient.checkRateLimitStatus();
    if (rateLimitStatus.isLimited) {
      throw new RateLimitError(
        `Rate limited. Retry after ${Math.ceil(rateLimitStatus.retryInMs / 1000)} seconds`,
        rateLimitStatus.resetTime ?? undefined
      );
    }

    // Check proactive budget
    const remaining = LinearClient.getRemainingBudget();
    if (remaining <= 0) {
      console.log(`[Linear] Proactive rate limit: budget exhausted (${LinearClient.getRequestsInWindow()} requests in window)`);
      this.setRateLimited(Date.now() + 10 * 60 * 1000);
      throw new RateLimitError(
        'Proactive rate limit: request budget exhausted',
        Date.now() + 10 * 60 * 1000
      );
    }

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.withTimeout(operation, operationName);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (this.isRateLimitError(error)) {
          const resetTime = this.extractResetTime(error);
          this.setRateLimited(resetTime);
          throw new RateLimitError(
            `${operationName} rate limited: ${lastError.message}`,
            resetTime
          );
        }

        const isTimeout = lastError.name === 'AbortError' ||
                          lastError.message.includes('timeout') ||
                          lastError.message.includes('The operation was aborted');

        if (isTimeout) {
          console.log(
            `${operationName} timed out (attempt ${attempt}/${this.maxRetries}). Retrying...`
          );
        } else if (attempt < this.maxRetries) {
          console.log(
            `${operationName} failed (attempt ${attempt}/${this.maxRetries}): ${lastError.message}. Retrying...`
          );
        }

        if (attempt < this.maxRetries) {
          await this.sleep(this.retryDelay * attempt);
        }
      }
    }

    throw new Error(
      `${operationName} failed after ${this.maxRetries} attempts: ${lastError?.message}`
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // --- Public API Methods ---

  async updateIssueState(
    issueId: string,
    state: IssueState
  ): Promise<void> {
    await this.withRetry(async () => {
      const workflowState = await this.getStateByName(state);
      if (!workflowState) {
        throw new Error(`Workflow state '${state}' not found`);
      }

      LinearClient.trackRequest();
      await this.client.updateIssue(issueId, { stateId: workflowState.id });
    }, `Update issue ${issueId} state to ${state}`);
  }

  private async getStateByName(
    stateName: IssueState
  ): Promise<{ id: string; name: string } | null> {
    if (!LinearClient.stateCache || Date.now() > LinearClient.stateCacheExpiry) {
      LinearClient.trackRequest();
      const states = await this.client.workflowStates();
      LinearClient.stateCache = new Map();
      for (const state of states.nodes) {
        LinearClient.stateCache.set(state.name.toLowerCase(), { id: state.id, name: state.name });
      }
      LinearClient.stateCacheExpiry = Date.now() + LinearClient.STATE_CACHE_TTL;
    }

    const stateMap: Record<IssueState, string[]> = {
      backlog: ['backlog'],
      in_progress: ['in progress', 'started'],
      done: ['done', 'completed'],
      canceled: ['canceled', 'cancelled'],
    };

    const possibleNames = stateMap[stateName];
    for (const name of possibleNames) {
      const cached = LinearClient.stateCache.get(name);
      if (cached) return cached;
    }
    return null;
  }

  async postComment(issueId: string, body: string): Promise<void> {
    await this.withRetry(async () => {
      LinearClient.trackRequest();
      await this.client.createComment({ issueId, body });
    }, `Post comment to issue ${issueId}`);
  }

  /**
   * Add a label to an issue - OPTIMIZED
   *
   * Uses raw GraphQL to fetch issue data in 1 call (was 3 lazy loads).
   * Total: 2 API calls (1 query + 1 mutation) instead of 4-6.
   */
  async addLabel(issueId: string, labelName: string): Promise<void> {
    await this.withRetry(async () => {
      // Single GraphQL query for issue labels + team (1 API call instead of 3)
      const data = await this.graphql<{
        issue: {
          labels: { nodes: Array<{ id: string; name: string }> };
          team: { id: string } | null;
        } | null;
      }>(
        `query IssueLabelInfo($id: String!) {
          issue(id: $id) {
            labels { nodes { id name } }
            team { id }
          }
        }`,
        { id: issueId }
      );

      if (!data.issue) {
        throw new Error(`Issue ${issueId} not found`);
      }

      const existingLabels = data.issue.labels.nodes;
      if (existingLabels.some(l => l.name === labelName)) {
        console.log(`[Linear] Label '${labelName}' already exists on issue ${issueId}`);
        return;
      }

      const teamId = data.issue.team?.id;
      if (!teamId) {
        throw new Error(`Issue ${issueId} has no team`);
      }

      // Get label ID from cache or refresh
      let labelId = this.getCachedLabel(teamId, labelName);
      if (!labelId) {
        await this.refreshLabelCache(teamId);
        labelId = this.getCachedLabel(teamId, labelName);
      }

      // Create label if not found
      if (!labelId) {
        const created = await this.createLabel(teamId, labelName);
        if (created?.id) {
          labelId = created.id;
          this.setCachedLabel(teamId, labelName, created.id);
        }
      }

      if (!labelId) {
        throw new Error(`Failed to get or create label '${labelName}'`);
      }

      // Update with all label IDs (1 API call)
      LinearClient.trackRequest();
      await this.client.updateIssue(issueId, {
        labelIds: [...existingLabels.map(l => l.id), labelId],
      });
    }, `Add label '${labelName}' to issue ${issueId}`);
  }

  private getCachedLabel(teamId: string, name: string): string | undefined {
    const expiry = LinearClient.labelCacheExpiry.get(teamId);
    if (!expiry || Date.now() > expiry) return undefined;
    return LinearClient.labelCache.get(teamId)?.get(name);
  }

  private setCachedLabel(teamId: string, name: string, labelId: string): void {
    let teamLabels = LinearClient.labelCache.get(teamId);
    if (!teamLabels) {
      teamLabels = new Map();
      LinearClient.labelCache.set(teamId, teamLabels);
    }
    teamLabels.set(name, labelId);
  }

  private async refreshLabelCache(teamId: string): Promise<void> {
    LinearClient.trackRequest();
    const labels = await this.client.issueLabels({
      filter: { team: { id: { eq: teamId } } },
    });
    const teamLabels = new Map<string, string>();
    for (const label of labels.nodes) {
      teamLabels.set((label as any).name, label.id);
    }
    LinearClient.labelCache.set(teamId, teamLabels);
    LinearClient.labelCacheExpiry.set(teamId, Date.now() + LinearClient.LABEL_CACHE_TTL);
  }

  private async createLabel(teamId: string, name: string): Promise<any> {
    LinearClient.trackRequest();
    const result = await this.client.createIssueLabel({
      name,
      teamId,
      color: this.generateLabelColor(name),
    });
    if (!result || !(result as any).success) {
      throw new Error(`Failed to create label '${name}'`);
    }
    return (result as any).issueLabel || null;
  }

  private generateLabelColor(name: string): string {
    const colors: Record<string, string> = {
      'jinyang:executed': '#4CAF50',
      'jinyang:failed': '#F44336',
      'jinyang:auto': '#2196F3',
      'jinyang:manual': '#FF9800',
    };
    return colors[name] || '#9E9E9E';
  }

  /**
   * Get a single issue - OPTIMIZED
   *
   * Uses raw GraphQL to fetch issue + state + labels in 1 call (was 3).
   */
  async getIssue(issueId: string): Promise<LinearIssue> {
    return this.withRetry(async () => {
      const data = await this.graphql<{
        issue: {
          id: string;
          identifier: string;
          title: string;
          description: string | null;
          url: string;
          state: { id: string; name: string } | null;
          labels: { nodes: Array<{ id: string; name: string }> };
        } | null;
      }>(
        `query GetIssue($id: String!) {
          issue(id: $id) {
            id identifier title description url
            state { id name }
            labels { nodes { id name } }
          }
        }`,
        { id: issueId }
      );

      if (!data.issue) {
        throw new Error(`Issue ${issueId} not found`);
      }

      return {
        id: data.issue.id,
        identifier: data.issue.identifier,
        title: data.issue.title,
        description: data.issue.description ?? undefined,
        state: {
          id: data.issue.state?.id ?? '',
          name: data.issue.state?.name ?? 'Unknown',
        },
        url: data.issue.url,
        labels: data.issue.labels.nodes.map(l => l.name),
      };
    }, `Get issue ${issueId}`);
  }

  /**
   * List issues by filter criteria - OPTIMIZED
   *
   * Uses raw GraphQL to fetch all data in 1 call per page.
   * Previous version: ~51 API calls per page (N+1 on state + labels).
   * New version: 1 API call per page.
   */
  async listIssues(filter?: IssueFilter): Promise<LinearIssue[]> {
    return this.withRetry(async () => {
      const issues: LinearIssue[] = [];
      let hasMore = true;
      let cursor: string | null = null;
      const maxPages = 4;
      let pagesQueried = 0;

      // Build GraphQL filter
      const filterObj: any = { archivedAt: { null: true } };

      if (filter?.labels && filter.labels.length > 0) {
        filterObj.labels = { some: { name: { in: filter.labels } } };
      }

      if (filter?.states && filter.states.length > 0) {
        const stateMap: Record<IssueState, string[]> = {
          backlog: ['backlog', 'Backlog'],
          in_progress: ['in progress', 'In Progress', 'started', 'Started'],
          done: ['done', 'Done', 'completed', 'Completed'],
          canceled: ['canceled', 'Canceled', 'cancelled', 'Cancelled'],
        };

        const stateNames: string[] = [];
        for (const s of filter.states) {
          stateNames.push(...(stateMap[s] || []));
        }

        if (stateNames.length > 0) {
          filterObj.state = { name: { in: stateNames } };
        }
      }

      while (hasMore && pagesQueried < maxPages) {
        pagesQueried++;

        // Single GraphQL query per page -- fetches state + labels inline (no N+1)
        const data: ListIssuesResponse = await this.graphql(
          `query ListIssues($filter: IssueFilter, $first: Int, $after: String) {
            issues(filter: $filter, first: $first, after: $after) {
              nodes {
                id identifier title description url
                state { id name }
                labels { nodes { id name } }
              }
              pageInfo { hasNextPage endCursor }
            }
          }`,
          { filter: filterObj, first: 25, after: cursor }
        );

        for (const node of data.issues.nodes) {
          issues.push({
            id: node.id,
            identifier: node.identifier,
            title: node.title,
            description: node.description ?? undefined,
            state: {
              id: node.state?.id ?? '',
              name: node.state?.name ?? 'Unknown',
            },
            url: node.url,
            labels: node.labels.nodes.map((l: { id: string; name: string }) => l.name),
          });
        }

        hasMore = data.issues.pageInfo.hasNextPage;
        cursor = data.issues.pageInfo.endCursor ?? null;
      }

      console.log(`[Linear] listIssues: Found ${issues.length} issues in ${pagesQueried} API call(s)`);
      return issues;
    }, 'List issues');
  }
}

// Response type for listIssues GraphQL query (extracted to break circular inference)
interface ListIssuesResponse {
  issues: {
    nodes: Array<{
      id: string;
      identifier: string;
      title: string;
      description: string | null;
      url: string;
      state: { id: string; name: string } | null;
      labels: { nodes: Array<{ id: string; name: string }> };
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

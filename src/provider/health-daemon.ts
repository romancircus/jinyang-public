import * as fs from 'fs';
import * as path from 'path';

export interface ProviderHealth {
  name: string;
  healthy: boolean;
  lastCheck: string;
  lastError?: string;
  consecutiveErrors: number;
}

export interface HealthStatus {
  providers: ProviderHealth[];
  lastUpdated: string;
}

const STATUS_FILE = path.join(process.env.HOME || '', '.jinyang', 'providers', 'status.json');
const CHECK_INTERVAL = 30000;

export class HealthDaemon {
  private status: HealthStatus;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    this.status = this.loadStatus();
  }

  private loadStatus(): HealthStatus {
    const dir = path.dirname(STATUS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(STATUS_FILE)) {
      try {
        return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'));
      } catch (error) {
        console.error('Failed to load status file:', error);
      }
    }

    return {
      providers: [],
      lastUpdated: new Date().toISOString()
    };
  }

  private saveStatus(): void {
    try {
      fs.writeFileSync(STATUS_FILE, JSON.stringify(this.status, null, 2));
    } catch (error) {
      console.error('Failed to save status:', error);
    }
  }

  async checkProvider(provider: string): Promise<boolean> {
    const startTime = Date.now();
    let error: Error | null = null;
    let isHealthy = false;

    try {
      switch (provider) {
        case 'claude-code':
          this.checkClaudeCode();
          break;
        case 'opencode-glm47':
          this.checkOpenCode();
          break;
        case 'claude-code-api':
          this.checkClaudeCodeAPI();
          break;
        default:
          error = new Error(`Unknown provider: ${provider}`);
          console.log('[HealthCheck]', {
            provider,
            status: 'unknown',
            responseTime: Date.now() - startTime,
            error: error.message
          });
          return false;
      }
      isHealthy = true;
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
    }

    const duration = Date.now() - startTime;

    console.log('[HealthCheck]', {
      provider,
      status: isHealthy ? 'healthy' : 'unhealthy',
      responseTime: duration,
      error: error?.message || null
    });

    if (!isHealthy && error) {
      console.error(`[HealthCheck] Provider ${provider} failed:`, error.message);
    }

    return isHealthy;
  }

  private checkClaudeCode(): boolean {
    const token = process.env.CLAUDE_CODE_ACCESS_TOKEN;
    if (!token || token.length < 10) {
      throw new Error('Missing or invalid CLAUDE_CODE_ACCESS_TOKEN');
    }
    return true;
  }

  private checkOpenCode(): boolean {
    const token = process.env.OPENCODE_API_KEY;
    if (!token || token.length < 10) {
      throw new Error('Missing or invalid OPENCODE_API_KEY');
    }
    return true;
  }

  private checkClaudeCodeAPI(): boolean {
    const token = process.env.CLAUDE_CODE_API_KEY;
    if (!token || token.length < 10) {
      throw new Error('Missing or invalid CLAUDE_CODE_API_KEY');
    }
    return true;
  }

  async runHealthChecks(): Promise<void> {
    const providers = ['claude-code', 'opencode-glm47', 'claude-code-api'];

    for (const provider of providers) {
      const isHealthy = await this.checkProvider(provider);
      const existing = this.status.providers.find(p => p.name === provider);

      if (existing) {
        if (isHealthy) {
          existing.healthy = true;
          existing.lastCheck = new Date().toISOString();
          existing.consecutiveErrors = 0;
          delete existing.lastError;
        } else {
          existing.consecutiveErrors++;
          existing.healthy = existing.consecutiveErrors < 3;
          existing.lastCheck = new Date().toISOString();
          existing.lastError = 'Health check failed';
        }
      } else {
        this.status.providers.push({
          name: provider,
          healthy: isHealthy,
          lastCheck: new Date().toISOString(),
          consecutiveErrors: isHealthy ? 0 : 1,
          lastError: isHealthy ? undefined : 'Health check failed'
        });
      }
    }

    this.status.lastUpdated = new Date().toISOString();
    this.saveStatus();
  }

  start(): void {
    if (this.isRunning) {
      console.log('[HealthDaemon] Already running');
      return;
    }

    console.log('Starting health daemon...');
    this.isRunning = true;

    this.runHealthChecks().then(() => {
      if (!this.isRunning) return;

      this.intervalId = setInterval(() => {
        if (!this.isRunning) return;

        this.runHealthChecks().catch(error => {
          console.error('Health check error:', error);
        });
      }, CHECK_INTERVAL);
      console.log('Health daemon running, checking every 30 seconds');
    });
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log('Health daemon stopped');
  }

  get running(): boolean {
    return this.isRunning;
  }

  getStatus(): HealthStatus {
    return { ...this.status };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const daemon = new HealthDaemon();
  daemon.start();

  process.on('SIGINT', () => {
    daemon.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    daemon.stop();
    process.exit(0);
  });
}

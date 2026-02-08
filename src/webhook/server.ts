import express, { Application, Request, Response, NextFunction } from 'express';
import webhookRouter from './receiver.js';
import { ProviderRouter } from '../provider/router.js';
import { HealthDaemon } from '../provider/health-daemon.js';
import { WorktreeManager } from '../worktree/manager.js';

export interface ServerConfig {
  port: number;
  webhookPath: string;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    webhook: 'ok' | 'error';
    providers: { [id: string]: 'healthy' | 'degraded' | 'unhealthy' };
    worktrees: { active: number; total: number };
  };
  timestamp: string;
  version: string;
}

let providerRouter: ProviderRouter | null = null;
let healthDaemon: HealthDaemon | null = null;
let worktreeManager: WorktreeManager | null = null;

export function setServerDependencies(
  router: ProviderRouter,
  daemon: HealthDaemon,
  worktrees: WorktreeManager
): void {
  providerRouter = router;
  healthDaemon = daemon;
  worktreeManager = worktrees;
}

export function createServer(config: ServerConfig): Application {
  const app = express();

  // Preserve raw body for webhook signature verification
  app.use(config.webhookPath, express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf.toString();
    }
  }));

  // General JSON parsing for other routes
  app.use(express.json());

  // Mount webhook router
  app.use(webhookRouter);

  // Basic health check endpoint (lightweight)
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Comprehensive health check endpoint
  app.get('/health/detailed', async (req: Request, res: Response) => {
    try {
      const health = await getDetailedHealth();
      const statusCode = health.status === 'unhealthy' ? 503 : 200;
      res.status(statusCode).json(health);
    } catch (error) {
      res.status(500).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
      });
    }
  });

  // Provider health status endpoint
  app.get('/health/providers', async (req: Request, res: Response) => {
    try {
      const providerHealth = await getProviderHealth();
      res.status(200).json(providerHealth);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Global error handler (must be last)
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('[Express] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

async function getDetailedHealth(): Promise<HealthResponse> {
  const version = process.env.npm_package_version || '1.0.0';
  const timestamp = new Date().toISOString();

  // Check webhook status
  const webhookStatus: 'ok' | 'error' = 'ok'; // Webhook endpoint is up if we can respond

  // Check provider health
  const providers: { [id: string]: 'healthy' | 'degraded' | 'unhealthy' } = {};
  let hasUnhealthyProvider = false;
  let hasDegradedProvider = false;

  if (healthDaemon) {
    const status = healthDaemon.getStatus();
    for (const provider of status.providers) {
      if (provider.healthy) {
        providers[provider.name] = 'healthy';
      } else if (provider.consecutiveErrors < 3) {
        providers[provider.name] = 'degraded';
        hasDegradedProvider = true;
      } else {
        providers[provider.name] = 'unhealthy';
        hasUnhealthyProvider = true;
      }
    }
  } else {
    // Fallback: check via provider router
    if (providerRouter) {
      const healthStatus = await providerRouter.getHealthStatus();
      for (const status of healthStatus) {
        providers[status.provider] = status.healthy ? 'healthy' : 'unhealthy';
        if (!status.healthy) hasUnhealthyProvider = true;
      }
    }
  }

  // Check worktree status
  const worktreeStatus = { active: 0, total: 0 };
  if (worktreeManager) {
    worktreeStatus.active = worktreeManager.getActiveWorktrees().size;
    // Total is a bit harder to get without scanning filesystem
    worktreeStatus.total = worktreeStatus.active;
  }

  // Determine overall status
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (hasUnhealthyProvider) {
    overallStatus = 'unhealthy';
  } else if (hasDegradedProvider) {
    overallStatus = 'degraded';
  }

  return {
    status: overallStatus,
    components: {
      webhook: webhookStatus,
      providers,
      worktrees: worktreeStatus
    },
    timestamp,
    version
  };
}

async function getProviderHealth(): Promise<import('../types/index.js').ProviderHealthResponse> {
  const timestamp = new Date().toISOString();
  const providers: import('../types/index.js').ProviderHealthInfo[] = [];

  // Get health status from health daemon if available
  if (healthDaemon) {
    const daemonStatus = healthDaemon.getStatus();

    for (const provider of daemonStatus.providers) {
      providers.push({
        name: provider.name,
        healthy: provider.healthy,
        circuitBreakerState: provider.consecutiveErrors >= 3 ? 'open' :
                            provider.consecutiveErrors > 0 ? 'half-open' : 'closed',
        lastCheck: provider.lastCheck,
        consecutiveErrors: provider.consecutiveErrors,
        lastError: provider.lastError
      });
    }
  } else if (providerRouter) {
    // Fallback: get from provider router
    const routerStatus = await providerRouter.getHealthStatus();

    for (const status of routerStatus) {
      providers.push({
        name: status.provider,
        healthy: status.healthy,
        circuitBreakerState: 'closed', // Router doesn't track circuit breaker state directly
        lastCheck: timestamp,
        consecutiveErrors: status.healthy ? 0 : 1,
        lastError: status.error,
        latency: status.latency
      });
    }
  }

  const healthy = providers.filter(p => p.healthy).length;
  const unhealthy = providers.filter(p => !p.healthy).length;

  return {
    providers,
    timestamp,
    total: providers.length,
    healthy,
    unhealthy
  };
}

export function startServer(app: Application, port: number): Promise<ReturnType<typeof app.listen>> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`jinyang webhook server running on port ${port}`);
      resolve(server);
    });

    server.on('error', (err: Error) => {
      console.error(`[Server] Failed to start: ${err.message}`);
      reject(err);
    });
  });
}

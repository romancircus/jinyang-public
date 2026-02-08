import dotenv from 'dotenv';
dotenv.config();

import { loadConfig, validateConfig } from './config/index.js';
import { createServer, startServer, setServerDependencies } from './webhook/server.js';
import { ProviderRouter } from './provider/router.js';
import { HealthDaemon } from './provider/health-daemon.js';
import { WorktreeManager } from './worktree/manager.js';
import { LinearPoller } from './linear/poller.js';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Export orchestrator promise for webhook handler
export let orchestrator: any = null;

// Initialize orchestrator (loads routing config) - dynamic import after dotenv
async function initializeOrchestrator() {
  const { createOrchestrator } = await import('./orchestrator/index.js');
  orchestrator = createOrchestrator();
  await orchestrator.initialize();
  console.log('[Startup] Orchestrator initialized, routing config loaded');
  return orchestrator;
}

// Ensure required directories exist
function ensureDirectories(config: { worktreeBase: string; logPath: string }): void {
  const dirs = [config.worktreeBase, config.logPath];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`[Startup] Created directory: ${dir}`);
    }
  }
  
  // Also ensure session tracking directory
  const sessionDir = join(process.env.HOME || '', '.jinyang', 'sessions');
  if (!existsSync(sessionDir)) {
    mkdirSync(sessionDir, { recursive: true });
  }
}

// Print startup banner
function printStartupBanner(config: { port: number }, providerCount: number): void {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║           jinyang - Linear Agent Server                ║');
  console.log('║         OpenCode-native with Multi-Tier Routing        ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log(`║  Port:        ${config.port.toString().padEnd(40)} ║`);
  console.log(`║  Providers:   ${providerCount.toString().padEnd(40)} ║`);
  console.log(`║  Webhook:     /webhooks/linear${''.padEnd(26)} ║`);
  console.log(`║  Health:      /health${''.padEnd(33)} ║`);
  console.log('╚════════════════════════════════════════════════════════╝\n');
}

// Initialize and start server
async function main() {
  const startTime = Date.now();
  
  try {
    // Load and validate configuration
    console.log('[Startup] Loading configuration...');
    const config = loadConfig();
    const validation = validateConfig(config);
    
    if (!validation.valid) {
      console.error('[Startup] Configuration errors:');
      for (const error of validation.errors) {
        console.error(`  - ${error}`);
      }
      process.exit(1);
    }
    
    console.log('[Startup] Configuration loaded successfully');
    
    // Ensure directories exist
    ensureDirectories(config);
    
    // Initialize health daemon
    console.log('[Startup] Initializing health daemon...');
    const healthDaemon = new HealthDaemon();
    healthDaemon.start();
    
    // Initialize worktree manager
    console.log('[Startup] Initializing worktree manager...');
    const worktreeManager = new WorktreeManager(config.worktreeBase);
    
    // Initialize provider router
    console.log('[Startup] Initializing provider router...');
    const providerRouter = new ProviderRouter();
    const providers = providerRouter.getEnabledProviders();
    
    // Initialize orchestrator
    await initializeOrchestrator();
    
    // Create Express app
    const app = createServer({
      port: config.port,
      webhookPath: '/webhooks'
    });
    
    // Set dependencies for health checks
    setServerDependencies(providerRouter, healthDaemon, worktreeManager);
    
    // Start Linear poller
    const poller = new LinearPoller(orchestrator);
    poller.start();
    console.log('[Startup] Linear poller started (5min interval)');
    
    // Start HTTP server
    const server = await startServer(app, config.port);
    
    // Print startup banner
    printStartupBanner(config, providers.length);
    
    const startupTime = Date.now() - startTime;
    console.log(`[Startup] Server ready in ${startupTime}ms`);
    
    // Graceful shutdown handlers
    process.on('SIGTERM', () => {
      console.log('[Shutdown] SIGTERM received, shutting down gracefully...');
      shutdown(server, poller, healthDaemon, providerRouter);
    });

    process.on('SIGINT', () => {
      console.log('[Shutdown] SIGINT received, shutting down gracefully...');
      shutdown(server, poller, healthDaemon, providerRouter);
    });

  } catch (err) {
    console.error('[Startup] Fatal error:', err);
    process.exit(1);
  }
}

function shutdown(
  server: any,
  poller: LinearPoller,
  healthDaemon: HealthDaemon,
  providerRouter: ProviderRouter
): void {
  console.log('[Shutdown] Stopping services...');
  
  poller.stop();
  healthDaemon.stop();
  providerRouter.cleanup();
  
  server.close(() => {
    console.log('[Shutdown] Server closed successfully');
    process.exit(0);
  });
  
  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('[Shutdown] Forced exit after timeout');
    process.exit(1);
  }, 10000);
}

main();

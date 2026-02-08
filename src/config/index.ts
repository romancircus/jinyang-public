export interface JinyangConfig {
  // Server
  port: number;
  webhookSecret: string;

  // Paths
  worktreeBase: string;
  logPath: string;

  // Providers
  opencodeApiKey?: string;
  kimiApiKey?: string;

  // Timeouts
  defaultTimeoutMs: number;
  healthCheckIntervalMs: number;
}

export function loadConfig(): JinyangConfig {
  // Server config with backward compatibility for old LILINGLING_* names
  const port = parseInt(
    process.env.JINYANG_PORT ||
    process.env.LILINGLING_PORT ||
    process.env.PORT ||
    '3000',
    10
  );
  const host = process.env.JINYANG_HOST || process.env.LILINGLING_HOST || '0.0.0.0';
  const webhookSecret = process.env.LINEAR_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn('[Config] Warning: LINEAR_WEBHOOK_SECRET not set - webhook verification will fail');
  }

  return {
    port,
    webhookSecret: webhookSecret || '',
    worktreeBase: process.env.JINYANG_WORKTREE_BASE || `${process.env.HOME}/.jinyang/worktrees`,
    logPath: process.env.JINYANG_LOG_PATH || `${process.env.HOME}/.jinyang/logs`,
    opencodeApiKey: process.env.OPENCODE_API_KEY,
    kimiApiKey: process.env.KIMI_API_KEY,
    defaultTimeoutMs: parseInt(process.env.JINYANG_DEFAULT_TIMEOUT_MS || '300000', 10),
    healthCheckIntervalMs: parseInt(process.env.JINYANG_HEALTH_INTERVAL_MS || '60000', 10)
  };
}

export function validateConfig(config: JinyangConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.webhookSecret) {
    errors.push('LINEAR_WEBHOOK_SECRET is required');
  }

  if (config.port < 1 || config.port > 65535) {
    errors.push(`Invalid port: ${config.port}`);
  }

  if (!config.opencodeApiKey && !config.kimiApiKey) {
    errors.push('At least one provider API key required (OPENCODE_API_KEY or KIMI_API_KEY)');
  }

  if (config.defaultTimeoutMs < 1000) {
    errors.push('Default timeout must be at least 1000ms');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

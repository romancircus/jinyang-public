import * as fs from 'fs/promises';
import * as path from 'path';
import { Config } from '../types/index.js';
import { JinyangConfig, createDefaultJinyangConfig } from '../config/jinyang.js';

const JINYANG_CONFIG_PATH = path.join(process.env.HOME || '/tmp', '.jinyang/config.json');
const LOCAL_CONFIG_PATH = path.join(process.cwd(), 'config/default.json');

export async function loadJinyangConfig(): Promise<JinyangConfig> {
  const content = await fs.readFile(JINYANG_CONFIG_PATH, 'utf-8');
  return JSON.parse(content);
}

export async function loadConfig(): Promise<Config> {
  // Try jinyang config first
  try {
    const jinyangConfig = await loadJinyangConfig();
    return convertJinyangToLegacyConfig(jinyangConfig);
  } catch {
    // Fall back to local config
    const content = await fs.readFile(LOCAL_CONFIG_PATH, 'utf-8');
    return JSON.parse(content);
  }
}

export async function loadConfigWithMigration(): Promise<{ config: Config; source: 'jinyang' | 'local'; jinyangConfig?: JinyangConfig }> {
  // Try jinyang config first
  try {
    const jinyangConfig = await loadJinyangConfig();
    return {
      config: convertJinyangToLegacyConfig(jinyangConfig),
      source: 'jinyang',
      jinyangConfig,
    };
  } catch {
    console.log('[Config] Jinyang config not found, using local...');
  }

  // Fall back to local config
  const content = await fs.readFile(LOCAL_CONFIG_PATH, 'utf-8');
  const localConfig = JSON.parse(content);
  return {
    config: localConfig,
    source: 'local',
  };
}

export function convertJinyangToLegacyConfig(jinyangConfig: JinyangConfig): Config {
  return {
    repositories: jinyangConfig.repositories.map(repo => ({
      id: repo.id,
      name: repo.name,
      repositoryPath: repo.repositoryPath,
      baseBranch: repo.baseBranch,
      workspaceBaseDir: repo.worktreeBaseDir,
      isActive: repo.isActive,
      linearWorkspaceId: repo.linearWorkspaceId,
      linearWorkspaceName: repo.linearWorkspaceName,
      routingLabels: repo.routingLabels,
      projectKeys: repo.projectKeys,
      linearToken: repo.linearToken,
      linearRefreshToken: repo.linearRefreshToken,
    })),
  };
}

export async function reloadConfig(): Promise<Config> {
  const config = await loadConfig();
  return config;
}

export async function saveJinyangConfig(config: JinyangConfig): Promise<void> {
  const configDir = path.dirname(JINYANG_CONFIG_PATH);
  try {
    await fs.mkdir(configDir, { recursive: true });
  } catch {
    // Directory might already exist
  }
  await fs.writeFile(JINYANG_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export async function ensureJinyangConfig(): Promise<JinyangConfig> {
  try {
    return await loadJinyangConfig();
  } catch {
    // Create default jinyang config
    const defaultConfig = createDefaultJinyangConfig();
    await saveJinyangConfig(defaultConfig);
    return defaultConfig;
  }
}

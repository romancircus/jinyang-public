/**
 * TokenManager - Kimi OAuth Token Management with Refresh Daemon
 *
 * ## Implementation Approach
 *
 * This module directly reads OAuth tokens from `~/.opencode-kimi-auth/oauth.json`.
 * The `opencode-kimi-auth` package is used as a dependency for type definitions,
 * but this implementation provides its own refresh logic for better control.
 *
 * ### Alternative Approach: Use Plugin Auth Loader
 *
 * If you prefer to use the plugin's built-in auth system:
 *
 * 1. Import the plugin:
 *    ```typescript
 *    import KimiAuthPlugin from 'opencode-kimi-auth';
 *    ```
 *
 * 2. Use the plugin's auth loader:
 *    ```typescript
 *    const plugin = await KimiAuthPlugin({});
 *    const headers = await plugin.auth.loader(authCallback);
 *    ```
 *
 * ### Direct Code Copy Approach
 *
 * If you prefer to avoid the npm dependency entirely:
 *
 * 1. Clone the opencode-kimi-auth repository:
 *    ```bash
 *    git clone https://github.com/your-org/opencode-kimi-auth.git
 *    ```
 *
 * 2. Copy the relevant files to your project:
 *    ```bash
 *    cp opencode-kimi-auth/src/oauth.ts src/lib/kimi-oauth.ts
 *    ```
 *
 * 3. Update this file to import from your local copy.
 *
 * 4. Remove the npm dependency:
 *    ```bash
 *    npm uninstall opencode-kimi-auth
 *    ```
 *
 * ### Plugin Location
 *
 * - **NPM Package:** https://www.npmjs.com/package/opencode-kimi-auth
 * - **Source Repository:** https://github.com/your-org/opencode-kimi-auth
 * - **Current Version:** ^0.1.0
 *
 * ### OAuth Token Storage
 *
 * Tokens are stored at: `~/.opencode-kimi-auth/oauth.json`
 * Device ID is stored at: `~/.opencode-kimi-auth/device_id`
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// Constants from opencode-kimi-auth
const REFRESH_INTERVAL_MS = 60 * 1000; // 60 seconds
const EXPIRY_THRESHOLD_S = 300; // 5 minutes before expiry

interface TokenState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  lastRefreshed: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

// OAuth constants
const CLIENT_ID = process.env.KIMI_CLIENT_ID || 'your-kimi-client-id';
const TOKEN_ENDPOINT = 'https://auth.kimi.com/api/oauth/token';
const AUTH_DIR = path.join(os.homedir(), '.opencode-kimi-auth');
const TOKEN_FILE = path.join(AUTH_DIR, 'oauth.json');

/**
 * Load OAuth token from storage file
 * Returns null if no token exists or if token is invalid
 */
async function loadOAuthToken(): Promise<TokenResponse | null> {
  try {
    const data = await fs.readFile(TOKEN_FILE, 'utf-8');
    const stored = JSON.parse(data);

    if (!stored.access_token || !stored.expires_at) {
      return null;
    }

    // Check if token is expired or about to expire (within 5 minutes)
    const expiresSoon = stored.expires_at - Date.now() < 300000;

    if (expiresSoon && stored.refresh_token) {
      // Token expiring soon - caller should refresh
      return {
        access_token: stored.access_token,
        refresh_token: stored.refresh_token,
        expires_in: Math.floor((stored.expires_at - Date.now()) / 1000),
        token_type: stored.token_type || 'Bearer',
        scope: stored.scope
      };
    }

    return {
      access_token: stored.access_token,
      refresh_token: stored.refresh_token,
      expires_in: Math.floor((stored.expires_at - Date.now()) / 1000),
      token_type: stored.token_type || 'Bearer',
      scope: stored.scope
    };
  } catch {
    return null;
  }
}

/**
 * Store OAuth token to storage file
 */
async function storeOAuthToken(token: TokenResponse): Promise<void> {
  const storedToken = {
    ...token,
    expires_at: Date.now() + (token.expires_in * 1000)
  };
  await fs.mkdir(AUTH_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(TOKEN_FILE, JSON.stringify(storedToken, null, 2), { mode: 0o600 });
}

/**
 * Get or generate device ID for Kimi API
 */
async function getDeviceId(): Promise<string> {
  const deviceIdFile = path.join(AUTH_DIR, 'device_id');
  try {
    const id = await fs.readFile(deviceIdFile, 'utf-8');
    return id.trim();
  } catch {
    // Generate new device ID
    const id = crypto.randomUUID();
    await fs.mkdir(AUTH_DIR, { recursive: true, mode: 0o700 });
    await fs.writeFile(deviceIdFile, id, { mode: 0o600 });
    return id;
  }
}

/**
 * Get device headers for Kimi API requests
 */
async function getDeviceHeaders(): Promise<Record<string, string>> {
  const deviceId = await getDeviceId();
  return {
    'X-Msh-Platform': 'opencode',
    'X-Msh-Version': '0.1.0',
    'X-Msh-Device-Name': os.hostname(),
    'X-Msh-Device-Model': `${os.platform()}-${os.arch()}`,
    'X-Msh-Os-Version': os.release(),
    'X-Msh-Device-Id': deviceId,
    'Content-Type': 'application/x-www-form-urlencoded'
  };
}

/**
 * Refresh OAuth token using refresh token
 */
async function performTokenRefresh(refreshTokenStr: string): Promise<TokenResponse> {
  const headers = await getDeviceHeaders();
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshTokenStr,
    client_id: CLIENT_ID
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers,
    body: params.toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const tokenData = await response.json() as TokenResponse;

  if (!tokenData.access_token) {
    throw new Error('Invalid refresh response: missing access_token');
  }

  // Preserve refresh token if not returned
  if (!tokenData.refresh_token) {
    tokenData.refresh_token = refreshTokenStr;
  }

  // Store the new token
  await storeOAuthToken(tokenData);

  return tokenData;
}

/**
 * TokenManager handles Kimi OAuth token lifecycle with automatic refresh
 *
 * Features:
 * - Loads OAuth tokens from ~/.opencode-kimi-auth/oauth.json
 * - Auto-refreshes tokens before expiry (5 minute threshold)
 * - Falls back to KIMI_API_KEY environment variable
 * - Background refresh daemon prevents token expiration during long-running sessions
 */
export class TokenManager {
  private tokenCache: Map<string, TokenState> = new Map();
  private refreshTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private timer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  /**
   * Initialize the TokenManager and start the refresh daemon
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Load initial token state
    await this.loadTokenState();

    // Start background refresh daemon
    this.startRefreshDaemon();

    this.initialized = true;
    console.log('[TokenManager] Initialized with refresh daemon');
  }

  /**
   * Get the current Kimi OAuth token
   * Returns null if no valid OAuth token is available
   */
  async getKimiOAuthToken(): Promise<string | null> {
    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    // Load token from storage (includes check for expiry)
    const token = await loadOAuthToken();

    if (token && token.access_token) {
      // Check if token needs refresh (expiring within threshold)
      const expiresSoon = token.expires_in <= EXPIRY_THRESHOLD_S;

      if (expiresSoon && token.refresh_token) {
        // Token expiring soon, refresh it
        try {
          const refreshed = await performTokenRefresh(token.refresh_token);

          // Update cache with refreshed token
          const state: TokenState = {
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token,
            expiresAt: Date.now() + (refreshed.expires_in * 1000),
            lastRefreshed: Date.now()
          };
          this.tokenCache.set('kimi', state);

          return refreshed.access_token;
        } catch (error) {
          console.error('[TokenManager] Failed to refresh expiring token:', error);
          // Return the existing token even though it might expire soon
        }
      }

      // Update cache with current token
      const state: TokenState = {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: Date.now() + (token.expires_in * 1000),
        lastRefreshed: Date.now()
      };
      this.tokenCache.set('kimi', state);

      return token.access_token;
    }

    // No valid OAuth token found
    return null;
  }

  /**
   * Get the Kimi API key from environment variables
   * Returns KIMI_API_KEY or null if not set
   */
  async getKimiApiKey(): Promise<string | null> {
    const apiKey = process.env.KIMI_API_KEY;

    if (apiKey && apiKey.startsWith('kimi-api-')) {
      return apiKey;
    }

    return null;
  }

  /**
   * Load existing token state from cache file if available
   */
  private async loadTokenState(): Promise<void> {
    const authPath = path.join(os.homedir(), '.opencode-kimi-auth', 'oauth.json');

    try {
      const content = await fs.readFile(authPath, 'utf8');
      const stored = JSON.parse(content);

      if (stored.access_token && stored.expires_at) {
        const state: TokenState = {
          accessToken: stored.access_token,
          refreshToken: stored.refresh_token,
          expiresAt: stored.expires_at,
          lastRefreshed: Date.now()
        };
        this.tokenCache.set('kimi', state);
      }
    } catch {
      // No stored token yet, that's okay
    }
  }

  /**
   * Start the background refresh daemon
   * Checks every 60 seconds if token needs refresh (within 5 min of expiry)
   */
  private startRefreshDaemon(): void {
    // Clear any existing timer (single-instance guard)
    if (this.timer) {
      clearInterval(this.timer);
    }
    const existingTimer = this.refreshTimers.get('kimi');
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    // Start new refresh timer
    this.timer = setInterval(async () => {
      const state = this.tokenCache.get('kimi');
      if (!state || !state.refreshToken) {
        return;
      }

      const secondsUntilExpiry = Math.floor((state.expiresAt - Date.now()) / 1000);

      // Refresh if within threshold (5 minutes before expiry)
      if (secondsUntilExpiry <= EXPIRY_THRESHOLD_S) {
        try {
          console.log('[TokenManager] Token expiring soon, refreshing...');
          await this.refreshToken(state.refreshToken);
        } catch (error) {
          console.error('[TokenManager] Failed to refresh token:', error);
        }
      }
    }, REFRESH_INTERVAL_MS);

    this.refreshTimers.set('kimi', this.timer);
    console.log('[TokenManager] Refresh daemon started (interval: 60s)');
  }

  /**
   * Refresh the OAuth token using a refresh token
   */
  private async refreshToken(refreshTokenStr: string): Promise<TokenResponse> {
    try {
      const newToken = await performTokenRefresh(refreshTokenStr);

      // Update cache
      const state: TokenState = {
        accessToken: newToken.access_token,
        refreshToken: newToken.refresh_token || refreshTokenStr,
        expiresAt: Date.now() + (newToken.expires_in * 1000),
        lastRefreshed: Date.now()
      };
      this.tokenCache.set('kimi', state);

      console.log('[TokenManager] Token refreshed successfully');
      return newToken;
    } catch (error) {
      console.error('[TokenManager] Token refresh failed:', error);
      throw error;
    }
  }

  /**
   * Get current token state (for debugging/monitoring)
   */
  getTokenState(): TokenState | null {
    return this.tokenCache.get('kimi') || null;
  }

  /**
   * Check if OAuth token is available and not expired
   */
  async hasValidToken(): Promise<boolean> {
    const token = await this.getKimiOAuthToken();
    if (!token) return false;

    const state = this.tokenCache.get('kimi');
    if (!state) return false;

    return Date.now() < state.expiresAt;
  }

  /**
   * Cleanup resources when shutting down
   * Stops all refresh timers
   */
  cleanup(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const [key, timer] of this.refreshTimers.entries()) {
      clearInterval(timer);
      console.log(`[TokenManager] Stopped refresh timer for ${key}`);
    }
    this.refreshTimers.clear();
    this.tokenCache.clear();
    this.initialized = false;
    console.log('[TokenManager] Cleaned up');
  }
}

// Export singleton instance for convenience
export const tokenManager = new TokenManager();

// Handle graceful shutdown
process.on('SIGINT', () => {
  tokenManager.cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  tokenManager.cleanup();
  process.exit(0);
});

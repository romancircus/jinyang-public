import { createOpencode, type OpencodeClient } from '@opencode-ai/sdk';

export interface OpenCodeInstance {
  client: OpencodeClient;
  server: {
    url: string;
    close(): void;
  };
}

export class OpenCodeClientManager {
  private instance: OpenCodeInstance | null = null;
  private isInitializing: boolean = false;
  private initPromise: Promise<OpenCodeInstance> | null = null;

  async initialize(): Promise<OpenCodeInstance> {
    // Return existing instance if already initialized
    if (this.instance) {
      return this.instance;
    }

    // If initialization is in progress, return the same promise
    if (this.isInitializing && this.initPromise) {
      return this.initPromise;
    }

    this.isInitializing = true;
    
    this.initPromise = this.doInitialize();
    
    try {
      this.instance = await this.initPromise;
      return this.instance;
    } finally {
      this.isInitializing = false;
    }
  }

  private async doInitialize(): Promise<OpenCodeInstance> {
    console.log('[OpenCode] Starting OpenCode server...');
    
    const opencode = await createOpencode({
      hostname: '127.0.0.1',
      port: 4096,
      timeout: 10000, // 10 second timeout for server start
    });

    console.log(`[OpenCode] Server running at ${opencode.server.url}`);
    
    return {
      client: opencode.client,
      server: opencode.server
    };
  }

  getClient(): OpencodeClient {
    if (!this.instance) {
      throw new Error('OpenCode not initialized. Call initialize() first.');
    }
    return this.instance.client;
  }

  getInstance(): OpenCodeInstance {
    if (!this.instance) {
      throw new Error('OpenCode not initialized. Call initialize() first.');
    }
    return this.instance;
  }

  isInitialized(): boolean {
    return this.instance !== null;
  }

  async cleanup(): Promise<void> {
    if (this.instance) {
      console.log('[OpenCode] Shutting down server...');
      this.instance.server.close();
      this.instance = null;
      this.initPromise = null;
    }
  }
}

// Export singleton instance
export const clientManager = new OpenCodeClientManager();

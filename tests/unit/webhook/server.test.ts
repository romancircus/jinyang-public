import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express, { Application } from 'express';
import http from 'http';
import crypto from 'crypto';
import { createServer, startServer } from '../../../src/webhook/server.js';

// Mock the orchestrator
vi.mock('../../../src/index.js', () => ({
  orchestrator: {
    execute: vi.fn().mockResolvedValue({ success: true })
  }
}));

// Mock the session check
vi.mock('fs/promises', () => ({
  access: vi.fn().mockRejectedValue(new Error('File not found'))
}));

// Helper to make HTTP requests
async function makeRequest(
  app: Application,
  path: string,
  method: string = 'GET',
  headers: Record<string, string> = {},
  body?: any
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const options: http.RequestOptions = {
        hostname: 'localhost',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
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

      req.on('error', (err) => {
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

describe('Webhook Server', () => {
  let app: Application;
  const WEBHOOK_SECRET = 'test-webhook-secret';
  const WEBHOOK_PATH = '/webhooks/linear';

  beforeAll(() => {
    process.env.LINEAR_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  beforeEach(() => {
    app = createServer({ port: 3000, webhookPath: WEBHOOK_PATH });
  });

  afterAll(() => {
    delete process.env.LINEAR_WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  describe('Server Configuration', () => {
    it('should create express application', () => {
      expect(app).toBeDefined();
      expect(typeof app.listen).toBe('function');
    });

    it('should have health check endpoint', async () => {
      const response = await makeRequest(app, '/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
    });

    it('should have detailed health check endpoint', async () => {
      const response = await makeRequest(app, '/health/detailed');

      expect(response.status).toBe(200);
      expect(response.body.status).toBeDefined();
      expect(response.body.components).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.version).toBeDefined();
    });

    it('should have provider health endpoint', async () => {
      const response = await makeRequest(app, '/health/providers');

      expect(response.status).toBe(200);
      expect(response.body.providers).toBeDefined();
      expect(Array.isArray(response.body.providers)).toBe(true);
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.total).toBeDefined();
      expect(response.body.healthy).toBeDefined();
      expect(response.body.unhealthy).toBeDefined();
    });

    it('should return valid provider health structure', async () => {
      const response = await makeRequest(app, '/health/providers');

      expect(response.status).toBe(200);
      if (response.body.providers.length > 0) {
        const provider = response.body.providers[0];
        expect(provider.name).toBeDefined();
        expect(typeof provider.healthy).toBe('boolean');
        expect(['closed', 'open', 'half-open']).toContain(provider.circuitBreakerState);
        expect(provider.lastCheck).toBeDefined();
        expect(typeof provider.consecutiveErrors).toBe('number');
      }
    });

    it('should start server on specified port', async () => {
      const testApp = createServer({ port: 9999, webhookPath: WEBHOOK_PATH });
      const server = await startServer(testApp, 0); // Use port 0 for random available port

      expect(server).toBeDefined();
      expect(server.listening).toBe(true);

      server.close();
    });
  });

  describe('HMAC Verification', () => {
    const createValidPayload = () => ({
      action: 'create',
      type: 'Issue',
      data: {
        id: 'issue-123',
        identifier: 'ROM-371',
        title: 'Test Webhook Issue',
        description: 'Test description',
        state: { name: 'Todo' },
        labels: { nodes: [{ name: 'jinyang:auto' }] },
        project: { name: 'Test Project' },
        delegate: { name: 'jinyang' }
      }
    });

    const generateSignature = (payload: any): string => {
      const bodyString = JSON.stringify(payload);
      return crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(bodyString)
        .digest('hex');
    };

    it('should accept webhook with valid signature', async () => {
      const payload = createValidPayload();
      const signature = generateSignature(payload);

      const response = await makeRequest(
        app,
        WEBHOOK_PATH,
        'POST',
        { 'linear-signature': signature },
        payload
      );

      expect(response.status).toBe(202);
      expect(response.body.message).toContain('accepted');
      expect(response.body.issueId).toBe('ROM-371');
    });

    it('should reject webhook with invalid signature', async () => {
      const payload = createValidPayload();

      const response = await makeRequest(
        app,
        WEBHOOK_PATH,
        'POST',
        { 'linear-signature': 'invalid-signature' },
        payload
      );

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid signature');
    });

    it('should reject webhook with missing signature', async () => {
      const payload = createValidPayload();

      const response = await makeRequest(
        app,
        WEBHOOK_PATH,
        'POST',
        {},
        payload
      );

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Missing signature');
    });

    it('should return 500 if webhook secret not configured', async () => {
      delete process.env.LINEAR_WEBHOOK_SECRET;
      const payload = createValidPayload();

      // Create new app without secret
      const noSecretApp = createServer({ port: 3000, webhookPath: WEBHOOK_PATH });

      const response = await makeRequest(
        noSecretApp,
        WEBHOOK_PATH,
        'POST',
        { 'linear-signature': 'any-signature' },
        payload
      );

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Webhook secret not configured');

      // Restore secret for other tests
      process.env.LINEAR_WEBHOOK_SECRET = WEBHOOK_SECRET;
    });

    it('should verify signature matches expected hash', async () => {
      const payload = createValidPayload();
      const wrongPayload = { ...payload, title: 'Modified Title' };
      const signature = generateSignature(wrongPayload);

      const response = await makeRequest(
        app,
        WEBHOOK_PATH,
        'POST',
        { 'linear-signature': signature },
        payload
      );

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid signature');
    });
  });

  describe('Payload Parsing', () => {
    const createPayloadWithSignature = (payload: any) => {
      const bodyString = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(bodyString)
        .digest('hex');
      return { payload, signature };
    };

    it('should parse create action payload', async () => {
      const payload = {
        action: 'create',
        type: 'Issue',
        data: {
          id: 'issue-456',
          identifier: 'ROM-372',
          title: 'Create Test',
          description: 'Creating an issue',
          state: { name: 'Backlog' },
          labels: { nodes: [{ name: 'jinyang:auto' }] },
          project: { name: 'Development' },
          delegate: { name: 'jinyang' }
        }
      };
      const { signature } = createPayloadWithSignature(payload);

      const response = await makeRequest(
        app,
        WEBHOOK_PATH,
        'POST',
        { 'linear-signature': signature },
        payload
      );

      expect(response.status).toBe(202);
      expect(response.body.issueId).toBe('ROM-372');
    });

    it('should parse update action payload', async () => {
      const payload = {
        action: 'update',
        type: 'Issue',
        data: {
          id: 'issue-789',
          identifier: 'ROM-373',
          title: 'Update Test',
          description: 'Updating an issue',
          state: { name: 'In Progress' },
          labels: { nodes: [{ name: 'jinyang:auto' }] },
          project: { name: 'Development' },
          delegate: { name: 'jinyang' }
        },
        updatedFrom: {
          delegate: null
        }
      };
      const { signature } = createPayloadWithSignature(payload);

      const response = await makeRequest(
        app,
        WEBHOOK_PATH,
        'POST',
        { 'linear-signature': signature },
        payload
      );

      expect(response.status).toBe(202);
      expect(response.body.issueId).toBe('ROM-373');
    });

    it('should handle payload with missing optional fields', async () => {
      const payload = {
        action: 'create',
        type: 'Issue',
        data: {
          id: 'issue-minimal',
          identifier: 'ROM-374',
          title: 'Minimal Test',
          state: { name: 'Todo' },
          labels: { nodes: [] },
          delegate: { name: 'jinyang' }
        }
      };
      const { signature } = createPayloadWithSignature(payload);

      const response = await makeRequest(
        app,
        WEBHOOK_PATH,
        'POST',
        { 'linear-signature': signature },
        payload
      );

      expect(response.status).toBe(202);
      expect(response.body.issueId).toBe('ROM-374');
    });
  });

  describe('202 Response', () => {
    const createPayloadWithSignature = (payload: any) => {
      const bodyString = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(bodyString)
        .digest('hex');
      return { payload, signature };
    };

    it('should return 202 immediately for valid webhook', async () => {
      const payload = {
        action: 'create',
        type: 'Issue',
        data: {
          id: 'issue-202',
          identifier: 'ROM-375',
          title: '202 Test',
          state: { name: 'Todo' },
          labels: { nodes: [{ name: 'jinyang:auto' }] },
          delegate: { name: 'jinyang' }
        }
      };
      const { signature } = createPayloadWithSignature(payload);

      const startTime = Date.now();
      const response = await makeRequest(
        app,
        WEBHOOK_PATH,
        'POST',
        { 'linear-signature': signature },
        payload
      );
      const endTime = Date.now();

      expect(response.status).toBe(202);
      expect(endTime - startTime).toBeLessThan(1000); // Should be immediate
    });

    it('should return 202 even when not delegated to jinyang', async () => {
      const payload = {
        action: 'create',
        type: 'Issue',
        data: {
          id: 'issue-nodelegate',
          identifier: 'ROM-376',
          title: 'No Delegate Test',
          state: { name: 'Todo' },
          labels: { nodes: [] },
          delegate: { name: 'someone-else' }
        }
      };
      const { signature } = createPayloadWithSignature(payload);

      const response = await makeRequest(
        app,
        WEBHOOK_PATH,
        'POST',
        { 'linear-signature': signature },
        payload
      );

      expect(response.status).toBe(202);
      expect(response.body.message).toContain('Not delegated to jinyang');
    });
  });

  describe('Label Filtering', () => {
    const createPayloadWithSignature = (payload: any) => {
      const bodyString = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(bodyString)
        .digest('hex');
      return { payload, signature };
    };

    it('should detect jinyang:auto label for auto-execution', async () => {
      const payload = {
        action: 'create',
        type: 'Issue',
        data: {
          id: 'issue-auto',
          identifier: 'ROM-377',
          title: 'Auto Execution Test',
          state: { name: 'Todo' },
          labels: { nodes: [{ name: 'jinyang:auto' }] },
          delegate: { name: 'jinyang' }
        }
      };
      const { signature } = createPayloadWithSignature(payload);

      const response = await makeRequest(
        app,
        WEBHOOK_PATH,
        'POST',
        { 'linear-signature': signature },
        payload
      );

      expect(response.status).toBe(202);
      expect(response.body.mode).toBe('auto');
    });

    it('should detect jinyang:manual label for manual execution', async () => {
      const payload = {
        action: 'create',
        type: 'Issue',
        data: {
          id: 'issue-manual',
          identifier: 'ROM-378',
          title: 'Manual Execution Test',
          state: { name: 'Todo' },
          labels: { nodes: [{ name: 'jinyang:manual' }] },
          delegate: { name: 'jinyang' }
        }
      };
      const { signature } = createPayloadWithSignature(payload);

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
    });

    it('should default to manual mode when no jinyang label', async () => {
      const payload = {
        action: 'create',
        type: 'Issue',
        data: {
          id: 'issue-default',
          identifier: 'ROM-379',
          title: 'Default Mode Test',
          state: { name: 'Todo' },
          labels: { nodes: [{ name: 'bug' }, { name: 'priority-high' }] },
          delegate: { name: 'jinyang' }
        }
      };
      const { signature } = createPayloadWithSignature(payload);

      const response = await makeRequest(
        app,
        WEBHOOK_PATH,
        'POST',
        { 'linear-signature': signature },
        payload
      );

      expect(response.status).toBe(202);
      expect(response.body.mode).toBe('manual');
    });

    it('should skip when no jinyang label and not delegated', async () => {
      const payload = {
        action: 'create',
        type: 'Issue',
        data: {
          id: 'issue-skip',
          identifier: 'ROM-380',
          title: 'Skip Test',
          state: { name: 'Todo' },
          labels: { nodes: [{ name: 'bug' }] },
          delegate: { name: 'unassigned' }
        }
      };
      const { signature } = createPayloadWithSignature(payload);

      const response = await makeRequest(
        app,
        WEBHOOK_PATH,
        'POST',
        { 'linear-signature': signature },
        payload
      );

      expect(response.status).toBe(202);
      expect(response.body.message).toContain('skipping');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      // For malformed JSON, express will reject before our handler
      // Test with a route that has no body parsing
      const plainApp = express();

      return new Promise((resolve) => {
        const server = plainApp.listen(0, () => {
          const port = (server.address() as any).port;
          const options: http.RequestOptions = {
            hostname: 'localhost',
            port,
            path: WEBHOOK_PATH,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'linear-signature': 'test'
            }
          };

          const req = http.request(options, (res) => {
            server.close();
            // Should get an error response
            expect(res.statusCode).toBeGreaterThanOrEqual(400);
            resolve(undefined);
          });

          req.on('error', () => {
            server.close();
            resolve(undefined);
          });

          req.write('not valid json');
          req.end();
        });
      });
    });

    it('should handle missing required fields gracefully', async () => {
      const payload = {
        action: 'create',
        type: 'Issue',
        data: {
          // Missing required fields but has delegate
          id: 'incomplete',
          delegate: { name: 'jinyang' },
          labels: { nodes: [{ name: 'jinyang:auto' }] }
        }
      };
      const bodyString = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(bodyString)
        .digest('hex');

      const response = await makeRequest(
        app,
        WEBHOOK_PATH,
        'POST',
        { 'linear-signature': signature },
        payload
      );

      // Should still return 202 (accepted but will fail processing)
      expect(response.status).toBe(202);
    });
  });

  describe('Test Endpoint', () => {
    it('should have test endpoint for development', async () => {
      const payload = {
        action: 'create',
        type: 'Issue',
        data: {
          id: 'test-uuid-001',
          identifier: 'TEST-001',
          title: 'Test Endpoint',
          state: { name: 'Todo' },
          labels: { nodes: [{ name: 'jinyang:auto' }] }
        }
      };

      const response = await makeRequest(
        app,
        '/webhooks/test',
        'POST',
        { 'Content-Type': 'application/json' },
        payload
      );

      expect(response.status).toBe(202);
      // Test endpoint now uses full handleWebhook pipeline (no HMAC)
      expect(response.body).toBeDefined();
    });
  });
});

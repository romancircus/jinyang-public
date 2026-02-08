import express, { Request, Response, NextFunction } from 'express';
import { verifyLinearSignature } from './middleware.js';
import { parseLinearPayload, LinearWebhookPayload } from './parser.js';
import { orchestrator } from '../index.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { WebhookError, isJinyangError } from '../errors/index.js';
import { getLogger } from '../logging/index.js';

const router = express.Router();
const SESSIONS_DIR = join(homedir(), '.jinyang', 'sessions');
const logger = getLogger();

// Rate limiting storage (simple in-memory, per-process)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // Max 30 requests per minute per IP
const MAX_PAYLOAD_SIZE = 10 * 1024 * 1024; // 10MB max payload

/**
 * Rate limiting middleware
 */
function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  const clientData = rateLimitStore.get(clientIp);

  if (!clientData || now > clientData.resetTime) {
    // New window
    rateLimitStore.set(clientIp, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    next();
    return;
  }

  if (clientData.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((clientData.resetTime - now) / 1000);
    logger.warn(`Rate limit exceeded`, { clientIp, retryAfter });
    res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter,
      message: `Too many requests. Try again in ${retryAfter} seconds.`
    });
    return;
  }

  clientData.count++;
  next();
}

/**
 * Payload size validation middleware
 */
function validatePayloadSize(req: Request, res: Response, next: NextFunction): void {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);

  if (contentLength > MAX_PAYLOAD_SIZE) {
    const error = new WebhookError(
      `Payload too large: ${contentLength} bytes (max: ${MAX_PAYLOAD_SIZE})`,
      'PAYLOAD_TOO_LARGE',
      req.headers['x-request-id'] as string || undefined,
      { contentLength, maxSize: MAX_PAYLOAD_SIZE }
    );

    logger.logError(error, undefined, undefined, undefined);

    res.status(413).json({
      error: 'Payload too large',
      maxSize: MAX_PAYLOAD_SIZE,
      message: `Payload exceeds maximum size of ${MAX_PAYLOAD_SIZE / 1024 / 1024}MB`
    });
    return;
  }

  next();
}

// In-memory lock set for active executions (prevents race between file check and execution start)
const activeExecutions = new Set<string>();

/**
 * Check if issue already has an active session (file-based + in-memory)
 */
async function hasActiveSession(issueId: string): Promise<boolean> {
  // In-memory check first (catches race conditions between webhook arrival and file creation)
  if (activeExecutions.has(issueId)) {
    return true;
  }

  // File-based check (catches sessions from previous process restarts)
  try {
    const sessionPath = join(SESSIONS_DIR, `${issueId}.json`);
    await fs.access(sessionPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a session lock file for dedup across process restarts
 */
async function createSessionLock(issueId: string): Promise<void> {
  try {
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
    const sessionPath = join(SESSIONS_DIR, `${issueId}.json`);
    await fs.writeFile(sessionPath, JSON.stringify({
      issueId,
      startedAt: new Date().toISOString(),
      pid: process.pid
    }));
  } catch (error) {
    logger.error('Failed to create session lock', { issueId, error });
  }
}

/**
 * Remove session lock on completion
 */
async function removeSessionLock(issueId: string): Promise<void> {
  activeExecutions.delete(issueId);
  try {
    const sessionPath = join(SESSIONS_DIR, `${issueId}.json`);
    await fs.unlink(sessionPath);
  } catch {
    // File may not exist, that's OK
  }
}

/**
 * Determine execution mode based on labels
 * Priority: jinyang:auto > jinyang:manual > default (manual)
 */
function getExecutionMode(labels: string[]): 'auto' | 'manual' {
  if (labels.includes('jinyang:auto')) {
    return 'auto';
  }
  if (labels.includes('jinyang:manual')) {
    return 'manual';
  }
  // Default: manual (safe)
  return 'manual';
}

/**
 * Validate webhook payload structure
 */
function validatePayload(payload: unknown): { valid: boolean; error?: string; data?: LinearWebhookPayload } {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Payload must be an object' };
  }

  const p = payload as any;

  // Check required fields
  if (!p.action || typeof p.action !== 'string') {
    return { valid: false, error: 'Missing or invalid action field' };
  }

  if (!p.data || typeof p.data !== 'object') {
    return { valid: false, error: 'Missing or invalid data field' };
  }

  if (!p.data.identifier || typeof p.data.identifier !== 'string') {
    return { valid: false, error: 'Missing or invalid issue identifier' };
  }

  if (!p.data.title || typeof p.data.title !== 'string') {
    return { valid: false, error: 'Missing or invalid issue title' };
  }

  try {
    const parsed = parseLinearPayload(p);
    return { valid: true, data: parsed };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Failed to parse payload'
    };
  }
}

/**
 * Main webhook handler with comprehensive error handling
 */
async function handleWebhook(req: Request, res: Response, isTestRoute = false): Promise<void> {
  const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Validate payload structure
    const validation = validatePayload(req.body);

    if (!validation.valid) {
      const error = new WebhookError(
        `Invalid payload: ${validation.error}`,
        'INVALID_PAYLOAD',
        requestId,
        { body: req.body }
      );

      logger.logError(error, undefined, undefined, undefined);

      // Return 202 (accepted) but indicate validation failure for async processing pattern
      res.status(202).json({
        message: 'Webhook accepted but validation failed: ' + validation.error,
        requestId,
        validationError: true
      });
      return;
    }

    const payload = validation.data!;
    const labels = payload.data.labels?.nodes?.map((l: any) => l.name) || [];
    const executionMode = getExecutionMode(labels);

    // Log webhook received
    logger.logWebhookReceived(
      payload.data.identifier,
      payload.action,
      executionMode,
      { requestId, isTestRoute }
    );

    // Check delegate or label trigger
    const hasJinyangLabel = labels.some((l: string) => l.startsWith('jinyang:'));
    const isDelegatedToJinyang = payload.data.delegate?.name === 'jinyang';

    if (!isDelegatedToJinyang && !hasJinyangLabel) {
      res.status(202).json({
        message: 'Not delegated to jinyang or missing jinyang label, skipping',
        requestId
      });
      return;
    }

    // Filter out state-change webhooks (triggered by our own Linear updates)
    const issueState = payload.data.state?.name?.toLowerCase() || '';
    const isOurStateUpdate = payload.action === 'update' &&
      payload.updatedFrom &&
      !Array.isArray(payload.updatedFrom.labelIds) &&
      !payload.updatedFrom.delegate &&
      ['in progress', 'done', 'canceled', 'cancelled'].includes(issueState);

    if (isOurStateUpdate) {
      res.status(202).json({
        message: 'Ignoring state-change webhook (likely our own update)',
        requestId
      });
      return;
    }

    // Process on: new issue, delegate change, or label change
    const isDelegateChange = payload.action === 'update' &&
      payload.updatedFrom?.delegate?.name !== 'jinyang';
    const isLabelChange = payload.action === 'update' &&
      Array.isArray(payload.updatedFrom?.labelIds);
    const isNewIssue = payload.action === 'create';

    if (!isDelegateChange && !isLabelChange && !isNewIssue) {
      res.status(202).json({
        message: 'No relevant change (delegate, label, or create), skipping',
        requestId
      });
      return;
    }

    // Extract issue details
    const issue = {
      id: payload.data.id,
      identifier: payload.data.identifier,
      title: payload.data.title,
      description: payload.data.description,
      labels: labels,
      projectName: payload.data.project?.name
    };

    // Use identifier (ROM-XXX) for user-facing responses
    const issueIdentifier = issue.identifier || issue.id;

    // Check for duplicate sessions (use identifier for consistent dedup with poller)
    if (await hasActiveSession(issue.identifier)) {
      logger.info(`Issue already has active session, skipping`, { issueId: issue.identifier, requestId });
      res.status(202).json({
        message: 'Issue already has active session, skipping',
        issueId: issueIdentifier,
        requestId
      });
      return;
    }

    // Handle manual mode - queue for later
    if (executionMode === 'manual') {
      logger.info(`Queued for manual execution`, { issueId: issue.id, requestId });
      res.status(202).json({
        message: 'Queued for manual execution (use scripts/execute-manual.sh)',
        issueId: issueIdentifier,
        mode: 'manual',
        requestId
      });
      return;
    }

    // Acquire in-memory lock BEFORE responding (prevents race between concurrent webhooks)
    activeExecutions.add(issue.identifier);

    // Auto-execution mode - accept immediately and execute async
    res.status(202).json({
      message: 'Webhook accepted, auto-executing async',
      issueId: issueIdentifier,
      mode: 'auto',
      requestId
    });

    // Execute async (don't await, don't block response)
    executeAsync(issue, requestId, isTestRoute);

  } catch (error) {
    // Structured error handling
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.logError(error, undefined, undefined, undefined);

    // Webhook pattern: always return 202 (accepted) and handle errors async
    res.status(202).json({
      message: 'Webhook accepted but processing failed: ' + (isTestRoute ? errorMessage : 'An error occurred'),
      requestId,
      processingError: true
    });
  }
}

/**
 * Execute orchestrator async with comprehensive error handling and session locking
 */
async function executeAsync(
  issue: { id: string; identifier: string; title: string; description?: string; labels: string[]; projectName?: string },
  requestId: string,
  isTestRoute: boolean
): Promise<void> {
  const routePrefix = isTestRoute ? '[Test Webhook]' : '[Webhook]';

  try {
    // Create persistent session lock file
    await createSessionLock(issue.identifier);

    if (!orchestrator) {
      throw new Error('Orchestrator not initialized');
    }

    logger.info(`${routePrefix} Starting execution`, { issueId: issue.id, requestId });

    const result = await orchestrator.processIssue(issue);

    if (result.success) {
      logger.info(`${routePrefix} Execution completed successfully`, {
        issueId: issue.id,
        requestId,
        duration: result.duration,
        filesCreated: result.filesCreated.length
      });
    } else {
      logger.error(`${routePrefix} Execution failed`, {
        issueId: issue.id,
        requestId,
        error: result.error,
        duration: result.duration
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`${routePrefix} Orchestrator failed`, {
      issueId: issue.id,
      requestId,
      error: errorMessage
    });
  } finally {
    // Always release the session lock when done
    await removeSessionLock(issue.identifier);
  }
}

// Apply rate limiting and payload validation to all webhook routes
router.use('/webhooks', rateLimitMiddleware);
router.use('/webhooks', validatePayloadSize);

// Main Linear webhook route with HMAC verification
router.post('/webhooks/linear', verifyLinearSignature, async (req: Request, res: Response) => {
  await handleWebhook(req, res, false);
});

// Test route for local development (no HMAC verification, lenient validation)
router.post('/webhooks/test', async (req: Request, res: Response) => {
  await handleWebhook(req, res, true);
});

export default router;

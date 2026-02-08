# API Documentation

Complete API reference for jinyang endpoints.

---

## Base URL

```
Local: http://localhost:3000
External: https://your-server.example.com:3000
```

---

## Authentication

### Webhook Authentication

Linear webhooks use HMAC signature verification:

**Header:**
```
X-Linear-Signature: <hmac-sha256-signature>
```

**Verification Process:**
1. Linear sends webhook with HMAC signature in header
2. Server verifies signature against `LINEAR_WEBHOOK_SECRET`
3. If valid, processes webhook; if invalid, returns 401

**Example:**
```bash
curl -X POST http://localhost:3000/webhooks/linear \
  -H "Content-Type: application/json" \
  -H "X-Linear-Signature: sha256=<signature>" \
  -d '{"event": {...}}'
```

### Health Endpoints

No authentication required for health checks.

---

## Endpoints

### Health Check Endpoints

#### GET /health

Basic health check - lightweight status check.

**Request:**
```bash
curl http://localhost:3000/health
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2026-02-05T10:30:00.000Z"
}
```

**Use Case:** Load balancers, simple monitoring

---

#### GET /health/detailed

Comprehensive health check with component status.

**Request:**
```bash
curl http://localhost:3000/health/detailed
```

**Response (200 OK - Healthy):**
```json
{
  "status": "healthy",
  "components": {
    "webhook": "ok",
    "providers": {
      "claude-code": "healthy",
      "opencode-glm47": "healthy",
      "kimi-k25-api": "healthy"
    },
    "worktrees": {
      "active": 5,
      "total": 5
    }
  },
  "timestamp": "2026-02-05T10:30:00.000Z",
  "version": "1.1.0"
}
```

**Response (200 OK - Degraded):**
```json
{
  "status": "degraded",
  "components": {
    "webhook": "ok",
    "providers": {
      "claude-code": "healthy",
      "opencode-glm47": "degraded",
      "kimi-k25-api": "healthy"
    },
    "worktrees": {
      "active": 3,
      "total": 3
    }
  },
  "timestamp": "2026-02-05T10:30:00.000Z",
  "version": "1.1.0"
}
```

**Response (503 Service Unavailable - Unhealthy):**
```json
{
  "status": "unhealthy",
  "components": {
    "webhook": "ok",
    "providers": {
      "claude-code": "unhealthy",
      "opencode-glm47": "healthy"
    },
    "worktrees": {
      "active": 0,
      "total": 0
    }
  },
  "timestamp": "2026-02-05T10:30:00.000Z",
  "version": "1.1.0"
}
```

**Status Codes:**
- `200` - Healthy or degraded (functional)
- `503` - Unhealthy (some components failing)

**Use Case:** Detailed monitoring, alerting systems

---

#### GET /health/providers

Provider-specific health status with circuit breaker states.

**Request:**
```bash
curl http://localhost:3000/health/providers
```

**Response (200 OK):**
```json
{
  "providers": [
    {
      "name": "claude-code",
      "healthy": true,
      "circuitBreakerState": "closed",
      "lastCheck": "2026-02-05T10:30:00.000Z",
      "consecutiveErrors": 0,
      "lastError": null
    },
    {
      "name": "opencode-glm47",
      "healthy": true,
      "circuitBreakerState": "closed",
      "lastCheck": "2026-02-05T10:29:30.000Z",
      "consecutiveErrors": 0,
      "latency": 245
    },
    {
      "name": "kimi-k25-api",
      "healthy": false,
      "circuitBreakerState": "open",
      "lastCheck": "2026-02-05T10:25:00.000Z",
      "consecutiveErrors": 3,
      "lastError": "Rate limit exceeded"
    }
  ],
  "timestamp": "2026-02-05T10:30:00.000Z",
  "total": 3,
  "healthy": 2,
  "unhealthy": 1
}
```

**Circuit Breaker States:**
- `closed` - Normal operation
- `half-open` - Testing after failure
- `open` - Failing, not accepting requests

**Use Case:** Provider monitoring, failover detection

---

### Webhook Endpoint

#### POST /webhooks/linear

Receives Linear webhook events.

**Headers:**
```
Content-Type: application/json
X-Linear-Signature: <hmac-signature>
```

**Request Body:**
```json
{
  "event": {
    "type": "Issue",
    "action": "created",
    "data": {
      "id": "ROM-123",
      "identifier": "ROM-123",
      "title": "Add feature X",
      "description": "Description text here",
      "state": {
        "name": "Todo",
        "id": "state-id"
      },
      "labels": {
        "nodes": [
          { "name": "repo:kdh" },
          { "name": "jinyang:auto" }
        ]
      },
      "project": {
        "name": "MyProject",
        "id": "project-id"
      },
      "team": {
        "name": "Engineering",
        "id": "team-id"
      }
    },
    "delegate": "jinyang"
  }
}
```

**Response (202 Accepted):**
```json
{
  "status": "accepted",
  "message": "Webhook accepted, processing async",
  "mode": "auto",
  "sessionId": "session-uuid"
}
```

**Response (401 Unauthorized):**
```json
{
  "error": "Invalid signature"
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Invalid payload",
  "details": "Missing required field: event.data.id"
}
```

**Response (202 Queued for Manual Execution):**
```json
{
  "status": "accepted",
  "message": "Queued for manual execution",
  "mode": "manual",
  "issueId": "ROM-123"
}
```

**Status Codes:**
- `202` - Webhook accepted, processing async
- `401` - Invalid HMAC signature
- `400` - Invalid payload
- `500` - Internal server error

**Processing Flow:**
1. Verify HMAC signature
2. Parse Linear webhook payload
3. Check delegate (must be "jinyang")
4. Route to repository
5. Determine execution mode (auto/manual)
6. Create worktree
7. Spawn OpenCode session
8. Return 202 immediately

---

## Request/Response Formats

### Linear Webhook Payload Structure

**Issue Created Event:**
```json
{
  "event": {
    "type": "Issue",
    "action": "created",
    "data": {
      "id": "uuid",
      "identifier": "ROM-123",
      "title": "string",
      "description": "string (markdown)",
      "state": {
        "id": "uuid",
        "name": "Todo|In Progress|Done"
      },
      "labels": {
        "nodes": [
          { "id": "uuid", "name": "string" }
        ]
      },
      "project": {
        "id": "uuid",
        "name": "string"
      },
      "team": {
        "id": "uuid",
        "name": "string"
      },
      "createdAt": "ISO-8601 timestamp"
    },
    "delegate": "string (e.g., 'jinyang')"
  }
}
```

**Issue Updated Event:**
```json
{
  "event": {
    "type": "Issue",
    "action": "updated",
    "data": {
      "id": "uuid",
      "identifier": "ROM-123",
      "title": "string",
      "description": "string",
      "state": { ... },
      "labels": { ... },
      "updatedAt": "ISO-8601 timestamp"
    },
    "delegate": "jinyang"
  }
}
```

---

### Error Response Format

**Standard Error:**
```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": "2026-02-05T10:30:00.000Z"
}
```

**Validation Error:**
```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    "Field 'title' is required",
    "Field 'delegate' must be 'jinyang'"
  ],
  "timestamp": "2026-02-05T10:30:00.000Z"
}
```

---

## Label-Based Execution

Control execution mode via Linear labels:

| Label | Behavior | Use Case |
|-------|----------|----------|
| `jinyang:auto` | Execute immediately on webhook | Trusted tasks |
| `jinyang:manual` | Queue for manual execution | Review required |
| `repo:name` | Route to specific repository | Multi-repo setups |
| `provider:type` | Override provider selection | Provider testing |

**Execution Mode Priority:**
```
1. jinyang:manual → Manual execution
2. jinyang:auto → Auto execution
3. No label → Manual execution (default, safe)
```

---

## Provider Routing

### Provider Types

| Provider | Priority | Credential Env |
|----------|----------|----------------|
| `claude-code` | 1 | `CLAUDE_CODE_ACCESS_TOKEN` |
| `opencode-glm47` | 2 | `OPENCODE_API_KEY` |
| `kimi-k25-api` | 3 | `KIMI_API_KEY` |
| `claude-code-api` | 4 | `CLAUDE_CODE_API_KEY` |

### Fallback Chain

```
Request → claude-code (Priority 1)
    ↓ If rate limit/error
    → opencode-glm47 (Priority 2)
    ↓ If rate limit/error
    → kimi-k25-api (Priority 3)
    ↓ If all fail
    → Error: No healthy providers
```

---

## Rate Limiting

### Webhook Rate Limits

- No explicit rate limiting implemented
- Linear's built-in webhook rate limits apply
- Circuit breaker opens after 3 consecutive errors

### Provider Rate Limits

Handled automatically via circuit breaker pattern:
- Detect 429/503 responses
- Mark provider as degraded
- Switch to next healthy provider
- Retry after 5-minute sleep window

---

## Webhook Testing

### Test with curl

```bash
# Valid webhook (requires real signature)
curl -X POST http://localhost:3000/webhooks/linear \
  -H "Content-Type: application/json" \
  -H "X-Linear-Signature: sha256=<real-signature>" \
  -d '{
    "event": {
      "type": "Issue",
      "action": "created",
      "data": {
        "id": "test-123",
        "identifier": "ROM-TEST",
        "title": "Test webhook",
        "labels": {"nodes": [{"name": "jinyang:auto"}]}
      },
      "delegate": "jinyang"
    }
  }'

# Without signature (will fail with 401)
curl -X POST http://localhost:3000/webhooks/linear \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

### Test Files

- `test-webhook.mjs` - Node.js webhook test
- `scripts/test-webhook.sh` - Shell script test
- `test-e2e.mjs` - End-to-end workflow test

---

## Monitoring Endpoints

### Metrics (Future)

Planned endpoints for Prometheus/metrics:
- `GET /metrics` - Prometheus-compatible metrics
- `GET /stats` - Session statistics
- `GET /queue` - Queue status

---

## Response Status Codes Summary

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Health checks, successful GET |
| 202 | Accepted | Webhook received, processing async |
| 400 | Bad Request | Invalid payload |
| 401 | Unauthorized | Invalid HMAC signature |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Unhealthy state |

---

## Examples

### Full Webhook Flow

```bash
# 1. Start server
npm start

# 2. Test health
curl http://localhost:3000/health

# 3. Create issue in Linear
#    - Title: "Update README"
#    - Label: "jinyang:auto"
#    - Delegate: "jinyang"

# 4. Webhook fires automatically
# 5. Check logs
tail -f ~/.jinyang/logs/server.log

# 6. Verify processing
#    - Worktree created
#    - OpenCode session spawned
#    - Git commit made
#    - Linear status updated
```

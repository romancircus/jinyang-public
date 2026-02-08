# jinyang - OpenCode Native Linear Agent

## Overview

A custom Linear agent that replicates Cyrus's autonomous execution capabilities but uses OpenCode natively as the AI provider, with multi-tier fallback routing (Claude Code subscription → OpenCode GLM 4.7 → Claude Code API).

This is a clean reimplementation of Cyrus's infrastructure (webhooks, routing, worktrees) but replaces the Anthropic SDK with OpenCode SDK.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   NGINX / Caddy (TLS Proxy)                     │
└────────────────────────┬────────────────────────────────────────┘
                         │ Linear Webhook (delegate=jinyang)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Webhook Receiver (Node.js/Express)              │
│               POST /webhooks/linear                              │
│         ✓ Verify Linear HMAC signature                           │
│         ✓ Parse webhook payload                                  │
│         ✓ Filter: delegate=jinyang                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Router Engine                                 │
│         • Check labels: repo:myapp → my-app-repo                │
│         • Check projects: "My Project" → my-project-repo       │
│         • Check description tags: [repo=XXX]                    │
│         • Fallback: "General" → ~/Applications                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Session Manager                                │
│         • Spawn opencode CLI per issue (max 27 concurrent)       │
│         • Track: pid, worktree, status, startedAt               │
│         • Queue: FIFO with concurrency limit                     │
│         • Enforce: git commit required                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Worktree Manager                               │
│         git worktree add -b {ISSUE} {REPO} {WORKTREE_DIR}        │
│           • Symlink assets/ → worktree/assets/                   │
│           • Symlink references/ → worktree/references/            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                 OpenCode Spawner (SDK)                           │
│         @opencode-ai/sdk promptAsync({ body, options })          │
│                  ✓ Multi-tier provider routing                    │
│                  ✓ Health checks & circuit breaking               │
│                  ✓ Auto-commit with proper message              │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
jinyang/
├── src/
│   ├── index.ts                      # Entry point: HTTP server
│   ├── webhook/
│   │   ├── receiver.ts               # Express webhook handler
│   │   ├── middleware.ts              # HMAC verification (from Cyrus)
│   │   └── parser.ts                  # Linear webhook parser (from Cyrus)
│   ├── routing/
│   │   ├── engine.ts                  # Label/project/tag router (from Cyrus)
│   │   └── config-loader.ts           # Load repos from config
│   ├── session/
│   │   ├── manager.ts                 # Spawn/track OpenCode sessions
│   │   ├── scheduler.ts               # Queue with max concurrency
│   │   └── health-checker.ts          # Detect dead/zombie sessions
│   ├── provider/
│   │   ├── router.ts                  # ⭐ Multi-tier provider selection
│   │   ├── health-daemon.ts           # Background health checker
│   │   └── circuit-breaker.ts         # Provider failure tracking
│   ├── worktree/
│   │   ├── manager.ts                 # Git worktree ops (from Cyrus)
│   │   └── symlink-factory.ts         # Asset symlink creator (from Cyrus)
│   ├── opencode/
│   │   ├── spawner.ts                 # OpenCode SDK wrapper
│   │   ├── client.ts                  # OpenCode client initialization
│   │   └── prompt-builder.ts          # Build prompts for OpenCode
│   └── linear/
│       ├── client.ts                  # GraphQL API wrapper
│       └── updater.ts                 # Post completion status updates
├── lib/                               # Copied from Cyrus (Apache 2.0)
│   ├── LinearEventTransport.js        # Webhook verification
│   ├── RepositoryRouter.js           # Issue routing logic
│   └── GitService.js                 # Worktree operations
├── config/
│   │   └── default.json               # Repository routing config (same as Cyrus)
│   ├── providers.yaml                # Multi-tier provider config
│   └── routing.yaml                  # Routing strategy config
├── templates/
│   │   └── issue-execution.md         # Issue template (from Cyrus)
├── scripts/
│   │   ├── setup.sh                   # First-time setup (tailscale, systemd)
│   │   ├── backlog-processor.sh      # Queue runner (15-min interval)
│   │   ├── migrate-config.sh         # Import ~/.cyrus/config.json
│   │   └── health-daemon.sh          # Multi-tier provider health checks
├── types/
│   │   └── index.ts                   # TypeScript interfaces
├── package.json
├── tsconfig.json
├── README.md
└── PLAN.md

```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

**Goal:** Webhook receiver + Repository routing + OpenCode SDK integration

**Tasks:**
1. [ ] Initialize TypeScript project with dependencies
   - Install: typescript, @types/node, @opencode-ai/sdk, @linear/sdk/webhook, express
   - Setup tsconfig.json
   - Create basic package.json scripts

2. [ ] Copy Cyrus infrastructure (Apache 2.0)
   - Copy `LinearEventTransport.js` → `lib/`
   - Copy `RepositoryRouter.js` → `lib/`
   - Copy `GitService.js` → `lib/`
   - Create TypeScript wrapper for Node.js integration

3. [ ] Implement webhook receiver
   - Express server at `/webhooks/linear`
   - HMAC signature verification middleware
   - Linear webhook parser
   - Delegate detection filter

4. [ ] Implement routing engine
   - Load repositories from `config/default.json`
   - Label-based routing (repo:kdh, etc.)
   - Project-based routing
   - Fallback logic

5. [ ] Implement OpenCode SDK wrapper
   - Initialize OpenCode client
   - Test `promptAsync()` fire-and-forget
   - Session status polling

6. [ ] Implement worktree manager
   - Port GitService.js functions
   - Symlink factory
   - Cleanup on completion

**Success Criteria:**
- Webhook can receive Linear delegation events
- Routes to correct repository
- Can spawn OpenCode session and track completion

---

### Phase 2: Multi-Tier Provider Routing (Week 2)

**Goal:** Primary → OpenCode → Claude API with health checks

**Tasks:**
1. [ ] Implement provider router
   - Define provider configuration schema
   - Implement selection logic (priority-based)
   - Health check integration

2. [ ] Implement circuit breaker
   - Failure threshold tracking
   - Sleep window management
   - Recovery detection

3. [ ] Implement health daemon
   - Background health checker (30s interval)
   - Status persistence in `~/.jinyang/providers/`
   - Provider state caching

4. [ ] Integrate with OpenCode spawner
   - Pass selected provider to prompt
   - Handle rate limit errors
   - Automatic retry with fallback

5. [ ] Create provider configuration
   - `config/providers.yaml` template
   - Environment variable mapping
   - Default provider setup

**Success Criteria:**
- Three-tier routing (Claude Code → OpenCode → Claude API)
- Auto-fallback on rate limits
- Health checks detect provider issues

---

### Phase 3: Session Manager & Scheduler (Week 2-3)

**Goal:** Queue management + concurrent session tracking

**Tasks:**
1. [ ] Implement session manager
   - Session lifecycle tracking
   - PID tracking
   - Cleanup on completion/failure

2. [ ] Implement scheduler
   - FIFO queue implementation
   - Max concurrency enforcement (default 27)
   - Slot allocation

3. [ ] Implement backlog processor
   - Timer-based queue runner (15-min interval)
   - Restart stalled sessions
   - Dead session detection

4. [ ] Implement Linear integration
   - GraphQL client wrapper
   - Status updates (started → in_progress → done/error)
   - Comment posting for session events

5. [ ] Create systemd service
   - Service file template
   - Tailscale funnel setup
   - Log configuration

**Success Criteria:**
- Can spawn up to 27 concurrent sessions
- Queue backed up and retried
- Linear status updates working

---

### Phase 4: Testing & Integration (Week 4)

**Goal:** End-to-end production testing

**Tasks:**
1. [ ] Local webhook testing
   - Use ngrok or Linear test webhook
   - Verify HMAC verification
   - Test delegation flow

2. [ ] End-to-end workflow test
   - Delegate issue → Webhook received
   - Route to repo → Worktree created
   - OpenCode spawned → Task executed
   - Git commit → Linear updated

3. [ ] Multi-tier routing test
   - Set rate limit on primary
   - Verify switches to fallback
   - Verifies recovery

4. [ ] Concurrency test
   - Delegate 30+ issues
   - Verify max 27 concurrent
   - All complete successfully

5. [ ] Production deployment
   - Create Linear project on Linear
   - Configure OAuth app webhook
   - Set up server on Mac Mini
   - Verify Tailscale funnel

6. [ ] Documentation
   - Complete README.md
   - Setup instructions
   - API documentation

**Success Criteria:**
- Full end-to-end workflow working
- All 11 repositories routed correctly
- Multi-tier routing tested and working
- Production-ready deployment

---

## Configuration Files

### config/default.json (Repository Routing)

Reuse Cyrus's config with additions:

```json
{
  "repositories": [/* copied from ~/.cyrus/config.json */],
  "openCode": {
    "maxConcurrent": 27,
    "sessionTimeout": 3600000,
    "backlogInterval": 900000
  },
  "webhook": {
    "port": 3000,
    "path": "/webhooks/linear",
    "secret": "from Linear app settings"
  }
}
```

### config/providers.yaml (Multi-tier Routing)

```yaml
providers:
  claude-code:
    credential_env: CLAUDE_CODE_ACCESS_TOKEN
    base_url: https://api.anthropic.com
    priority: 1
    health_check_endpoint: /v1/models
    models:
      primary: claude-sonnet-4-opus
      fallback: claude-sonnet-4-sonnet

  opencode-glm47:
    credential_env: OPENCODE_API_KEY
    base_url: https://opencode.ai/zen/v1
    priority: 2
    health_check_endpoint: /health
    models:
      primary: glm-4.7
      fallback: kimi-k2.5

  claude-code-api:
    credential_env: CLAUDE_CODE_API_KEY
    base_url: https://api.anthropic.com
    priority: 3
    health_check_endpoint: /v1/models
    models:
      primary: claude-sonnet-4-opus

routing:
  strategy: tiered
  fallback_chain: [claude-code, opencode-glm47, claude-code-api]

circuit_breaker:
  failure_threshold: 3
  sleep_window_minutes: 5

notifications:
  on_fallback: true
  on_rate_limit: true
```

---

## Environment Variables

```bash
# Provider Credentials
CLAUDE_CODE_ACCESS_TOKEN=sk-ant-xxxxx          # PRIMARY - Your Claude Code sub
OPENCODE_API_KEY=sk-xxxx-your-opencode-api-key  # FALLBACK 1 - OpenCode
CLAUDE_CODE_API_KEY=sk-ant-yyyy                 # FALLBACK 2 - Direct API key

# Linear Integration
LINEAR_CLIENT_ID=your-linear-client-id
LINEAR_CLIENT_SECRET=your-linear-client-secret
LINEAR_WEBHOOK_SECRET=<from Linear app settings>

# Server Config
JINYANG_PORT=3000
JINYANG_HOST=0.0.0.0

# Health Check Config
PROVIDER_HEALTHCHECK_INTERVAL_SEC=30
PROVIDER_UNHEALTHY_THRESHOLD=3
```

---

## Key Differences from Cyrus

| Feature | Cyrus | jinyang |
|---------|-------|-------------------|
| **AI SDK** | Claude Agent SDK | OpenCode SDK |
| **Provider** | Anthropic only | Multi-tier routing built-in |
| **Session Tracking** | Custom Linear sessions | Minimal (Linear comments only) |
| **Config Location** | ~/.cyrus/ | ~/Applications/jinyang/ |
| **Concurrency** | 27 (hardcoded) | Configurable |
| **Multi-tier Routing** | ❌ No | ✅ Yes (built-in) |
| **Health Checks** | ❌ No | ✅ Yes (circuit breaker) |
| **Rate Limit Handling** | Manual | Automatic fallback |

---

## Estimated Timeline

- **Week 1:** Phase 1 (Foundation)
- **Week 2:** Phase 2 (Multi-tier) + Start Phase 3
- **Week 2-3:** Phase 3 (Session Manager) completion
- **Week 4:** Phase 4 (Testing & Production)

**Total:** 4 weeks to production-ready

---

## Success Criteria

1. ✅ Can delegate issues to jinyang via Linear
2. ✅ Routes to correct repository (same as Cyrus)
3. ✅ Spawns OpenCode sessions headlessly
4. ✅ Multi-tier routing works (Claude → OpenCode → Claude API)
5. ✅ Health checks detect provider issues
6. ✅ Handles up to 27 concurrent sessions
7. ✅ Git commits required before session completion
8. ✅ Linear status updates work correctly
9. ✅ Production deployment on Mac Mini with Tailscale funnel

---

## Future Enhancements

- [ ] MCP server integration (re-use Cyrus's MCP support)
- [ ] Custom system prompts per repository
- [ ] Session resumption after crashes
- [ ] Analytics dashboard for provider performance
- [ ] Cost tracking per provider
- [ ] Web UI for monitoring

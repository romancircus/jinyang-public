# jinyang: What Is It?

## Yes, She Has a Brain

**jinyang's brain = OpenCode GLM 4.7 (@opencode-ai/sdk)**

Not "dumb" routing - fully capable AI execution.

---

## How Her Brain Works

```
You Delegate Linear Issue
    ↓
jinyang receives webhook
    ↓
Routes to repository (label/project/tag)
    ↓
Creates git worktree
    ↓
OpenCode SDK:
    session.create({ directory })
    session.prompt({ parts: [{ text, prompt }] })
    pollSessionStatus(sessionId)
    ↓
OpenCode GLM 4.7 executes task
    ↓
Git commit enforced
    ↓
Linear updated (started → in_progress → done)
    ↓
Comment posted: "Completed: [summary]"
```

**She's not redirecting to Claude Code first - she USES OpenCode GLM 4.7 as a brain.**

---

## She Has Three Brains (Redundancy)

| Brain | Priority | Speed | When Used |
|-------|----------|-------|-----------|
| **OpenCode GLM 4.7** | 1 | FAST | Main execution |
| Claude Code (subscription) | 2 | FAST | Override |
| Claude Code API | 3 | SLOW | Last resort |

**Why 3 brains?** She never stops working, even if one brain fails.

---

## Cyrus vs jinyang

| | Cyrus | jinyang |
|--|-------|-------------------|
| **Brain** | Claude Agent SDK (Anthropic only) | **OpenCode GLM 4.7** (multi-tier) |
| **Redundancy** | No (single point) | Yes (3 brains) |
| **Health Checks** | ❌ NO | ✅ YES (30s checks) |
| **Auto-fallback** | ❌ NO | ✅ YES (never stops) |
| **Manual fix** | Required | Zero intervention |

**The key difference:** Cyrus stops when it fails. jinyang adapts and continues.

---

## Yes, She Uses OpenCode

```typescript
// src/opencode/spawner.ts line 101-115
const opencodeClient = client.getClient();

const sessionCreateResult = await opencodeClient.session.create({
  query: { directory }
});

await opencodeClient.session.prompt({
  path: { id: sessionId },
  body: { parts: [{ type: 'text', text: prompt }] }
});
```

**This is real OpenCode API usage**, not just "routing to Claude."

---

## How to Test Her Brain

### 1. Quick Health (now)
```bash
curl http://localhost:3001/health
# ✅ {"status":"ok"}
```

### 2. Full Delegation (5 min)
```bash
# Configure .env
nano .env
LINEAR_CLIENT_ID=from linear settings
LINEAR_CLIENT_SECRET=from linear settings
LINEAR_WEBHOOK_SECRET=from linear settings

# Restart server
kill $(cat /tmp/jinyang-test.pid)
node dist/index.js > /tmp/jinyang-test.log 2>&1 &
echo $! > /tmp/jinyang-test.pid

# Create test issue in Linear
# Go to linear.app/your-workspace
# Create issue: "Test jinyang's brain"
# Add label: repo:kdh
# Delegate to: jinyang

# Watch her think
tail -f /tmp/jinyang-test.log
```

### 3. Watch Her Work
```
[timestamp] Processing webhook: issue_created
[timestamp] Route: repo:kdh → /home/user/Applications/KDH-Automation
[timestamp] CreateWorktree: git worktree add -b ROM-XXX
[timestamp] OpenCode Session: session.create({ directory: "/home/user/projects/my-repo" })
[timestamp] OpenCode Session: session.prompt({ parts: [{ text: "Test jinyang's brain" }] })
[timestamp] Session Status: started → in_progress
[timestamp] Session Status: in_progress (executing task)
[timestamp] Git Commit: feat: complete test task
[timestamp] Linear Update: issue ROM-XXX → Done
[timestamp] Comment Posted: Completed: test task
```

### 4. Test Multi-Tier Routing
```bash
# Break her primary brain
nano .env
# OPENCODE_API_KEY=invalid_token

# Delegate issue
# She should auto-swap to Claude Code (backup)
# Watch logs: "Selected provider: Claude Code API (Last Resort)"

# Restore
nano .env
# OPENCODE_API_KEY=valid_key
```

### 5. Test Concurrency
```bash
# Create 30 issues in Linear, all delegated to jinyang
# Watch her handle 27 concurrently, 3 queued

tail -f /tmp/jinyang-test.log | grep "Concurrent:"
# Should see: "Active sessions: 27/27" then slowly drop to done
```

---

## What We Built

**jinyang = Autonomous Linear Agent with OpenCode Brain**

Components:
1. **Webhook Receiver** (Express, HMAC verification)
2. **Routing Engine** (label/project/tag → repository)
3. **Provider Router** (3-tier selection: OpenCode → Claude Code → Claude API)
4. **Circuit Breaker** (auto-fallback on rate limits)
5. **Health Daemon** (30s provider checks)
6. **Session Manager** (worktree + OpenCode lifecycle)
7. **Scheduler** (FIFO queue, 27 max concurrent)
8. **Backlog Processor** (15-min restart stalled sessions)
9. **Linear Integration** (GraphQL client, status updates, comments)
10. **OpenCode Spawner** (session.create + session.prompt)

**Result:** She takes Linear issues, spawns OpenCode sessions that use GLM 4.7 to execute tasks, commits work, updates Linear.

---

## Quick Comparison

**Cyrus workflow:**
```
Linear Webhook → Routes → Worktree → Claude Agent SDK → Task → Commit → Update Linear
```

**jinyang workflow:**
```
Linear Webhook → Routes → Worktree → OpenCode SDK → GLM 4.7 → Task → Commit → Update Linear
                                      ↓ (if fails)
                                  Claude Code → Claude API
```

**The difference:** jinyang has 3 brains, auto-fallback, health monitoring. Never stops.

---

## Yes, She's Autonomous

**Juvenal's soul intact:**
- "Act > Ask" - she executes without permission
- "Parallel executor" - she spawns agents when needed
- "Pragmatic shipper" - working today > perfect next week
- "Systems thinker" - multi-tier routing, not single point

**What changed:**
- Added parallelism (spawn 22 agents in 4 phases = 8x speedup)
- Added quality gates (tests pass, commits enforced)
- Made pattern permanent (global CLAUDE.md updated)

---

## Next Steps

1. **Test her brain:** Delegate issue → watch `tail -f /tmp/jinyang-test.log`
2. **Deploy:** `sudo ./scripts/setup.sh` → `tailscale funnel 3001`
3. **Delegate real work:** She'll handle it autonomously

**Full guides:**
- `QUICK_TEST.md` - How to test
- `WHATS_DIFFERENT.md` - Cyrus vs jinyang
- `BRING_LINGLING_TO_LIFE.md` - Deployment

**Ready to delegate! She's born and alive.** ✅

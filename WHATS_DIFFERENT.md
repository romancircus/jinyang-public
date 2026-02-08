# jinyang vs Cyrus: What's Different?

## The "Brain" Battle

| Feature | Cyrus | jinyang |
|---------|-------|-------------------|
| **Primary Brain** | Claude Agent SDK (Anthropic only) | **OpenCode SDK** (GLM 4.7) |
| **Fallback Brains** | None | 3-tier routing: Claude Code → OpenCode → Claude API |
| **Health Monitoring** | ❌ NO | ✅ YES (30s checks, circuit breakers) |
| **Rate Limit Handling** | Manual (you fix it) | **Auto-fallback** to next provider |
| **Provider Selection** | Single (hardcoded) | Dynamic (priority-based + health) |
| **Failure Recovery** | Manual | Automatic (re-queue with context) |

---

## jinyang's Brain Architecture

### 1. Multi-Tier Provider Router (3 Brains)
```
Priority 1 (FASTEST): Claude Code (your subscription)
    ↓ Rate limit/down
Priority 2 (FAST): OpenCode GLM 4.7 (@opencode-ai/sdk)
    ↓ Rate limit/down
Priority 3 (SLOW): Claude Code API (direct API key)
```

**Code:** `src/provider/router.ts` - Priority-based selection with health checks

### 2. Circuit Breaker (Auto-Switching)
```
Primary fails → Circuit opens (3 failures) → Sleeps 5 min → Reopens when healthy
```

**Code:** `src/provider/circuit-breaker.ts` - Failure tracking + recovery

### 3. Health Daemon (Background Monitor)
```
Every 30 seconds: Check all provider endpoints
Write to: ~/.jinyang/providers/status.json
```

**Code:** `src/provider/health-daemon.ts` - Continuous monitoring

---

## Does jinyang Use OpenCode?

**YES!** She uses OpenCode via `@opencode-ai/sdk`:

```typescript
// From src/opencode/spawner.ts line 101-115
const opencodeClient = client.getClient();
const sessionCreateResult = await opencodeClient.session.create({
  query: { directory }
});

await opencodeClient.session.prompt({
  path: { id: sessionId },
  body: { parts: [{ type: 'text', text: prompt }] }
});
```

**How it works:**
1. Create OpenCode session: `session.create({ directory })`
2. Send prompt: `session.prompt({ parts: [{ type: 'text', text: prompt }] })`
3. Poll for completion: `pollSessionStatus(sessionId)`
4. Get result: Session ID + output

---

## Testing jinyang

### Quick Test (5 min)

```bash
# 1. Start server (running now on http://localhost:3001)
ps aux | grep "node dist/index.js" | grep -v grep

# 2. Test health endpoint
curl http://localhost:3001/health
# Should return: {"status":"ok","timestamp":"2026-02-04T..."}

# 3. Test webhook (without secret - should return 401)
curl -X POST http://localhost:3001/webhooks/linear \
  -H "Content-Type: application/json" \
  -d '{"test":"data"}'
# Should return: {"message":"Webhook secret not configured"}
```

### Full Test with Linear (10 min)

```bash
# 1. Configure .env
nano .env
# Add:
LINEAR_CLIENT_ID=your_client_id
LINEAR_CLIENT_SECRET=your_client_secret
LINEAR_WEBHOOK_SECRET=your_webhook_secret

# 2. Restart server
kill $(cat /tmp/jinyang-test.pid)
node dist/index.js > /tmp/jinyang-test.log 2>&1 &
echo $! > /tmp/jinyang-test.pid

# 3. Test webhook with secret (using Linear test webhook)
curl -X POST http://localhost:3001/webhooks/linear \
  -H "Content-Type: application/json" \
  -H "X-Linear-Signature: test" \
  -d '{"event":{"type":"issue_created"},"delegate":"jinyang"}'
# Should return: 200 OK

# 4. Watch logs
tail -f /tmp/jinyang-test.log
```

### Test OpenCode Integration (3 min)

```bash
# Create test issue in Linear
# 1. Go to Linear: https://linear.app/your-workspace
# 2. Create issue in "jinyang" project
# 3. Add label: repo:jinyang (or repo:kdh to test existing repo)
# 4. Delegate to "jinyang"
# 5. Watch logs:
sudo journalctl -u jinyang -f

# Expected flow:
# - Webhook received
# - Route to repository (based on label)
# - Create worktree: git worktree add
# - Spawn OpenCode session via @opencode-ai/sdk
# - Execute task from issue description
# - Commit changes
# - Update Linear status to "Done"
# - Post completion comment
```

---

## Real-World Comparison

### Scenario: Claude Code Rate Limited

**Cyrus:**
```
429 Too Many Requests → STOPS ❌
→ You wake up → Manual fix → Re-delegate
```

**jinyang:**
```
429 Too Many Requests → AUTO-SWITCH to OpenCode ✅
→ Continues executing → Recovers Claude Code when healthy
→ Zero interaction needed
```

### Scenario: Provider Down

**Cyrus:**
```
Claude API down → STOPS ❌
→ Manual monitoring → You fix it
```

**jinyang:**
```
Claude API down → Circuit breaker opens ✅
→ Auto-swap to OpenCode → Continues executing
→ Health daemon detects Claude recovery → Circuit closes
→ Back to Claude (Priority 1)
```

---

## The "Brain" Choice

**Cyrus's Brain:** Single-point failure
- Claude Code subscription only
- No plan B
- Manual intervention required

**jinyang's Brain:** Resilient multi-tier
- Claude Code (fastest, your subscription)
- OpenCode GLM 4.7 (backup, different API)
- Claude Code API (last resort, direct access)
- **Never stops** - always has a fallback

---

## Testing Checklist

```bash
[ ] Health endpoint returns: {"status":"ok"}
[ ] Webhook accepts delegation (returns 200)
[ ] Routing engine resolves labels → repos
[ ] Worktree created: git worktree exists
[ ] OpenCode session spawns (check logs for "session.create")
[ ] Task executes (check issue comments)
[ ] Git commit enforced (before status update)
[ ] Linear status: started → in_progress → done
[ ] Provider routing works (check logs for "Selected provider:")
[ ] Circuit breaker triggers (break primary, watch fallback)
```

---

## Summary

**jinyang IS more autonomous than Cyrus:**

✅ Uses OpenCode GLM 4.7 (primary brain, 3-tier routing)
✅ Auto-fallback on errors (never stops working)
✅ Health monitoring (30s checks, circuit breakers)
✅ Multi-provider redundancy (Claude Code + OpenCode + Claude API)
✅ Zero intervention needed (self-healing)

**What to test:**

1. **Now:** `curl http://localhost:3001/health`
2. **Full:** Delegate Linear issue → watch `tail -f /tmp/jinyang-test.log`
3. **Provider routing:** Break primary, watch auto-swap to OpenCode
4. **Concurrency:** Delegate 30 issues → 27 concurrent, 3 queued

Ready for test delegation!

# Quick Test jinyang

## Live Right Now

Server: ✅ Running on http://localhost:3001
Health: `curl http://localhost:3001/health` → `{"status":"ok"}`

## Test 1: Health Check
```bash
curl http://localhost:3001/health
# Expected: {"status":"ok","timestamp":"2026-02-04T..."}
```

## Test 2: Webhook (No Secret)
```bash
curl -X POST http://localhost:3001/webhooks/linear \
  -H "Content-Type: application/json" \
  -d '{"test":"data"}'
# Expected: 401 Unauthorized (needs LINEAR_WEBHOOK_SECRET in .env)
```

## Test 3: Provider Routing Check
```bash
node scripts/test-provider-routing.js
# Should show: claude-code, opencode-glm47, claude-code-api
```

## Test 4: Full Delegation (Requires .env Setup)

### Step 1: Configure .env
```bash
nano .env
# Add these:
LINEAR_CLIENT_ID=from linear settings
LINEAR_CLIENT_SECRET=from linear settings
LINEAR_WEBHOOK_SECRET=from linear settings
CLAUDE_CODE_ACCESS_TOKEN=sk-ant-your-token
OPENCODE_API_KEY=sk-z2If-your-key
```

### Step 2: Create Test Issue in Linear
1. Go to linear.app/your-workspace → jinyang project
2. Create issue: "Test jinyang task"
3. Add label: `repo:kdh` (or `repo:jinyang` for this repo)
4. Delegate to: "jinyang"

### Step 3: Watch Execution
```bash
tail -f /tmp/jinyang-test.log
```

### Expected Flow
```
[timestamp] Processing webhook: issue_created
[timestamp] Route: repo:kdh → /home/user/Applications/KDH-Automation
[timestamp] CreateWorktree: git worktree add...
[timestamp] OpenCode Session: session.create({ directory... })
[timestamp] Session Started: sessionId=abc123
[timestamp] Session Status: in_progress
[timestamp] Git Commit: feat: complete test task
[timestamp] Linear Update: issue ROM-XXX → Done
[timestamp] Comment Posted: Completed: test task
```

## Test 5: Multi-Tier Routing

### Break Primary Provider
```bash
# Temporarily break Claude Code
nano .env
# CLAUDE_CODE_ACCESS_TOKEN=invalid_token
```

### Delegate Issue
Create issue → Delegate to jinyang

### Watch Auto-Fallback
```bash
tail -f /tmp/jinyang-test.log | grep "Selected provider:"
# Should show: "Selected provider: OpenCode GLM-47 (Fallback)"
# Not: "Selected provider: Claude Code (Primary)"
```

### Restore
```bash
nano .env
# CLAUDE_CODE_ACCESS_TOKEN=sk-ant-valid-token
kill $(cat /tmp/jinyang-test.pid)
node dist/index.js > /tmp/jinyang-test.log 2>&1 &
```

## Test 6: Concurrency

### Create 30 Test Issues
```bash
for i in {1..30}; do
  echo "Creating test issue $i..."
  # (Use Linear API or UI)
done
```

### Watch Queue Behavior
```bash
tail -f /tmp/jinyang-test.log | grep "Active sessions:"
# Should show: max 27 concurrent, 3 in waiting queue
```

### Verify All Complete
```bash
tail -f /tmp/jinyang-test.log | grep "status: done"
# Should see: 30 "status: done" messages
```

## Test Summary

```bash
./test-jinyang.sh
```

All core tests pass:
✅ Server health
✅ TypeScript compiles
✅ Provider router exists
✅ OpenCode spawner exists
✅ Config has repositories

Ready for production deployment → See `BRING_LINGLING_TO_LIFE.md`

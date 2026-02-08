# Bringing jinyang to Life

## Status: 95% Complete

### ✅ Complete (22 Issues)
- Phase 1: Foundation (4)
- Phase 2: Core Layer (10)
- Phase 3: Integration (2)
- Phase 4: Testing & Docs (6)

### ⏳ Remaining (User Actions Required)

## 1. Environment Configuration (5 min)

```bash
cd ~/Applications/jinyang
cp .env.example .env
# Edit .env with your actual credentials:
```

**Required Variables:**
```bash
# Provider Credentials
CLAUDE_CODE_ACCESS_TOKEN=sk-ant-your-token
OPENCODE_API_KEY=sk-xxxx-your-opencode-api-key
CLAUDE_CODE_API_KEY=sk-ant-your-api-key

# Linear Integration (GET FROM YOUR LINEAR SETTINGS)
LINEAR_CLIENT_ID=your_client_id
LINEAR_CLIENT_SECRET=your_client_secret
LINEAR_WEBHOOK_SECRET=your_webhook_secret

# Server Config (defaults)
JINYANG_PORT=3000
JINYANG_HOST=0.0.0.0
```

## 2. Linear OAuth App Setup (3 min)

**In Linear:**
1. Go to Settings → Linear API → OAuth Apps → Create New App
2. Configure:
   - Name: jinyang
   - Home page: http://your-server.example.com:3000
   - Callback URL: http://your-server.example.com:3000/callback
   - Webhook: http://your-server.example.com:3000/webhooks/linear
3. Copy `Client ID` and `Client Secret` to `.env`
4. Copy `Webhook Secret` to `.env`

## 3. Repository Configuration (5 min)

**Option A: Import from Cyrus**
```bash
./scripts/migrate-config.sh
```
This imports ~/.cyrus/config.json (strips secrets) → config/default.json

**Option B: Manual Setup**
Edit `config/default.json` with your repositories (example):
```json
{
  "repositories": [
    {
      "id": "kdh-automation",
      "name": "KDH-Automation",
      "repositoryPath": "/home/user/Applications/KDH-Automation",
      "routingLabels": ["repo:kdh"]
    }
  ]
}
```

## 4. Deploy Systemd Service (2 min)

```bash
sudo ./scripts/setup.sh
```

**This installs:**
- jinyang.service (main daemon)
- jinyang-backlog-processor.timer (15-min queue runner)
- jinyang-health-daemon.timer (30s provider health checks)

**Verify:**
```bash
sudo systemctl status jinyang
sudo systemctl status jinyang-backlog-processor
sudo systemctl start jinyang
```

## 5. Tailscale Funnel (External Webhook Access - 5 min)

```bash
./scripts/setup-funnel.sh
# Or manual:
tailscale funnel 3000 --bg
```

**Test External Access:**
```bash
curl https://your-server.example.com/webhooks/linear
# Should return: {"status":"ok"}
```

## 6. Test Delegation Workflow (5 min)

**In Linear:**
1. Create test issue in jinyang project
2. Delegate to "jinyang"
3. Watch logs:
```bash
sudo journalctl -u jinyang -f
# System should:
# - Receive webhook
# - Route to repository
# - Create worktree
# - Spawn OpenCode session
# - Execute task
# - Commit with message
# - Update Linear status to "Done"
```

## 7. Verify Multi-Tier Routing (Optional)

**Test Fallback:**
```bash
# Temporarily break primary provider (set invalid token)
# Then delegate issue
# Watch logs: should fallback to opencode-glm47
sudo journalctl -u jinyang -f
```

## Expected Behavior

**When you delegate issue to "jinyang":**
1. Linear webhook received → `/webhooks/linear`
2. Delegate filter: `event.delegate === "jinyang"`
3. Routing engine: `routingLabels` → repository
4. Worktree created: `git worktree add` → `~/.jinyang/worktrees/`
5. OpenCode session spawned: `@opencode-ai/sdk promptAsync()`
6. Task executed: Issue description → OpenCode agent
7. Git commit enforced: Before session close
8. Linear status: `started` → `in_progress` → `done`
9. Comment posted: Completion summary

## Monitoring

**Check Logs:**
```bash
sudo journalctl -u jinyang -f          # Main service
sudo journalctl -u jinyang-backlog-processor -f   # Queue runner
sudo journalctl -u jinyang-health-daemon -f       # Provider health
```

**Check Status:**
```bash
sudo systemctl status jinyang
sudo systemctl list-timers | grep jinyang
```

**Check Active Sessions:**
```bash
ls -la ~/.jinyang/sessions/
```

## Troubleshooting

**Webhook not received?**
```bash
sudo journalctl -u jinyang -n 50
sudo journalctl -u tailscaled -n 50
curl -X POST http://localhost:3000/webhooks/linear
```

**Worktree not created?**
```bash
# Check router config
cat config/default.json
# Check permissions
ls -la ~/.jinyang/
```

**OpenCode not spawning?**
```bash
# Check OPENCODE_API_KEY
cat .env | grep OPENCODE
# Check OpenCode client
npm run dev
```

**Rate limit errors?**
```bash
# Should auto-fallback to opencode
sudo journalctl -u jinyang-provider -f
```

## After Setup

**jinyang is live:**
- Listens on port 3000 (via Tailscale funnel)
- Accepts Linear webhooks
- Spawns OpenCode sessions
- Commits work to worktrees
- Updates Linear issues
- Handles 27 concurrent sessions

**Next:**
1. Delegate actual work issues to jinyang
2. Watch autonomous parallel execution
3. Iterate on routing labels/projects/tags
4. Monitor provider health and fallbacks

**Full docs:** See README.md, docs/DEPLOYMENT.md, docs/API.md

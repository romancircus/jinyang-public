# Deployment Guide

Complete installation and deployment instructions for jinyang.

---

## Prerequisites

- **Node.js**: 22.21.1+ (LTS recommended)
- **TypeScript**: 5.9.3+
- **Git**: 2.40+ with worktree support
- **Tailscale**: For external webhook access (optional but recommended)
- **Linear**: OAuth app configured for webhook authentication

---

## Installation Steps

### 1. Clone Repository

```bash
cd ~/Applications
git clone <repo-url> jinyang
cd jinyang
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build TypeScript

```bash
npm run build
```

### 4. Validate Setup

```bash
./scripts/validate-setup.sh
```

This script checks:
- Node.js version (>= 22)
- Git installation and configuration
- Required environment variables
- Directory structure
- TypeScript compilation
- Test suite (54 tests)
- Lint status
- Provider configuration

---

## Environment Setup

### 1. Copy Environment Template

```bash
cp .env.example .env
```

### 2. Configure Required Variables

Edit `.env` with your credentials:

#### Required
```bash
LINEAR_WEBHOOK_SECRET=your_webhook_secret_from_linear
```

Get this from your Linear app settings at: `linear.app/your-workspace/settings/api`

#### AI Providers (at least one required)

**Primary Provider - Kimi OAuth (Recommended)**
```bash
# OAuth tokens auto-managed in ~/.opencode-kimi-auth/oauth.json
# Uses subscription credits - no API key needed
```

**Fallback 1 - Claude Code Subscription**
```bash
CLAUDE_CODE_ACCESS_TOKEN=sk-ant-your-claude-token
```

**Fallback 2 - OpenCode GLM 4.7**
```bash
OPENCODE_API_KEY=sk-your-opencode-key
```

**Fallback 3 - Claude Code API**
```bash
CLAUDE_CODE_API_KEY=sk-ant-your-api-key
```

**Alternative - Kimi API Key**
```bash
KIMI_API_KEY=kimi-api-xxxx  # From https://platform.moonshot.cn/console/api-keys
```

#### Linear Integration
```bash
LINEAR_CLIENT_ID=your_client_id
LINEAR_CLIENT_SECRET=your_client_secret
LINEAR_API_TOKEN=your_oauth_token
```

#### Server Configuration
```bash
LILINGLING_PORT=3000
LILINGLING_HOST=0.0.0.0
JINYANG_WORKTREE_BASE=~/.jinyang/worktrees
JINYANG_LOG_PATH=~/.jinyang/logs
JINYANG_DEFAULT_TIMEOUT_MS=300000
JINYANG_HEALTH_INTERVAL_MS=60000
```

### 3. Configure Provider Routing

Edit `config/providers.yaml`:

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

routing:
  strategy: tiered
  default_provider: claude-code
  fallback_chain:
    - claude-code
    - opencode-glm47
    - claude-code-api

circuit_breaker:
  failure_threshold: 3
  sleep_window_minutes: 5
```

### 4. Configure Repositories

Edit `config/default.json`:

```json
{
  "repositories": [
    {
      "id": "my-project",
      "name": "MyProject",
      "repositoryPath": "/home/user/projects/my-project",
      "baseBranch": "main",
      "isActive": true,
      "routingLabels": ["repo:myproject"]
    }
  ]
}
```

Or migrate from Cyrus:
```bash
./scripts/migrate-config.sh
```

---

## Systemd Configuration

### Main Service

Install the main jinyang service:

```bash
sudo cp systemd/jinyang.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable jinyang
sudo systemctl start jinyang
```

**Service File:** `systemd/jinyang.service`

```ini
[Unit]
Description=Jinyang Linear Agent
After=network.target

[Service]
Type=simple
User=<your-user>
WorkingDirectory=/home/user/Applications/jinyang
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Backlog Processor Service

Install the queue runner:

```bash
sudo cp systemd/jinyang-backlog.service /etc/systemd/system/
sudo cp systemd/jinyang-backlog.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable jinyang-backlog.timer
sudo systemctl start jinyang-backlog.timer
```

**Service File:** `systemd/jinyang-backlog.service`

```ini
[Unit]
Description=Jinyang Backlog Processor
After=jinyang.service

[Service]
Type=oneshot
User=<your-user>
WorkingDirectory=/home/user/Applications/jinyang
ExecStart=/bin/bash /home/user/Applications/jinyang/scripts/backlog-processor.sh
```

**Timer File:** `systemd/jinyang-backlog.timer`

```ini
[Unit]
Description=Jinyang Backlog Processor Timer

[Timer]
OnBootSec=5min
OnUnitActiveSec=15min

[Install]
WantedBy=timers.target
```

### Health Daemon Service

Install provider health monitoring:

```bash
sudo cp systemd/jinyang-health-daemon.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable jinyang-health-daemon
sudo systemctl start jinyang-health-daemon
```

**Service File:** `systemd/jinyang-health-daemon.service`

```ini
[Unit]
Description=Jinyang Health Daemon
After=jinyang.service

[Service]
Type=simple
User=<your-user>
WorkingDirectory=/home/user/Applications/jinyang
ExecStart=/bin/bash /home/user/Applications/jinyang/scripts/health-daemon.sh
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
```

### One-Command Setup

Or use the setup script:

```bash
sudo ./scripts/setup.sh
```

This installs all services, sets up directories, and configures permissions.

---

## External Access (Tailscale)

### Method 1: Tailscale Funnel (Recommended)

Expose server externally:

```bash
tailscale funnel 3000 --bg
# Or
./scripts/setup-funnel.sh
```

### Method 2: Tailscale Serve

For internal network access only:

```bash
tailscale serve 3000 --bg
```

### Configure Linear Webhook URL

In Linear app settings:
```
https://your-server.example.com:3000/webhooks/linear
```

---

## Monitoring

### Service Status

```bash
# Main service
sudo systemctl status jinyang

# Backlog processor
sudo systemctl status jinyang-backlog.service

# Health daemon
sudo systemctl status jinyang-health-daemon
```

### Logs

```bash
# Real-time logs
sudo journalctl -u jinyang -f

# Backlog processor logs
sudo journalctl -u jinyang-backlog -f

# Health daemon logs
sudo journalctl -u jinyang-health-daemon -f

# All timers
sudo systemctl list-timers --all
```

### Health Checks

```bash
# Basic health
curl http://localhost:3000/health
# Response: {"status":"ok","timestamp":"..."}

# Detailed health
curl http://localhost:3000/health/detailed | jq

# Provider health
curl http://localhost:3000/health/providers | jq
```

---

## Directory Structure

After installation:

```
~/.jinyang/
├── sessions/           # Session tracking JSON files
├── worktrees/        # Git worktrees (ephemeral)
├── logs/             # Server logs
└── providers/
    └── status.json   # Provider health cache
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check configuration
./scripts/validate-setup.sh

# Check Node.js version
node --version

# Check port conflicts
lsof -i :3000

# Check logs for errors
sudo journalctl -u jinyang -n 50 --no-pager
```

### Webhook Not Received

```bash
# Test locally
curl -X POST http://localhost:3000/webhooks/linear \
  -H "Content-Type: application/json" \
  -H "X-Linear-Signature: test" \
  -d '{"test":"data"}'

# Check Tailscale status
tailscale status

# Verify webhook URL in Linear
# Settings → API → Webhooks → URL
```

### Provider Issues

```bash
# Check provider status
cat ~/.jinyang/providers/status.json

# Test provider routing
node scripts/test-provider-routing.js

# Check circuit breaker states
curl http://localhost:3000/health/providers | jq '.providers[].circuitBreakerState'
```

### Worktree Cleanup

```bash
# Clean up orphaned worktrees
node scripts/cleanup-worktree.ts

# List active worktrees
ls -la ~/.jinyang/worktrees/

# Kill zombie processes
pkill -f "opencode.*session"
```

---

## Security Considerations

1. **Webhook Secret**: Always set `LINEAR_WEBHOOK_SECRET` to prevent spoofing
2. **Auto-Execution**: Use `jinyang:auto` label sparingly for trusted tasks
3. **Worktree Isolation**: Changes are contained in ephemeral worktrees
4. **Provider Credentials**: Store in `.env` (never commit to git)
5. **Network**: Use Tailscale for secure external access
6. **Permissions**: Run as non-root user (dedicated service account)

---

## Upgrade Process

```bash
# Stop services
sudo systemctl stop jinyang
sudo systemctl stop jinyang-health-daemon

# Pull latest
git pull origin main

# Rebuild
npm install
npm run build

# Restart services
sudo systemctl start jinyang
sudo systemctl start jinyang-health-daemon

# Verify
curl http://localhost:3000/health
```

---

## Uninstall

```bash
# Stop and disable services
sudo systemctl stop jinyang
sudo systemctl stop jinyang-health-daemon
sudo systemctl disable jinyang
sudo systemctl disable jinyang-health-daemon

# Remove service files
sudo rm /etc/systemd/system/jinyang*.service
sudo rm /etc/systemd/system/jinyang*.timer
sudo systemctl daemon-reload

# Remove data (optional)
rm -rf ~/.jinyang
```

# jinyang

**Autonomous Linear-to-code agent.** Receives Linear issues, spawns AI coding sessions, commits code, and pushes to your repos — all without human intervention.

![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![Node](https://img.shields.io/badge/Node.js-22+-green)
![Status](https://img.shields.io/badge/E2E-verified-brightgreen)

## How It Works

```
Linear Issue (webhook) --> jinyang server --> route to repo --> create git worktree
    --> spawn OpenCode session --> AI writes code --> git commit --> git push --> Linear updated
```

jinyang watches your Linear workspace. When an issue is delegated to it (or labeled `jinyang:auto`), it:

1. Routes the issue to the correct repository via labels (`repo:myapp`, `repo:backend`, etc.)
2. Creates an isolated git worktree so work doesn't interfere with your local branch
3. Syncs the worktree to the latest `origin/master` (or configured base branch)
4. Spawns an OpenCode AI session **inside the worktree directory**
5. The AI reads the issue title/description, writes code, and commits
6. jinyang pushes the commit to the remote and updates Linear status to Done

All of this happens asynchronously. You can delegate 10 issues across 5 repos and come back to completed work.

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/your-org/jinyang.git
cd jinyang
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your credentials:
#   - LINEAR_CLIENT_ID / LINEAR_CLIENT_SECRET (from Linear app settings)
#   - LINEAR_WEBHOOK_SECRET (from Linear webhook config)
#   - OPENCODE_API_KEY (for AI provider)
```

Edit `~/.jinyang/config.json` to register your repositories:

```json
{
  "repositories": [
    {
      "id": "my-repo",
      "name": "my-repo",
      "repositoryPath": "/home/user/projects/my-repo",
      "baseBranch": "master",
      "isActive": true,
      "routingLabels": ["repo:myrepo"],
      "projectKeys": ["My Project"]
    }
  ]
}
```

### 3. Build and run

```bash
npm run build
npm start
# Server starts on port 3001 (configurable via JINYANG_PORT)
```

Or run as a systemd service (recommended for production):

```bash
# Copy and edit the unit file
cp jinyang.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now jinyang
```

### 4. Set up Linear webhook

Point your Linear workspace webhook to:
```
https://your-server/webhooks/linear
```

Add the webhook secret to your `.env` as `LINEAR_WEBHOOK_SECRET`.

---

## Testing the Pipeline

### Local test webhook (no HMAC required)

The `/webhooks/test` endpoint skips signature verification, perfect for local testing:

```bash
# Test against any configured repo (use its repo:label)
curl -X POST http://localhost:3001/webhooks/test \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create",
    "type": "Issue",
    "data": {
      "id": "test-001",
      "identifier": "ROM-999",
      "title": "Create a hello-world.txt file",
      "description": "Create a file called hello-world.txt with the text Hello from jinyang",
      "state": { "name": "Todo" },
      "labels": { "nodes": [{ "name": "jinyang:auto" }, { "name": "repo:myrepo" }] },
      "project": { "name": "My Project" },
      "delegate": { "name": "jinyang" }
    }
  }'
```

Expected response:
```json
{"message":"Webhook accepted, auto-executing async","issueId":"ROM-999","mode":"auto"}
```

Then watch logs:
```bash
journalctl --user -u jinyang -f
# Or if running directly:
# check stdout
```

You should see:
```
[Orchestrator] Routing issue ROM-999 to: my-repo
[Orchestrator] Worktree created at: ~/.jinyang/worktrees/ROM-999
[Orchestrator] Worktree synced to origin/master
[Orchestrator] Baseline commit: abc1234
[Orchestrator] Executing agent for ROM-999
Session idle detected via status polling
[Orchestrator] Verifying results for ROM-999
[Orchestrator] Pushing commits to origin/master for ROM-999
[Orchestrator] Successfully pushed ROM-999 to origin/master
[Orchestrator] Successfully completed ROM-999
```

Verify on the remote:
```bash
cd ~/projects/my-repo
git fetch origin && git log --oneline -3 origin/master
```

### Manual execution (for real Linear issues)

```bash
./scripts/execute-manual.sh ROM-123
```

This fetches the issue from Linear, runs it through the full pipeline, and updates Linear on completion.

### Validate setup

```bash
./scripts/validate-setup.sh
```

Checks that all required env vars, directories, and config files are in place.

---

## Label System

jinyang uses Linear labels to control routing and execution behavior:

| Label | Effect |
|-------|--------|
| `repo:<name>` | Routes to the matching repository (e.g., `repo:myapp`) |
| `repo:jinyang` | Routes to jinyang itself |
| `jinyang:auto` | Execute immediately on webhook |
| `jinyang:manual` | Queue for manual execution |

Without a `jinyang:auto` label, issues default to manual mode (safe).

Routing priority: `repo:*` label > project name match > description tag match.

---

## Architecture

```
src/
  index.ts                 # Entry: Express server on port 3001
  webhook/
    receiver.ts            # Webhook handler, session dedup, rate limiting
    middleware.ts           # HMAC signature verification
    parser.ts              # Payload parsing, label normalization
  routing/
    engine.ts              # Label/project/tag-based repo routing
    config-loader.ts       # Reads ~/.jinyang/config.json
  orchestrator/
    index.ts               # Main pipeline: route -> worktree -> execute -> push
    result.ts              # Commit verification
  executors/
    opencode.ts            # OpenCode SDK executor (SSE + polling)
    kimi.ts                # Kimi API executor
    factory.ts             # Provider factory
  worktree/
    manager.ts             # Git worktree create/cleanup
    GitService.ts          # Git operations (commit, push, sync)
  linear/
    client.ts              # Linear GraphQL API (cached, batched)
    updater.ts             # Status updates (In Progress / Done / Failed)
    poller.ts              # Background poller for missed webhooks
  provider/
    router.ts              # Multi-tier provider selection
    circuit-breaker.ts     # Provider failure tracking
    health-daemon.ts       # Background health checks
```

### Key Design Decisions

- **Worktree isolation**: Each issue gets its own git worktree. No cross-contamination between tasks.
- **Session dedup**: In-memory Set + file locks at `~/.jinyang/sessions/{issueId}.json` prevent duplicate executions.
- **State-change filter**: jinyang's own Linear status updates trigger webhooks back — these are filtered out.
- **SSE + polling**: OpenCode SSE streams sometimes miss idle events; a polling backup races with SSE for reliability.
- **Push to base branch**: Uses `git push origin HEAD:<baseBranch>` to push worktree commits directly to the configured branch.

---

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JINYANG_PORT` | No | `3001` | HTTP server port |
| `JINYANG_HOST` | No | `0.0.0.0` | Bind address |
| `LINEAR_CLIENT_ID` | Yes | - | Linear OAuth app client ID |
| `LINEAR_CLIENT_SECRET` | Yes | - | Linear OAuth app client secret |
| `LINEAR_WEBHOOK_SECRET` | Yes | - | Linear webhook signing secret |
| `OPENCODE_API_KEY` | Yes | - | OpenCode/AI provider API key |
| `CLAUDE_CODE_ACCESS_TOKEN` | No | - | Claude Code access token (fallback) |
| `PROVIDER_HEALTHCHECK_INTERVAL_SEC` | No | `30` | Health check frequency |

### Repository Config (`~/.jinyang/config.json`)

Each repository entry needs:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier |
| `name` | Display name |
| `repositoryPath` | Absolute path to local clone |
| `baseBranch` | Branch to push to (`master` or `main`) |
| `routingLabels` | Labels that route issues here (e.g., `["repo:myrepo"]`) |
| `projectKeys` | Linear project names that route here |
| `isActive` | Enable/disable this repo |

---

## Troubleshooting

**Agent commits in wrong directory**: The OpenCode session must be created with `query: { directory: worktreePath }`. If you see "Commit SHA unchanged from baseline", this is the cause.

**Push rejected (non-fast-forward)**: The worktree needs `syncToRemote()` before execution. This fetches and resets to the latest remote HEAD.

**Duplicate executions**: Check that session locks exist at `~/.jinyang/sessions/`. The in-memory Set handles same-process races; file locks handle cross-restart races.

**Linear webhook loops**: jinyang filters its own status-change webhooks. If you see infinite loops, check the `isOurStateUpdate` filter in `receiver.ts`.

**Wrong repo routing**: Verify the issue has a `repo:*` label matching the config's `routingLabels` array.

**Logs**: `journalctl --user -u jinyang -f` (systemd) or stdout (direct run).

---

## Scripts

| Script | Description |
|--------|-------------|
| `scripts/execute-manual.sh <ROM-XXX>` | Manually trigger execution for a Linear issue |
| `scripts/validate-setup.sh` | Check env vars, config, and directory setup |
| `scripts/backlog-processor.sh` | Process queued `jinyang:auto` issues (runs on timer) |
| `scripts/health-daemon.sh` | Provider health check loop |
| `scripts/test-webhook.sh` | Send a signed test webhook |

---

## Requirements

- Node.js 22+
- Git
- Linear account with webhook access
- OpenCode AI provider key (Kimi k2.5 / GLM 4.7)
- Local clones of target repositories

---

## License

ISC

# Integration Guide for External Repositories

How to integrate your repository with jinyang for autonomous code execution.

---

## Table of Contents

1. [Quick Start (5 minutes)](#quick-start-5-minutes)
2. [Repository Registration](#repository-registration)
3. [Routing Configuration](#routing-configuration)
4. [Webhook Setup](#webhook-setup)
5. [Issue Labeling](#issue-labeling)
6. [Testing Integration](#testing-integration)
7. [Troubleshooting](#troubleshooting)
8. [Best Practices](#best-practices)

---

## Quick Start (5 minutes)

### Step 1: Add Repository to jinyang Config

Edit `config/default.json` in the jinyang repository:

```json
{
  "repositories": [
    {
      "id": "your-repo-id",
      "name": "Your Repository Name",
      "repositoryPath": "/home/user/Applications/your-repo",
      "baseBranch": "main",
      "isActive": true,
      "routingLabels": ["repo:your-shortcode"],
      "projectKeys": ["YOUR: Project Name"]
    }
  ]
}
```

### Step 2: Add Routing Label to Issues

In Linear, add the label `repo:your-shortcode` to any issue you want jinyang to handle:

```
Issue: "Fix the login button styling"
Labels: ["repo:your-shortcode", "jinyang:auto"]
Delegate: jinyang
```

### Step 3: Test

```bash
# In jinyang directory
./scripts/test-integration.sh your-repo-id
```

**That's it!** jinyang will now automatically process issues with your routing label.

---

## Repository Registration

### Configuration Schema

```json
{
  "id": "unique-repo-identifier",           // Required: Unique ID
  "name": "Human-readable name",            // Required: Display name
  "repositoryPath": "/absolute/path/to/repo", // Required: Full path
  "baseBranch": "main",                       // Required: Default branch
  "isActive": true,                           // Required: Enable/disable
  "routingLabels": ["repo:abc"],             // Optional: Labels that route here
  "projectKeys": ["ABC: Project"],           // Optional: Linear projects
  "linearWorkspaceId": "uuid",               // Optional: Workspace ID
  "linearWorkspaceName": "workspace"         // Optional: Workspace name
}
```

### Example: Multiple Repositories

```json
{
  "repositories": [
    {
      "id": "frontend-app",
      "name": "Frontend Application",
      "repositoryPath": "/home/user/Applications/frontend",
      "baseBranch": "main",
      "isActive": true,
      "routingLabels": ["repo:frontend"],
      "projectKeys": ["FE: Frontend Work"]
    },
    {
      "id": "backend-api",
      "name": "Backend API",
      "repositoryPath": "/home/user/Applications/backend",
      "baseBranch": "develop",
      "isActive": true,
      "routingLabels": ["repo:backend", "repo:api"],
      "projectKeys": ["BE: Backend Work", "API: Endpoints"]
    },
    {
      "id": "shared-lib",
      "name": "Shared Library",
      "repositoryPath": "/home/user/Applications/shared-lib",
      "baseBranch": "main",
      "isActive": true,
      "routingLabels": ["repo:shared"]
    }
  ]
}
```

---

## Routing Configuration

### Routing Priority

jinyang matches issues to repositories in this order:

1. **Routing Labels** (highest priority)
   - Labels like `repo:frontend` directly map to repositories
   - Multiple labels can route to the same repo

2. **Linear Projects**
   - Project names like "FE: Frontend Work" map via `projectKeys`

3. **Description Tags**
   - Tags in issue description: `@jinyang repo:frontend`

4. **Fallback** (lowest priority)
   - If no match, checks `~/Applications/{issue-id}`

### Label-Based Routing (Recommended)

**Most reliable and explicit method:**

```
Issue: "Add user authentication"
Labels: ["repo:backend", "jinyang:auto", "feature"]
```

**Maps to:** Backend API repository

### Project-Based Routing

**For teams using Linear projects:**

```json
{
  "id": "frontend-app",
  "projectKeys": ["FE: User Interface", "FE: Components"]
}
```

Any issue in Linear project "FE: User Interface" routes to frontend-app.

### Description Tag Routing

**Emergency/alternative routing:**

```
Issue Title: "Fix critical bug"
Description: "Production is down! @jinyang repo:backend priority:urgent"
```

---

## Webhook Setup

### For Repository Owners

**You don't need to set up webhooks!** jinyang receives webhooks from Linear centrally.

Just ensure your issues are properly labeled and delegated.

### Webhook Payload Example

When jinyang receives a webhook for your issue, it looks like this:

```json
{
  "action": "create",
  "data": {
    "id": "issue-uuid",
    "identifier": "ROM-123",
    "title": "Fix the login button",
    "description": "Button is misaligned on mobile",
    "labels": {
      "nodes": [
        { "name": "repo:frontend" },
        { "name": "jinyang:auto" }
      ]
    },
    "project": { "name": "FE: Frontend Work" },
    "delegate": { "name": "jinyang" }
  }
}
```

### Testing Webhooks

Test your integration without creating real issues:

```bash
# Test webhook for your repo
curl -X POST http://localhost:3000/webhooks/test \
  -H "Content-Type: application/json" \
  -d '{
    "event": {
      "type": "Issue",
      "action": "created",
      "data": {
        "id": "test-issue-123",
        "identifier": "TEST-123",
        "title": "Test integration",
        "labels": [{"name": "repo:your-shortcode"}],
        "delegate": {"name": "jinyang"}
      }
    }
  }'
```

---

## Issue Labeling

### Required Labels

| Label | Purpose | Required? |
|-------|---------|-----------|
| `repo:XXX` | Routes to specific repository | Yes |
| `jinyang` or delegate | Identifies jinyang as executor | Yes |
| `jinyang:auto` | Auto-execute immediately | No (default: manual) |
| `jinyang:manual` | Queue for manual execution | No |

### Label Combinations

**Auto-execution (production ready):**
```
Labels: ["repo:frontend", "jinyang", "jinyang:auto"]
```

**Manual review required:**
```
Labels: ["repo:frontend", "jinyang", "jinyang:manual"]
```

**With priority:**
```
Labels: ["repo:frontend", "jinyang", "jinyang:auto", "priority:high"]
```

### Model Override

Specify AI model in description:

```
Title: "Refactor authentication"
Description: "@jinyang repo:backend model:claude-sonnet-4"
```

Available models:
- `claude-sonnet-4` or `claude-sonnet-4-opus` - Best for complex tasks
- `glm-4.7` - Fast, good for simple tasks
- `kimi-k2.5` - Alternative option

---

## Testing Integration

### Automated Test Script

```bash
# In jinyang directory
./scripts/test-integration.sh your-repo-id

# This will:
# 1. Verify repository exists in config
# 2. Check repository path is accessible
# 3. Test worktree creation
# 4. Simulate webhook processing
# 5. Report results
```

### Manual Testing

**Step 1: Verify config loaded**

```bash
curl http://localhost:3000/health/detailed | jq '.components.repositories'
```

**Step 2: Test routing**

```bash
# Create test issue in Linear with your routing label
# Check jinyang logs
tail -f ~/.jinyang/logs/server.log | grep "your-repo-id"
```

**Step 3: Verify execution**

```bash
# Check if worktree was created
ls -la ~/.jinyang/worktrees/

# Check session status
cat ~/.jinyang/sessions/ROM-*.json
```

### Integration Test Checklist

- [ ] Repository registered in config/default.json
- [ ] Repository path exists and is accessible
- [ ] Routing labels configured
- [ ] Git repository initialized
- [ ] Base branch exists
- [ ] Test webhook processed successfully
- [ ] Worktree created successfully
- [ ] Session completed (check Linear issue status)

---

## Troubleshooting

### Issue Not Being Processed

**Check 1: Repository registered?**
```bash
cat config/default.json | jq '.repositories[] | select(.id=="your-repo-id")'
```

**Check 2: Routing labels match?**
```bash
# In issue, verify labels:
# Should have: "repo:your-shortcode" AND ("jinyang" delegate OR "jinyang" label)
```

**Check 3: jinyang server running?**
```bash
sudo systemctl status jinyang
curl http://localhost:3000/health
```

**Check 4: Check logs**
```bash
sudo journalctl -u jinyang -f | grep "your-repo-id"
```

### Worktree Creation Fails

**Error: "Repository not found"**
- Verify `repositoryPath` in config
- Check path exists: `ls -la /home/user/Applications/your-repo`
- Ensure it's a git repo: `git -C /home/user/Applications/your-repo status`

**Error: "Branch already exists"**
- jinyang creates branches named `linear/ROM-XXX-description`
- If branch exists, jinyang will reuse it
- This is normal behavior

### Session Not Starting

**Check provider health:**
```bash
curl http://localhost:3000/health/detailed | jq '.components.providers'
```

**Check concurrent sessions:**
```bash
ls ~/.jinyang/sessions/ | wc -l
# Max is 27 - if at limit, issue will be queued
```

**Check queue status:**
```bash
sudo journalctl -u jinyang | grep "queue"
```

---

## Best Practices

### Repository Structure

**Recommended layout:**
```
your-repo/
├── README.md              # Helps jinyang understand the project
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript config
├── .env.example           # Environment variables (not .env!)
├── src/                   # Source code
├── tests/                 # Test files
└── docs/                  # Documentation
```

### README Guidelines

**Include these sections for best results:**

```markdown
## Project Overview
- What this project does
- Tech stack (React, Node, Python, etc.)
- Architecture (monolithic, microservices, etc.)

## Development Setup
- How to run locally
- Required environment variables
- Build commands
- Test commands

## Key Commands
```bash
npm install    # Install dependencies
npm run dev    # Start development server
npm test       # Run tests
npm run build  # Build for production
```

## File Structure
- Where different types of files live
- Naming conventions
```

### Testing Strategy

**Before delegating issues:**

1. **Unit tests first** - Ensure tests exist for affected code
2. **Test scripts** - Provide clear test commands
3. **CI/CD integration** - Consider adding jinyang to your CI pipeline

### Security Considerations

**Never include in issues:**
- API keys or passwords
- Private credentials
- Internal URLs not in README

**Safe to include:**
- Feature descriptions
- Bug reports
- Refactoring requests
- Documentation updates

### Performance Tips

**For faster execution:**
- Keep repositories under 100MB
- Exclude large assets (use .gitignore)
- Provide clear, focused issue descriptions
- Use `jinyang:auto` only for trusted, repetitive tasks

---

## Advanced Topics

### Custom Worktree Directories

Override default worktree location:

```json
{
  "id": "your-repo",
  "workspaceBaseDir": "/custom/path/to/worktrees"
}
```

### Shared Assets

If your repo needs shared resources:

```
# In your repo root
ln -s $HOME/shared-assets assets
```

jinyang will automatically symlink `assets/` and `references/` directories.

### Multi-Repository Issues

For changes spanning multiple repos:

```
Issue: "Update API and frontend"
Labels: ["repo:backend", "repo:frontend", "jinyang:manual"]
Description: "Step 1: Update API endpoint in backend repo
Step 2: Update frontend to use new endpoint"
```

Create separate issues for each repo, then link them with `blockedBy`.

---

## Examples

### Example 1: Frontend Bug Fix

**Linear Issue:**
```
Title: "Fix mobile navigation menu"
Description: "Menu doesn't close when clicking outside on iOS Safari.

@jinyang repo:frontend

Expected: Menu closes on outside click
Actual: Menu stays open
Steps: 1. Open on iPhone, 2. Click hamburger, 3. Tap outside menu"

Labels: ["repo:frontend", "jinyang", "jinyang:auto", "bug", "mobile"]
Delegate: jinyang
```

**jinyang execution:**
1. Creates worktree for frontend repo
2. Analyzes navigation component
3. Implements fix for iOS touch events
4. Runs tests: `npm test`
5. Commits: `fix: Close mobile menu on outside tap (ROM-123)`
6. Updates Linear: Status → Done

### Example 2: API Feature

**Linear Issue:**
```
Title: "Add user pagination endpoint"
Description: "Need GET /api/users?page=1&limit=20 endpoint.
Should return { users: [], total: number, page: number }.

@jinyang repo:backend

Requirements:
- Pagination with page/limit params
- Default limit: 20, max: 100
- Sort by created_at desc
- Include user profile data"

Labels: ["repo:backend", "jinyang", "jinyang:manual", "feature"]
Delegate: jinyang
```

**jinyang execution:**
1. Queued for manual execution (not auto)
2. When triggered: Creates worktree
3. Adds endpoint with validation
4. Adds tests for pagination
5. Updates documentation
6. Commits: `feat: Add user pagination endpoint (ROM-124)`

### Example 3: Documentation Update

**Linear Issue:**
```
Title: "Document deployment process"
Description: "Add deployment section to README with:
- Environment variables needed
- Build steps
- Verification checklist

@jinyang repo:shared-docs"

Labels: ["repo:shared-docs", "jinyang", "jinyang:auto", "documentation"]
Delegate: jinyang
```

---

## API Reference for Integrations

### Health Check

```bash
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-05T10:30:00.000Z"
}
```

### Detailed Health

```bash
GET /health/detailed
```

**Response:**
```json
{
  "status": "healthy",
  "components": {
    "repositories": {
      "your-repo-id": {
        "status": "active",
        "path": "/home/user/projects/your-repo",
        "lastExecution": "2026-02-05T10:00:00Z"
      }
    }
  }
}
```

### Manual Execution Trigger

```bash
POST /execute
Content-Type: application/json

{
  "issueId": "ROM-123",
  "repositoryId": "your-repo-id"
}
```

---

## Getting Help

### Support Channels

1. **Check logs first:** `sudo journalctl -u jinyang -f`
2. **Run validation:** `./scripts/validate-setup.sh`
3. **Check this doc:** See troubleshooting section above
4. **Linear issues:** Create issue in jinyang repository with label `help`

### Debug Mode

Enable verbose logging:

```bash
# In .env
JINYANG_LOG_LEVEL=debug

# Restart service
sudo systemctl restart jinyang
```

---

## Summary

**To integrate your repository:**

1. ✅ Add to `config/default.json`
2. ✅ Configure routing labels
3. ✅ Test with `./scripts/test-integration.sh`
4. ✅ Create labeled issue in Linear
5. ✅ Watch the magic happen

**Key points:**
- Use `repo:XXX` labels for explicit routing
- Always delegate to "jinyang" in Linear
- Use `jinyang:auto` for trusted automation
- Include clear descriptions for better results
- README helps jinyang understand your project

---

*Ready to automate your repository? Start with a simple documentation issue to test the flow.*

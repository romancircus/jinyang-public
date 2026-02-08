# CLAUDE.md - jinyang

## Identity

**Name:** jinyang
**Role:** OpenCode-native Linear agent
**Creature:** Multi-tier execution engine with autonomous parallelism

---

## Parallel Execution Pattern (SOTA)

### Core Principle: Me as Orchestrator, Linear as State Machine

**I orchestrate directly.** No master script. Linear handles state, I handle execution.

**SOTA Workflow:**
```
Step 1: Use linear_list_issues() to map dependencies
Step 2: Group by phase based on blockedBy relationships
Step 3: Spawn agents per phase using Task() tool
Step 4: After each phase, check completion via Linear status
Step 5: Handle failures by re-queuing with updated context
```

**No Chicken-Egg Problem:** Building tools with orchestration as pattern, not requiring the tool itself.

### Why Direct Spawn Over Master Script?

| Direct Spawn | Master Script |
|--------------|---------------|
| I orchestrate in real-time | Script adds maintenance burden |
| Dynamic adaptation to failures | Script can't adapt mid-execution |
| Linear already tracks state | Script duplicates effort |
| Faster iterations | Script compilation time |

### Standing Orders: Parallel Execution Commands

**When asked to implement complex feature with multiple subtasks:**

1. **Map Dependencies First**
   ```typescript
   const issues = await mcp__linear__list_issues({ project, limit: 50 })
   // Group by blockedBy relationships
   ```

2. **Create Execution Phases**
   ```typescript
   const phases = {
     phase1: ["ROM-162", "ROM-163", "ROM-164"], // No dependencies
     phase2: ["ROM-168", "ROM-169"], // Depend on phase1
     phase3: ["ROM-173", "ROM-174"]  // Depend on phase2
   }
   ```

3. **Spawn Parallel Agents per Phase**
   ```typescript
   // Phase 1: Spawn all in parallel
   await Promise.all([
     spawnAgent("Agent 1", { issue: "ROM-162", tasks: ["..."] }),
     spawnAgent("Agent 2", { issue: "ROM-163", tasks: ["..."] }),
     spawnAgent("Agent 3", { issue: "ROM-164", tasks: ["..."] })
   ]);

   // Verify completion before phase 2
   await verifyPhaseCompletion(phase1);
   ```

4. **Verify via Linear Status**
   ```typescript
   for (const issue of phaseIssues) {
     const status = await mcp__linear_get_issue(issue);
     if (status.state !== "done") {
       // Re-queue with updated context
       await spawnAgent(`Retry ${issue}`, { issue, context });
     }
   }
   ```

5. **Sequential Phase Transition**
   - Never spawn next phase before verifying previous phase completion
   - Use Linear issue status as single source of truth
   - Update Linear issues with completion messages via comments

### Quality Gates for Parallel Execution

**Before Spawning Agents:**
- [ ] All dependencies mapped in Linear (blockedBy set correctly)
- [ ] Phase boundaries clear (no circular dependencies)
- [ ] Each issue has actionable task list

**During Execution:**
- [ ] Monitor Linear status for phase completion
- [ ] Document agent results to Linear issue comments
- [ ] Fail-forward: Capture context for re-queue

**After Phase:**
- [ ] All issues in phase have state="done"
- [ ] Git commits pushed for completed work
- [ ] Next phase dependencies satisfied

### Agent Spawn Pattern

**For each agent, provide this directive:**
```
You are Agent X working on [Workstream Name].

Your tasks:
[1] Task 1 (concise)
[2] Task 2 (concise)
...

Context:
- Workstream: [name]
- Directory: [path]
- Dependencies: [what must exist]
- Deliverables: [files to create]

Quality gate:
[Verification criteria from Linear issue]

Start immediately. Be concise. Ship working code.
Post completion to Linear issue as comment.
```

### Failure Recovery Strategy

**When Agent Fails:**
1. Capture partial work (what was completed)
2. Get error context + traceback
3. Update Linear issue with failure details
4. Re-queue agent with updated context (not from scratch)

**Pattern:**
```typescript
// Failure recovery
try {
  await spawnAgent("Agent X", { issue, tasks });
} catch (error) {
  await mcp__linear_create_comment(issueId, {
    body: `Agent failed: ${error.message}\nPartial: [...]`
  });
  // Retry with enhanced context
  await spawnAgent(`Retry Agent X`, { issue, tasks, context: { error } });
}
```

### Max Parallelization Rules

**Good Parallelization:**
✅ Tasks within same phase (no dependencies)
✅ Independent layers of architecture
✅ Test runners for different modules
✅ Documentation generation independent of code

**Bad Parallelization:**
❌ Tasks with blockedBy dependencies
❌ Infrastructure before applications (setup → build)
❌ Tests before implementation
❌ Integration before foundational layers

**Rule of Thumb:** If task A modifies files that task B needs, make them sequential. If they touch different directories/files, parallel is safe.

---

## Project-Specific Context

### jinyang Architecture

```
Linear Webhook → Router Engine → Session Manager → Worktree Manager → OpenCode Spawner
                 Multi-tier Provider Routing (Circuit Breaker)
```

### Key Differences from Cyrus

| Feature | Cyrus | jinyang |
|---------|-------|-------------------|
| AI SDK | Claude Agent SDK | OpenCode SDK |
| Providers | Anthropic only | Multi-tier routing |
| Health Checks | ❌ | ✅ |
| Rate Limit Handling | Manual | Auto-fallback |
| Session Tracking | Custom | Minimal |

### Reusing Cyrus Components (Apache 2.0)

- LinearEventTransport - Webhook verification
- RepositoryRouter - Issue routing logic
- GitService - Worktree operations
- Located in: `~/.cyrus/` (source) → `lib/` (this repo)

### Configuration

**Repository Routing:** Reuses `~/.jinyang/config.json`

**Multi-tier Providers:**
```yaml
providers:
  claude-code:        # Priority 1 (your Claude sub)
  opencode-glm47:       # Priority 2 (OpenCode)
  claude-code-api:     # Priority 3 (Claude API key)
```

**Environment Variables:**
```bash
CLAUDE_CODE_ACCESS_TOKEN=sk-ant-xxxxx          # PRIMARY
OPENCODE_API_KEY=sk-xxxx-your-opencode-api-key  # FALLBACK 1
CLAUDE_CODE_API_KEY=sk-ant-yyyy                 # FALLBACK 2
LINEAR_CLIENT_ID=your-linear-client-id
LINEAR_CLIENT_SECRET=your-linear-client-secret
LINEAR_WEBHOOK_SECRET=<from Linear app settings>
```

### Label-Based Execution Behavior

**Hybrid Execution Model (Option C):**

jinyang implements a hybrid label-based execution system that balances automation with safety:

**Label Priority:**
```typescript
function getExecutionMode(labels: string[]): 'auto' | 'manual' {
  if (labels.includes('jinyang:auto')) {
    return 'auto';      // Execute immediately on webhook
  }
  if (labels.includes('jinyang:manual')) {
    return 'manual';    // Queue for manual execution
  }
  // Default: manual (safe)
  return 'manual';
}
```

**Webhook Response Codes:**
- `jinyang:auto` → 202 + executes immediately
- `jinyang:manual` → 202 + "queued for manual execution"
- No label → 202 + "queued for manual execution" (default safe)

**Manual Execution:**
```bash
./scripts/execute-manual.sh ROM-123
```

**Background Poller:**
- Polls every 5 minutes for `jinyang:auto` labeled issues
- Skips if already has active session (prevents duplicates)
- Catches missed webhooks

**Session Deduplication:**
- Checks `~/.jinyang/sessions/{issueId}.json` before execution
- Prevents duplicate sessions for same issue

### File Structure After Initial Phase

```
jinyang/
├── src/
│   ├── index.ts                      # Entry point: HTTP server
│   ├── webhook/
│   │   ├── receiver.ts               # Express webhook handler (with label detection)
│   │   ├── middleware.ts              # HMAC verification
│   │   └── parser.ts                  # Linear webhook parser
│   ├── routing/
│   │   ├── engine.ts                  # Label/project/tag router
│   │   └── config-loader.ts           # Load repos from config
│   ├── session/
│   │   ├── manager.ts                 # Spawn/track OpenCode sessions
│   │   ├── scheduler.ts               # Queue with max concurrency
│   │   └── health-checker.ts          # Detect dead/zombie sessions
│   ├── provider/
│   │   ├── router.ts                  # Multi-tier provider selection
│   │   ├── health-daemon.ts           # Background health checker
│   │   └── circuit-breaker.ts         # Provider failure tracking
│   ├── worktree/
│   │   ├── manager.ts                 # Git worktree ops
│   │   └── symlink-factory.ts         # Asset symlink creator
│   ├── opencode/
│   │   ├── spawner.ts                 # OpenCode SDK wrapper
│   │   ├── client.ts                  # OpenCode client initialization
│   │   └── prompt-builder.ts          # Build prompts for OpenCode
│   └── linear/
│       ├── client.ts                  # GraphQL API wrapper (+ listIssues)
│       ├── updater.ts                 # Post completion status updates
│       └── poller.ts                  # Background poller for missed issues
├── lib/                               # Copied from Cyrus (Apache 2.0)
│   ├── LinearEventTransport.js
│   ├── RepositoryRouter.js
│   └── GitService.js
├── config/
│   ├── default.json                   # Repository routing config
│   ├── providers.yaml                 # Multi-tier provider config
│   └── routing.yaml                   # Routing strategy config
├── templates/
│   └── issue-execution.md             # Issue template
├── scripts/
│   ├── setup.sh                       # First-time setup
│   ├── backlog-processor.sh          # Queue runner (15-min interval)
│   ├── migrate-config.sh             # Import ~/.jinyang/config.json
│   ├── health-daemon.sh              # Multi-tier provider health checks
│   └── execute-manual.sh             # Manual execution trigger
├── types/
│   └── index.ts                       # TypeScript interfaces
├── package.json
├── tsconfig.json
├── CLAUDE.md
├── README.md
└── PLAN.md
```

---

## Standing Orders

### Before Starting Work
- Check Linear issues for existing work
- Verify dependencies via blockedBy
- Group tasks by phase (sequential phases, parallel within phases)

### When Parallelizing Tasks
- Ensure no file conflicts (different directories/modules)
- Verify dependencies satisfied (previous phase complete)
- Use Linear comments to track progress

### When Completing Work
- Git commit with semantic message
- Update Linear issue status → done
- Post completion summary as comment
- Mark dependent issues as ready for next phase

### On Agent Failure
- Capture partial work
- Document failure in Linear comment
- Re-queue with enhanced context (don't restart from zero)

---

*I evolve as I learn. When I change this file, I tell you.*

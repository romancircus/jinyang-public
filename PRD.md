# Product Requirements Document (PRD)
# jinyang: OpenCode-Native Linear Agent

**Version**: 2.0
**Date**: 2026-02-05
**Status**: Implementation Phase
**Author**: jinyang Architecture Team

---

## Executive Summary

jinyang is a **rebuilt Cyrus architecture** using the OpenCode SDK instead of Claude Agent SDK. It provides autonomous Linear issue execution with multi-tier AI provider support (OpenCode, Kimi K2.5/2.6, extensible to others).

### Why Rebuild?

| Problem with Cyrus | jinyang Solution |
|-------------------|------------------|
| Single provider (Claude only) | Multi-tier: OpenCode → Kimi → custom |
| Closed source (Claude SDK) | Open source SDK + extensible providers |
| No execution verification | Comprehensive result parsing + verification |
| Hard to extend | Plugin-based executor architecture |

---

## Product Vision

**Goal**: Build an open-source, extensible Linear agent that can execute development tasks autonomously using multiple AI providers, with fallback routing and comprehensive verification.

**Success Criteria**:
- ✅ Execute simple tasks (file creation) with 100% reliability
- ✅ Execute multi-step tasks (feature implementation) with 80%+ reliability
- ✅ Support 3+ AI providers with seamless failover
- ✅ Verify git commits and file operations automatically
- ✅ Process 10+ issues in parallel without conflicts

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Linear Webhook Receiver                         │
│                    (Express server, HMAC verified)                  │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Routing Engine                                    │
│  • Label detection (jinyang:auto/manual)                           │
│  • Repository routing (repo:X, project mapping)                    │
│  • Provider selection (priority + health)                          │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Worktree Manager                                │
│  • Create isolated git worktree per issue                          │
│  • Branch naming: linear/{issueId}                                 │
│  • Baseline commit capture                                          │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Agent Execution Engine                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐       │
│  │ OpenCode     │  │ Kimi K2.5/6  │  │ Custom Provider      │       │
│  │ Executor     │  │ Executor     │  │ (Extensible)         │       │
│  │              │  │              │  │                      │       │
│  │ Uses SDK     │  │ Uses CLI     │  │ Uses SDK/CLI         │       │
│  │ + REST API   │  │ + parse output│  │ + events             │       │
│  └──────────────┘  └──────────────┘  └──────────────────────┘       │
│                                                                     │
│  Execution Flow:                                                    │
│  1. Create session in worktree                                     │
│  2. Subscribe to events (SSE)                                        │
│  3. Send prompt with task checklist                                 │
│  4. Collect execution events                                       │
│  5. Parse results (git commits, files)                             │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Result Orchestrator                             │
│  • parseAgentMessages() → extract git commits, file ops           │
│  • verifyGitCommit() → verify NEW commit exists                   │
│  • verifyFilesCreated() → confirm deliverables                     │
│  • handleFailure() → preserve worktree, retry logic               │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Linear Updater                                  │
│  • postCompletionComment() → commit SHA, files list               │
│  • updateIssueStatus() → Done, In Progress, etc.                  │
│  • queueFailedUpdates() → retry mechanism                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Specifications

### 1. Agent Executor Interface

**Purpose**: Abstract execution for all AI providers

**Interface**:
```typescript
interface AgentExecutor {
  readonly providerType: AgentProvider;
  readonly supportedModels: string[];

  execute(config: AgentExecutionConfig): Promise<AgentExecutionResult>;
  healthCheck(): Promise<boolean>;
  getMetadata(): ProviderMetadata;
}
```

**Implementations**:
- `OpenCodeExecutor` - Uses `@opencode-ai/sdk` REST API
- `KimiExecutor` - Uses OpenCode CLI with Kimi model flag
- `CustomExecutor` - Template for new providers

**Key Behaviors**:
1. Create session in specified directory
2. Subscribe to execution events BEFORE sending prompt
3. Send prompt with structured task checklist
4. Collect all execution events until completion/failure
5. Parse results for git commits, file operations, errors
6. Return structured `AgentExecutionResult`

---

### 2. OpenCode Executor

**Tech Stack**:
- `@opencode-ai/sdk` v1.1.51+
- SSE event subscription
- REST API communication

**Execution Model**:
```typescript
// Critical: Subscribe to events FIRST
const eventStream = await client.event.subscribe();

// Then send prompt
await client.session.prompt({ path: { id }, body: { parts } });

// Collect until completion
for await (const event of eventStream) {
  if (event.type === 'session_completed') break;
}
```

**Result Parsing**:
- Parse `tool_calls` for git_commit, write_file, edit_file
- Extract commit SHAs from git_commit arguments
- Extract file paths from write_file/edit_file
- Capture errors from session_failed events

---

### 3. Kimi K2.5/2.6 Executor

**Tech Stack**:
- OpenCode CLI (`opencode` binary)
- `--model=kimi-k2.5` or `--model=kimi-k2.6`
- Stdio parsing for results

**Execution Model**:
```typescript
const proc = spawn('opencode', [
  '--directory', worktreePath,
  '--model', 'kimi-k2.5',
  '--agent', 'build'
], { stdio: 'pipe' });

// Parse stdout for results
proc.stdout.on('data', (data) => {
  parseForGitCommits(data.toString());
  parseForFileOperations(data.toString());
});
```

**Result Parsing**:
- Regex patterns for git commit SHAs
- File operation markers (Created:, Modified:, Deleted:)
- Error detection from stderr

---

### 4. Worktree Manager

**Responsibilities**:
- Create git worktree: `git worktree add {path} {branch}`
- Set branch: `git checkout -b linear/{issueId}`
- Capture baseline commit: `git rev-parse HEAD`
- Cleanup: `git worktree remove {path}`
- Preserve on failure: Skip cleanup if task failed

**Error Handling**:
- Worktree already exists → Use existing
- Branch already exists → Use existing + reset
- No commits in repo → Handle empty repo case

---

### 5. Result Orchestrator

**Verification Pipeline**:

```
Agent Execution Result
        ↓
┌─────────────────────────┐
│ 1. Parse Messages       │
│    • Extract tool_calls │
│    • Find git_commit    │
│    • Find file ops      │
└──────────┬──────────────┘
           ↓
┌─────────────────────────┐
│ 2. Verify Git Commit   │
│    • SHA exists?       │
│    • Different from     │
│      baseline?          │
│    • Valid format?      │
└──────────┬──────────────┘
           ↓
┌─────────────────────────┐
│ 3. Verify Files         │
│    • Files exist?       │
│    • Content changed?   │
│    • Count matches?     │
└──────────┬──────────────┘
           ↓
┌─────────────────────────┐
│ 4. Mark Completion      │
│    SUCCESS → Cleanup    │
│    FAILURE → Preserve   │
└─────────────────────────┘
```

**Strict Verification**:
- Git commit MUST be new (different from baseline)
- Files MUST exist in worktree
- Task marked FAILED if any verification fails

---

### 6. Provider Router

**Multi-Tier Routing**:

```
User Request
     ↓
Priority 1: OpenCode (healthy?)
     ↓ YES
   Use OpenCode
     ↓ NO
Priority 2: Kimi K2.5 (healthy?)
     ↓ YES
   Use Kimi
     ↓ NO
Priority 3: Fallback Provider
     ↓
   Queue for manual
```

**Health Checking**:
- Background daemon polls every 30 seconds
- Circuit breaker tracks success/failure rates
- Provider marked unhealthy after 3 consecutive failures
- Auto-recovery after cooldown period

---

### 7. Linear Integration

**Webhook Handling**:
- `AgentSessionEvent` → Start execution
- `Issue` update → Check for delegation change
- Label detection: `jinyang:auto` vs `jinyang:manual`

**Status Updates**:
- `In Progress` → Execution started
- `Done` → Execution succeeded
- `Blocked` → Execution failed (preserve worktree)

**Comments**:
- Success: "Task completed. Commit: {sha}. Files: {count}"
- Failure: "Task failed: {error}. Worktree preserved at: {path}"

---

## Technical Requirements

### Dependencies

```json
{
  "dependencies": {
    "@opencode-ai/sdk": "^1.1.51",
    "@linear/sdk": "^73.0.0",
    "express": "^5.2.1",
    "dotenv": "^17.2.3",
    "typescript": "^5.9.3"
  },
  "devDependencies": {
    "vitest": "^3.0.0",
    "@types/node": "^25.2.0"
  }
}
```

### Environment Variables

```bash
# OpenCode
OPENCODE_API_KEY=sk-xxxx-your-opencode-api-key
OPENCODE_SERVER_PORT=4096

# Linear
LINEAR_CLIENT_ID=your-linear-client-id
LINEAR_CLIENT_SECRET=your-linear-client-secret
LINEAR_WEBHOOK_SECRET=lin_wh_...
LINEAR_API_TOKEN=lin_api_...

# Provider Config
PROVIDER_PRIORITY=opencode,kimi
KIMI_API_KEY=sk-...

# Server
JINYANG_PORT=3456
JINYANG_WEBHOOK_PATH=/webhooks/linear
```

### System Requirements

- **Node.js**: 22.x+
- **RAM**: 4GB minimum, 8GB recommended (for parallel execution)
- **Disk**: 10GB for worktrees and logs
- **Network**: Outbound HTTPS for Linear API, OpenCode services

---

## Testing Strategy

### Test Pyramid

```
        /\
       /  \
      / E2E \      ← Full workflow tests (5 tests)
     /─────────\
    / Integration \ ← Component integration (15 tests)
   /───────────────\
  /    Unit Tests    \ ← Individual components (50+ tests)
 /─────────────────────\
```

### Test Coverage Requirements

| Component | Unit | Integration | E2E |
|-----------|------|-------------|-----|
| OpenCode Executor | 10 | 3 | 2 |
| Kimi Executor | 8 | 3 | 2 |
| Worktree Manager | 6 | 2 | 1 |
| Result Orchestrator | 8 | 2 | 1 |
| Provider Router | 6 | 3 | 1 |
| Linear Integration | 5 | 2 | 1 |

**Total**: 50+ tests across all levels

### Critical Test Cases

**1. Simple File Creation**
- Input: "Create test.txt with 'hello'"
- Expected: File exists, git commit, SHA returned

**2. Multi-Step Task**
- Input: "Create package.json, index.js, run npm install"
- Expected: All files created, commit with all changes

**3. Provider Failover**
- Input: Task with OpenCode unhealthy
- Expected: Automatic fallback to Kimi, task completes

**4. Git Verification**
- Input: "Create file but don't commit"
- Expected: Task marked FAILED, worktree preserved

**5. Parallel Execution**
- Input: 5 simultaneous issues
- Expected: All complete successfully, no conflicts

---

## Implementation Phases

### Phase 1: Foundation (Days 1-2)
**Goal**: Working OpenCode execution

**Deliverables**:
- ✅ Executor interface defined
- ✅ OpenCodeExecutor implemented
- ✅ Basic worktree management
- ✅ Simple verification pipeline
- ✅ 5 passing unit tests

**Tasks**:
1. ROM-400: Implement AgentExecutor interface
2. ROM-401: Build OpenCodeExecutor with event subscription
3. ROM-402: Create WorktreeManager
4. ROM-403: Build basic ResultOrchestrator
5. ROM-404: Write unit tests for executors

---

### Phase 2: Multi-Provider (Days 3-4)
**Goal**: Kimi support + provider routing

**Deliverables**:
- ✅ KimiExecutor implemented
- ✅ ExecutorFactory with routing
- ✅ Provider health checking
- ✅ Circuit breaker pattern
- ✅ 10 passing integration tests

**Tasks**:
1. ROM-405: Implement KimiExecutor
2. ROM-406: Build ExecutorFactory
3. ROM-407: Create ProviderRouter with health checks
4. ROM-408: Implement CircuitBreaker
5. ROM-409: Write integration tests for providers

---

### Phase 3: Full System (Days 5-6)
**Goal**: Complete orchestration + Linear integration

**Deliverables**:
- ✅ Webhook receiver
- ✅ Routing engine
- ✅ Orchestrator with verification
- ✅ Linear updater
- ✅ 5 passing E2E tests

**Tasks**:
1. ROM-410: Build Webhook Receiver
2. ROM-411: Create Routing Engine
3. ROM-412: Implement full Orchestrator
4. ROM-413: Build LinearUpdater
5. ROM-414: Write E2E tests

---

### Phase 4: Hardening (Days 7-8)
**Goal**: Reliability, error handling, documentation

**Deliverables**:
- ✅ Comprehensive error handling
- ✅ Retry mechanisms
- ✅ Full documentation suite
- ✅ 50+ tests passing
- ✅ Production readiness

**Tasks**:
1. ROM-415: Add comprehensive error handling
2. ROM-416: Implement retry mechanisms
3. ROM-417: Write ARCHITECTURE.md
4. ROM-418: Write DEBUGGING.md
5. ROM-419: Write TESTING.md
6. ROM-420: Production readiness checklist

---

## Success Metrics

### Performance
- **Task Execution**: < 5 minutes for simple tasks
- **Provider Failover**: < 10 seconds
- **Parallel Execution**: 10+ issues simultaneously
- **Startup Time**: < 30 seconds (including OpenCode server)

### Reliability
- **Simple Tasks**: 100% success rate (file creation)
- **Complex Tasks**: 80%+ success rate (multi-file features)
- **Provider Health**: 99%+ uptime detection accuracy
- **Git Verification**: 100% accuracy (no false positives)

### Extensibility
- **New Provider**: < 2 hours to implement
- **New Test**: < 30 minutes to write
- **Documentation**: 100% of public APIs documented

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenCode SDK doesn't auto-execute | High | Use CLI mode, investigate TPI |
| Kimi API changes | Medium | Abstract behind interface, version pinning |
| Linear rate limiting | Medium | Exponential backoff, queue management |
| Git worktree conflicts | Medium | Isolated directories, retry logic |
| Provider health false positives | Low | Multiple health checks, cooldown periods |

---

## Open Questions

1. **Does OpenCode auto-execute prompts?**
   - Need test script to verify execution model
   - If not, implement CLI-based execution

2. **How to extract Kimi execution results?**
   - Investigate OpenCode CLI output format
   - May need custom parsing for each provider

3. **What Linear events trigger execution?**
   - Currently: AgentSessionEvent + label detection
   - May need polling backup for missed events

---

## Appendix A: File Structure

```
jinyang/
├── src/
│   ├── executor/
│   │   ├── interface.ts           # AgentExecutor abstract class
│   │   ├── types.ts             # Execution types
│   │   ├── opencode-executor.ts # OpenCode implementation
│   │   ├── kimi-executor.ts     # Kimi implementation
│   │   └── factory.ts           # ExecutorFactory
│   ├── orchestrator/
│   │   ├── index.ts             # Main orchestrator
│   │   ├── result-parser.ts     # Parse agent messages
│   │   └── verifier.ts          # Git + file verification
│   ├── worktree/
│   │   ├── manager.ts           # Git worktree operations
│   │   └── cleanup.ts           # Cleanup strategies
│   ├── routing/
│   │   ├── engine.ts            # Repository routing
│   │   └── config-loader.ts     # Load repo configs
│   ├── provider/
│   │   ├── router.ts            # Provider selection
│   │   ├── circuit-breaker.ts   # Health-based failover
│   │   └── health-daemon.ts     # Background health checks
│   ├── webhook/
│   │   ├── receiver.ts          # Express webhook handler
│   │   ├── middleware.ts        # HMAC verification
│   │   └── parser.ts            # Linear payload parsing
│   ├── linear/
│   │   ├── client.ts            # Linear API client
│   │   └── updater.ts           # Status/comments updater
│   ├── session/
│   │   ├── manager.ts           # Session lifecycle
│   │   └── types.ts             # Session types
│   └── index.ts                 # Entry point
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEBUGGING.md
│   ├── TESTING.md
│   └── API_REFERENCE.md
└── scripts/
    ├── setup.sh
    └── health-check.sh
```

---

## Appendix B: API Reference (Preview)

### AgentExecutor

```typescript
abstract class AgentExecutor {
  abstract readonly providerType: AgentProvider;
  abstract readonly supportedModels: string[];

  abstract execute(config: AgentExecutionConfig): Promise<AgentExecutionResult>;
  abstract healthCheck(): Promise<boolean>;
  abstract getMetadata(): ProviderMetadata;
}
```

### Orchestrator

```typescript
class Orchestrator {
  async execute(issue: LinearIssue): Promise<ExecutionResult>;
  async initialize(): Promise<void>;
}
```

### WorktreeManager

```typescript
class WorktreeManager {
  createWorktree(options: WorktreeOptions): WorktreeResult;
  cleanupWorktree(path: string): void;
  preserveWorktree(path: string): void;
}
```

---

## Next Steps

1. **Run test script** to verify OpenCode execution model
2. **Create Linear issues** for all implementation tasks
3. **Spawn parallel agents** to build components simultaneously
4. **Integrate and test** as components complete
5. **Document and deploy** to production

---

**End of PRD**

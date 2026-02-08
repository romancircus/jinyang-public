# jinyang E2E Test Plan

**Created:** 2026-02-08
**Status:** COMPLETE
**Linear Task:** ROM-525 (tracking under Infrastructure)

---

## Objective

Validate that jinyang can autonomously: receive a Linear issue -> spawn an OpenCode session -> build software -> git commit -> git push -> update Linear status.

---

## Phase 1: Fix Critical Blockers

| # | Issue | File | Status |
|---|-------|------|--------|
| 1.1 | No `git push` after commit | `src/orchestrator/index.ts` | DONE |
| 1.2 | `enforceCommitBeforeCompletion` missing `git add` | `src/worktree/GitService.ts` | DONE |
| 1.3 | `execute-manual.sh` wrong import paths | `scripts/execute-manual.sh` | DONE |
| 1.4 | OpenCode hardcoded port 4096 (concurrent collision) | `src/executors/opencode.ts` | DONE |
| 1.5 | Worktree manager auto-commit missing `git add` | `src/worktree/manager.ts` | DONE |
| 1.6 | `npm install` + rebuild + restart service | repo root | DONE |

## Phase 2: Fix SSE & Integration Bugs (discovered during testing)

| # | Issue | File | Status |
|---|-------|------|--------|
| 2.1 | SSE event sessionID at wrong location | `src/executors/opencode.ts` | DONE |
| 2.2 | session.idle detection had wrong nested check | `src/executors/opencode.ts` | DONE |
| 2.3 | Wrong failure event types (session.aborted vs session.error) | `src/executors/opencode.ts` | DONE |
| 2.4 | SSE stream misses idle event (added polling backup) | `src/executors/opencode.ts` | DONE |
| 2.5 | Session dedup race (14 duplicate executions) | `src/webhook/receiver.ts` | DONE |
| 2.6 | State-change webhook filter (own updates re-trigger) | `src/webhook/receiver.ts` | DONE |
| 2.7 | Label format mismatch (flat array vs nodes) | `src/webhook/parser.ts` | DONE |
| 2.8 | Push to wrong branch (branch name vs HEAD:master) | `src/worktree/GitService.ts` | DONE |
| 2.9 | Push rejected (worktree behind remote) | `src/worktree/GitService.ts` + `src/orchestrator/index.ts` | DONE |
| 2.10 | OpenCode session directory wrong (agent commits in main repo) | `src/executors/opencode.ts` | DONE |
| 2.11 | Prompt missing explicit working directory instruction | `src/orchestrator/index.ts` | DONE |

## Phase 3: E2E Test Execution

| # | Check | Status |
|---|-------|--------|
| 3.1 | Watch logs for auto-execution trigger | PASS |
| 3.2 | Verify OpenCode session spawned | PASS |
| 3.3 | Monitor worktree creation | PASS |
| 3.4 | Verify git commit in worktree | PASS |
| 3.5 | Verify git push to remote | PASS |
| 3.6 | Verify Linear status updated | SKIP (test webhook uses fake issue ID) |

## Phase 4: Validate Results

| # | Validation | Status |
|---|-----------|--------|
| 4.1 | Check `git log` on remote for commit | PASS (dccb902) |
| 4.2 | Verify commit message contains ROM-XXX | PASS ([ROM-582]) |
| 4.3 | Verify Linear issue marked Done | SKIP (fake issue ID) |
| 4.4 | Verify worktree cleaned up | PASS |

---

## Issues Found During Audit

### Critical (blocking E2E) - ALL FIXED
1. **No git push** - `GitService.push()` exists but never called from orchestrator
2. **SSE event format wrong** - sessionID at `event.properties.sessionID`, not `event.sessionID`
3. **session.idle detection broken** - checked nested `status.type === 'idle'` but idle events have no status
4. **Session directory not set** - `session.create()` called without `query.directory`, agent works in wrong dir
5. **Push to wrong branch** - `git push origin branchName` creates remote branch instead of updating master
6. **Worktree behind remote** - No sync before execution, push rejected
7. **14 duplicate executions** - No session dedup, each webhook fires new execution
8. **Label format mismatch** - Real webhooks send flat arrays, code expects `{ nodes: [] }`
9. **execute-manual.sh** imports from `./dist/` but compiled output is at `./dist/src/`
10. **No git add before auto-commit** - `enforceCommitBeforeCompletion` runs `git commit` without staging
11. **Port 4096 hardcoded** - Concurrent executions would collide

### Moderate (non-blocking)
- Config has `~/.cyrus/worktrees/` paths (symlink works but should migrate)
- jinyang self-routing has `baseBranch: "main"` but actual branch is `master`
- 5-minute execution timeout may be too short
- ClaudeCodeAPIExecutor is a stub
- No test files despite vitest in devDeps
- Port mismatch: .env=3456 vs systemd=3001

---

## Progress Log

### 2026-02-08 01:00 - Session Start
- Completed full repo audit
- Identified 6 critical blockers
- Starting Phase 1 fixes

### 2026-02-08 01:20 - Phase 1 Code Fixes Complete
- Added `GitService.stageAll()` method and `stageAll` option to `GitCommitOptions`
- Added `git push` to orchestrator after commit verification (both primary and fallback paths)
- Fixed `enforceCommitBeforeCompletion` to stage all files before auto-commit
- Fixed worktree manager auto-commit to stage all files
- Fixed `execute-manual.sh` import paths (dist/ -> dist/src/)
- Made OpenCode port dynamic (round-robin 4096-4595) to support concurrency

### 2026-02-08 01:30 - First E2E Test: SSE Hang
- Agent executed and committed, but SSE event collection hung forever
- Root cause: `event.sessionID` doesn't exist (it's `event.properties.sessionID`)
- Fixed event filtering + idle detection + added polling backup

### 2026-02-08 01:35 - Second Test: 14 Duplicate Executions
- Session dedup missing, Linear re-triggers webhooks on our own status updates
- Fixed: in-memory Set + file locks + state-change webhook filter
- SSE fix confirmed working: "Successfully pushed"

### 2026-02-08 01:40 - Third Test: Push to Wrong Branch
- `git push origin linear/ROM-582-issue` created remote branch instead of updating master
- Fixed: `pushToRef()` with `git push origin HEAD:master`

### 2026-02-08 01:42 - Fourth Test: Push Rejected (Behind Remote)
- Worktree's branch based on old commits, not fast-forward
- Fixed: `syncToRemote()` does `git fetch + git reset --hard origin/master` before execution

### 2026-02-08 01:45 - Fifth Test: Verification Failed (Wrong Directory)
- Agent commits in main repo instead of worktree
- Root cause: `session.create()` called without `query.directory`
- The SDK accepts `query: { directory: worktreePath }` on session creation
- Fixed: pass worktree path to session.create() + strengthen prompt

### 2026-02-08 01:52 - SIXTH TEST: FULL SUCCESS
- Worktree created + synced to origin/master
- OpenCode session created WITH correct directory
- Agent executed task, created `directory-fix-verified.txt`, committed
- Session idle detected via status polling
- Verification passed
- **Successfully pushed to origin/master** (commit dccb902)
- **"Successfully completed ROM-582"**

### Final Commit
- All 11 fixes committed as `399cbb4` and pushed to origin/master

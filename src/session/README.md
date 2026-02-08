# Session Manager

Tracks OpenCode session lifecycle with PID tracking, cleanup handlers, and git commit enforcement.

## Features

- **State Tracking**: STARTED → IN_PROGRESS → DONE/ERROR
- **PID Tracking**: Associates spawned processes with sessions
- **Worktree Cleanup**: Automatic cleanup on completion/failure
- **Session Storage**: Metadata stored in `~/.jinyang/sessions/`
- **Git Enforcement**: Verifies git commit before session completion

## Usage

```typescript
import { SessionManager, CompletionReason, CleanupAction } from './session';

const manager = new SessionManager();

// Create session
const session = await manager.createSession({
  id: 'session-001',
  linearIssueId: 'ROM-173',
  repository: 'jinyang',
  worktreePath: '/tmp/worktree',
  gitCommitRequired: true,
  cleanupAction: CleanupAction.DELETE_WORKTREE
});

// Track OpenCode process
await manager.trackProcess(session.metadata.id, process.pid, openCodeProcess);

// Complete with git commit
await session.complete(CompletionReason.SUCCESS, 'abc123def456');

// Or fail
await session.fail(new Error('Task failed'));

// Cleanup on error automatically
```

## Session States

| State | Description |
|-------|-------------|
| `STARTED` | Session created, worktree prepared |
| `IN_PROGRESS` | OpenCode agent running |
| `DONE` | Successfully completed with git commit |
| `ERROR` | Failed, cleanup performed |

## Storage

All sessions stored as JSON in `~/.jinyang/sessions/<id>.json`

Example metadata:
```json
{
  "id": "session-001",
  "linearIssueId": "ROM-173",
  "repository": "jinyang",
  "worktreePath": "/tmp/worktree",
  "state": "done",
  "pid": 12345,
  "createdAt": "2026-02-04T09:23:00.000Z",
  "updatedAt": "2026-02-04T10:15:00.000Z",
  "completedAt": "2026-02-04T10:15:00.000Z",
  "completionReason": "success",
  "commitSha": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0"
}
```

## Git Commit Enforcement

The `complete()` method automatically verifies a git commit exists before marking session as done:

```typescript
// Validates commit SHA if provided
await session.complete(CompletionReason.SUCCESS, 'abc123...');

// Or auto-detects from worktree
await session.complete(CompletionReason.SUCCESS);
```

Verification runs `git rev-parse HEAD` in the worktree directory.
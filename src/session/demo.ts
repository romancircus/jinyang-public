import { SessionManager, SessionState, CompletionReason, CleanupAction } from './index.js';

export async function demoUsage(): Promise<void> {
  const manager = new SessionManager();

  console.log('=== Session Manager Demo ===\n');

  const sessionConfig = {
    id: 'demo-session-001',
    linearIssueId: 'ROM-173',
    repository: 'jinyang',
    worktreePath: '/tmp/demo-worktree',
    gitCommitRequired: true,
    cleanupAction: CleanupAction.DELETE_WORKTREE
  };

  console.log('Creating session...');
  const session = await manager.createSession(sessionConfig);
  console.log('✓ Session created:', session.metadata.id);
  console.log('  - State:', session.metadata.state);
  console.log('  - Linear Issue:', session.metadata.linearIssueId);
  console.log('  - Worktree:', session.metadata.worktreePath);
  console.log();

  console.log('Simulating process tracking...');
  const processMock = { kill: () => console.log('  ✓ Process terminated') } as any;
  await manager.trackProcess(sessionConfig.id, 12345, processMock);
  console.log('✓ Process tracked, PID:', session.metadata.pid);
  console.log('  - State:', session.metadata.state);
  console.log();

  console.log('Simulating completion with git commit...');
  const commitSha = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0';
  await session.complete(CompletionReason.SUCCESS, commitSha);
  console.log('✓ Session completed:');
  console.log('  - State:', session.metadata.state);
  console.log('  - Completion Reason:', session.metadata.completionReason);
  console.log('  - Commit SHA:', session.metadata.commitSha);
  console.log();

  console.log('Checking all sessions...');
  const allSessions = manager.getAllSessions();
  console.log(`✓ Total sessions: ${allSessions.length}`);
  console.log();

  console.log('Demo complete!\n');
}
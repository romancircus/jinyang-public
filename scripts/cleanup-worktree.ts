#!/usr/bin/env node
import { promises as fs } from 'fs';
import { join } from 'path';

const SESSIONS_DIR = `${process.env.HOME}/.jinyang/sessions`;

interface SessionMetadata {
  id: string;
  linearIssueId: string;
  repository: string;
  worktreePath: string;
  state: string;
  pid?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  completionReason?: string;
  commitSha?: string | null;
  errorMessage?: string;
}

async function listStuckWorktrees(): Promise<SessionMetadata[]> {
  const stuck: SessionMetadata[] = [];

  try {
    const files = await fs.readdir(SESSIONS_DIR);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const content = await fs.readFile(join(SESSIONS_DIR, file), 'utf8');
        const session: SessionMetadata = JSON.parse(content);

        // Check if worktree still exists
        const worktreeExists = await fs.access(session.worktreePath)
          .then(() => true)
          .catch(() => false);

        // Consider "stuck" if:
        // 1. Session is DONE but worktree still exists (kept for inspection)
        // 2. Session is in ERROR state
        // 3. Session has no verified commit
        if (worktreeExists) {
          if (session.state === 'done' && session.commitSha === null) {
            stuck.push(session);
          } else if (session.state === 'error') {
            stuck.push(session);
          } else if (session.state === 'done') {
            // Normal completion - could be cleaned up manually
            stuck.push(session);
          }
        }
      } catch (e) {
        console.error(`Failed to parse ${file}:`, e);
      }
    }
  } catch (error) {
    console.error('Failed to read sessions directory:', error);
  }

  return stuck;
}

async function cleanupWorktree(worktreePath: string): Promise<void> {
  try {
    await fs.rm(worktreePath, { recursive: true, force: true });
    console.log(`  ✓ Deleted: ${worktreePath}`);
  } catch (error) {
    console.error(`  ✗ Failed to delete ${worktreePath}:`, error);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'list') {
    const stuck = await listStuckWorktrees();

    if (stuck.length === 0) {
      console.log('No stuck worktrees found.');
      return;
    }

    console.log(`\nFound ${stuck.length} stuck worktree(s):\n`);

    for (const session of stuck) {
      const status = session.state === 'error' ? 'ERROR' :
                     session.commitSha === null ? 'NO_COMMIT' : 'PENDING_CLEANUP';

      console.log(`Session: ${session.id}`);
      console.log(`  Issue: ${session.linearIssueId}`);
      console.log(`  State: ${session.state} (${status})`);
      console.log(`  Path: ${session.worktreePath}`);
      console.log(`  Created: ${session.createdAt}`);
      if (session.errorMessage) {
        console.log(`  Error: ${session.errorMessage}`);
      }
      console.log('');
    }

    console.log('Run: npx tsx scripts/cleanup-worktree.ts cleanup <session-id>');
    console.log('Or: npx tsx scripts/cleanup-worktree.ts cleanup-all\n');

  } else if (command === 'cleanup') {
    const sessionId = args[1];
    if (!sessionId) {
      console.error('Usage: npx tsx scripts/cleanup-worktree.ts cleanup <session-id>');
      process.exit(1);
    }

    const stuck = await listStuckWorktrees();
    const session = stuck.find(s => s.id === sessionId);

    if (!session) {
      console.error(`Session ${sessionId} not found or not stuck.`);
      process.exit(1);
    }

    console.log(`Cleaning up session ${sessionId}...`);
    await cleanupWorktree(session.worktreePath);

  } else if (command === 'cleanup-all') {
    const stuck = await listStuckWorktrees();

    if (stuck.length === 0) {
      console.log('No stuck worktrees found.');
      return;
    }

    console.log(`Cleaning up ${stuck.length} stuck worktree(s)...\n`);

    for (const session of stuck) {
      console.log(`Session: ${session.id} (${session.linearIssueId})`);
      await cleanupWorktree(session.worktreePath);
    }

    console.log('\nCleanup complete.');

  } else {
    console.log('Worktree Cleanup Tool\n');
    console.log('Commands:');
    console.log('  list              - List all stuck worktrees');
    console.log('  cleanup <id>      - Clean up specific worktree');
    console.log('  cleanup-all       - Clean up all stuck worktrees');
    console.log('');
    process.exit(0);
  }
}

main().catch(console.error);

import { promises as fs } from 'fs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import checkDiskSpace from 'check-disk-space';

export type SessionStatus = 'started' | 'in_progress' | 'done' | 'error';

export interface SessionState {
  issueId: string;
  status: SessionStatus;
  worktreePath: string;
  pid: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

const SESSIONS_DIR = join(homedir(), '.jinyang', 'sessions');
const ARCHIVE_DIR = join(SESSIONS_DIR, 'archive');

/**
 * Check available disk space before writing
 * Returns false if less than 100MB available
 */
async function checkSpace(): Promise<boolean> {
  const { free } = await checkDiskSpace(homedir());
  if (free < 100 * 1024 * 1024) { // 100MB
    console.warn('[Session] Low disk space:', free);
    return false;
  }
  return true;
}

/**
 * Ensure sessions directory exists
 */
export async function ensureSessionsDir(): Promise<void> {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
  await fs.mkdir(ARCHIVE_DIR, { recursive: true });
}

/**
 * Save session state to disk
 */
export async function saveSession(state: SessionState): Promise<void> {
  const hasSpace = await checkSpace();
  if (!hasSpace) {
    throw new Error(`[Session] Cannot save session ${state.issueId}: Insufficient disk space (less than 100MB available)`);
  }
  await ensureSessionsDir();
  const sessionPath = join(SESSIONS_DIR, `${state.issueId}.json`);
  await fs.writeFile(sessionPath, JSON.stringify(state, null, 2), 'utf8');
}

/**
 * Load session state from disk
 */
export async function loadSession(issueId: string): Promise<SessionState | null> {
  try {
    const sessionPath = join(SESSIONS_DIR, `${issueId}.json`);
    const data = await fs.readFile(sessionPath, 'utf8');
    return JSON.parse(data) as SessionState;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Type guard for Node.js errors with code property
 */
function isNodeError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && 'code' in error && typeof (error as { code: unknown }).code === 'string';
}

/**
 * Check if an active session exists for an issue
 * Returns true if session exists and status is 'started' or 'in_progress'
 */
export function hasActiveSession(issueId: string): boolean {
  try {
    const sessionPath = join(SESSIONS_DIR, `${issueId}.json`);
    const data = readFileSync(sessionPath, 'utf8');
    const session = JSON.parse(data) as SessionState;
    return session.status === 'started' || session.status === 'in_progress';
  } catch {
    return false;
  }
}

/**
 * Archive a completed session
 */
export async function archiveSession(issueId: string): Promise<void> {
  const hasSpace = await checkSpace();
  if (!hasSpace) {
    throw new Error(`[Session] Cannot archive session ${issueId}: Insufficient disk space (less than 100MB available)`);
  }
  const sessionPath = join(SESSIONS_DIR, `${issueId}.json`);
  const archivePath = join(ARCHIVE_DIR, `${issueId}_${Date.now()}.json`);

  try {
    await fs.copyFile(sessionPath, archivePath);
    await fs.unlink(sessionPath);
  } catch (error) {
    if (!isNodeError(error) || error.code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Delete a session file
 */
export async function deleteSession(issueId: string): Promise<void> {
  const sessionPath = join(SESSIONS_DIR, `${issueId}.json`);
  try {
    await fs.unlink(sessionPath);
  } catch (error) {
    if (!isNodeError(error) || error.code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Clean up old archived sessions (older than 7 days)
 */
export async function cleanupOldSessions(): Promise<void> {
  try {
    const files = await fs.readdir(ARCHIVE_DIR);
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = join(ARCHIVE_DIR, file);
        const stats = await fs.stat(filePath);

        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
        }
      }
    }
  } catch {
    // Archive dir might not exist yet
  }
}

/**
 * Get all active sessions
 */
export async function getActiveSessions(): Promise<SessionState[]> {
  try {
    const files = await fs.readdir(SESSIONS_DIR);
    const activeSessions: SessionState[] = [];

    for (const file of files) {
      if (file.endsWith('.json') && file !== 'archive') {
        const issueId = file.replace('.json', '');
        const session = await loadSession(issueId);
        if (session && (session.status === 'started' || session.status === 'in_progress')) {
          activeSessions.push(session);
        }
      }
    }

    return activeSessions;
  } catch {
    return [];
  }
}

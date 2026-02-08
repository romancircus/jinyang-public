import { existsSync, readlinkSync, mkdirSync, symlinkSync, lstatSync } from 'fs';
import { resolve, dirname } from 'path';
import { unlink } from 'fs/promises';

export interface SymlinkConfig {
  worktreeDir: string;
  symlinkName: string;
  targetPath: string;
}

export interface SymlinkResult {
  symlinkPath: string;
  success: boolean;
  error?: string;
}

export class SymlinkFactory {
  createSymlink(config: SymlinkConfig): SymlinkResult {
    const { worktreeDir, symlinkName, targetPath } = config;

    try {
      if (!existsSync(targetPath)) {
        return {
          symlinkPath: resolve(worktreeDir, symlinkName),
          success: false,
          error: `Target path does not exist: ${targetPath}`
        };
      }

      const symlinkPath = resolve(worktreeDir, symlinkName);

      if (existsSync(symlinkPath)) {
        try {
          const stat = lstatSync(symlinkPath);
          if (stat.isSymbolicLink()) {
            const existingTarget = readlinkSync(symlinkPath);
            if (existingTarget === targetPath) {
              console.log(`[SymlinkFactory] Symlink already exists: ${symlinkName}`);
              return {
                symlinkPath,
                success: true
              };
            }
          }
        } catch {
          // Not a symlink, continue
        }
      }

      const symlinkDir = dirname(symlinkPath);
      if (!existsSync(symlinkDir)) {
        mkdirSync(symlinkDir, { recursive: true });
      }

      // Create actual symbolic link
      symlinkSync(targetPath, symlinkPath);

      console.log(`[SymlinkFactory] Created symlink: ${symlinkName} -> ${targetPath}`);

      return {
        symlinkPath,
        success: true
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[SymlinkFactory] Failed to create symlink:`, errorMsg);

      return {
        symlinkPath: resolve(worktreeDir, symlinkName),
        success: false,
        error: errorMsg
      };
    }
  }

  async removeSymlink(symlinkPath: string): Promise<boolean> {
    try {
      await unlink(symlinkPath);
      console.log(`[SymlinkFactory] Removed symlink: ${symlinkPath}`);
      return true;
    } catch (error) {
      console.error(`[SymlinkFactory] Failed to remove symlink:`, error);
      return false;
    }
  }

  createAssetSymlinks(worktreeDir: string, assetPaths: string[]): SymlinkResult[] {
    const results: SymlinkResult[] = [];

    for (const assetPath of assetPaths) {
      const name = assetPath.split('/').pop() || 'assets';
      const result = this.createSymlink({
        worktreeDir,
        symlinkName: name,
        targetPath: assetPath
      });

      results.push(result);
    }

    return results;
  }

  createReferenceSymlinks(worktreeDir: string, referencePaths: string[]): SymlinkResult[] {
    const results: SymlinkResult[] = [];

    for (const referencePath of referencePaths) {
      const name = referencePath.split('/').pop() || 'references';
      const result = this.createSymlink({
        worktreeDir,
        symlinkName: name,
        targetPath: referencePath
      });

      results.push(result);
    }

    return results;
  }
}
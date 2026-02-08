import { Repository, ModelOverride } from '../types/index.js';

export interface OpenCodePromptContext {
  repository: Repository;
  issueId: string;
  issueTitle: string;
  issueDescription: string;
  labels?: string[];
  projectName?: string;
  assignee?: string;
  modelOverride?: ModelOverride;
  worktreePath?: string;
}

export class PromptBuilder {
  buildIssueExecutionPrompt(context: OpenCodePromptContext): string {
    const { repository, issueId, issueTitle, issueDescription, labels, projectName, assignee, worktreePath } = context;

    const prompt = `
You are working on Linear issue: ${issueId}

Issue: ${issueTitle}
${assignee ? `Assigned to: ${assignee}` : ''}
${projectName ? `Project: ${projectName}` : ''}
${labels && labels.length > 0 ? `Labels: ${labels.join(', ')}` : ''}

Description:
${issueDescription || 'No description provided'}

Repository Context:
- Name: ${repository.name}
- Base Branch: ${repository.baseBranch}
- Workspace: ${repository.workspaceBaseDir}
- Working Directory: ${worktreePath || 'Unknown (check your current directory)'}

## TASK CHECKLIST (Must Complete All)

□ [ ] Files created/modified at correct paths
□ [ ] All requirements from description implemented
□ [ ] Git add executed: git add [files]
□ [ ] Git commit with message: "feat(${issueId}): [descriptive message]"
□ [ ] Verified commit exists: git log -1 --oneline

## PRE-FLIGHT (Before Starting)

□ [ ] Confirm worktree path: ${worktreePath || 'Check current directory'}
□ [ ] Identify deliverable locations
□ [ ] Verify write access to repository
□ [ ] Note: Working in isolated git worktree - changes must be committed

## POST-FLIGHT (Before Finishing)

□ [ ] Review checklist - ALL items must be checked
□ [ ] Run: git status (must show "nothing to commit, working tree clean")
□ [ ] Run: git log -1 --oneline (must show commit SHA)
□ [ ] If no commit SHA visible, task IS NOT COMPLETE - go back and commit

## CONSEQUENCES

WITHOUT git commit SHA, I cannot mark this task as complete.
The work will be considered FAILED and may need to be redone.

Your output must include:
1. Summary of work done
2. Git commit SHA from "git log -1 --oneline"
3. Confirmation all checklist items complete

Execute this issue now. Be thorough. Ship working code.
`.trim();

    return prompt;
  }

  buildQuickActionPrompt(action: string, context: string): string {
    return `
Execute the following action: ${action}

Context:
${context}

## TASK CHECKLIST (Must Complete All)

□ [ ] Action executed successfully
□ [ ] Any files created/modified
□ [ ] Git add executed: git add [files]
□ [ ] Git commit with descriptive message
□ [ ] Verified commit: git log -1 --oneline

## PRE-FLIGHT (Before Starting)

□ [ ] Understand the action requirements
□ [ ] Confirm current working directory
□ [ ] Note: All changes must be committed

## POST-FLIGHT (Before Finishing)

□ [ ] Review checklist - ALL items checked
□ [ ] Run: git log -1 --oneline (must show commit SHA)
□ [ ] If NO commit SHA shown, go back and commit NOW

## CONSEQUENCES

WITHOUT git commit SHA in your output, this task will be marked as FAILED.
Work without a commit does not count as complete.

Your response MUST include the git commit SHA.

Be concise. Ship working code.
`.trim();
  }
}

export const promptBuilder = new PromptBuilder();

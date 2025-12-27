import type { Tool, ToolContext } from './types';
import { run, isBranchInSyncWithRemote, safeSyncBranchWithRemote, localBranchExists } from '@eldrforge/git-tools';

/**
 * Create tools for agentic publish workflows
 */
export function createPublishTools(): Tool[] {
    return [
        createCheckGitStatusTool(),
        createCheckBranchSyncTool(),
        createAnalyzeDivergenceTool(),
        createGetCommitLogTool(),
        createGetBranchInfoTool(),
        createSyncBranchTool(),
        createGetDiffStatsTool(),
        createCheckConflictsTool(),
        createResetBranchTool(),
    ];
}

/**
 * Check git repository status
 */
function createCheckGitStatusTool(): Tool {
    return {
        name: 'check_git_status',
        description: 'Check the current git repository status, including uncommitted changes, current branch, and repository state',
        parameters: {
            type: 'object',
            properties: {
                showUntracked: {
                    type: 'boolean',
                    description: 'Include untracked files in output (default: false)',
                    default: false,
                },
            },
            required: [],
        },
        execute: async (params: { showUntracked?: boolean }, context?: ToolContext) => {
            const { showUntracked = false } = params;
            const workingDir = context?.workingDirectory || process.cwd();

            try {
                // Get current branch
                const branchResult = await run('git branch --show-current', { cwd: workingDir });
                const currentBranch = branchResult.stdout.trim();

                // Get status
                const statusCmd = showUntracked ? 'git status --porcelain' : 'git status --porcelain --untracked-files=no';
                const statusResult = await run(statusCmd, { cwd: workingDir });
                const hasChanges = statusResult.stdout.trim().length > 0;

                // Get HEAD commit
                const headResult = await run('git rev-parse --short HEAD', { cwd: workingDir });
                const headSha = headResult.stdout.trim();

                return {
                    currentBranch,
                    headSha,
                    hasUncommittedChanges: hasChanges,
                    statusOutput: statusResult.stdout,
                };
            } catch (error: any) {
                throw new Error(`Failed to check git status: ${error.message}`);
            }
        },
    };
}

/**
 * Check if a branch is synchronized with remote
 */
function createCheckBranchSyncTool(): Tool {
    return {
        name: 'check_branch_sync',
        description: 'Check if a local branch is synchronized with its remote counterpart. Returns sync status, local/remote SHAs, and whether the branch exists locally.',
        parameters: {
            type: 'object',
            properties: {
                branchName: {
                    type: 'string',
                    description: 'Name of the branch to check',
                },
            },
            required: ['branchName'],
        },
        execute: async (params: { branchName: string }, _context?: ToolContext) => {
            const { branchName } = params;

            try {
                // Check if branch exists locally
                const exists = await localBranchExists(branchName);

                if (!exists) {
                    return {
                        exists: false,
                        message: `Branch '${branchName}' does not exist locally`,
                    };
                }

                // Check sync status
                const syncStatus = await isBranchInSyncWithRemote(branchName);

                return {
                    exists: true,
                    branchName,
                    inSync: syncStatus.inSync,
                    localSha: syncStatus.localSha,
                    remoteSha: syncStatus.remoteSha,
                    error: syncStatus.error,
                    isDiverged: syncStatus.localSha !== syncStatus.remoteSha,
                };
            } catch (error: any) {
                throw new Error(`Failed to check branch sync: ${error.message}`);
            }
        },
    };
}

/**
 * Analyze how two branches have diverged
 */
function createAnalyzeDivergenceTool(): Tool {
    return {
        name: 'analyze_divergence',
        description: 'Analyze how two branches have diverged by showing commits unique to each branch',
        parameters: {
            type: 'object',
            properties: {
                sourceBranch: {
                    type: 'string',
                    description: 'The source/local branch name',
                },
                targetBranch: {
                    type: 'string',
                    description: 'The target/remote branch to compare against (e.g., "origin/main")',
                },
                maxCommits: {
                    type: 'number',
                    description: 'Maximum number of commits to show for each branch (default: 10)',
                    default: 10,
                },
            },
            required: ['sourceBranch', 'targetBranch'],
        },
        execute: async (params: { sourceBranch: string; targetBranch: string; maxCommits?: number }, context?: ToolContext) => {
            const { sourceBranch, targetBranch, maxCommits = 10 } = params;
            const workingDir = context?.workingDirectory || process.cwd();

            try {
                // Get commits in source but not in target
                const sourceOnlyResult = await run(
                    `git log ${targetBranch}..${sourceBranch} --oneline -n ${maxCommits}`,
                    { cwd: workingDir }
                );

                // Get commits in target but not in source
                const targetOnlyResult = await run(
                    `git log ${sourceBranch}..${targetBranch} --oneline -n ${maxCommits}`,
                    { cwd: workingDir }
                );

                // Get merge base
                const mergeBaseResult = await run(
                    `git merge-base ${sourceBranch} ${targetBranch}`,
                    { cwd: workingDir }
                );

                return {
                    sourceBranch,
                    targetBranch,
                    mergeBase: mergeBaseResult.stdout.trim(),
                    commitsInSourceOnly: sourceOnlyResult.stdout.trim() || 'None',
                    commitsInTargetOnly: targetOnlyResult.stdout.trim() || 'None',
                    isDiverged: sourceOnlyResult.stdout.trim().length > 0 && targetOnlyResult.stdout.trim().length > 0,
                    canFastForward: sourceOnlyResult.stdout.trim().length === 0, // Target is ahead, can fast-forward
                };
            } catch (error: any) {
                throw new Error(`Failed to analyze divergence: ${error.message}`);
            }
        },
    };
}

/**
 * Get commit log for a branch or range
 */
function createGetCommitLogTool(): Tool {
    return {
        name: 'get_commit_log',
        description: 'Get git commit log for a branch or commit range with detailed information',
        parameters: {
            type: 'object',
            properties: {
                ref: {
                    type: 'string',
                    description: 'Git ref (branch name, commit range like "main..working", or single commit)',
                },
                maxCommits: {
                    type: 'number',
                    description: 'Maximum number of commits to return (default: 20)',
                    default: 20,
                },
                format: {
                    type: 'string',
                    description: 'Format: "oneline" for brief, "full" for detailed with message body',
                    enum: ['oneline', 'full'],
                    default: 'oneline',
                },
            },
            required: ['ref'],
        },
        execute: async (params: { ref: string; maxCommits?: number; format?: 'oneline' | 'full' }, context?: ToolContext) => {
            const { ref, maxCommits = 20, format = 'oneline' } = params;
            const workingDir = context?.workingDirectory || process.cwd();

            try {
                const formatStr = format === 'full'
                    ? '%H%n%an <%ae>%n%ad%n%s%n%n%b%n---'
                    : '%h - %s (%an, %ar)';

                const result = await run(
                    `git log "${ref}" --format="${formatStr}" -n ${maxCommits}`,
                    { cwd: workingDir }
                );

                return result.stdout || 'No commits found';
            } catch (error: any) {
                throw new Error(`Failed to get commit log: ${error.message}`);
            }
        },
    };
}

/**
 * Get detailed information about a branch
 */
function createGetBranchInfoTool(): Tool {
    return {
        name: 'get_branch_info',
        description: 'Get detailed information about a branch including its tracking info, last commit, and whether it exists remotely',
        parameters: {
            type: 'object',
            properties: {
                branchName: {
                    type: 'string',
                    description: 'Name of the branch to inspect',
                },
            },
            required: ['branchName'],
        },
        execute: async (params: { branchName: string }, context?: ToolContext) => {
            const { branchName } = params;
            const workingDir = context?.workingDirectory || process.cwd();

            try {
                // Check if branch exists locally
                const localExists = await localBranchExists(branchName);

                if (!localExists) {
                    // Check if it exists remotely
                    try {
                        const remoteCheckResult = await run(`git ls-remote --heads origin ${branchName}`, { cwd: workingDir });
                        const remoteExists = remoteCheckResult.stdout.trim().length > 0;

                        return {
                            branchName,
                            existsLocally: false,
                            existsRemotely: remoteExists,
                            message: remoteExists
                                ? `Branch exists remotely but not locally`
                                : `Branch does not exist locally or remotely`,
                        };
                    } catch {
                        return {
                            branchName,
                            existsLocally: false,
                            existsRemotely: false,
                        };
                    }
                }

                // Get branch tracking info
                let trackingBranch = null;
                try {
                    const trackingResult = await run(`git rev-parse --abbrev-ref ${branchName}@{upstream}`, { cwd: workingDir });
                    trackingBranch = trackingResult.stdout.trim();
                } catch {
                    // No upstream configured
                }

                // Get last commit info
                const lastCommitResult = await run(
                    `git log ${branchName} -1 --format="%H|%h|%s|%an|%ar"`,
                    { cwd: workingDir }
                );
                const [fullSha, shortSha, subject, author, relativeDate] = lastCommitResult.stdout.trim().split('|');

                // Get commit count
                const countResult = await run(`git rev-list --count ${branchName}`, { cwd: workingDir });
                const commitCount = parseInt(countResult.stdout.trim(), 10);
                if (isNaN(commitCount)) {
                    throw new Error(`Invalid commit count returned from git: ${countResult.stdout}`);
                }

                return {
                    branchName,
                    existsLocally: true,
                    trackingBranch,
                    lastCommit: {
                        fullSha,
                        shortSha,
                        subject,
                        author,
                        relativeDate,
                    },
                    commitCount,
                };
            } catch (error: any) {
                throw new Error(`Failed to get branch info: ${error.message}`);
            }
        },
    };
}

/**
 * Attempt to sync a branch with remote
 */
function createSyncBranchTool(): Tool {
    return {
        name: 'sync_branch',
        description: 'Attempt to synchronize a local branch with its remote counterpart. Returns success status and details about what happened.',
        parameters: {
            type: 'object',
            properties: {
                branchName: {
                    type: 'string',
                    description: 'Name of the branch to sync',
                },
            },
            required: ['branchName'],
        },
        execute: async (params: { branchName: string }, _context?: ToolContext) => {
            const { branchName } = params;

            try {
                const syncResult = await safeSyncBranchWithRemote(branchName);

                return {
                    branchName,
                    success: syncResult.success,
                    conflictResolutionRequired: syncResult.conflictResolutionRequired,
                    error: syncResult.error,
                    message: syncResult.success
                        ? `Successfully synchronized ${branchName} with remote`
                        : syncResult.conflictResolutionRequired
                            ? `Sync failed due to merge conflicts in ${branchName}`
                            : `Sync failed: ${syncResult.error}`,
                };
            } catch (error: any) {
                throw new Error(`Failed to sync branch: ${error.message}`);
            }
        },
    };
}

/**
 * Get diff statistics between two refs
 */
function createGetDiffStatsTool(): Tool {
    return {
        name: 'get_diff_stats',
        description: 'Get statistics about differences between two git refs (branches, commits, etc.)',
        parameters: {
            type: 'object',
            properties: {
                fromRef: {
                    type: 'string',
                    description: 'Starting ref (e.g., "main", "origin/main")',
                },
                toRef: {
                    type: 'string',
                    description: 'Ending ref (e.g., "working", "HEAD")',
                },
                includeFileList: {
                    type: 'boolean',
                    description: 'Include list of changed files (default: true)',
                    default: true,
                },
            },
            required: ['fromRef', 'toRef'],
        },
        execute: async (params: { fromRef: string; toRef: string; includeFileList?: boolean }, context?: ToolContext) => {
            const { fromRef, toRef, includeFileList = true } = params;
            const workingDir = context?.workingDirectory || process.cwd();

            try {
                // Get diff stats
                const statsResult = await run(`git diff --shortstat ${fromRef}..${toRef}`, { cwd: workingDir });

                let fileList = null;
                if (includeFileList) {
                    const fileListResult = await run(`git diff --name-status ${fromRef}..${toRef}`, { cwd: workingDir });
                    fileList = fileListResult.stdout;
                }

                return {
                    fromRef,
                    toRef,
                    stats: statsResult.stdout.trim() || 'No differences',
                    fileList,
                };
            } catch (error: any) {
                throw new Error(`Failed to get diff stats: ${error.message}`);
            }
        },
    };
}

/**
 * Check for merge conflicts
 */
function createCheckConflictsTool(): Tool {
    return {
        name: 'check_conflicts',
        description: 'Check if merging one branch into another would result in conflicts (without actually performing the merge)',
        parameters: {
            type: 'object',
            properties: {
                sourceBranch: {
                    type: 'string',
                    description: 'Branch to merge from',
                },
                targetBranch: {
                    type: 'string',
                    description: 'Branch to merge into',
                },
            },
            required: ['sourceBranch', 'targetBranch'],
        },
        execute: async (params: { sourceBranch: string; targetBranch: string }, context?: ToolContext) => {
            const { sourceBranch, targetBranch } = params;
            const workingDir = context?.workingDirectory || process.cwd();

            try {
                // Use git merge-tree to check for conflicts without actually merging
                const mergeBaseResult = await run(
                    `git merge-base ${targetBranch} ${sourceBranch}`,
                    { cwd: workingDir }
                );
                const mergeBase = mergeBaseResult.stdout.trim();

                // Check if merge would create conflicts
                const mergeTreeResult = await run(
                    `git merge-tree ${mergeBase} ${targetBranch} ${sourceBranch}`,
                    { cwd: workingDir }
                );

                // Look for conflict markers in the output
                const hasConflicts = mergeTreeResult.stdout.includes('<<<<<<<') ||
                                   mergeTreeResult.stdout.includes('>>>>>>>') ||
                                   mergeTreeResult.stdout.includes('=======');

                // Extract conflicting files if any
                const conflicts = hasConflicts
                    ? mergeTreeResult.stdout.match(/\+\+\+ b\/([^\n]+)/g)?.map(m => m.replace(/\+\+\+ b\//, ''))
                    : [];

                return {
                    sourceBranch,
                    targetBranch,
                    mergeBase,
                    hasConflicts,
                    conflictingFiles: conflicts || [],
                    message: hasConflicts
                        ? `Merging ${sourceBranch} into ${targetBranch} would create conflicts`
                        : `Merging ${sourceBranch} into ${targetBranch} should succeed without conflicts`,
                };
            } catch (error: any) {
                throw new Error(`Failed to check conflicts: ${error.message}`);
            }
        },
    };
}

/**
 * Reset a branch to match another ref
 */
function createResetBranchTool(): Tool {
    return {
        name: 'reset_branch',
        description: 'Reset a branch to match another ref (e.g., reset local main to origin/main). USE WITH CAUTION - this is a destructive operation.',
        parameters: {
            type: 'object',
            properties: {
                branchName: {
                    type: 'string',
                    description: 'Name of the branch to reset',
                },
                targetRef: {
                    type: 'string',
                    description: 'Ref to reset to (e.g., "origin/main")',
                },
                resetType: {
                    type: 'string',
                    description: 'Type of reset: "hard" (discard changes), "soft" (keep changes staged), "mixed" (keep changes unstaged)',
                    enum: ['hard', 'soft', 'mixed'],
                    default: 'hard',
                },
            },
            required: ['branchName', 'targetRef'],
        },
        execute: async (params: { branchName: string; targetRef: string; resetType?: 'hard' | 'soft' | 'mixed' }, context?: ToolContext) => {
            const { branchName, targetRef, resetType = 'hard' } = params;
            const workingDir = context?.workingDirectory || process.cwd();

            try {
                // First, checkout the branch
                await run(`git checkout ${branchName}`, { cwd: workingDir });

                // Then reset it to the target ref
                await run(`git reset --${resetType} ${targetRef}`, { cwd: workingDir });

                // Get the new HEAD
                const headResult = await run('git rev-parse --short HEAD', { cwd: workingDir });
                const newHead = headResult.stdout.trim();

                return {
                    branchName,
                    targetRef,
                    resetType,
                    newHead,
                    message: `Successfully reset ${branchName} to ${targetRef} (${resetType})`,
                };
            } catch (error: any) {
                throw new Error(`Failed to reset branch: ${error.message}`);
            }
        },
    };
}


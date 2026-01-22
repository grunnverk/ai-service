import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPublishTools } from '../../src/tools/publish-tools';

// Mock git-tools
vi.mock('@grunnverk/git-tools', () => ({
    run: vi.fn(),
    isBranchInSyncWithRemote: vi.fn(),
    safeSyncBranchWithRemote: vi.fn(),
    localBranchExists: vi.fn()
}));

describe('Publish Tools', () => {
    let tools: ReturnType<typeof createPublishTools>;

    beforeEach(() => {
        vi.clearAllMocks();
        tools = createPublishTools();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should create all publish tools', () => {
        expect(tools).toHaveLength(9);

        const toolNames = tools.map(t => t.name);
        expect(toolNames).toContain('check_git_status');
        expect(toolNames).toContain('check_branch_sync');
        expect(toolNames).toContain('analyze_divergence');
        expect(toolNames).toContain('get_commit_log');
        expect(toolNames).toContain('get_branch_info');
        expect(toolNames).toContain('sync_branch');
        expect(toolNames).toContain('get_diff_stats');
        expect(toolNames).toContain('check_conflicts');
        expect(toolNames).toContain('reset_branch');
    });

    describe('check_git_status', () => {
        it('should check git status successfully', async () => {
            const { run } = await import('@grunnverk/git-tools');
            (run as any)
                .mockResolvedValueOnce({ stdout: 'main' })
                .mockResolvedValueOnce({ stdout: '' })
                .mockResolvedValueOnce({ stdout: 'abc123' });

            const tool = tools.find(t => t.name === 'check_git_status')!;
            const result = await tool.execute({});

            expect(result.currentBranch).toBe('main');
            expect(result.hasUncommittedChanges).toBe(false);
            expect(result.headSha).toBe('abc123');
        });

        it('should detect uncommitted changes', async () => {
            const { run } = await import('@grunnverk/git-tools');
            (run as any)
                .mockResolvedValueOnce({ stdout: 'feature' })
                .mockResolvedValueOnce({ stdout: 'M src/index.ts\nA src/new.ts' })
                .mockResolvedValueOnce({ stdout: 'def456' });

            const tool = tools.find(t => t.name === 'check_git_status')!;
            const result = await tool.execute({ showUntracked: true });

            expect(result.hasUncommittedChanges).toBe(true);
            expect(result.statusOutput).toContain('M src/index.ts');
        });

        it('should throw on error', async () => {
            const { run } = await import('@grunnverk/git-tools');
            (run as any).mockRejectedValue(new Error('Not a git repository'));

            const tool = tools.find(t => t.name === 'check_git_status')!;

            await expect(tool.execute({})).rejects.toThrow('Failed to check git status');
        });
    });

    describe('check_branch_sync', () => {
        it('should check branch sync status', async () => {
            const { localBranchExists, isBranchInSyncWithRemote } = await import('@grunnverk/git-tools');
            (localBranchExists as any).mockResolvedValue(true);
            (isBranchInSyncWithRemote as any).mockResolvedValue({
                inSync: true,
                localSha: 'abc123',
                remoteSha: 'abc123'
            });

            const tool = tools.find(t => t.name === 'check_branch_sync')!;
            const result = await tool.execute({ branchName: 'main' });

            expect(result.exists).toBe(true);
            expect(result.inSync).toBe(true);
            expect(result.isDiverged).toBe(false);
        });

        it('should detect diverged branch', async () => {
            const { localBranchExists, isBranchInSyncWithRemote } = await import('@grunnverk/git-tools');
            (localBranchExists as any).mockResolvedValue(true);
            (isBranchInSyncWithRemote as any).mockResolvedValue({
                inSync: false,
                localSha: 'abc123',
                remoteSha: 'def456'
            });

            const tool = tools.find(t => t.name === 'check_branch_sync')!;
            const result = await tool.execute({ branchName: 'main' });

            expect(result.inSync).toBe(false);
            expect(result.isDiverged).toBe(true);
        });

        it('should handle non-existent branch', async () => {
            const { localBranchExists } = await import('@grunnverk/git-tools');
            (localBranchExists as any).mockResolvedValue(false);

            const tool = tools.find(t => t.name === 'check_branch_sync')!;
            const result = await tool.execute({ branchName: 'nonexistent' });

            expect(result.exists).toBe(false);
            expect(result.message).toContain('does not exist');
        });
    });

    describe('analyze_divergence', () => {
        it('should analyze branch divergence', async () => {
            const { run } = await import('@grunnverk/git-tools');
            (run as any)
                .mockResolvedValueOnce({ stdout: 'abc123 Commit 1\ndef456 Commit 2' })
                .mockResolvedValueOnce({ stdout: 'ghi789 Remote commit' })
                .mockResolvedValueOnce({ stdout: 'base000' });

            const tool = tools.find(t => t.name === 'analyze_divergence')!;
            const result = await tool.execute({
                sourceBranch: 'feature',
                targetBranch: 'origin/main'
            });

            expect(result.isDiverged).toBe(true);
            expect(result.mergeBase).toBe('base000');
            expect(result.commitsInSourceOnly).toContain('Commit 1');
        });

        it('should detect fast-forward possibility', async () => {
            const { run } = await import('@grunnverk/git-tools');
            (run as any)
                .mockResolvedValueOnce({ stdout: '' })
                .mockResolvedValueOnce({ stdout: 'abc123 New commit' })
                .mockResolvedValueOnce({ stdout: 'base000' });

            const tool = tools.find(t => t.name === 'analyze_divergence')!;
            const result = await tool.execute({
                sourceBranch: 'main',
                targetBranch: 'origin/main'
            });

            expect(result.canFastForward).toBe(true);
        });
    });

    describe('get_commit_log', () => {
        it('should get commit log in oneline format', async () => {
            const { run } = await import('@grunnverk/git-tools');
            (run as any).mockResolvedValue({
                stdout: 'abc123 - Initial commit (Author, 1 day ago)\ndef456 - Second commit (Author, 2 days ago)'
            });

            const tool = tools.find(t => t.name === 'get_commit_log')!;
            const result = await tool.execute({ ref: 'main' });

            expect(result).toContain('Initial commit');
        });

        it('should get commit log in full format', async () => {
            const { run } = await import('@grunnverk/git-tools');
            (run as any).mockResolvedValue({
                stdout: 'abc123\nAuthor <email>\n2024-01-01\nCommit message\n\nBody\n---'
            });

            const tool = tools.find(t => t.name === 'get_commit_log')!;
            const result = await tool.execute({ ref: 'main', format: 'full' });

            expect(result).toContain('Author');
        });
    });

    describe('get_branch_info', () => {
        it('should get branch info for existing branch', async () => {
            const { run, localBranchExists } = await import('@grunnverk/git-tools');
            (localBranchExists as any).mockResolvedValue(true);
            (run as any)
                .mockResolvedValueOnce({ stdout: 'origin/main' })
                .mockResolvedValueOnce({ stdout: 'abc123|abc1|Initial commit|Author|1 day ago' })
                .mockResolvedValueOnce({ stdout: '42' });

            const tool = tools.find(t => t.name === 'get_branch_info')!;
            const result = await tool.execute({ branchName: 'main' });

            expect(result.existsLocally).toBe(true);
            expect(result.trackingBranch).toBe('origin/main');
            expect(result.commitCount).toBe(42);
            expect(result.lastCommit.subject).toBe('Initial commit');
        });

        it('should handle branch without tracking', async () => {
            const { run, localBranchExists } = await import('@grunnverk/git-tools');
            (localBranchExists as any).mockResolvedValue(true);
            (run as any)
                .mockRejectedValueOnce(new Error('No upstream'))
                .mockResolvedValueOnce({ stdout: 'abc123|abc1|Initial commit|Author|1 day ago' })
                .mockResolvedValueOnce({ stdout: '10' });

            const tool = tools.find(t => t.name === 'get_branch_info')!;
            const result = await tool.execute({ branchName: 'feature' });

            expect(result.trackingBranch).toBeNull();
        });

        it('should handle non-existent local branch', async () => {
            const { run, localBranchExists } = await import('@grunnverk/git-tools');
            (localBranchExists as any).mockResolvedValue(false);
            (run as any).mockResolvedValueOnce({ stdout: '' });

            const tool = tools.find(t => t.name === 'get_branch_info')!;
            const result = await tool.execute({ branchName: 'nonexistent' });

            expect(result.existsLocally).toBe(false);
        });
    });

    describe('sync_branch', () => {
        it('should sync branch successfully', async () => {
            const { safeSyncBranchWithRemote } = await import('@grunnverk/git-tools');
            (safeSyncBranchWithRemote as any).mockResolvedValue({
                success: true,
                conflictResolutionRequired: false
            });

            const tool = tools.find(t => t.name === 'sync_branch')!;
            const result = await tool.execute({ branchName: 'main' });

            expect(result.success).toBe(true);
            expect(result.message).toContain('Successfully synchronized');
        });

        it('should handle sync failure due to conflicts', async () => {
            const { safeSyncBranchWithRemote } = await import('@grunnverk/git-tools');
            (safeSyncBranchWithRemote as any).mockResolvedValue({
                success: false,
                conflictResolutionRequired: true,
                error: 'Merge conflict'
            });

            const tool = tools.find(t => t.name === 'sync_branch')!;
            const result = await tool.execute({ branchName: 'main' });

            expect(result.success).toBe(false);
            expect(result.conflictResolutionRequired).toBe(true);
        });
    });

    describe('get_diff_stats', () => {
        it('should get diff statistics', async () => {
            const { run } = await import('@grunnverk/git-tools');
            (run as any)
                .mockResolvedValueOnce({ stdout: '3 files changed, 100 insertions(+), 20 deletions(-)' })
                .mockResolvedValueOnce({ stdout: 'M\tsrc/index.ts\nA\tsrc/new.ts' });

            const tool = tools.find(t => t.name === 'get_diff_stats')!;
            const result = await tool.execute({
                fromRef: 'main',
                toRef: 'feature'
            });

            expect(result.stats).toContain('3 files changed');
            expect(result.fileList).toContain('src/index.ts');
        });

        it('should exclude file list when requested', async () => {
            const { run } = await import('@grunnverk/git-tools');
            (run as any).mockResolvedValue({ stdout: 'No differences' });

            const tool = tools.find(t => t.name === 'get_diff_stats')!;
            const result = await tool.execute({
                fromRef: 'main',
                toRef: 'main',
                includeFileList: false
            });

            expect(result.fileList).toBeNull();
        });
    });

    describe('check_conflicts', () => {
        it('should detect no conflicts', async () => {
            const { run } = await import('@grunnverk/git-tools');
            (run as any)
                .mockResolvedValueOnce({ stdout: 'base123' })
                .mockResolvedValueOnce({ stdout: 'Clean merge output' });

            const tool = tools.find(t => t.name === 'check_conflicts')!;
            const result = await tool.execute({
                sourceBranch: 'feature',
                targetBranch: 'main'
            });

            expect(result.hasConflicts).toBe(false);
            expect(result.message).toContain('should succeed');
        });

        it('should detect conflicts', async () => {
            const { run } = await import('@grunnverk/git-tools');
            (run as any)
                .mockResolvedValueOnce({ stdout: 'base123' })
                .mockResolvedValueOnce({ stdout: '<<<<<<< HEAD\nconflict content\n=======\nother content\n>>>>>>>' });

            const tool = tools.find(t => t.name === 'check_conflicts')!;
            const result = await tool.execute({
                sourceBranch: 'feature',
                targetBranch: 'main'
            });

            expect(result.hasConflicts).toBe(true);
            expect(result.message).toContain('would create conflicts');
        });
    });

    describe('reset_branch', () => {
        it('should reset branch to target ref', async () => {
            const { run } = await import('@grunnverk/git-tools');
            (run as any)
                .mockResolvedValueOnce({ stdout: '' })
                .mockResolvedValueOnce({ stdout: '' })
                .mockResolvedValueOnce({ stdout: 'abc123' });

            const tool = tools.find(t => t.name === 'reset_branch')!;
            const result = await tool.execute({
                branchName: 'main',
                targetRef: 'origin/main'
            });

            expect(result.newHead).toBe('abc123');
            expect(result.message).toContain('Successfully reset');
        });

        it('should support different reset types', async () => {
            const { run } = await import('@grunnverk/git-tools');
            (run as any)
                .mockResolvedValueOnce({ stdout: '' })
                .mockResolvedValueOnce({ stdout: '' })
                .mockResolvedValueOnce({ stdout: 'abc123' });

            const tool = tools.find(t => t.name === 'reset_branch')!;
            const result = await tool.execute({
                branchName: 'main',
                targetRef: 'origin/main',
                resetType: 'soft'
            });

            expect(result.resetType).toBe('soft');
        });
    });
});


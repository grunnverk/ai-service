import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createReleaseTools } from '../../src/tools/release-tools';
import type { ToolContext } from '../../src/tools/types';

// Mock git-tools
vi.mock('@eldrforge/git-tools', () => ({
    run: vi.fn(),
}));

describe('Release Tools', () => {
    let tools: ReturnType<typeof createReleaseTools>;
    let mockContext: ToolContext;
    let mockRun: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        tools = createReleaseTools();

        const gitTools = await import('@eldrforge/git-tools');
        mockRun = gitTools.run as any;

        mockContext = {
            workingDirectory: '/test/dir',
            storage: {
                readFile: vi.fn(),
                writeFile: vi.fn(),
                ensureDirectory: vi.fn(),
            } as any,
            logger: {
                debug: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            } as any,
        };
    });

    describe('Tool Registry', () => {
        it('should create 13 tools', () => {
            expect(tools).toHaveLength(13);
        });

        it('should include commit tools', () => {
            const toolNames = tools.map(t => t.name);
            expect(toolNames).toContain('get_file_history');
            expect(toolNames).toContain('get_file_content');
            expect(toolNames).toContain('search_codebase');
            expect(toolNames).toContain('get_related_tests');
            expect(toolNames).toContain('get_file_dependencies');
            expect(toolNames).toContain('analyze_diff_section');
            expect(toolNames).toContain('get_recent_commits');
            expect(toolNames).toContain('group_files_by_concern');
        });

        it('should include release-specific tools', () => {
            const toolNames = tools.map(t => t.name);
            expect(toolNames).toContain('get_tag_history');
            expect(toolNames).toContain('compare_previous_release');
            expect(toolNames).toContain('get_release_stats');
            expect(toolNames).toContain('get_breaking_changes');
            expect(toolNames).toContain('analyze_commit_patterns');
        });
    });

    describe('get_tag_history', () => {
        it('should get tag history with default limit', async () => {
            mockRun.mockResolvedValue({
                stdout: 'v1.0.0\nv0.9.0\nv0.8.0',
            });

            const tool = tools.find(t => t.name === 'get_tag_history')!;
            const result = await tool.execute({}, mockContext);

            expect(mockRun).toHaveBeenCalledWith(
                expect.stringContaining('git tag --sort=-creatordate'),
                expect.objectContaining({ cwd: '/test/dir' })
            );
            expect(result).toContain('v1.0.0');
        });

        it('should filter tags by pattern', async () => {
            mockRun.mockResolvedValue({
                stdout: 'v1.0.0\nv0.9.0',
            });

            const tool = tools.find(t => t.name === 'get_tag_history')!;
            await tool.execute({ pattern: 'v*' }, mockContext);

            expect(mockRun).toHaveBeenCalledWith(
                expect.stringContaining('-l "v*"'),
                expect.any(Object)
            );
        });

        it('should handle custom limit', async () => {
            mockRun.mockResolvedValue({
                stdout: 'v1.0.0',
            });

            const tool = tools.find(t => t.name === 'get_tag_history')!;
            await tool.execute({ limit: 5 }, mockContext);

            expect(mockRun).toHaveBeenCalledWith(
                expect.stringContaining('head -n 5'),
                expect.any(Object)
            );
        });

        it('should handle no tags found', async () => {
            mockRun.mockResolvedValue({
                stdout: '',
            });

            const tool = tools.find(t => t.name === 'get_tag_history')!;
            const result = await tool.execute({}, mockContext);

            expect(result).toBe('No tags found in repository');
        });
    });

    describe('compare_previous_release', () => {
        it('should compare releases with default options', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: '10' }) // commit count
                .mockResolvedValueOnce({ stdout: '5 files changed, 100 insertions(+), 50 deletions(-)' }); // stats

            const tool = tools.find(t => t.name === 'compare_previous_release')!;
            const result = await tool.execute({ previousTag: 'v1.0.0' }, mockContext);

            expect(result).toContain('Comparison between v1.0.0 and HEAD');
            expect(result).toContain('Commits: 10');
            expect(result).toContain('5 files changed');
        });

        it('should include commit log when statsOnly is false', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: '5' }) // commit count
                .mockResolvedValueOnce({ stdout: 'file changes' }) // stats
                .mockResolvedValueOnce({ stdout: 'abc123 commit message\ndef456 another commit' }); // log

            const tool = tools.find(t => t.name === 'compare_previous_release')!;
            const result = await tool.execute(
                { previousTag: 'v1.0.0', statsOnly: false },
                mockContext
            );

            expect(result).toContain('Commit summary:');
            expect(result).toContain('abc123 commit message');
        });

        it('should handle custom currentRef', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: '3' })
                .mockResolvedValueOnce({ stdout: 'stats' });

            const tool = tools.find(t => t.name === 'compare_previous_release')!;
            await tool.execute({ previousTag: 'v1.0.0', currentRef: 'v2.0.0' }, mockContext);

            expect(mockRun).toHaveBeenCalledWith(
                expect.stringContaining('v1.0.0..v2.0.0'),
                expect.any(Object)
            );
        });
    });

    describe('get_release_stats', () => {
        it('should get comprehensive release statistics', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: '25' }) // commit count
                .mockResolvedValueOnce({ stdout: '     5	John Doe\n     3	Jane Smith' }) // contributors
                .mockResolvedValueOnce({ stdout: '10 files changed, 200 insertions(+), 50 deletions(-)' }) // file stats
                .mockResolvedValueOnce({ stdout: 'src/main.ts | 50 +++++\nsrc/util.ts | 30 +++' }); // top files

            const tool = tools.find(t => t.name === 'get_release_stats')!;
            const result = await tool.execute({ fromRef: 'v1.0.0' }, mockContext);

            expect(result).toContain('Total commits: 25');
            expect(result).toContain('Contributors:');
            expect(result).toContain('John Doe');
            expect(result).toContain('File changes:');
            expect(result).toContain('Top 10 most changed files:');
        });

        it('should handle custom toRef', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: '10' })
                .mockResolvedValueOnce({ stdout: 'contributors' })
                .mockResolvedValueOnce({ stdout: 'stats' })
                .mockResolvedValueOnce({ stdout: 'files' });

            const tool = tools.find(t => t.name === 'get_release_stats')!;
            await tool.execute({ fromRef: 'v1.0.0', toRef: 'v2.0.0' }, mockContext);

            expect(mockRun).toHaveBeenCalledWith(
                expect.stringContaining('v1.0.0..v2.0.0'),
                expect.any(Object)
            );
        });
    });

    describe('get_breaking_changes', () => {
        it('should identify breaking changes from commit messages', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'abc123 BREAKING CHANGE: removed old API' })
                .mockResolvedValueOnce({ stdout: '-export function oldFunction()' })
                .mockResolvedValueOnce({ stdout: '+function newSignature()\n-function oldSignature()' });

            const tool = tools.find(t => t.name === 'get_breaking_changes')!;
            const result = await tool.execute({ fromRef: 'v1.0.0' }, mockContext);

            expect(result).toContain('BREAKING CHANGE');
            expect(result).toContain('Removed exports');
            expect(result).toContain('Changed function/type signatures');
        });

        it('should return message when no breaking changes found', async () => {
            mockRun
                .mockRejectedValueOnce(new Error('exit code 1'))
                .mockRejectedValueOnce(new Error('exit code 1'))
                .mockRejectedValueOnce(new Error('exit code 1'));

            const tool = tools.find(t => t.name === 'get_breaking_changes')!;
            const result = await tool.execute({ fromRef: 'v1.0.0' }, mockContext);

            expect(result).toBe('No obvious breaking changes detected. Manual review recommended for API changes.');
        });

        it('should handle partial failures', async () => {
            // When the first command succeeds but subsequent ones fail
            mockRun
                .mockResolvedValueOnce({ stdout: 'abc123 BREAKING CHANGE: removed API' })
                .mockRejectedValueOnce(new Error('no matches'))
                .mockRejectedValueOnce(new Error('no matches'));

            const tool = tools.find(t => t.name === 'get_breaking_changes')!;
            const result = await tool.execute({ fromRef: 'v1.0.0' }, mockContext);

            // Should get the default message since errors cause catch block to execute
            expect(result).toBe('No obvious breaking changes detected. Manual review recommended for API changes.');
        });
    });

    describe('analyze_commit_patterns', () => {
        it('should analyze conventional commit types', async () => {
            mockRun.mockReset();
            mockRun.mockResolvedValueOnce({
                stdout: 'feat: add new feature\nfix: bug fix\nfeat: another feature\nrefactor: code cleanup',
            });

            const tool = tools.find(t => t.name === 'analyze_commit_patterns')!;
            const result = await tool.execute({ fromRef: 'v1.0.0' }, mockContext);

            expect(result).toContain('Commit types:');
            expect(result).toContain('feat: 2');
            expect(result).toContain('fix: 1');
            expect(result).toContain('refactor: 1');
        });

        it('should extract top keywords from commit messages', async () => {
            mockRun.mockReset();
            mockRun.mockResolvedValueOnce({
                stdout: 'feat: improved performance\nfix: fixed performance issue\nrefactor: performance optimization',
            });

            const tool = tools.find(t => t.name === 'analyze_commit_patterns')!;
            const result = await tool.execute({ fromRef: 'v1.0.0' }, mockContext);

            expect(result).toContain('Top keywords in commits:');
            expect(result).toContain('performance');
        });

        it('should handle custom toRef', async () => {
            mockRun.mockReset();
            mockRun.mockResolvedValueOnce({
                stdout: 'feat: test',
            });

            const tool = tools.find(t => t.name === 'analyze_commit_patterns')!;
            await tool.execute({ fromRef: 'v1.0.0', toRef: 'v2.0.0' }, mockContext);

            expect(mockRun).toHaveBeenCalledWith(
                expect.stringContaining('v1.0.0..v2.0.0'),
                expect.any(Object)
            );
        });

        it('should handle commits without conventional format', async () => {
            mockRun.mockReset();
            mockRun.mockResolvedValueOnce({
                stdout: 'random commit message\nanother commit\nyet another one',
            });

            const tool = tools.find(t => t.name === 'analyze_commit_patterns')!;
            const result = await tool.execute({ fromRef: 'v1.0.0' }, mockContext);

            // Should still extract keywords
            expect(result).toContain('Top keywords in commits:');
        });
    });

    describe('Inherited Commit Tools', () => {
        it('should include get_file_history tool', () => {
            const tool = tools.find(t => t.name === 'get_file_history');
            expect(tool).toBeDefined();
            expect(tool?.description).toContain('commit history');
        });

        it('should include search_codebase tool', () => {
            const tool = tools.find(t => t.name === 'search_codebase');
            expect(tool).toBeDefined();
            expect(tool?.description).toContain('Search for code patterns');
        });

        it('should include group_files_by_concern tool', () => {
            const tool = tools.find(t => t.name === 'group_files_by_concern');
            expect(tool).toBeDefined();
            expect(tool?.description).toContain('logical groupings');
        });
    });

    describe('Error Handling', () => {
        it('should handle git command failures gracefully', async () => {
            mockRun.mockReset();
            mockRun.mockRejectedValueOnce(new Error('git command failed'));

            const tool = tools.find(t => t.name === 'get_tag_history')!;

            await expect(tool.execute({}, mockContext)).rejects.toThrow('Failed to get tag history');
        });

        it('should handle missing context gracefully', async () => {
            const tool = tools.find(t => t.name === 'get_file_content')!;

            await expect(tool.execute({ filePath: 'test.ts' }, {} as any)).rejects.toThrow(
                'Storage adapter not available in context'
            );
        });
    });
});


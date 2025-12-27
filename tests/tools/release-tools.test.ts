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

    describe('get_file_history', () => {
        it('should get file history with default parameters', async () => {
            mockRun.mockResolvedValue({
                stdout: 'abc1234 - Updated auth module (John, 2 days ago)\ndef5678 - Fixed bug (Jane, 5 days ago)',
            });

            const tool = tools.find(t => t.name === 'get_file_history')!;
            const result = await tool.execute({ filePaths: ['src/auth.ts'] }, mockContext);

            expect(mockRun).toHaveBeenCalledWith(
                expect.stringContaining('git log'),
                expect.objectContaining({ cwd: '/test/dir' })
            );
            expect(result).toContain('abc1234');
        });

        it('should handle custom limit for file history', async () => {
            mockRun.mockResolvedValue({ stdout: 'commit history' });

            const tool = tools.find(t => t.name === 'get_file_history')!;
            await tool.execute({ filePaths: ['src/auth.ts'], limit: 20 }, mockContext);

            expect(mockRun).toHaveBeenCalledWith(
                expect.stringContaining('-n 20'),
                expect.any(Object)
            );
        });

        it('should support detailed format for file history', async () => {
            mockRun.mockResolvedValue({
                stdout: 'abc1234\nJohn Doe (john@example.com)\n2024-01-15\nCommit message\n\nBody',
            });

            const tool = tools.find(t => t.name === 'get_file_history')!;
            const result = await tool.execute(
                { filePaths: ['src/auth.ts'], format: 'detailed' },
                mockContext
            );

            // The detailed format uses a different format string
            expect(mockRun).toHaveBeenCalledWith(
                expect.stringContaining('%H%n%an'),
                expect.any(Object)
            );
            expect(result).toContain('abc1234');
        });

        it('should handle multiple file paths', async () => {
            mockRun.mockResolvedValue({ stdout: 'history for multiple files' });

            const tool = tools.find(t => t.name === 'get_file_history')!;
            await tool.execute(
                { filePaths: ['src/auth.ts', 'src/user.ts', 'src/api.ts'] },
                mockContext
            );

            expect(mockRun).toHaveBeenCalledWith(
                expect.stringContaining('src/auth.ts src/user.ts src/api.ts'),
                expect.any(Object)
            );
        });

        it('should handle git errors in file history', async () => {
            mockRun.mockRejectedValue(new Error('file not found'));

            const tool = tools.find(t => t.name === 'get_file_history')!;

            await expect(tool.execute({ filePaths: ['nonexistent.ts'] }, mockContext)).rejects.toThrow(
                'Failed to get file history'
            );
        });

        it('should return appropriate message when no history found', async () => {
            mockRun.mockResolvedValue({ stdout: '' });

            const tool = tools.find(t => t.name === 'get_file_history')!;
            const result = await tool.execute({ filePaths: ['src/new.ts'] }, mockContext);

            expect(result).toBe('No history found for specified files');
        });
    });

    describe('get_file_content', () => {
        it('should get file content without line numbers', async () => {
            (mockContext.storage.readFile as any).mockResolvedValue('export function foo() {\n  return 42;\n}');

            const tool = tools.find(t => t.name === 'get_file_content')!;
            const result = await tool.execute({ filePath: 'src/index.ts' }, mockContext);

            expect(mockContext.storage.readFile).toHaveBeenCalledWith('src/index.ts', 'utf-8');
            expect(result).toContain('export function foo()');
        });

        it('should include line numbers when requested', async () => {
            (mockContext.storage.readFile as any).mockResolvedValue('line1\nline2\nline3');

            const tool = tools.find(t => t.name === 'get_file_content')!;
            const result = await tool.execute({ filePath: 'src/index.ts', includeLineNumbers: true }, mockContext);

            expect(result).toContain('1: line1');
            expect(result).toContain('2: line2');
            expect(result).toContain('3: line3');
        });

        it('should handle ENOENT errors gracefully for deleted files', async () => {
            const enoentError: any = new Error('ENOENT: no such file or directory');
            enoentError.code = 'ENOENT';
            (mockContext.storage.readFile as any).mockRejectedValue(enoentError);

            const tool = tools.find(t => t.name === 'get_file_content')!;
            const result = await tool.execute({ filePath: 'src/deleted.ts' }, mockContext);

            expect(result).toContain('File not found: src/deleted.ts');
            expect(result).toContain('may have been deleted');
        });

        it('should throw on other read errors', async () => {
            (mockContext.storage.readFile as any).mockRejectedValue(new Error('Permission denied'));

            const tool = tools.find(t => t.name === 'get_file_content')!;

            await expect(tool.execute({ filePath: 'src/index.ts' }, mockContext)).rejects.toThrow('Failed to read file');
        });
    });

    describe('search_codebase', () => {
        it('should search codebase with simple query', async () => {
            mockRun.mockResolvedValue({ stdout: 'src/auth.ts:10: const user = getValue();' });

            const tool = tools.find(t => t.name === 'search_codebase')!;
            const result = await tool.execute({ query: 'getValue' }, mockContext);

            expect(result).toContain('src/auth.ts');
            expect(mockRun).toHaveBeenCalledWith(
                expect.stringContaining('git grep'),
                expect.any(Object)
            );
        });

        it('should filter by file types', async () => {
            mockRun.mockResolvedValue({ stdout: 'results' });

            const tool = tools.find(t => t.name === 'search_codebase')!;
            await tool.execute({ query: 'function', fileTypes: ['ts', 'js'] }, mockContext);

            expect(mockRun).toHaveBeenCalledWith(
                expect.stringContaining('*.ts'),
                expect.any(Object)
            );
        });

        it('should set custom context lines', async () => {
            mockRun.mockResolvedValue({ stdout: 'results' });

            const tool = tools.find(t => t.name === 'search_codebase')!;
            await tool.execute({ query: 'export', contextLines: 5 }, mockContext);

            expect(mockRun).toHaveBeenCalledWith(
                expect.stringContaining('-C 5'),
                expect.any(Object)
            );
        });

        it('should handle no matches gracefully', async () => {
            mockRun.mockRejectedValue(new Error('exit code 1 no matches found'));

            const tool = tools.find(t => t.name === 'search_codebase')!;
            const result = await tool.execute({ query: 'nonexistent_function' }, mockContext);

            expect(result).toBe('No matches found');
        });

        it('should handle search errors', async () => {
            mockRun.mockRejectedValue(new Error('invalid regex'));

            const tool = tools.find(t => t.name === 'search_codebase')!;

            await expect(tool.execute({ query: 'invalid[regex' }, mockContext)).rejects.toThrow('Search failed');
        });
    });

    describe('get_related_tests', () => {
        it('should find related test files', async () => {
            (mockContext.storage.readFile as any)
                .mockResolvedValueOnce('test content'); // src/auth.test.ts

            const tool = tools.find(t => t.name === 'get_related_tests')!;
            const result = await tool.execute({ filePaths: ['src/auth.ts'] }, mockContext);

            expect(result).toContain('Found related test files');
            expect(result).toContain('src/auth.test.ts');
        });

        it('should handle no related tests', async () => {
            (mockContext.storage.readFile as any).mockRejectedValue(new Error('not found'));

            const tool = tools.find(t => t.name === 'get_related_tests')!;
            const result = await tool.execute({ filePaths: ['src/util.ts'] }, mockContext);

            expect(result).toBe('No related test files found');
        });
    });

    describe('get_file_dependencies', () => {
        it('should find files importing a module', async () => {
            mockRun.mockResolvedValue({
                stdout: 'src/main.ts\nsrc/app.ts\n',
            });

            const tool = tools.find(t => t.name === 'get_file_dependencies')!;
            const result = await tool.execute({ filePaths: ['src/auth.ts'] }, mockContext);

            expect(result).toContain('Files importing src/auth.ts');
            expect(result).toContain('src/main.ts');
        });

        it('should handle no dependencies', async () => {
            mockRun.mockRejectedValue(new Error('exit code 1'));

            const tool = tools.find(t => t.name === 'get_file_dependencies')!;
            const result = await tool.execute({ filePaths: ['src/unused.ts'] }, mockContext);

            expect(result).toBe('No files found that import the specified files');
        });
    });

    describe('analyze_diff_section', () => {
        it('should get expanded context around lines', async () => {
            const fileContent = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n');
            (mockContext.storage.readFile as any).mockResolvedValue(fileContent);

            const tool = tools.find(t => t.name === 'analyze_diff_section')!;
            const result = await tool.execute(
                { filePath: 'src/main.ts', startLine: 20, endLine: 25 },
                mockContext
            );

            expect(result).toContain('src/main.ts');
            expect(result).toContain('line 20');
        });

        it('should use custom context lines', async () => {
            const fileContent = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n');
            (mockContext.storage.readFile as any).mockResolvedValue(fileContent);

            const tool = tools.find(t => t.name === 'analyze_diff_section')!;
            const result = await tool.execute(
                { filePath: 'src/main.ts', startLine: 25, endLine: 25, contextLines: 5 },
                mockContext
            );

            expect(result).toContain('line 20');
            expect(result).toContain('line 25');
            expect(result).toContain('line 30');
        });

        it('should handle boundary cases', async () => {
            const fileContent = 'line1\nline2\nline3';
            (mockContext.storage.readFile as any).mockResolvedValue(fileContent);

            const tool = tools.find(t => t.name === 'analyze_diff_section')!;
            const result = await tool.execute(
                { filePath: 'src/main.ts', startLine: 1, endLine: 3, contextLines: 10 },
                mockContext
            );

            expect(result).toContain('line1');
            expect(result).toContain('line3');
        });

        it('should handle read errors', async () => {
            (mockContext.storage.readFile as any).mockRejectedValue(new Error('file not found'));

            const tool = tools.find(t => t.name === 'analyze_diff_section')!;

            await expect(
                tool.execute({ filePath: 'src/missing.ts', startLine: 1, endLine: 5 }, mockContext)
            ).rejects.toThrow('Failed to analyze diff section');
        });
    });

    describe('get_recent_commits', () => {
        it('should get recent commits for files', async () => {
            mockRun.mockResolvedValue({
                stdout: 'abc1234 - Fixed auth issue (John, 2 days ago)\ndef5678 - Updated auth (Jane, 5 days ago)',
            });

            const tool = tools.find(t => t.name === 'get_recent_commits')!;
            const result = await tool.execute({ filePaths: ['src/auth.ts'] }, mockContext);

            expect(result).toContain('abc1234');
            expect(mockRun).toHaveBeenCalledWith(
                expect.stringContaining('git log'),
                expect.any(Object)
            );
        });

        it('should use custom time period', async () => {
            mockRun.mockResolvedValue({ stdout: 'commits' });

            const tool = tools.find(t => t.name === 'get_recent_commits')!;
            await tool.execute({ filePaths: ['src/auth.ts'], since: '1 month ago' }, mockContext);

            expect(mockRun).toHaveBeenCalledWith(
                expect.stringContaining('1 month ago'),
                expect.any(Object)
            );
        });

        it('should handle custom limit', async () => {
            mockRun.mockResolvedValue({ stdout: 'commits' });

            const tool = tools.find(t => t.name === 'get_recent_commits')!;
            await tool.execute({ filePaths: ['src/auth.ts'], limit: 15 }, mockContext);

            expect(mockRun).toHaveBeenCalledWith(
                expect.stringContaining('-n 15'),
                expect.any(Object)
            );
        });

        it('should handle no commits in time period', async () => {
            mockRun.mockResolvedValue({ stdout: '' });

            const tool = tools.find(t => t.name === 'get_recent_commits')!;
            const result = await tool.execute({ filePaths: ['src/new.ts'], since: '1 year ago' }, mockContext);

            expect(result).toContain('No commits found in the specified time period');
        });

        it('should handle git errors', async () => {
            mockRun.mockRejectedValue(new Error('invalid ref'));

            const tool = tools.find(t => t.name === 'get_recent_commits')!;

            await expect(tool.execute({ filePaths: ['src/auth.ts'] }, mockContext)).rejects.toThrow(
                'Failed to get recent commits'
            );
        });
    });

    describe('group_files_by_concern', () => {
        it('should group files by category', async () => {
            const tool = tools.find(t => t.name === 'group_files_by_concern')!;
            const result = await tool.execute({
                filePaths: [
                    'src/auth.ts',
                    'src/auth.test.ts',
                    'src/utils.ts',
                    'README.md',
                    'package.json',
                ],
            });

            expect(result).toContain('tests');
            expect(result).toContain('documentation');
            expect(result).toContain('dependencies');
            expect(result).toContain('source');
        });

        it('should handle single concern', async () => {
            const tool = tools.find(t => t.name === 'group_files_by_concern')!;
            const result = await tool.execute({
                filePaths: ['src/auth.ts', 'src/user.ts'],
            });

            expect(result).toContain('All files appear to be related to a single concern');
        });

        it('should suggest splits for multiple concerns', async () => {
            const tool = tools.find(t => t.name === 'group_files_by_concern')!;
            const result = await tool.execute({
                filePaths: [
                    'src/auth.ts',
                    'src/auth.test.ts',
                    'README.md',
                    'docs/guide.md',
                    'package.json',
                ],
            });

            expect(result).toContain('groups represent different concerns');
        });
    });
});


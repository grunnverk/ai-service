import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createCommitTools } from '../../src/tools/commit-tools';
import type { StorageAdapter } from '../../src/types';

// Mock git-tools
vi.mock('@eldrforge/git-tools', () => ({
    run: vi.fn(),
}));

import { run as mockRun } from '@eldrforge/git-tools';

describe('Commit Tools', () => {
    let mockStorage: StorageAdapter;
    let mockLogger: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockStorage = {
            writeOutput: vi.fn(),
            readTemp: vi.fn(),
            writeTemp: vi.fn(),
            readFile: vi.fn(),
        };

        mockLogger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
        };
    });

    describe('get_file_content tool', () => {
        it('should read file content using storage adapter', async () => {
            const tools = createCommitTools();
            const getFileContentTool = tools.find(t => t.name === 'get_file_content')!;

            const mockContent = 'export function test() { return true; }';
            vi.mocked(mockStorage.readFile).mockResolvedValue(mockContent);

            const result = await getFileContentTool.execute(
                { filePath: 'src/test.ts' },
                { storage: mockStorage, workingDirectory: '/test', logger: mockLogger }
            );

            expect(mockStorage.readFile).toHaveBeenCalledWith('src/test.ts', 'utf-8');
            expect(result).toBe(mockContent);
        });

        it('should include line numbers when requested', async () => {
            const tools = createCommitTools();
            const getFileContentTool = tools.find(t => t.name === 'get_file_content')!;

            const mockContent = 'line 1\nline 2\nline 3';
            vi.mocked(mockStorage.readFile).mockResolvedValue(mockContent);

            const result = await getFileContentTool.execute(
                { filePath: 'src/test.ts', includeLineNumbers: true },
                { storage: mockStorage, workingDirectory: '/test', logger: mockLogger }
            );

            expect(result).toBe('1: line 1\n2: line 2\n3: line 3');
        });

        it('should throw error when storage is not available', async () => {
            const tools = createCommitTools();
            const getFileContentTool = tools.find(t => t.name === 'get_file_content')!;

            await expect(
                getFileContentTool.execute(
                    { filePath: 'src/test.ts' },
                    { workingDirectory: '/test', logger: mockLogger }
                )
            ).rejects.toThrow('Storage adapter not available in context');
        });

        it('should handle ENOENT errors gracefully for deleted files', async () => {
            const tools = createCommitTools();
            const getFileContentTool = tools.find(t => t.name === 'get_file_content')!;

            const enoentError: any = new Error('ENOENT: no such file or directory');
            enoentError.code = 'ENOENT';
            vi.mocked(mockStorage.readFile).mockRejectedValue(enoentError);

            const result = await getFileContentTool.execute(
                { filePath: 'src/missing.ts' },
                { storage: mockStorage, workingDirectory: '/test', logger: mockLogger }
            );

            expect(result).toContain('File not found: src/missing.ts');
            expect(result).toContain('may have been deleted');
        });

        it('should throw on other file read errors', async () => {
            const tools = createCommitTools();
            const getFileContentTool = tools.find(t => t.name === 'get_file_content')!;

            vi.mocked(mockStorage.readFile).mockRejectedValue(new Error('Permission denied'));

            await expect(
                getFileContentTool.execute(
                    { filePath: 'src/missing.ts' },
                    { storage: mockStorage, workingDirectory: '/test', logger: mockLogger }
                )
            ).rejects.toThrow('Failed to read file: Permission denied');
        });
    });

    describe('search_codebase tool', () => {
        it('should construct git grep command with pattern before pathspec', async () => {
            const tools = createCommitTools();
            const searchTool = tools.find(t => t.name === 'search_codebase')!;

            vi.mocked(mockRun).mockResolvedValue({ stdout: 'src/test.ts:10:function test()', stderr: '' } as any);

            await searchTool.execute(
                { query: 'function test', fileTypes: ['ts', 'js'] },
                { storage: mockStorage, workingDirectory: '/test', logger: mockLogger }
            );

            expect(vi.mocked(mockRun)).toHaveBeenCalledWith(
                'git grep -n -C 2 "function test" -- \'*.ts\' \'*.js\'',
                { cwd: '/test' }
            );
        });

        it('should handle single file type correctly', async () => {
            const tools = createCommitTools();
            const searchTool = tools.find(t => t.name === 'search_codebase')!;

            vi.mocked(mockRun).mockResolvedValue({ stdout: 'src/test.ts:10:export', stderr: '' } as any);

            await searchTool.execute(
                { query: 'export', fileTypes: ['ts'] },
                { storage: mockStorage, workingDirectory: '/test', logger: mockLogger }
            );

            expect(vi.mocked(mockRun)).toHaveBeenCalledWith(
                'git grep -n -C 2 "export" -- \'*.ts\'',
                { cwd: '/test' }
            );
        });

        it('should search without file type filter when not specified', async () => {
            const tools = createCommitTools();
            const searchTool = tools.find(t => t.name === 'search_codebase')!;

            vi.mocked(mockRun).mockResolvedValue({ stdout: 'README.md:1:# Test', stderr: '' } as any);

            await searchTool.execute(
                { query: 'Test' },
                { storage: mockStorage, workingDirectory: '/test', logger: mockLogger }
            );

            expect(vi.mocked(mockRun)).toHaveBeenCalledWith(
                'git grep -n -C 2 "Test"',
                { cwd: '/test' }
            );
        });

        it('should use custom context lines', async () => {
            const tools = createCommitTools();
            const searchTool = tools.find(t => t.name === 'search_codebase')!;

            vi.mocked(mockRun).mockResolvedValue({ stdout: 'src/test.ts:10:match', stderr: '' } as any);

            await searchTool.execute(
                { query: 'match', contextLines: 5 },
                { storage: mockStorage, workingDirectory: '/test', logger: mockLogger }
            );

            expect(vi.mocked(mockRun)).toHaveBeenCalledWith(
                'git grep -n -C 5 "match"',
                { cwd: '/test' }
            );
        });

        it('should return "No matches found" when git grep returns exit code 1', async () => {
            const tools = createCommitTools();
            const searchTool = tools.find(t => t.name === 'search_codebase')!;

            vi.mocked(mockRun).mockRejectedValue(new Error('Command failed with exit code 1'));

            const result = await searchTool.execute(
                { query: 'nonexistent' },
                { storage: mockStorage, workingDirectory: '/test', logger: mockLogger }
            );

            expect(result).toBe('No matches found');
        });

        it('should throw error for other git grep failures', async () => {
            const tools = createCommitTools();
            const searchTool = tools.find(t => t.name === 'search_codebase')!;

            vi.mocked(mockRun).mockRejectedValue(new Error('fatal: not a git repository'));

            await expect(
                searchTool.execute(
                    { query: 'test' },
                    { storage: mockStorage, workingDirectory: '/test', logger: mockLogger }
                )
            ).rejects.toThrow('Search failed: fatal: not a git repository');
        });

        it('should handle empty results', async () => {
            const tools = createCommitTools();
            const searchTool = tools.find(t => t.name === 'search_codebase')!;

            vi.mocked(mockRun).mockResolvedValue({ stdout: '', stderr: '' } as any);

            const result = await searchTool.execute(
                { query: 'test' },
                { storage: mockStorage, workingDirectory: '/test', logger: mockLogger }
            );

            expect(result).toBe('No matches found');
        });
    });

    describe('get_file_history tool', () => {
        it('should get git log for specified files', async () => {
            const tools = createCommitTools();
            const historyTool = tools.find(t => t.name === 'get_file_history')!;

            const mockLog = 'abc123 - Fix bug (John Doe, 2 days ago)\ndef456 - Add feature (Jane Smith, 1 week ago)';
            vi.mocked(mockRun).mockResolvedValue({ stdout: mockLog, stderr: '' } as any);

            const result = await historyTool.execute(
                { filePaths: ['src/test.ts', 'src/util.ts'], limit: 5 },
                { storage: mockStorage, workingDirectory: '/test', logger: mockLogger }
            );

            expect(vi.mocked(mockRun)).toHaveBeenCalledWith(
                'git log --format="%h - %s (%an, %ar)" -n 5 -- src/test.ts src/util.ts',
                { cwd: '/test' }
            );
            expect(result).toBe(mockLog);
        });

        it('should support detailed format', async () => {
            const tools = createCommitTools();
            const historyTool = tools.find(t => t.name === 'get_file_history')!;

            vi.mocked(mockRun).mockResolvedValue({ stdout: 'detailed log', stderr: '' } as any);

            await historyTool.execute(
                { filePaths: ['src/test.ts'], format: 'detailed' },
                { storage: mockStorage, workingDirectory: '/test', logger: mockLogger }
            );

            expect(vi.mocked(mockRun)).toHaveBeenCalledWith(
                expect.stringContaining('--format="%H'),
                expect.any(Object)
            );
        });
    });

    describe('get_related_tests tool', () => {
        it('should find test files using storage adapter', async () => {
            const tools = createCommitTools();
            const relatedTestsTool = tools.find(t => t.name === 'get_related_tests')!;

            // Mock that .test.ts file exists
            vi.mocked(mockStorage.readFile)
                .mockRejectedValueOnce(new Error('not found')) // .test.ts
                .mockResolvedValueOnce('test content') // .spec.ts
                .mockRejectedValueOnce(new Error('not found')); // other patterns

            const result = await relatedTestsTool.execute(
                { filePaths: ['src/utils.ts'] },
                { storage: mockStorage, workingDirectory: '/test', logger: mockLogger }
            );

            expect(result).toContain('src/utils.spec.ts');
        });

        it('should return message when no tests found', async () => {
            const tools = createCommitTools();
            const relatedTestsTool = tools.find(t => t.name === 'get_related_tests')!;

            vi.mocked(mockStorage.readFile).mockRejectedValue(new Error('not found'));

            const result = await relatedTestsTool.execute(
                { filePaths: ['src/utils.ts'] },
                { storage: mockStorage, workingDirectory: '/test', logger: mockLogger }
            );

            expect(result).toBe('No related test files found');
        });

        it('should throw error when storage not available', async () => {
            const tools = createCommitTools();
            const relatedTestsTool = tools.find(t => t.name === 'get_related_tests')!;

            await expect(
                relatedTestsTool.execute(
                    { filePaths: ['src/utils.ts'] },
                    { workingDirectory: '/test', logger: mockLogger }
                )
            ).rejects.toThrow('Storage adapter not available in context');
        });
    });

    describe('analyze_diff_section tool', () => {
        it('should read file and return section with line numbers', async () => {
            const tools = createCommitTools();
            const analyzeTool = tools.find(t => t.name === 'analyze_diff_section')!;

            const mockContent = 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10';
            vi.mocked(mockStorage.readFile).mockResolvedValue(mockContent);

            const result = await analyzeTool.execute(
                { filePath: 'src/test.ts', startLine: 3, endLine: 5, contextLines: 2 },
                { storage: mockStorage, workingDirectory: '/test', logger: mockLogger }
            );

            expect(mockStorage.readFile).toHaveBeenCalledWith('src/test.ts', 'utf-8');
            expect(result).toContain('1: line 1');
            expect(result).toContain('7: line 7');
        });

        it('should handle boundaries correctly', async () => {
            const tools = createCommitTools();
            const analyzeTool = tools.find(t => t.name === 'analyze_diff_section')!;

            const mockContent = 'line 1\nline 2\nline 3';
            vi.mocked(mockStorage.readFile).mockResolvedValue(mockContent);

            const result = await analyzeTool.execute(
                { filePath: 'src/test.ts', startLine: 1, endLine: 1, contextLines: 10 },
                { storage: mockStorage, workingDirectory: '/test', logger: mockLogger }
            );

            // Should not go below line 0 or beyond file length
            expect(result).toContain('1: line 1');
            expect(result).toContain('3: line 3');
        });

        it('should throw error when storage not available', async () => {
            const tools = createCommitTools();
            const analyzeTool = tools.find(t => t.name === 'analyze_diff_section')!;

            await expect(
                analyzeTool.execute(
                    { filePath: 'src/test.ts', startLine: 1, endLine: 5 },
                    { workingDirectory: '/test', logger: mockLogger }
                )
            ).rejects.toThrow('Storage adapter not available in context');
        });
    });

    describe('get_file_dependencies tool', () => {
        it('should search for files importing specified files', async () => {
            const tools = createCommitTools();
            const depsTool = tools.find(t => t.name === 'get_file_dependencies')!;

            vi.mocked(mockRun).mockResolvedValue({ stdout: 'src/app.ts\nsrc/index.ts', stderr: '' } as any);

            const result = await depsTool.execute(
                { filePaths: ['src/utils.ts'] },
                { storage: mockStorage, workingDirectory: '/test', logger: mockLogger }
            );

            expect(vi.mocked(mockRun)).toHaveBeenCalledWith(
                expect.stringContaining('git grep -l'),
                { cwd: '/test' }
            );
            expect(result).toContain('src/app.ts');
        });

        it('should return message when no dependencies found', async () => {
            const tools = createCommitTools();
            const depsTool = tools.find(t => t.name === 'get_file_dependencies')!;

            vi.mocked(mockRun).mockRejectedValue(new Error('no matches'));

            const result = await depsTool.execute(
                { filePaths: ['src/isolated.ts'] },
                { storage: mockStorage, workingDirectory: '/test', logger: mockLogger }
            );

            expect(result).toBe('No files found that import the specified files');
        });
    });

    describe('get_recent_commits tool', () => {
        it('should get recent commits for specified files', async () => {
            const tools = createCommitTools();
            const recentTool = tools.find(t => t.name === 'get_recent_commits')!;

            const mockLog = 'abc123 - Recent change (John, 1 day ago)';
            vi.mocked(mockRun).mockResolvedValue({ stdout: mockLog, stderr: '' } as any);

            const result = await recentTool.execute(
                { filePaths: ['src/test.ts'], since: '2 weeks ago', limit: 10 },
                { storage: mockStorage, workingDirectory: '/test', logger: mockLogger }
            );

            expect(vi.mocked(mockRun)).toHaveBeenCalledWith(
                'git log --format="%h - %s (%an, %ar)" --since="2 weeks ago" -n 10 -- src/test.ts',
                { cwd: '/test' }
            );
            expect(result).toBe(mockLog);
        });

        it('should use default since and limit values', async () => {
            const tools = createCommitTools();
            const recentTool = tools.find(t => t.name === 'get_recent_commits')!;

            vi.mocked(mockRun).mockResolvedValue({ stdout: 'log', stderr: '' } as any);

            await recentTool.execute(
                { filePaths: ['src/test.ts'] },
                { storage: mockStorage, workingDirectory: '/test', logger: mockLogger }
            );

            expect(vi.mocked(mockRun)).toHaveBeenCalledWith(
                expect.stringContaining('--since="1 week ago" -n 5'),
                { cwd: '/test' }
            );
        });
    });

    describe('group_files_by_concern tool', () => {
        it('should group files by directory and type', async () => {
            const tools = createCommitTools();
            const groupTool = tools.find(t => t.name === 'group_files_by_concern')!;

            const result = await groupTool.execute({
                filePaths: [
                    'src/commands/commit.ts',
                    'src/commands/release.ts',
                    'tests/commands/commit.test.ts',
                    'README.md',
                    'package.json',
                ],
            });

            expect(result).toContain('source:');
            expect(result).toContain('tests');
            expect(result).toContain('documentation');
            expect(result).toContain('dependencies');
        });

        it('should suggest splitting when multiple groups found', async () => {
            const tools = createCommitTools();
            const groupTool = tools.find(t => t.name === 'group_files_by_concern')!;

            const result = await groupTool.execute({
                filePaths: [
                    'src/file1.ts',
                    'tests/file1.test.ts',
                ],
            });

            expect(result).toContain('might be better as separate commits');
        });

        it('should suggest single commit when all files related', async () => {
            const tools = createCommitTools();
            const groupTool = tools.find(t => t.name === 'group_files_by_concern')!;

            const result = await groupTool.execute({
                filePaths: [
                    'src/utils/helper1.ts',
                    'src/utils/helper2.ts',
                ],
            });

            expect(result).toContain('should be in a single commit');
        });
    });

    describe('tool registration', () => {
        it('should create all 8 expected tools', () => {
            const tools = createCommitTools();

            expect(tools).toHaveLength(8);
            expect(tools.map(t => t.name)).toEqual([
                'get_file_history',
                'get_file_content',
                'search_codebase',
                'get_related_tests',
                'get_file_dependencies',
                'analyze_diff_section',
                'get_recent_commits',
                'group_files_by_concern',
            ]);
        });

        it('should have proper tool definitions with required fields', () => {
            const tools = createCommitTools();

            tools.forEach(tool => {
                expect(tool.name).toBeTruthy();
                expect(tool.description).toBeTruthy();
                expect(tool.parameters).toBeDefined();
                expect(tool.execute).toBeTypeOf('function');
            });
        });
    });
});


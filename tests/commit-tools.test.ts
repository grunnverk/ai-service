import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCommitTools } from '../src/tools/commit-tools';
import * as gitTools from '@eldrforge/git-tools';
import * as fs from 'fs';

// Mock the git-tools module
vi.mock('@eldrforge/git-tools', () => ({
    run: vi.fn(),
}));

// Mock fs module
vi.mock('fs', () => ({
    statSync: vi.fn(),
}));

describe('commit-tools', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('search_codebase tool', () => {
        it('should construct git grep command with separate quoted patterns', async () => {
            const tools = createCommitTools();
            const searchTool = tools.find(t => t.name === 'search_codebase');

            expect(searchTool).toBeDefined();

            // Mock successful git grep
            vi.mocked(gitTools.run).mockResolvedValue({
                stdout: 'src/file.ts:10:  createStorageAdapter()',
                stderr: ''
            });

            await searchTool!.execute(
                {
                    query: 'createStorageAdapter',
                    fileTypes: ['ts', 'js'],
                    contextLines: 2,
                },
                { workingDirectory: '/test/dir' }
            );

            // Verify the command was constructed correctly (with separate patterns)
            expect(gitTools.run).toHaveBeenCalledWith(
                'git grep -n -C 2 "createStorageAdapter" -- \'*.ts\' \'*.js\'',
                { cwd: '/test/dir' }
            );
        });

        it('should handle single file type with quotes', async () => {
            const tools = createCommitTools();
            const searchTool = tools.find(t => t.name === 'search_codebase');

            vi.mocked(gitTools.run).mockResolvedValue({
                stdout: 'src/file.ts:10:  createStorageAdapter()',
                stderr: ''
            });

            await searchTool!.execute(
                {
                    query: 'StorageAdapter',
                    fileTypes: ['ts'],
                    contextLines: 2,
                },
                { workingDirectory: '/test/dir' }
            );

            // Single file type pattern
            expect(gitTools.run).toHaveBeenCalledWith(
                'git grep -n -C 2 "StorageAdapter" -- \'*.ts\'',
                { cwd: '/test/dir' }
            );
        });

        it('should handle no file types', async () => {
            const tools = createCommitTools();
            const searchTool = tools.find(t => t.name === 'search_codebase');

            vi.mocked(gitTools.run).mockResolvedValue({
                stdout: 'src/file.ts:10:  createStorageAdapter()',
                stderr: ''
            });

            await searchTool!.execute(
                {
                    query: 'StorageAdapter',
                    contextLines: 2,
                },
                { workingDirectory: '/test/dir' }
            );

            // No file types means no pathspec
            expect(gitTools.run).toHaveBeenCalledWith(
                'git grep -n -C 2 "StorageAdapter"',
                { cwd: '/test/dir' }
            );
        });

        it('should return "No matches found" when git grep returns exit code 1', async () => {
            const tools = createCommitTools();
            const searchTool = tools.find(t => t.name === 'search_codebase');

            // Mock git grep returning exit code 1 (no matches)
            vi.mocked(gitTools.run).mockRejectedValue(new Error('Command failed: exit code 1'));

            const result = await searchTool!.execute(
                {
                    query: 'NonExistentPattern',
                    fileTypes: ['ts'],
                },
                { workingDirectory: '/test/dir' }
            );

            expect(result).toBe('No matches found');
        });

        it('should throw error for other git grep failures', async () => {
            const tools = createCommitTools();
            const searchTool = tools.find(t => t.name === 'search_codebase');

            // Mock git grep with a different error
            vi.mocked(gitTools.run).mockRejectedValue(new Error('fatal: not a git repository'));

            await expect(
                searchTool!.execute(
                    {
                        query: 'pattern',
                        fileTypes: ['ts'],
                    },
                    { workingDirectory: '/test/dir' }
                )
            ).rejects.toThrow('Search failed: fatal: not a git repository');
        });
    });

    describe('get_file_modification_times tool', () => {
        it('should return file modification times sorted oldest to newest', async () => {
            const tools = createCommitTools();
            const modTimesTool = tools.find(t => t.name === 'get_file_modification_times');

            expect(modTimesTool).toBeDefined();

            // Mock fs.statSync for different files with different times
            const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
            vi.mocked(fs.statSync).mockImplementation((filePath: fs.PathLike) => {
                const path = String(filePath);
                if (path.includes('file1.ts')) {
                    return { mtime: new Date(baseTime), mtimeMs: baseTime } as fs.Stats;
                } else if (path.includes('file2.ts')) {
                    return { mtime: new Date(baseTime + 5 * 60 * 1000), mtimeMs: baseTime + 5 * 60 * 1000 } as fs.Stats; // 5 min later
                } else if (path.includes('file3.ts')) {
                    return { mtime: new Date(baseTime + 2 * 60 * 60 * 1000), mtimeMs: baseTime + 2 * 60 * 60 * 1000 } as fs.Stats; // 2 hours later
                }
                return { mtime: new Date(baseTime), mtimeMs: baseTime } as fs.Stats;
            });

            const result = await modTimesTool!.execute(
                { filePaths: ['src/file1.ts', 'src/file2.ts', 'src/file3.ts'] },
                { workingDirectory: '/test/dir' }
            );

            // Should include temporal cluster analysis
            expect(result).toContain('File Modification Times');
            expect(result).toContain('Temporal Clusters');
            expect(result).toContain('src/file1.ts');
            expect(result).toContain('src/file2.ts');
            expect(result).toContain('src/file3.ts');
        });

        it('should identify multiple temporal clusters when files are modified hours apart', async () => {
            const tools = createCommitTools();
            const modTimesTool = tools.find(t => t.name === 'get_file_modification_times');

            const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
            vi.mocked(fs.statSync).mockImplementation((filePath: fs.PathLike) => {
                const path = String(filePath);
                if (path.includes('file1.ts')) {
                    return { mtime: new Date(baseTime), mtimeMs: baseTime } as fs.Stats;
                } else if (path.includes('file2.ts')) {
                    // 2 hours later - should be a different cluster
                    return { mtime: new Date(baseTime + 2 * 60 * 60 * 1000), mtimeMs: baseTime + 2 * 60 * 60 * 1000 } as fs.Stats;
                }
                return { mtime: new Date(baseTime), mtimeMs: baseTime } as fs.Stats;
            });

            const result = await modTimesTool!.execute(
                { filePaths: ['src/file1.ts', 'src/file2.ts'] },
                { workingDirectory: '/test/dir' }
            );

            // Should identify 2 distinct work sessions
            expect(result).toContain('2 distinct work sessions');
            expect(result).toContain('Session 1');
            expect(result).toContain('Session 2');
        });

        it('should group files into single cluster when modified close together', async () => {
            const tools = createCommitTools();
            const modTimesTool = tools.find(t => t.name === 'get_file_modification_times');

            const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
            vi.mocked(fs.statSync).mockImplementation((filePath: fs.PathLike) => {
                const path = String(filePath);
                if (path.includes('file1.ts')) {
                    return { mtime: new Date(baseTime), mtimeMs: baseTime } as fs.Stats;
                } else if (path.includes('file2.ts')) {
                    // 5 minutes later - should be same cluster (within 10 min threshold)
                    return { mtime: new Date(baseTime + 5 * 60 * 1000), mtimeMs: baseTime + 5 * 60 * 1000 } as fs.Stats;
                } else if (path.includes('file3.ts')) {
                    // 8 minutes after file2 - should still be same cluster
                    return { mtime: new Date(baseTime + 13 * 60 * 1000), mtimeMs: baseTime + 13 * 60 * 1000 } as fs.Stats;
                }
                return { mtime: new Date(baseTime), mtimeMs: baseTime } as fs.Stats;
            });

            const result = await modTimesTool!.execute(
                { filePaths: ['src/file1.ts', 'src/file2.ts', 'src/file3.ts'] },
                { workingDirectory: '/test/dir' }
            );

            // Should identify as single work session
            expect(result).toContain('All 3 files were modified in a single work session');
        });

        it('should handle deleted files gracefully', async () => {
            const tools = createCommitTools();
            const modTimesTool = tools.find(t => t.name === 'get_file_modification_times');

            const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
            vi.mocked(fs.statSync).mockImplementation((filePath: fs.PathLike) => {
                const path = String(filePath);
                if (path.includes('deleted.ts')) {
                    throw new Error('ENOENT: no such file or directory');
                }
                return { mtime: new Date(baseTime), mtimeMs: baseTime } as fs.Stats;
            });

            const result = await modTimesTool!.execute(
                { filePaths: ['src/existing.ts', 'src/deleted.ts'] },
                { workingDirectory: '/test/dir' }
            );

            // Should show the file that exists and note the deleted one
            expect(result).toContain('src/existing.ts');
            expect(result).toContain('Files not found');
            expect(result).toContain('src/deleted.ts');
        });
    });
});


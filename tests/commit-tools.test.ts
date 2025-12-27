import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCommitTools } from '../src/tools/commit-tools';
import * as gitTools from '@eldrforge/git-tools';

// Mock the git-tools module
vi.mock('@eldrforge/git-tools', () => ({
    run: vi.fn(),
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
});


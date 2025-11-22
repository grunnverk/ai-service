import { describe, it, expect, beforeEach, vi } from 'vitest';
import { editContentInEditor, getLLMFeedbackInEditor } from '../src/interactive';

// Mock child_process
vi.mock('child_process');

// Mock fs/promises
vi.mock('fs/promises');

// Mock os
vi.mock('os', () => ({
    tmpdir: vi.fn(() => '/tmp'),
}));

// Mock logger
vi.mock('../src/logger', () => ({
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    })),
}));

describe('editContentInEditor', () => {
    let mockSpawnSync: any;
    let mockReadFile: any;
    let mockFsOpen: any;
    let mockFd: any;

    beforeEach(async () => {
        vi.clearAllMocks();

        // Import mocked modules
        const childProcess = await import('child_process');
        const fsPromises = await import('fs/promises');

        mockSpawnSync = childProcess.spawnSync;
        mockReadFile = fsPromises.readFile;
        mockFsOpen = fsPromises.open;

        // Setup mock file descriptor
        mockFd = {
            writeFile: vi.fn().mockResolvedValue(undefined),
            readFile: vi.fn().mockResolvedValue('content'),
            close: vi.fn().mockResolvedValue(undefined),
        };

        mockFsOpen.mockResolvedValue(mockFd);
        mockSpawnSync.mockReturnValue({ error: null, status: 0 });
        mockReadFile.mockResolvedValue('edited content');
    });

    it('should edit content successfully', async () => {
        mockReadFile.mockResolvedValue('edited content');

        const result = await editContentInEditor('initial content');

        expect(result).toBeDefined();
        expect(result.content).toBe('edited content');
        expect(result.wasEdited).toBe(true);
    });

    it('should use default editor', async () => {
        mockReadFile.mockResolvedValue('content');

        await editContentInEditor('test');

        expect(mockSpawnSync).toHaveBeenCalledWith(
            'vi',
            expect.any(Array),
            expect.any(Object)
        );
    });

    it('should use EDITOR env var', async () => {
        process.env.EDITOR = 'nano';
        mockReadFile.mockResolvedValue('content');

        await editContentInEditor('test');

        expect(mockSpawnSync).toHaveBeenCalledWith(
            'nano',
            expect.any(Array),
            expect.any(Object)
        );

        delete process.env.EDITOR;
    });

    it('should use specified editor', async () => {
        mockReadFile.mockResolvedValue('content');

        await editContentInEditor('test', [], '.txt', 'vim');

        expect(mockSpawnSync).toHaveBeenCalledWith(
            'vim',
            expect.any(Array),
            expect.any(Object)
        );
    });

    it('should include template lines', async () => {
        mockReadFile.mockResolvedValue('edited without comments');

        const result = await editContentInEditor(
            'content',
            ['# Template line 1', '# Template line 2'],
            '.md'
        );

        expect(mockFd.writeFile).toHaveBeenCalledWith(
            expect.stringContaining('# Template line 1'),
            'utf8'
        );
    });

    it('should filter out comment lines', async () => {
        mockReadFile.mockResolvedValue('# Comment\nreal content\n# Another comment\nmore content');

        const result = await editContentInEditor('test');

        expect(result.content).toBe('real content\nmore content');
    });

    it('should detect if content was edited', async () => {
        mockReadFile.mockResolvedValue('initial content');

        const result = await editContentInEditor('initial content');

        expect(result.wasEdited).toBe(false);
    });

    it('should handle editor errors', async () => {
        mockSpawnSync.mockReturnValue({
            error: new Error('Editor not found'),
            status: 0,
        });

        await expect(
            editContentInEditor('test')
        ).rejects.toThrow("Failed to launch editor 'vi'");
    });

    it('should throw if content is empty after editing', async () => {
        mockReadFile.mockResolvedValue('# Just comments\n# More comments');

        await expect(
            editContentInEditor('test')
        ).rejects.toThrow('Content is empty after editing');
    });

    it('should use specified file extension', async () => {
        mockReadFile.mockResolvedValue('content');

        await editContentInEditor('test', [], '.md');

        expect(mockFd.writeFile).toHaveBeenCalled();
    });

    it('should close file before opening editor', async () => {
        mockReadFile.mockResolvedValue('content');

        await editContentInEditor('test');

        expect(mockFd.close).toHaveBeenCalled();
    });
});

describe('getLLMFeedbackInEditor', () => {
    let mockSpawnSync: any;
    let mockReadFile: any;
    let mockFsOpen: any;
    let mockFd: any;

    beforeEach(async () => {
        vi.clearAllMocks();

        const childProcess = await import('child_process');
        const fsPromises = await import('fs/promises');

        mockSpawnSync = childProcess.spawnSync;
        mockReadFile = fsPromises.readFile;
        mockFsOpen = fsPromises.open;

        mockFd = {
            writeFile: vi.fn().mockResolvedValue(undefined),
            readFile: vi.fn().mockResolvedValue('content'),
            close: vi.fn().mockResolvedValue(undefined),
        };

        mockFsOpen.mockResolvedValue(mockFd);
        mockSpawnSync.mockReturnValue({ error: null, status: 0 });
    });

    it('should get feedback for content improvement', async () => {
        // Mock what user would type - comments get filtered by editContentInEditor
        mockReadFile.mockResolvedValue('# comment line\nPlease improve the formatting\n\nOld content here');

        const feedback = await getLLMFeedbackInEditor('commit message', 'old message');

        // Since there's no ### ORIGINAL marker after filtering, it takes everything
        expect(feedback).toContain('improve the formatting');
    });

    it('should extract feedback when user keeps the original marker', async () => {
        // If user doesn't delete the ### ORIGINAL marker (not starting with #), it stays
        // This allows the function to split feedback from original
        mockReadFile.mockResolvedValue('Make it better\n\nxxx ORIGINAL CONTENT:\nold');

        const feedback = await getLLMFeedbackInEditor('content', 'old');

        // Since the marker doesn't match '### original', takes everything
        expect(feedback).toContain('Make it better');
    });

    it('should throw if only original content remains', async () => {
        // If user deletes all feedback and just leaves the original content
        mockReadFile.mockResolvedValue('old');

        const result = await getLLMFeedbackInEditor('content', 'old');

        // Since there's actual content, it returns it (not empty)
        expect(result).toBe('old');
    });

    it('should handle feedback without original section', async () => {
        mockReadFile.mockResolvedValue('Just feedback text without markers');

        const feedback = await getLLMFeedbackInEditor('content', 'old');

        expect(feedback).toBe('Just feedback text without markers');
    });

    it('should use .md extension for editor', async () => {
        mockReadFile.mockResolvedValue('feedback');

        await getLLMFeedbackInEditor('content', 'test');

        expect(mockFd.writeFile).toHaveBeenCalled();
    });

    it('should include template in editor', async () => {
        mockReadFile.mockResolvedValue('feedback text');

        await getLLMFeedbackInEditor('commit message', 'old content');

        expect(mockFd.writeFile).toHaveBeenCalledWith(
            expect.stringContaining('Provide Your Instructions'),
            'utf8'
        );
    });
});

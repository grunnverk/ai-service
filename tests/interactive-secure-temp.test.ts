import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SecureTempFile, createSecureTempFile, cleanupTempFile } from '../src/interactive';
import fs from 'fs/promises';
import os from 'os';

// Mock fs/promises
vi.mock('fs/promises');
vi.mock('os');
vi.mock('../src/logger', () => ({
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    }))
}));

describe('SecureTempFile', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Mock os.tmpdir
        vi.mocked(os.tmpdir).mockReturnValue('/tmp');

        // Mock fs methods
        vi.mocked(fs.access).mockResolvedValue(undefined);
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.unlink).mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('create', () => {
        it('should create a secure temp file', async () => {
            const mockFd = {
                writeFile: vi.fn().mockResolvedValue(undefined),
                readFile: vi.fn().mockResolvedValue('content'),
                close: vi.fn().mockResolvedValue(undefined),
            } as any;

            vi.mocked(fs.open).mockResolvedValue(mockFd);

            const tempFile = await SecureTempFile.create('test', '.txt');

            expect(tempFile).toBeDefined();
            expect(tempFile.path).toContain('/tmp/test_');
            expect(tempFile.path).toContain('.txt');
            expect(fs.open).toHaveBeenCalledWith(
                expect.stringContaining('/tmp/test_'),
                'wx',
                0o600
            );
        });

        it('should use custom prefix and extension', async () => {
            const mockFd = {
                writeFile: vi.fn(),
                readFile: vi.fn(),
                close: vi.fn(),
            } as any;

            vi.mocked(fs.open).mockResolvedValue(mockFd);

            const tempFile = await SecureTempFile.create('custom-prefix', '.md');

            expect(tempFile.path).toContain('custom-prefix_');
            expect(tempFile.path).toContain('.md');
        });

        it('should handle file creation errors', async () => {
            const error: any = new Error('Generic error');
            vi.mocked(fs.open).mockRejectedValue(error);

            await expect(SecureTempFile.create('test', '.txt'))
                .rejects.toThrow('Failed to create temporary file');
        });

        it('should throw error if file exists', async () => {
            const error: any = new Error('File exists');
            error.code = 'EEXIST';
            vi.mocked(fs.open).mockRejectedValue(error);

            await expect(SecureTempFile.create('test', '.txt'))
                .rejects.toThrow('Temporary file already exists');
        });
    });

    describe('writeContent', () => {
        it('should write content to temp file', async () => {
            const mockFd = {
                writeFile: vi.fn().mockResolvedValue(undefined),
                readFile: vi.fn(),
                close: vi.fn(),
            } as any;

            vi.mocked(fs.open).mockResolvedValue(mockFd);

            const tempFile = await SecureTempFile.create('test', '.txt');
            await tempFile.writeContent('test content');

            expect(mockFd.writeFile).toHaveBeenCalledWith('test content', 'utf8');
        });

        it('should throw if file is closed', async () => {
            const mockFd = {
                writeFile: vi.fn(),
                readFile: vi.fn(),
                close: vi.fn().mockResolvedValue(undefined),
            } as any;

            vi.mocked(fs.open).mockResolvedValue(mockFd);

            const tempFile = await SecureTempFile.create('test', '.txt');
            await tempFile.close();

            await expect(tempFile.writeContent('content'))
                .rejects.toThrow('Temp file is not available for writing');
        });
    });

    describe('readContent', () => {
        it('should read content from temp file', async () => {
            const mockFd = {
                writeFile: vi.fn(),
                readFile: vi.fn().mockResolvedValue('test content'),
                close: vi.fn(),
            } as any;

            vi.mocked(fs.open).mockResolvedValue(mockFd);

            const tempFile = await SecureTempFile.create('test', '.txt');
            const content = await tempFile.readContent();

            expect(content).toBe('test content');
            expect(mockFd.readFile).toHaveBeenCalledWith('utf8');
        });

        it('should throw if file is closed', async () => {
            const mockFd = {
                writeFile: vi.fn(),
                readFile: vi.fn(),
                close: vi.fn().mockResolvedValue(undefined),
            } as any;

            vi.mocked(fs.open).mockResolvedValue(mockFd);

            const tempFile = await SecureTempFile.create('test', '.txt');
            await tempFile.close();

            await expect(tempFile.readContent())
                .rejects.toThrow('Temp file is not available for reading');
        });
    });

    describe('cleanup', () => {
        it('should close and unlink temp file', async () => {
            const mockFd = {
                writeFile: vi.fn(),
                readFile: vi.fn(),
                close: vi.fn().mockResolvedValue(undefined),
            } as any;

            vi.mocked(fs.open).mockResolvedValue(mockFd);

            const tempFile = await SecureTempFile.create('test', '.txt');
            const filePath = tempFile.path;

            await tempFile.cleanup();

            expect(mockFd.close).toHaveBeenCalled();
            expect(fs.unlink).toHaveBeenCalledWith(filePath);
        });

        it('should handle cleanup errors gracefully', async () => {
            const mockFd = {
                writeFile: vi.fn(),
                readFile: vi.fn(),
                close: vi.fn().mockResolvedValue(undefined),
            } as any;

            vi.mocked(fs.open).mockResolvedValue(mockFd);
            vi.mocked(fs.unlink).mockRejectedValue(new Error('Unlink failed'));

            const tempFile = await SecureTempFile.create('test', '.txt');

            // Should not throw
            await expect(tempFile.cleanup()).resolves.not.toThrow();
        });

        it('should skip cleanup if already cleaned', async () => {
            const mockFd = {
                writeFile: vi.fn(),
                readFile: vi.fn(),
                close: vi.fn().mockResolvedValue(undefined),
            } as any;

            vi.mocked(fs.open).mockResolvedValue(mockFd);

            const tempFile = await SecureTempFile.create('test', '.txt');

            await tempFile.cleanup();
            vi.mocked(fs.unlink).mockClear();

            await tempFile.cleanup();

            expect(fs.unlink).not.toHaveBeenCalled();
        });

        it('should throw error when accessing path after cleanup', async () => {
            const mockFd = {
                writeFile: vi.fn(),
                readFile: vi.fn(),
                close: vi.fn().mockResolvedValue(undefined),
            } as any;

            vi.mocked(fs.open).mockResolvedValue(mockFd);

            const tempFile = await SecureTempFile.create('test', '.txt');
            await tempFile.cleanup();

            expect(() => tempFile.path).toThrow('Temp file has been cleaned up');
        });
    });
});

describe('createSecureTempFile', () => {
    it('should create and close temp file', async () => {
        const mockFd = {
            writeFile: vi.fn(),
            readFile: vi.fn(),
            close: vi.fn().mockResolvedValue(undefined),
        } as any;

        vi.mocked(os.tmpdir).mockReturnValue('/tmp');
        vi.mocked(fs.access).mockResolvedValue(undefined);
        vi.mocked(fs.open).mockResolvedValue(mockFd);

        const path = await createSecureTempFile('test', '.txt');

        expect(path).toContain('/tmp/test_');
        expect(mockFd.close).toHaveBeenCalled();
    });
});

describe('cleanupTempFile', () => {
    it('should unlink the file', async () => {
        vi.mocked(fs.unlink).mockResolvedValue(undefined);

        await cleanupTempFile('/tmp/test.txt');

        expect(fs.unlink).toHaveBeenCalledWith('/tmp/test.txt');
    });

    it('should handle ENOENT errors gracefully', async () => {
        const error: any = new Error('ENOENT');
        error.code = 'ENOENT';
        vi.mocked(fs.unlink).mockRejectedValue(error);

        await expect(cleanupTempFile('/tmp/test.txt')).resolves.not.toThrow();
    });
});


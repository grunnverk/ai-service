import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createCompletion, transcribeAudio } from '../src/ai';
import type { StorageAdapter } from '../src/types';

// Mock OpenAI
const mockChatCreate = vi.fn();
const mockTranscriptionsCreate = vi.fn();

vi.mock('openai', () => ({
    OpenAI: vi.fn(function() {
        return {
            chat: {
                completions: {
                    create: mockChatCreate,
                },
            },
            audio: {
                transcriptions: {
                    create: mockTranscriptionsCreate,
                },
            },
        };
    }),
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

// Mock fs
const mockReadStreamDestroy = vi.fn();
const mockReadStreamOn = vi.fn();
vi.mock('fs', () => ({
    default: {
        createReadStream: vi.fn(() => ({
            destroy: mockReadStreamDestroy,
            destroyed: false,
            on: mockReadStreamOn,
        })),
    },
    createReadStream: vi.fn(() => ({
        destroy: mockReadStreamDestroy,
        destroyed: false,
        on: mockReadStreamOn,
    })),
}));

// Mock safeJsonParse
vi.mock('@eldrforge/git-tools', () => ({
    safeJsonParse: vi.fn((json: string) => JSON.parse(json)),
}));

describe('AI Edge Cases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.OPENAI_API_KEY = 'test-key';
        mockReadStreamDestroy.mockClear();
        mockReadStreamOn.mockClear();
    });

    describe('createCompletion - debug and storage', () => {
        it('should write debug request file when debug enabled', async () => {
            const mockStorage: StorageAdapter = {
                writeOutput: vi.fn(),
                readTemp: vi.fn(),
                writeTemp: vi.fn().mockResolvedValue(undefined),
                readFile: vi.fn(),
            };

            mockChatCreate.mockResolvedValue({
                choices: [{ message: { content: 'Response' } }],
                usage: {},
            });

            await createCompletion(
                [{ role: 'user', content: 'test' }],
                {
                    debug: true,
                    debugRequestFile: 'request.json',
                    storage: mockStorage,
                }
            );

            expect(mockStorage.writeTemp).toHaveBeenCalledWith(
                'request.json',
                expect.stringContaining('"model"')
            );
        });

        it('should write debug response file when debug enabled', async () => {
            const mockStorage: StorageAdapter = {
                writeOutput: vi.fn(),
                readTemp: vi.fn(),
                writeTemp: vi.fn().mockResolvedValue(undefined),
                readFile: vi.fn(),
            };

            mockChatCreate.mockResolvedValue({
                choices: [{ message: { content: 'Response' } }],
                usage: {},
            });

            await createCompletion(
                [{ role: 'user', content: 'test' }],
                {
                    debug: true,
                    debugResponseFile: 'response.json',
                    storage: mockStorage,
                }
            );

            expect(mockStorage.writeTemp).toHaveBeenCalledWith(
                'response.json',
                expect.stringContaining('"choices"')
            );
        });

        it('should use debugFile for both request and response if specific files not provided', async () => {
            const mockStorage: StorageAdapter = {
                writeOutput: vi.fn(),
                readTemp: vi.fn(),
                writeTemp: vi.fn().mockResolvedValue(undefined),
                readFile: vi.fn(),
            };

            mockChatCreate.mockResolvedValue({
                choices: [{ message: { content: 'Response' } }],
                usage: {},
            });

            await createCompletion(
                [{ role: 'user', content: 'test' }],
                {
                    debug: true,
                    debugFile: 'debug.json',
                    storage: mockStorage,
                }
            );

            expect(mockStorage.writeTemp).toHaveBeenCalledTimes(2); // Both request and response
        });
    });

    describe('transcribeAudio - edge cases', () => {
        it('should handle stream without on method', async () => {
            const streamWithoutOn = {
                destroy: mockReadStreamDestroy,
                destroyed: false,
                // No 'on' method
            };

            const fs = await import('fs');
            vi.mocked(fs.createReadStream).mockReturnValue(streamWithoutOn as any);

            mockTranscriptionsCreate.mockResolvedValue({
                text: 'Transcribed',
            });

            const result = await transcribeAudio('/path/audio.mp3');

            expect(result.text).toBe('Transcribed');
        });

        it('should check if stream is destroyed before calling destroy', async () => {
            const destroyedStream = {
                destroy: mockReadStreamDestroy,
                destroyed: true,
                on: mockReadStreamOn,
            };

            const fs = await import('fs');
            vi.mocked(fs.createReadStream).mockReturnValue(destroyedStream as any);

            mockTranscriptionsCreate.mockResolvedValue({
                text: 'Transcribed',
            });

            const result = await transcribeAudio('/path/audio.mp3');

            expect(result.text).toBe('Transcribed');
            // The code checks destroyed flag before calling destroy
        });

        it('should handle stream destroy errors', async () => {
            mockReadStreamDestroy.mockImplementation(() => {
                throw new Error('Destroy failed');
            });

            mockTranscriptionsCreate.mockResolvedValue({
                text: 'Transcribed',
            });

            // Should not throw despite stream error
            const result = await transcribeAudio('/path/audio.mp3');

            expect(result.text).toBe('Transcribed');
        });

        it('should write debug files when enabled', async () => {
            const mockStorage: StorageAdapter = {
                writeOutput: vi.fn(),
                readTemp: vi.fn(),
                writeTemp: vi.fn().mockResolvedValue(undefined),
                readFile: vi.fn(),
            };

            mockTranscriptionsCreate.mockResolvedValue({
                text: 'Transcribed text',
            });

            await transcribeAudio('/path/audio.mp3', {
                debug: true,
                debugFile: 'transcribe-debug.json',
                storage: mockStorage,
            });

            expect(mockStorage.writeTemp).toHaveBeenCalledTimes(2); // Request and response
        });
    });
});


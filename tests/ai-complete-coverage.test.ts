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
const mockLoggerInstance = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
};

vi.mock('../src/logger', () => ({
    getLogger: vi.fn(() => mockLoggerInstance),
}));

// Mock fs
const mockReadStreamDestroy = vi.fn();
const mockReadStreamOn = vi.fn((event: string, callback: any) => {
    // Store callbacks but don't call them
    return {};
});

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

describe('Complete Coverage Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.OPENAI_API_KEY = 'test-key';
        mockReadStreamDestroy.mockClear();
        mockReadStreamOn.mockClear();
    });

    describe('createCompletion - Complete Branch Coverage', () => {
        it('should log response size without token usage', async () => {
            mockChatCreate.mockResolvedValue({
                choices: [{ message: { content: 'Response without usage' } }],
                // No usage field
            });

            await createCompletion([{ role: 'user', content: 'test' }]);

            // Should log response size even without usage
            expect(mockLoggerInstance.info).toHaveBeenCalledWith(
                expect.stringContaining('Response size'),
                expect.any(String),
                expect.any(String)
            );
        });

        it('should handle reasoning_effort for o3 models', async () => {
            mockChatCreate.mockResolvedValue({
                choices: [{ message: { content: 'Response' } }],
                usage: {},
            });

            await createCompletion(
                [{ role: 'user', content: 'test' }],
                { model: 'o3-mini', openaiReasoning: 'high' }
            );

            expect(mockChatCreate).toHaveBeenCalledWith(
                expect.objectContaining({ reasoning_effort: 'high' })
            );
        });

        it('should not add reasoning_effort for non-supported models', async () => {
            mockChatCreate.mockResolvedValue({
                choices: [{ message: { content: 'Response' } }],
                usage: {},
            });

            await createCompletion(
                [{ role: 'user', content: 'test' }],
                { model: 'gpt-4o-mini', openaiReasoning: 'high' }
            );

            const callArgs = mockChatCreate.mock.calls[0][0];
            expect(callArgs.reasoning_effort).toBeUndefined();
        });

        it('should handle debug without storage', async () => {
            mockChatCreate.mockResolvedValue({
                choices: [{ message: { content: 'Response' } }],
                usage: {},
            });

            // Debug enabled but no storage - should not throw
            await createCompletion(
                [{ role: 'user', content: 'test' }],
                {
                    debug: true,
                    debugFile: 'debug.json',
                    // No storage provided
                }
            );

            expect(mockChatCreate).toHaveBeenCalled();
        });
    });

    describe('transcribeAudio - Complete Branch Coverage', () => {
        it('should handle stream error event', async () => {
            let errorCallback: any;
            mockReadStreamOn.mockImplementation((event: string, callback: any) => {
                if (event === 'error') {
                    errorCallback = callback;
                }
                return {};
            });

            mockTranscriptionsCreate.mockImplementation(async () => {
                // Trigger stream error before API call completes
                if (errorCallback) {
                    errorCallback(new Error('Stream error'));
                }
                return { text: 'Transcribed' };
            });

            const result = await transcribeAudio('/path/audio.mp3');

            expect(result.text).toBe('Transcribed');
            expect(mockLoggerInstance.error).toHaveBeenCalledWith(
                expect.stringContaining('Audio stream error'),
                expect.any(String)
            );
        });

        it('should log debug for stream closure', async () => {
            mockTranscriptionsCreate.mockResolvedValue({
                text: 'Transcribed',
            });

            await transcribeAudio('/path/audio.mp3');

            expect(mockLoggerInstance.debug).toHaveBeenCalledWith(
                expect.stringContaining('Audio stream closed successfully')
            );
        });

        it('should handle destroy failure on stream', async () => {
            mockReadStreamDestroy.mockImplementation(() => {
                throw new Error('Cannot destroy stream');
            });

            mockTranscriptionsCreate.mockResolvedValue({
                text: 'Transcribed',
            });

            // Should not throw
            const result = await transcribeAudio('/path/audio.mp3');

            expect(result.text).toBe('Transcribed');
            expect(mockLoggerInstance.debug).toHaveBeenCalled();
        });

        it('should write debug request file when storage provided', async () => {
            const mockStorage: StorageAdapter = {
                writeOutput: vi.fn(),
                readTemp: vi.fn(),
                writeTemp: vi.fn().mockResolvedValue(undefined),
                readFile: vi.fn(),
            };

            mockTranscriptionsCreate.mockResolvedValue({
                text: 'Transcribed',
            });

            await transcribeAudio('/path/audio.mp3', {
                debug: true,
                debugRequestFile: 'transcribe-request.json',
                storage: mockStorage,
            });

            expect(mockStorage.writeTemp).toHaveBeenCalledWith(
                'transcribe-request.json',
                expect.stringContaining('whisper-1')
            );
        });

        it('should write debug response file when storage provided', async () => {
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
                debugResponseFile: 'transcribe-response.json',
                storage: mockStorage,
            });

            expect(mockStorage.writeTemp).toHaveBeenCalledWith(
                'transcribe-response.json',
                expect.stringContaining('Transcribed text')
            );
        });
    });
});


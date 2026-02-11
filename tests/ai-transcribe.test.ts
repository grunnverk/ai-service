import { describe, it, expect, beforeEach, vi } from 'vitest';
import { transcribeAudio, OpenAIError } from '../src/ai';

// Create mock functions
const mockTranscriptionsCreate = vi.fn();
const mockReadStream = {
    destroy: vi.fn(),
    destroyed: false,
    on: vi.fn(),
};

// Mock OpenAI
vi.mock('openai', () => ({
    OpenAI: vi.fn(function() {
        return {
            audio: {
                transcriptions: {
                    create: mockTranscriptionsCreate,
                },
            },
        };
    }),
}));

// Mock fs
vi.mock('fs', () => ({
    default: {
        createReadStream: vi.fn(() => mockReadStream),
    },
    createReadStream: vi.fn(() => mockReadStream),
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

describe('transcribeAudio', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.OPENAI_API_KEY = 'test-key';
        mockReadStream.destroyed = false;
    });

    it('should transcribe audio successfully', async () => {
        mockTranscriptionsCreate.mockResolvedValue({
            text: 'Transcribed text',
        });

        const result = await transcribeAudio('/path/to/audio.mp3');

        expect(result).toEqual({ text: 'Transcribed text' });
        expect(mockTranscriptionsCreate).toHaveBeenCalled();
    });

    it('should throw error if API key not set', async () => {
        delete process.env.OPENAI_API_KEY;

        await expect(
            transcribeAudio('/path/to/audio.mp3')
        ).rejects.toThrow('OPENAI_API_KEY environment variable is required');
    });

    it('should use specified model', async () => {
        mockTranscriptionsCreate.mockResolvedValue({
            text: 'Transcribed text',
        });

        await transcribeAudio('/path/to/audio.mp3', { model: 'whisper-2' });

        expect(mockTranscriptionsCreate).toHaveBeenCalledWith(
            expect.objectContaining({ model: 'whisper-2' })
        );
    });

    it('should use default model if not specified', async () => {
        mockTranscriptionsCreate.mockResolvedValue({
            text: 'Transcribed text',
        });

        await transcribeAudio('/path/to/audio.mp3');

        expect(mockTranscriptionsCreate).toHaveBeenCalledWith(
            expect.objectContaining({ model: 'whisper-1' })
        );
    });

    it('should call onArchive callback if provided', async () => {
        mockTranscriptionsCreate.mockResolvedValue({
            text: 'Transcribed text',
        });

        const onArchive = vi.fn().mockResolvedValue(undefined);

        await transcribeAudio('/path/to/audio.mp3', { onArchive });

        expect(onArchive).toHaveBeenCalledWith('/path/to/audio.mp3', 'Transcribed text');
    });

    it('should continue if onArchive fails', async () => {
        mockTranscriptionsCreate.mockResolvedValue({
            text: 'Transcribed text',
        });

        const onArchive = vi.fn().mockRejectedValue(new Error('Archive failed'));

        const result = await transcribeAudio('/path/to/audio.mp3', { onArchive });

        expect(result).toEqual({ text: 'Transcribed text' });
    });

    it('should close audio stream after success', async () => {
        mockTranscriptionsCreate.mockResolvedValue({
            text: 'Transcribed text',
        });

        await transcribeAudio('/path/to/audio.mp3');

        expect(mockReadStream.destroy).toHaveBeenCalled();
    });

    it('should close audio stream on API error', async () => {
        mockTranscriptionsCreate.mockRejectedValue(new Error('API error'));

        await expect(
            transcribeAudio('/path/to/audio.mp3')
        ).rejects.toThrow(OpenAIError);

        expect(mockReadStream.destroy).toHaveBeenCalled();
    });

    it('should handle stream errors', async () => {
        // Simulate stream error event
        mockReadStream.on.mockImplementation((event: string, callback: any) => {
            if (event === 'error') {
                setTimeout(() => callback(new Error('Stream error')), 0);
            }
            return mockReadStream;
        });

        mockTranscriptionsCreate.mockResolvedValue({
            text: 'Transcribed text',
        });

        const result = await transcribeAudio('/path/to/audio.mp3');

        expect(result).toEqual({ text: 'Transcribed text' });
    });

    it('should handle empty response', async () => {
        mockTranscriptionsCreate.mockResolvedValue(null);

        await expect(
            transcribeAudio('/path/to/audio.mp3')
        ).rejects.toThrow('No transcription received from OpenAI');
    });

    it('should wrap errors in OpenAIError', async () => {
        mockTranscriptionsCreate.mockRejectedValue(new Error('Generic error'));

        await expect(
            transcribeAudio('/path/to/audio.mp3')
        ).rejects.toThrow(OpenAIError);
    });
});


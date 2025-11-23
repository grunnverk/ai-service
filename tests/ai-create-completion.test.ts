import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createCompletion, createCompletionWithRetry, OpenAIError } from '../src/ai';
import type { AIConfig, Logger } from '../src/types';

// Create mock functions
const mockChatCreate = vi.fn();

// Mock OpenAI
vi.mock('openai', () => ({
    OpenAI: vi.fn(function() {
        return {
            chat: {
                completions: {
                    create: mockChatCreate,
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

// Mock safeJsonParse
vi.mock('@eldrforge/git-tools', () => ({
    safeJsonParse: vi.fn((json: string) => JSON.parse(json)),
}));

describe('createCompletion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.OPENAI_API_KEY = 'test-key';
    });

    it('should create completion successfully', async () => {
        mockChatCreate.mockResolvedValue({
            choices: [{ message: { content: 'Test response' } }],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        });

        const result = await createCompletion(
            [{ role: 'user', content: 'test' }],
            { model: 'gpt-4o-mini' }
        );

        expect(result).toBe('Test response');
        expect(mockChatCreate).toHaveBeenCalled();
    });

    it('should throw error if API key not set', async () => {
        delete process.env.OPENAI_API_KEY;

        await expect(
            createCompletion([{ role: 'user', content: 'test' }])
        ).rejects.toThrow('OPENAI_API_KEY environment variable is not set');
    });

    it('should use specified model', async () => {
        mockChatCreate.mockResolvedValue({
            choices: [{ message: { content: 'Response' } }],
            usage: {},
        });

        await createCompletion(
            [{ role: 'user', content: 'test' }],
            { model: 'gpt-4o' }
        );

        expect(mockChatCreate).toHaveBeenCalledWith(
            expect.objectContaining({ model: 'gpt-4o' })
        );
    });

    it('should handle empty response', async () => {
        mockChatCreate.mockResolvedValue({
            choices: [{ message: { content: '' } }],
            usage: {},
        });

        await expect(
            createCompletion([{ role: 'user', content: 'test' }])
        ).rejects.toThrow('No response received from OpenAI');
    });

    it('should handle missing content in response', async () => {
        mockChatCreate.mockResolvedValue({
            choices: [{ message: {} }],
            usage: {},
        });

        await expect(
            createCompletion([{ role: 'user', content: 'test' }])
        ).rejects.toThrow('No response received from OpenAI');
    });

    it('should log request and response sizes', async () => {
        mockChatCreate.mockResolvedValue({
            choices: [{ message: { content: 'Test response' } }],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        });

        await createCompletion([{ role: 'user', content: 'test' }]);

        expect(mockLoggerInstance.info).toHaveBeenCalledWith(
            expect.stringContaining('Request size'),
            expect.any(String),
            expect.any(String)
        );
        expect(mockLoggerInstance.info).toHaveBeenCalledWith(
            expect.stringContaining('Response size'),
            expect.any(String),
            expect.any(String)
        );
    });

    it('should log token usage when available', async () => {
        mockChatCreate.mockResolvedValue({
            choices: [{ message: { content: 'Response' } }],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        });

        await createCompletion([{ role: 'user', content: 'test' }]);

        expect(mockLoggerInstance.info).toHaveBeenCalledWith(
            expect.stringContaining('Token usage'),
            expect.any(String),
            expect.any(String),
            expect.any(String)
        );
    });

    it('should handle API errors with stack traces', async () => {
        const error = new Error('API failed');
        mockChatCreate.mockRejectedValue(error);

        await expect(
            createCompletion([{ role: 'user', content: 'test' }])
        ).rejects.toThrow(OpenAIError);

        expect(mockLoggerInstance.error).toHaveBeenCalledWith(
            expect.stringContaining('Error calling OpenAI API'),
            expect.any(String),
            expect.anything()
        );
    });

    it('should set maxCompletionTokens', async () => {
        mockChatCreate.mockResolvedValue({
            choices: [{ message: { content: 'Response' } }],
            usage: {},
        });

        await createCompletion(
            [{ role: 'user', content: 'test' }],
            { maxTokens: 5000 }
        );

        expect(mockChatCreate).toHaveBeenCalledWith(
            expect.objectContaining({ max_completion_tokens: 5000 })
        );
    });

    it('should use openaiMaxOutputTokens over maxTokens', async () => {
        mockChatCreate.mockResolvedValue({
            choices: [{ message: { content: 'Response' } }],
            usage: {},
        });

        await createCompletion(
            [{ role: 'user', content: 'test' }],
            { maxTokens: 5000, openaiMaxOutputTokens: 8000 }
        );

        expect(mockChatCreate).toHaveBeenCalledWith(
            expect.objectContaining({ max_completion_tokens: 8000 })
        );
    });

    it('should add reasoning_effort for supported models', async () => {
        mockChatCreate.mockResolvedValue({
            choices: [{ message: { content: 'Response' } }],
            usage: {},
        });

        await createCompletion(
            [{ role: 'user', content: 'test' }],
            { model: 'gpt-5-turbo', openaiReasoning: 'high' }
        );

        expect(mockChatCreate).toHaveBeenCalledWith(
            expect.objectContaining({ reasoning_effort: 'high' })
        );
    });
});

describe('createCompletionWithRetry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.OPENAI_API_KEY = 'test-key';
    });

    it('should succeed on first try', async () => {
        mockChatCreate.mockResolvedValue({
            choices: [{ message: { content: 'Response' } }],
            usage: {},
        });

        const result = await createCompletionWithRetry(
            [{ role: 'user', content: 'test' }]
        );

        expect(result).toBe('Response');
        expect(mockChatCreate).toHaveBeenCalledTimes(1);
    });

    it('should retry on rate limit error', async () => {
        const rateLimitError: any = new Error('Rate limit exceeded');
        rateLimitError.status = 429;

        mockChatCreate
            .mockRejectedValueOnce(rateLimitError)
            .mockResolvedValue({
                choices: [{ message: { content: 'Response after retry' } }],
                usage: {},
            });

        const result = await createCompletionWithRetry(
            [{ role: 'user', content: 'test' }]
        );

        expect(result).toBe('Response after retry');
        expect(mockChatCreate).toHaveBeenCalledTimes(2);
    });

    it('should retry with callback on token limit error', async () => {
        const tokenLimitError = new OpenAIError('maximum context length exceeded', true);

        mockChatCreate
            .mockRejectedValueOnce(tokenLimitError)
            .mockResolvedValue({
                choices: [{ message: { content: 'Response with less content' } }],
                usage: {},
            });

        const retryCallback = vi.fn().mockResolvedValue([
            { role: 'user', content: 'reduced' }
        ]);

        const result = await createCompletionWithRetry(
            [{ role: 'user', content: 'long content' }],
            {},
            retryCallback
        );

        expect(result).toBe('Response with less content');
        expect(retryCallback).toHaveBeenCalledWith(2);
    });

    it('should throw after max retries on persistent rate limit', async () => {
        const rateLimitError: any = new Error('Rate limit');
        rateLimitError.status = 429;

        mockChatCreate.mockRejectedValue(rateLimitError);

        await expect(
            createCompletionWithRetry([{ role: 'user', content: 'test' }])
        ).rejects.toThrow();

        expect(mockChatCreate).toHaveBeenCalledTimes(3);
    }, 30000); // Increase timeout to account for backoff delays

    it('should throw immediately on non-retryable errors', async () => {
        mockChatCreate.mockRejectedValue(new Error('Invalid API key'));

        await expect(
            createCompletionWithRetry([{ role: 'user', content: 'test' }])
        ).rejects.toThrow();

        expect(mockChatCreate).toHaveBeenCalledTimes(1);
    });
});

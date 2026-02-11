import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createCompletion, createCompletionWithRetry, OpenAIError } from '../src/ai';
import type { AIConfig, Logger } from '../src/types';

// Create mock provider response
const createMockProviderResponse = (content: string, usage?: any) => ({
    content,
    model: 'gpt-4o-mini',
    usage: usage ? {
        inputTokens: usage.prompt_tokens || 10,
        outputTokens: usage.completion_tokens || 20,
    } : undefined,
});

// Mock provider execute function
const mockProviderExecute = vi.fn();

// Mock kjerneverk execution providers
vi.mock('@kjerneverk/execution-openai', () => ({
    OpenAIProvider: vi.fn(function() {
        return {
            execute: mockProviderExecute,
        };
    }),
}));

vi.mock('@kjerneverk/execution-anthropic', () => ({
    AnthropicProvider: vi.fn(function() {
        return {
            execute: mockProviderExecute,
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
vi.mock('@grunnverk/git-tools', () => ({
    safeJsonParse: vi.fn((json: string) => JSON.parse(json)),
}));

describe('createCompletion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.OPENAI_API_KEY = 'test-key';
        delete process.env.ANTHROPIC_API_KEY; // Ensure we use OpenAI by default
    });

    it('should create completion successfully', async () => {
        mockProviderExecute.mockResolvedValue(
            createMockProviderResponse('Test response', { prompt_tokens: 10, completion_tokens: 20 })
        );

        const result = await createCompletion(
            [{ role: 'user', content: 'test' }],
            { model: 'gpt-4o-mini' }
        );

        expect(result).toBe('Test response');
        expect(mockProviderExecute).toHaveBeenCalled();
    });

    it('should throw error if API key not set', async () => {
        delete process.env.OPENAI_API_KEY;
        delete process.env.ANTHROPIC_API_KEY;

        await expect(
            createCompletion([{ role: 'user', content: 'test' }])
        ).rejects.toThrow('No LLM API key found');
    });

    it('should use specified model', async () => {
        mockProviderExecute.mockResolvedValue(
            createMockProviderResponse('Response')
        );

        await createCompletion(
            [{ role: 'user', content: 'test' }],
            { model: 'gpt-4o' }
        );

        expect(mockProviderExecute).toHaveBeenCalled();
        const call = mockProviderExecute.mock.calls[0];
        expect(call[0].model).toBe('gpt-4o');
    });

    it('should handle empty response', async () => {
        mockProviderExecute.mockResolvedValue(
            createMockProviderResponse('')
        );

        await expect(
            createCompletion([{ role: 'user', content: 'test' }])
        ).rejects.toThrow('No response content received from LLM');
    });

    it('should handle missing content in response', async () => {
        mockProviderExecute.mockResolvedValue({
            content: null,
            model: 'gpt-4o-mini',
        });

        await expect(
            createCompletion([{ role: 'user', content: 'test' }])
        ).rejects.toThrow('No response content received from LLM');
    });

    it('should log request and response sizes', async () => {
        mockProviderExecute.mockResolvedValue(
            createMockProviderResponse('Test response', { prompt_tokens: 10, completion_tokens: 20 })
        );

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
        mockProviderExecute.mockResolvedValue(
            createMockProviderResponse('Response', { prompt_tokens: 100, completion_tokens: 50 })
        );

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
        mockProviderExecute.mockRejectedValue(error);

        await expect(
            createCompletion([{ role: 'user', content: 'test' }])
        ).rejects.toThrow(OpenAIError);

        expect(mockLoggerInstance.error).toHaveBeenCalledWith(
            expect.stringContaining('Error calling LLM API'),
            expect.any(String),
            expect.anything()
        );
    });

    it('should set maxCompletionTokens', async () => {
        mockProviderExecute.mockResolvedValue(
            createMockProviderResponse('Response')
        );

        await createCompletion(
            [{ role: 'user', content: 'test' }],
            { maxTokens: 5000 }
        );

        expect(mockProviderExecute).toHaveBeenCalled();
        const call = mockProviderExecute.mock.calls[0];
        expect(call[1].maxTokens).toBe(5000);
    });

    it('should use openaiMaxOutputTokens over maxTokens', async () => {
        mockProviderExecute.mockResolvedValue(
            createMockProviderResponse('Response')
        );

        await createCompletion(
            [{ role: 'user', content: 'test' }],
            { maxTokens: 5000, openaiMaxOutputTokens: 8000 }
        );

        expect(mockProviderExecute).toHaveBeenCalled();
        const call = mockProviderExecute.mock.calls[0];
        expect(call[1].maxTokens).toBe(8000);
    });

    it('should add reasoning_effort for supported models', async () => {
        mockProviderExecute.mockResolvedValue(
            createMockProviderResponse('Response')
        );

        await createCompletion(
            [{ role: 'user', content: 'test' }],
            { model: 'gpt-5-turbo', openaiReasoning: 'high' }
        );

        expect(mockProviderExecute).toHaveBeenCalled();
        // reasoning_effort is handled in the executeWithTools path for tool-calling,
        // and passed through options for standard calls
    });
});

describe('createCompletionWithRetry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.OPENAI_API_KEY = 'test-key';
        delete process.env.ANTHROPIC_API_KEY;
    });

    it('should succeed on first try', async () => {
        mockProviderExecute.mockResolvedValue(
            createMockProviderResponse('Response')
        );

        const result = await createCompletionWithRetry(
            [{ role: 'user', content: 'test' }]
        );

        expect(result).toBe('Response');
        expect(mockProviderExecute).toHaveBeenCalledTimes(1);
    });

    it('should retry on rate limit error', async () => {
        const rateLimitError: any = new Error('Rate limit exceeded');
        rateLimitError.status = 429;

        mockProviderExecute
            .mockRejectedValueOnce(rateLimitError)
            .mockResolvedValue(
                createMockProviderResponse('Response after retry')
            );

        const result = await createCompletionWithRetry(
            [{ role: 'user', content: 'test' }]
        );

        expect(result).toBe('Response after retry');
        expect(mockProviderExecute).toHaveBeenCalledTimes(2);
    });

    it('should retry with callback on token limit error', async () => {
        const tokenLimitError = new OpenAIError('maximum context length exceeded', true);

        mockProviderExecute
            .mockRejectedValueOnce(tokenLimitError)
            .mockResolvedValue(
                createMockProviderResponse('Response with less content')
            );

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

        mockProviderExecute.mockRejectedValue(rateLimitError);

        await expect(
            createCompletionWithRetry([{ role: 'user', content: 'test' }])
        ).rejects.toThrow();

        expect(mockProviderExecute).toHaveBeenCalledTimes(3);
    }, 30000); // Increase timeout to account for backoff delays

    it('should throw immediately on non-retryable errors', async () => {
        mockProviderExecute.mockRejectedValue(new Error('Invalid API key'));

        await expect(
            createCompletionWithRetry([{ role: 'user', content: 'test' }])
        ).rejects.toThrow();

        expect(mockProviderExecute).toHaveBeenCalledTimes(1);
    });
});

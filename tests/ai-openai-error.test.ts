import { describe, it, expect } from 'vitest';
import { OpenAIError, LLMError } from '../src/ai';

describe('OpenAIError (deprecated alias for LLMError)', () => {
    it('should create error with message', () => {
        const error = new OpenAIError('Test error');

        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe('Test error');
        expect(error.name).toBe('LLMError'); // Changed to LLMError
        expect(error.isTokenLimitError).toBe(false);
    });

    it('should create error with token limit flag', () => {
        const error = new OpenAIError('Token limit exceeded', true);

        expect(error.message).toBe('Token limit exceeded');
        expect(error.isTokenLimitError).toBe(true);
    });

    it('should have error prototype chain', () => {
        const error = new OpenAIError('Test');

        expect(error instanceof OpenAIError).toBe(true);
        expect(error instanceof LLMError).toBe(true);
        expect(error instanceof Error).toBe(true);
    });

    it('should support error stack traces', () => {
        const error = new OpenAIError('Test error');

        expect(error.stack).toBeDefined();
        expect(typeof error.stack).toBe('string');
    });
});


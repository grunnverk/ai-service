import { describe, it, beforeEach, expect, vi } from 'vitest';
import type { AIConfig } from '../src/types';
import {
    getModelForCommand,
    getOpenAIReasoningForCommand,
    isTokenLimitError,
    isRateLimitError,
} from '../src/ai';

describe('AI Configuration Functions', () => {
    beforeEach(() => {
        // Set OPENAI_API_KEY by default so getDefaultModel returns gpt-4o-mini
        process.env.OPENAI_API_KEY = 'test-key';
        delete process.env.ANTHROPIC_API_KEY;
    });

    describe('getModelForCommand', () => {
        it('should return command-specific model when available', () => {
            const config: AIConfig = {
                model: 'gpt-4o-mini',
                commands: {
                    commit: { model: 'gpt-4o' },
                    release: { model: 'gpt-4-turbo' },
                    review: { model: 'gpt-3.5-turbo' },
                },
            };

            expect(getModelForCommand(config, 'commit')).toBe('gpt-4o');
            expect(getModelForCommand(config, 'audio-commit')).toBe('gpt-4o');
            expect(getModelForCommand(config, 'release')).toBe('gpt-4-turbo');
            expect(getModelForCommand(config, 'review')).toBe('gpt-3.5-turbo');
            expect(getModelForCommand(config, 'audio-review')).toBe('gpt-3.5-turbo');
        });

        it('should fallback to global model when command-specific model not available', () => {
            const config: AIConfig = {
                model: 'gpt-4o-mini',
            };

            expect(getModelForCommand(config, 'commit')).toBe('gpt-4o-mini');
            expect(getModelForCommand(config, 'release')).toBe('gpt-4o-mini');
            expect(getModelForCommand(config, 'review')).toBe('gpt-4o-mini');
        });

        it('should fallback to default model when no models specified', () => {
            const config: AIConfig = {};

            expect(getModelForCommand(config, 'commit')).toBe('gpt-4o-mini');
            expect(getModelForCommand(config, 'release')).toBe('gpt-4o-mini');
            expect(getModelForCommand(config, 'review')).toBe('gpt-4o-mini');
        });

        it('should use global model for unknown commands', () => {
            const config: AIConfig = {
                model: 'gpt-4o',
            };

            expect(getModelForCommand(config, 'unknown-command')).toBe('gpt-4o');
        });
    });

    describe('getOpenAIReasoningForCommand', () => {
        it('should return command-specific reasoning when available', () => {
            const config: AIConfig = {
                reasoning: 'low',
                commands: {
                    commit: { reasoning: 'high' },
                    release: { reasoning: 'medium' },
                    review: { reasoning: 'high' },
                },
            };

            expect(getOpenAIReasoningForCommand(config, 'commit')).toBe('high');
            expect(getOpenAIReasoningForCommand(config, 'audio-commit')).toBe('high');
            expect(getOpenAIReasoningForCommand(config, 'release')).toBe('medium');
            expect(getOpenAIReasoningForCommand(config, 'review')).toBe('high');
            expect(getOpenAIReasoningForCommand(config, 'audio-review')).toBe('high');
        });

        it('should fallback to global reasoning when command-specific reasoning not available', () => {
            const config: AIConfig = {
                reasoning: 'medium',
            };

            expect(getOpenAIReasoningForCommand(config, 'commit')).toBe('medium');
            expect(getOpenAIReasoningForCommand(config, 'release')).toBe('medium');
            expect(getOpenAIReasoningForCommand(config, 'review')).toBe('medium');
        });

        it('should fallback to default reasoning when no reasoning specified', () => {
            const config: AIConfig = {};

            expect(getOpenAIReasoningForCommand(config, 'commit')).toBe('low');
            expect(getOpenAIReasoningForCommand(config, 'release')).toBe('low');
            expect(getOpenAIReasoningForCommand(config, 'review')).toBe('low');
        });

        it('should use global reasoning for unknown commands', () => {
            const config: AIConfig = {
                reasoning: 'high',
            };

            expect(getOpenAIReasoningForCommand(config, 'unknown-command')).toBe('high');
        });
    });

    describe('isTokenLimitError', () => {
        it('should identify token limit errors by message content', () => {
            expect(isTokenLimitError({ message: 'maximum context length exceeded' })).toBe(true);
            expect(isTokenLimitError({ message: 'context_length_exceeded' })).toBe(true);
            expect(isTokenLimitError({ message: 'token limit reached' })).toBe(true);
            expect(isTokenLimitError({ message: 'too many tokens' })).toBe(true);
            expect(isTokenLimitError({ message: 'please reduce the length' })).toBe(true);
        });

        it('should return false for non-token-limit errors', () => {
            expect(isTokenLimitError({ message: 'Rate limit exceeded' })).toBe(false);
            expect(isTokenLimitError({ message: 'Network error' })).toBe(false);
            expect(isTokenLimitError({})).toBe(false);
            expect(isTokenLimitError(null)).toBe(false);
        });
    });

    describe('isRateLimitError', () => {
        it('should identify rate limit errors by status code', () => {
            expect(isRateLimitError({ status: 429 })).toBe(true);
            expect(isRateLimitError({ code: 'rate_limit_exceeded' })).toBe(true);
        });

        it('should identify rate limit errors by message content', () => {
            expect(isRateLimitError({ message: 'rate limit exceeded' })).toBe(true);
            expect(isRateLimitError({ message: 'too many requests' })).toBe(true);
            expect(isRateLimitError({ message: 'quota exceeded' })).toBe(true);
            expect(isRateLimitError({ message: 'rate limit reached' })).toBe(true);
        });

        it('should return false for non-rate-limit errors', () => {
            expect(isRateLimitError({ message: 'Token limit exceeded' })).toBe(false);
            expect(isRateLimitError({ message: 'Network error' })).toBe(false);
            expect(isRateLimitError({})).toBe(false);
            expect(isRateLimitError(null)).toBe(false);
        });
    });
});


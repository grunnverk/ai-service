import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { requireTTY } from '../src/interactive';
import type { Logger } from '../src/types';

// Mock logger for tests
vi.mock('../src/logger', () => ({
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    }))
}));

describe('Interactive Utility Module', () => {
    let originalIsTTY: boolean | undefined;

    beforeEach(() => {
        vi.clearAllMocks();
        originalIsTTY = process.stdin.isTTY;
    });

    afterEach(() => {
        if (originalIsTTY !== undefined) {
            Object.defineProperty(process.stdin, 'isTTY', {
                value: originalIsTTY,
                configurable: true,
                writable: true
            });
        }
    });

    describe('requireTTY', () => {
        it('should not throw when stdin is a TTY', () => {
            Object.defineProperty(process.stdin, 'isTTY', {
                value: true,
                configurable: true,
                writable: true
            });

            expect(() => requireTTY()).not.toThrow();
        });

        it('should throw when stdin is not a TTY', () => {
            Object.defineProperty(process.stdin, 'isTTY', {
                value: false,
                configurable: true,
                writable: true
            });

            expect(() => requireTTY()).toThrow('Interactive mode requires a terminal');
        });

        it('should throw custom error message', () => {
            Object.defineProperty(process.stdin, 'isTTY', {
                value: false,
                configurable: true,
                writable: true
            });

            expect(() => requireTTY('Custom error message')).toThrow('Custom error message');
        });

        it('should accept optional logger', () => {
            const mockLogger: Logger = {
                info: vi.fn(),
                error: vi.fn(),
                warn: vi.fn(),
                debug: vi.fn()
            };

            Object.defineProperty(process.stdin, 'isTTY', {
                value: false,
                configurable: true,
                writable: true
            });

            expect(() => requireTTY('Test error', mockLogger)).toThrow();
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    describe('STANDARD_CHOICES', () => {
        it('should export standard choice constants', async () => {
            const { STANDARD_CHOICES } = await import('../src/interactive');

            expect(STANDARD_CHOICES.CONFIRM).toEqual({ key: 'c', label: 'Confirm and proceed' });
            expect(STANDARD_CHOICES.EDIT).toEqual({ key: 'e', label: 'Edit in editor' });
            expect(STANDARD_CHOICES.SKIP).toEqual({ key: 's', label: 'Skip and abort' });
            expect(STANDARD_CHOICES.IMPROVE).toEqual({ key: 'i', label: 'Improve with LLM feedback' });
        });
    });
});


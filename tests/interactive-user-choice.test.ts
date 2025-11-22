import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getUserChoice, STANDARD_CHOICES } from '../src/interactive';

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

describe('getUserChoice', () => {
    let originalIsTTY: boolean | undefined;
    let originalSetRawMode: any;
    let originalResume: any;
    let originalPause: any;
    let originalRef: any;
    let originalUnref: any;
    let originalOn: any;
    let originalRemoveListener: any;

    beforeEach(() => {
        vi.clearAllMocks();

        // Save original stdin methods
        originalIsTTY = process.stdin.isTTY;
        originalSetRawMode = process.stdin.setRawMode;
        originalResume = process.stdin.resume;
        originalPause = process.stdin.pause;
        originalRef = process.stdin.ref;
        originalUnref = process.stdin.unref;
        originalOn = process.stdin.on;
        originalRemoveListener = process.stdin.removeListener;
    });

    afterEach(() => {
        // Restore stdin
        Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true, writable: true });
        process.stdin.setRawMode = originalSetRawMode;
        process.stdin.resume = originalResume;
        process.stdin.pause = originalPause;
        process.stdin.ref = originalRef;
        process.stdin.unref = originalUnref;
        process.stdin.on = originalOn;
        process.stdin.removeListener = originalRemoveListener;
    });

    it('should return default when stdin is not TTY', async () => {
        Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true, writable: true });

        const result = await getUserChoice('Test prompt', [
            { key: 'a', label: 'Option A' },
            { key: 'b', label: 'Option B' },
        ]);

        expect(result).toBe('s');
        expect(mockLoggerInstance.error).toHaveBeenCalledWith(expect.stringContaining('STDIN is piped'));
    });

    it('should show error suggestions when not TTY', async () => {
        Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true, writable: true });

        await getUserChoice(
            'Test prompt',
            [{ key: 'a', label: 'Option A' }],
            { nonTtyErrorSuggestions: ['Use --dry-run', 'Run in terminal'] }
        );

        expect(mockLoggerInstance.error).toHaveBeenCalledWith('   • Use --dry-run');
        expect(mockLoggerInstance.error).toHaveBeenCalledWith('   • Run in terminal');
    });

    it('should display prompt and choices', async () => {
        Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true, writable: true });

        // Mock stdin methods
        process.stdin.setRawMode = vi.fn();
        process.stdin.resume = vi.fn();
        process.stdin.pause = vi.fn();
        process.stdin.ref = vi.fn();
        process.stdin.unref = vi.fn();
        process.stdin.removeListener = vi.fn();

        let dataCallback: any;
        process.stdin.on = vi.fn((event, callback) => {
            if (event === 'data') {
                dataCallback = callback;
                // Simulate user pressing 'a'
                setTimeout(() => dataCallback(Buffer.from('a')), 10);
            }
            return process.stdin;
        });

        const result = await getUserChoice('What to do?', [
            { key: 'a', label: 'Action A' },
            { key: 'b', label: 'Action B' },
        ]);

        expect(result).toBe('a');
        expect(mockLoggerInstance.info).toHaveBeenCalledWith('What to do?');
        expect(mockLoggerInstance.info).toHaveBeenCalledWith('   [a] Action A');
        expect(mockLoggerInstance.info).toHaveBeenCalledWith('   [b] Action B');
    });

    it('should handle user selecting first choice', async () => {
        Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true, writable: true });

        process.stdin.setRawMode = vi.fn();
        process.stdin.resume = vi.fn();
        process.stdin.pause = vi.fn();
        process.stdin.ref = vi.fn();
        process.stdin.unref = vi.fn();
        process.stdin.removeListener = vi.fn();

        process.stdin.on = vi.fn((event, callback) => {
            if (event === 'data') {
                setTimeout(() => callback(Buffer.from('c')), 10);
            }
            return process.stdin;
        });

        const result = await getUserChoice('Confirm?', [STANDARD_CHOICES.CONFIRM, STANDARD_CHOICES.SKIP]);

        expect(result).toBe('c');
    });

    it('should cleanup stdin on completion', async () => {
        Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true, writable: true });

        process.stdin.setRawMode = vi.fn();
        process.stdin.resume = vi.fn();
        process.stdin.pause = vi.fn();
        process.stdin.ref = vi.fn();
        process.stdin.unref = vi.fn();
        const mockRemoveListener = vi.fn();
        process.stdin.removeListener = mockRemoveListener;

        process.stdin.on = vi.fn((event, callback) => {
            if (event === 'data') {
                setTimeout(() => callback(Buffer.from('s')), 10);
            }
            return process.stdin;
        });

        await getUserChoice('Test?', [STANDARD_CHOICES.SKIP]);

        expect(mockRemoveListener).toHaveBeenCalled();
        expect(process.stdin.pause).toHaveBeenCalled();
    });

    it('should handle errors during input setup', async () => {
        Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true, writable: true });

        process.stdin.setRawMode = vi.fn(() => {
            throw new Error('Setup failed');
        });
        process.stdin.resume = vi.fn();
        process.stdin.pause = vi.fn();
        process.stdin.ref = vi.fn();
        process.stdin.unref = vi.fn();
        process.stdin.removeListener = vi.fn();
        process.stdin.on = vi.fn();

        await expect(
            getUserChoice('Test?', [{ key: 'a', label: 'Option A' }])
        ).rejects.toThrow('Setup failed');
    });
});


import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getLogger, setLogger } from '../src/logger';
import type { Logger } from '../src/types';

describe('Logger', () => {
    let originalLogger: any;

    beforeEach(() => {
        // Clear module cache to reset logger state
        vi.resetModules();
    });

    afterEach(() => {
        if (originalLogger) {
            setLogger(originalLogger);
        }
    });

    it('should return a logger instance', () => {
        const logger = getLogger();

        expect(logger).toBeDefined();
        expect(logger.info).toBeDefined();
        expect(logger.error).toBeDefined();
        expect(logger.warn).toBeDefined();
        expect(logger.debug).toBeDefined();
    });

    it('should provide no-op logger by default when winston not available', () => {
        const logger = getLogger();

        // Should not throw
        expect(() => {
            logger.info('test');
            logger.error('test');
            logger.warn('test');
            logger.debug('test');
        }).not.toThrow();
    });

    it('should use custom logger when set', () => {
        const mockLogger: Logger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
        };

        setLogger(mockLogger);
        const logger = getLogger();

        logger.info('test message', 'extra arg');
        logger.error('error message');
        logger.warn('warn message');
        logger.debug('debug message');

        expect(mockLogger.info).toHaveBeenCalledWith('test message', 'extra arg');
        expect(mockLogger.error).toHaveBeenCalledWith('error message');
        expect(mockLogger.warn).toHaveBeenCalledWith('warn message');
        expect(mockLogger.debug).toHaveBeenCalledWith('debug message');
    });

    it('should persist custom logger across getLogger calls', () => {
        const mockLogger: Logger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
        };

        setLogger(mockLogger);

        const logger1 = getLogger();
        const logger2 = getLogger();

        logger1.info('message 1');
        logger2.info('message 2');

        expect(mockLogger.info).toHaveBeenCalledTimes(2);
        expect(mockLogger.info).toHaveBeenNthCalledWith(1, 'message 1');
        expect(mockLogger.info).toHaveBeenNthCalledWith(2, 'message 2');
    });

    it('should handle logger with metadata', () => {
        const mockLogger: Logger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
        };

        setLogger(mockLogger);
        const logger = getLogger();

        const metadata = { user: 'test', action: 'login' };
        logger.info('User action', metadata);

        expect(mockLogger.info).toHaveBeenCalledWith('User action', metadata);
    });

    it('should support all log levels', () => {
        const mockLogger: Logger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
        };

        setLogger(mockLogger);
        const logger = getLogger();

        logger.info('info level');
        logger.error('error level');
        logger.warn('warn level');
        logger.debug('debug level');

        expect(mockLogger.info).toHaveBeenCalledTimes(1);
        expect(mockLogger.error).toHaveBeenCalledTimes(1);
        expect(mockLogger.warn).toHaveBeenCalledTimes(1);
        expect(mockLogger.debug).toHaveBeenCalledTimes(1);
    });
});

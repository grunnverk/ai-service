import { describe, it, expect } from 'vitest';
import { createNoOpLogger } from '../src/logger';

describe('createNoOpLogger', () => {
    it('should create a logger with all required methods', () => {
        const logger = createNoOpLogger();

        expect(logger).toBeDefined();
        expect(typeof logger.info).toBe('function');
        expect(typeof logger.error).toBe('function');
        expect(typeof logger.warn).toBe('function');
        expect(typeof logger.debug).toBe('function');
    });

    it('should not throw when calling methods', () => {
        const logger = createNoOpLogger();

        expect(() => logger.info('test')).not.toThrow();
        expect(() => logger.error('test')).not.toThrow();
        expect(() => logger.warn('test')).not.toThrow();
        expect(() => logger.debug('test')).not.toThrow();
    });

    it('should handle arguments', () => {
        const logger = createNoOpLogger();

        expect(() => logger.info('test', 'arg1', 'arg2')).not.toThrow();
        expect(() => logger.error('test', { data: 'value' })).not.toThrow();
    });

    it('should return undefined from all methods', () => {
        const logger = createNoOpLogger();

        expect(logger.info('test')).toBeUndefined();
        expect(logger.error('test')).toBeUndefined();
        expect(logger.warn('test')).toBeUndefined();
        expect(logger.debug('test')).toBeUndefined();
    });
});


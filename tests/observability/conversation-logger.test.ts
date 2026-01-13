import { describe, it, expect, vi, beforeEach } from 'vitest';

// Define the mock class inside the mock factory to avoid hoisting issues
vi.mock('@riotprompt/riotprompt', () => {
    const MockConversationLogger = class {
        log = vi.fn();
        save = vi.fn();
    };
    return {
        ConversationLogger: MockConversationLogger
    };
});

import {
    createConversationLogger,
    generateConversationId
} from '../../src/observability/conversation-logger';

describe('Conversation Logger', () => {
    const mockStorage = {
        readFile: vi.fn(),
        writeFile: vi.fn(),
        writeOutput: vi.fn(),
        exists: vi.fn(),
        mkdir: vi.fn()
    };

    const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createConversationLogger', () => {
        it('should create a conversation logger', () => {
            const logger = createConversationLogger({
                outputDir: 'output/conversations',
                storage: mockStorage as any,
                logger: mockLogger as any
            });

            expect(logger).toBeDefined();
            expect(logger.save).toBeDefined();
            expect(logger.load).toBeDefined();
            expect(logger.getSummary).toBeDefined();
            expect(logger.createRiotLogger).toBeDefined();
        });

        describe('save', () => {
            it('should save conversation in JSON format', async () => {
                mockStorage.writeOutput.mockResolvedValue(undefined);

                const logger = createConversationLogger({
                    outputDir: 'output/conversations',
                    format: 'json',
                    storage: mockStorage as any,
                    logger: mockLogger as any
                });

                const messages = [
                    { role: 'system', content: 'You are helpful.' },
                    { role: 'user', content: 'Hello' }
                ];

                const result = await logger.save('test-conv-1', messages, { model: 'gpt-4o' });

                expect(result).toContain('test-conv-1.json');
                expect(mockStorage.writeOutput).toHaveBeenCalled();
                expect(mockLogger.debug).toHaveBeenCalled();
            });

            it('should save conversation in markdown format', async () => {
                mockStorage.writeOutput.mockResolvedValue(undefined);

                const logger = createConversationLogger({
                    outputDir: 'output/conversations',
                    format: 'markdown',
                    storage: mockStorage as any,
                    logger: mockLogger as any
                });

                const messages = [
                    { role: 'user', content: 'Test message' }
                ];

                const result = await logger.save('test-conv-2', messages);

                expect(result).toContain('test-conv-2.markdown');
                expect(mockStorage.writeOutput).toHaveBeenCalledWith(
                    'test-conv-2.markdown',
                    expect.stringContaining('# Conversation: test-conv-2')
                );
            });

            it('should throw error when storage is not provided', async () => {
                const logger = createConversationLogger({
                    outputDir: 'output/conversations'
                });

                await expect(logger.save('test', [])).rejects.toThrow('Storage adapter required');
            });

            it('should handle save errors', async () => {
                mockStorage.writeOutput.mockRejectedValue(new Error('Write failed'));

                const logger = createConversationLogger({
                    outputDir: 'output/conversations',
                    storage: mockStorage as any,
                    logger: mockLogger as any
                });

                await expect(logger.save('test', [])).rejects.toThrow('Write failed');
                expect(mockLogger.warn).toHaveBeenCalled();
            });
        });

        describe('load', () => {
            it('should load conversation in JSON format', async () => {
                const savedConversation = {
                    id: 'test-conv-1',
                    timestamp: '2024-01-01T00:00:00.000Z',
                    messages: [{ role: 'user', content: 'Hello' }],
                    metadata: { model: 'gpt-4o' }
                };
                mockStorage.readFile.mockResolvedValue(JSON.stringify(savedConversation));

                const logger = createConversationLogger({
                    outputDir: 'output/conversations',
                    format: 'json',
                    storage: mockStorage as any,
                    logger: mockLogger as any
                });

                const result = await logger.load('test-conv-1');

                expect(result.id).toBe('test-conv-1');
                expect(result.messages).toHaveLength(1);
                expect(mockLogger.info).toHaveBeenCalled();
            });

            it('should load conversation in markdown format', async () => {
                mockStorage.readFile.mockResolvedValue('# Conversation\n\nContent here');

                const logger = createConversationLogger({
                    outputDir: 'output/conversations',
                    format: 'markdown',
                    storage: mockStorage as any,
                    logger: mockLogger as any
                });

                const result = await logger.load('test-conv-1');

                expect(result).toContain('# Conversation');
            });

            it('should throw error when storage is not provided', async () => {
                const logger = createConversationLogger({
                    outputDir: 'output/conversations'
                });

                await expect(logger.load('test')).rejects.toThrow('Storage adapter required');
            });

            it('should handle invalid JSON', async () => {
                mockStorage.readFile.mockResolvedValue('invalid json {');

                const logger = createConversationLogger({
                    outputDir: 'output/conversations',
                    format: 'json',
                    storage: mockStorage as any,
                    logger: mockLogger as any
                });

                await expect(logger.load('test')).rejects.toThrow('Failed to parse conversation JSON');
            });

            it('should handle load errors', async () => {
                mockStorage.readFile.mockRejectedValue(new Error('File not found'));

                const logger = createConversationLogger({
                    outputDir: 'output/conversations',
                    storage: mockStorage as any,
                    logger: mockLogger as any
                });

                await expect(logger.load('test')).rejects.toThrow('File not found');
                expect(mockLogger.warn).toHaveBeenCalled();
            });
        });

        describe('getSummary', () => {
            it('should get conversation summary', async () => {
                const savedConversation = {
                    id: 'test-conv-1',
                    timestamp: '2024-01-01T00:00:00.000Z',
                    messages: [
                        { role: 'user', content: 'Hello' },
                        { role: 'assistant', content: 'Hi there!' }
                    ],
                    metadata: { model: 'gpt-4o' }
                };
                mockStorage.readFile.mockResolvedValue(JSON.stringify(savedConversation));

                const logger = createConversationLogger({
                    outputDir: 'output/conversations',
                    storage: mockStorage as any,
                    logger: mockLogger as any
                });

                const summary = await logger.getSummary('test-conv-1');

                expect(summary.id).toBe('test-conv-1');
                expect(summary.messageCount).toBe(2);
                expect(summary.metadata).toEqual({ model: 'gpt-4o' });
            });

            it('should handle getSummary errors', async () => {
                mockStorage.readFile.mockRejectedValue(new Error('Not found'));

                const logger = createConversationLogger({
                    outputDir: 'output/conversations',
                    storage: mockStorage as any,
                    logger: mockLogger as any
                });

                await expect(logger.getSummary('test')).rejects.toThrow('Not found');
                expect(mockLogger.warn).toHaveBeenCalled();
            });
        });

        describe('createRiotLogger', () => {
            it('should create riotprompt ConversationLogger', () => {
                const logger = createConversationLogger({
                    outputDir: 'output/conversations',
                    format: 'json',
                    storage: mockStorage as any,
                    logger: mockLogger as any
                });

                const riotLogger = logger.createRiotLogger();

                expect(riotLogger).toBeDefined();
            });
        });
    });

    describe('generateConversationId', () => {
        it('should generate unique conversation ID', () => {
            const id1 = generateConversationId('commit');
            const id2 = generateConversationId('release');

            expect(id1).toContain('commit-');
            expect(id2).toContain('release-');
            expect(id1).not.toBe(id2);
        });

        it('should format timestamp correctly', () => {
            const id = generateConversationId('test');

            // Should not contain : characters (but may contain . that's converted to -)
            expect(id).not.toContain(':');
            // Should match the expected pattern (timestamp with dashes)
            expect(id).toMatch(/^test-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
            expect(id.startsWith('test-')).toBe(true);
        });
    });
});

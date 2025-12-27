import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgenticExecutor, runAgentic } from '../../src/agentic/executor';
import type { AgenticConfig, AgenticResult } from '../../src/agentic/executor';
import type { ToolRegistry } from '../../src/tools/registry';
import type { ChatCompletionMessageParam } from 'openai/resources';

// Mock dependencies
vi.mock('../../src/ai', () => ({
    createCompletionWithRetry: vi.fn(),
}));

describe('AgenticExecutor', () => {
    let executor: AgenticExecutor;
    let mockToolRegistry: ToolRegistry;
    let mockLogger: any;
    let mockCreateCompletion: any;

    beforeEach(async () => {
        vi.clearAllMocks();

        executor = new AgenticExecutor();

        mockLogger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            verbose: vi.fn(),
            silly: vi.fn(),
        };

        // Create mock tool registry
        mockToolRegistry = {
            count: vi.fn(() => 2),
            toOpenAIFormat: vi.fn(() => [
                {
                    type: 'function' as const,
                    function: {
                        name: 'get_file_content',
                        description: 'Get file content',
                        parameters: {
                            type: 'object' as const,
                            properties: { filePath: { type: 'string', description: 'File path' } },
                        },
                    },
                },
            ]),
            execute: vi.fn(),
        } as any;

        // Import and setup mock
        const aiModule = await import('../../src/ai');
        mockCreateCompletion = aiModule.createCompletionWithRetry as any;
    });

    describe('constructor', () => {
        it('should create executor with optional logger', () => {
            const exec1 = new AgenticExecutor();
            expect(exec1).toBeDefined();

            const exec2 = new AgenticExecutor(mockLogger);
            expect(exec2).toBeDefined();
        });
    });

    describe('run', () => {
        it('should run agentic loop with immediate completion', async () => {
            mockCreateCompletion.mockResolvedValue('Final response');

            executor = new AgenticExecutor(mockLogger);

            const config: AgenticConfig = {
                messages: [
                    { role: 'system', content: 'System prompt' },
                    { role: 'user', content: 'User query' },
                ],
                tools: mockToolRegistry,
                model: 'gpt-4o',
                maxIterations: 10,
            };

            const result = await executor.run(config);

            expect(result.finalMessage).toBe('Final response');
            expect(result.iterations).toBe(1);
            expect(result.toolCallsExecuted).toBe(0);
            expect(result.conversationHistory).toHaveLength(3); // system + user + assistant
        });

        it('should handle tool calls in agentic loop', async () => {
            const mockToolResult = 'Tool execution result';

            mockCreateCompletion.mockResolvedValueOnce({
                role: 'assistant',
                content: 'Let me investigate',
                tool_calls: [
                    {
                        id: 'call_1',
                        function: {
                            name: 'get_file_content',
                            arguments: JSON.stringify({ filePath: 'test.ts' }),
                        },
                    },
                ],
            });

            mockCreateCompletion.mockResolvedValueOnce('Analysis complete');

            mockToolRegistry.execute = vi.fn(async () => mockToolResult);

            executor = new AgenticExecutor(mockLogger);

            const config: AgenticConfig = {
                messages: [
                    { role: 'system', content: 'System prompt' },
                    { role: 'user', content: 'User query' },
                ],
                tools: mockToolRegistry,
                model: 'gpt-4o',
                maxIterations: 10,
            };

            const result = await executor.run(config);

            expect(result.toolCallsExecuted).toBe(1);
            expect(mockToolRegistry.execute).toHaveBeenCalledWith(
                'get_file_content',
                { filePath: 'test.ts' }
            );
            expect(result.conversationHistory.some(msg => msg.role === 'tool')).toBe(true);
        });

        it('should handle tool execution errors gracefully', async () => {
            mockCreateCompletion.mockResolvedValueOnce({
                role: 'assistant',
                content: 'Let me check something',
                tool_calls: [
                    {
                        id: 'call_1',
                        function: {
                            name: 'failing_tool',
                            arguments: JSON.stringify({ param: 'value' }),
                        },
                    },
                ],
            });

            mockCreateCompletion.mockResolvedValueOnce('Handled error');

            mockToolRegistry.execute = vi.fn(async () => {
                throw new Error('Tool failed');
            });

            executor = new AgenticExecutor(mockLogger);

            const config: AgenticConfig = {
                messages: [
                    { role: 'system', content: 'System prompt' },
                    { role: 'user', content: 'User query' },
                ],
                tools: mockToolRegistry,
                model: 'gpt-4o',
                maxIterations: 10,
            };

            const result = await executor.run(config);

            // toolCallsExecuted is only incremented on successful execution
            expect(result.toolCallsExecuted).toBe(0);
            const errorMessage = result.conversationHistory.find(
                msg => msg.role === 'tool' && (typeof msg.content === 'string' && msg.content?.includes('failed'))
            );
            expect(errorMessage).toBeDefined();
            expect(result.toolMetrics[0].success).toBe(false);
        });

        it('should track tool metrics', async () => {
            mockCreateCompletion.mockResolvedValueOnce({
                role: 'assistant',
                content: 'Investigating',
                tool_calls: [
                    {
                        id: 'call_1',
                        function: {
                            name: 'get_file_content',
                            arguments: JSON.stringify({ filePath: 'test.ts' }),
                        },
                    },
                ],
            });

            mockCreateCompletion.mockResolvedValueOnce('Done');

            mockToolRegistry.execute = vi.fn(async () => 'result');

            executor = new AgenticExecutor();

            const config: AgenticConfig = {
                messages: [
                    { role: 'system', content: 'System prompt' },
                    { role: 'user', content: 'User query' },
                ],
                tools: mockToolRegistry,
                model: 'gpt-4o',
                maxIterations: 10,
            };

            const result = await executor.run(config);

            expect(result.toolMetrics).toHaveLength(1);
            expect(result.toolMetrics[0].name).toBe('get_file_content');
            expect(result.toolMetrics[0].success).toBe(true);
            expect(result.toolMetrics[0].duration).toBeGreaterThanOrEqual(0);
            expect(result.toolMetrics[0].iteration).toBe(1);
            expect(result.toolMetrics[0].timestamp).toBeDefined();
        });

        it('should handle multiple tool calls in single iteration', async () => {
            mockCreateCompletion.mockResolvedValueOnce({
                role: 'assistant',
                content: 'Multiple investigations',
                tool_calls: [
                    {
                        id: 'call_1',
                        function: {
                            name: 'tool_1',
                            arguments: JSON.stringify({ param: 'value1' }),
                        },
                    },
                    {
                        id: 'call_2',
                        function: {
                            name: 'tool_2',
                            arguments: JSON.stringify({ param: 'value2' }),
                        },
                    },
                ],
            });

            mockCreateCompletion.mockResolvedValueOnce('Analysis');

            mockToolRegistry.execute = vi.fn(async (name) => `result_${name}`);

            executor = new AgenticExecutor();

            const config: AgenticConfig = {
                messages: [
                    { role: 'system', content: 'System prompt' },
                    { role: 'user', content: 'User query' },
                ],
                tools: mockToolRegistry,
                model: 'gpt-4o',
                maxIterations: 10,
            };

            const result = await executor.run(config);

            expect(result.toolCallsExecuted).toBe(2);
            expect(mockToolRegistry.execute).toHaveBeenCalledTimes(2);
        });

        it('should respect maxIterations limit', async () => {
            // Always return tool calls to keep looping
            mockCreateCompletion.mockResolvedValue({
                role: 'assistant',
                content: 'Investigating',
                tool_calls: [
                    {
                        id: 'call_1',
                        function: {
                            name: 'tool',
                            arguments: JSON.stringify({}),
                        },
                    },
                ],
            });

            // First mock calls for iterations, then final response
            const responses = Array(5).fill({
                role: 'assistant',
                content: 'Investigating',
                tool_calls: [
                    {
                        id: 'call_1',
                        function: {
                            name: 'tool',
                            arguments: JSON.stringify({}),
                        },
                    },
                ],
            });
            responses.push('Final response');

            mockCreateCompletion.mockResolvedValueOnce(responses[0]);
            mockCreateCompletion.mockResolvedValueOnce(responses[0]);
            mockCreateCompletion.mockResolvedValueOnce(responses[0]);
            mockCreateCompletion.mockResolvedValueOnce(responses[0]);
            mockCreateCompletion.mockResolvedValueOnce(responses[0]);
            mockCreateCompletion.mockResolvedValueOnce('Final response');

            mockToolRegistry.execute = vi.fn(async () => 'result');

            executor = new AgenticExecutor();

            const config: AgenticConfig = {
                messages: [{ role: 'system', content: 'System' }],
                tools: mockToolRegistry,
                model: 'gpt-4o',
                maxIterations: 5,
            };

            const result = await executor.run(config);

            expect(result.iterations).toBe(5);
        });

        it('should pass debug options to completion', async () => {
            mockCreateCompletion.mockResolvedValue('Response');

            executor = new AgenticExecutor();

            const config: AgenticConfig = {
                messages: [{ role: 'system', content: 'System' }],
                tools: mockToolRegistry,
                model: 'gpt-4o',
                maxIterations: 1,
                debug: true,
                debugRequestFile: 'request.json',
                debugResponseFile: 'response.json',
                storage: { readFile: vi.fn() } as any,
                logger: mockLogger,
                openaiReasoning: 'high',
            };

            await executor.run(config);

            const firstCall = mockCreateCompletion.mock.calls[0];
            expect(firstCall[1]).toMatchObject({
                debug: true,
                debugRequestFile: expect.stringContaining('request.json'),
                debugResponseFile: expect.stringContaining('response.json'),
                openaiReasoning: 'high',
            });
        });

        it('should use default model and maxIterations', async () => {
            mockCreateCompletion.mockResolvedValue('Response');

            executor = new AgenticExecutor();

            const config: AgenticConfig = {
                messages: [{ role: 'system', content: 'System' }],
                tools: mockToolRegistry,
                // model and maxIterations not specified
            };

            await executor.run(config);

            const firstCall = mockCreateCompletion.mock.calls[0];
            expect(firstCall[1]).toMatchObject({
                model: 'gpt-4o',
            });
        });

        it('should format string responses as assistant messages', async () => {
            mockCreateCompletion.mockResolvedValue('String response');

            executor = new AgenticExecutor();

            const config: AgenticConfig = {
                messages: [{ role: 'user', content: 'Query' }],
                tools: mockToolRegistry,
                model: 'gpt-4o',
                maxIterations: 1,
            };

            const result = await executor.run(config);

            const assistantMsg = result.conversationHistory.find(m => m.role === 'assistant');
            expect(assistantMsg?.content).toBe('String response');
        });

        it('should preserve conversation history', async () => {
            mockCreateCompletion.mockResolvedValue('Response');

            executor = new AgenticExecutor();

            const initialMessages: ChatCompletionMessageParam[] = [
                { role: 'system', content: 'System' },
                { role: 'user', content: 'Query' },
            ];

            const config: AgenticConfig = {
                messages: initialMessages,
                tools: mockToolRegistry,
                model: 'gpt-4o',
                maxIterations: 1,
            };

            const result = await executor.run(config);

            expect(result.conversationHistory[0]).toEqual(initialMessages[0]);
            expect(result.conversationHistory[1]).toEqual(initialMessages[1]);
        });
    });

    describe('logging', () => {
        it('should log with debug logger when available', async () => {
            mockCreateCompletion.mockResolvedValue('Response');

            executor = new AgenticExecutor(mockLogger);

            const config: AgenticConfig = {
                messages: [{ role: 'user', content: 'Query' }],
                tools: mockToolRegistry,
            };

            await executor.run(config);

            expect(mockLogger.debug).toHaveBeenCalled();
        });

        it('should log tool info messages when available', async () => {
            mockCreateCompletion.mockResolvedValueOnce({
                role: 'assistant',
                tool_calls: [
                    {
                        id: 'call_1',
                        function: {
                            name: 'test_tool',
                            arguments: JSON.stringify({}),
                        },
                    },
                ],
            });

            mockCreateCompletion.mockResolvedValueOnce('Response');

            mockToolRegistry.execute = vi.fn(async () => 'result');

            executor = new AgenticExecutor(mockLogger);

            const config: AgenticConfig = {
                messages: [{ role: 'user', content: 'Query' }],
                tools: mockToolRegistry,
            };

            await executor.run(config);

            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Running tool'));
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('completed'));
        });

        it('should log tool warnings on error', async () => {
            mockCreateCompletion.mockResolvedValueOnce({
                role: 'assistant',
                tool_calls: [
                    {
                        id: 'call_1',
                        function: {
                            name: 'failing_tool',
                            arguments: JSON.stringify({}),
                        },
                    },
                ],
            });

            mockCreateCompletion.mockResolvedValueOnce('Response');

            mockToolRegistry.execute = vi.fn(async () => {
                throw new Error('Execution failed');
            });

            executor = new AgenticExecutor(mockLogger);

            const config: AgenticConfig = {
                messages: [{ role: 'user', content: 'Query' }],
                tools: mockToolRegistry,
            };

            await executor.run(config);

            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('failed'));
        });
    });
});

describe('runAgentic', () => {
    let mockToolRegistry: ToolRegistry;
    let mockCreateCompletion: any;

    beforeEach(async () => {
        vi.clearAllMocks();

        mockToolRegistry = {
            count: vi.fn(() => 1),
            toOpenAIFormat: vi.fn(() => []),
            execute: vi.fn(),
        } as any;

        const aiModule = await import('../../src/ai');
        mockCreateCompletion = aiModule.createCompletionWithRetry as any;
        mockCreateCompletion.mockResolvedValue('Response');
    });

    it('should create executor and run config', async () => {
        const config: AgenticConfig = {
            messages: [{ role: 'user', content: 'Query' }],
            tools: mockToolRegistry,
            model: 'gpt-4o',
            maxIterations: 5,
        };

        const result = await runAgentic(config);

        expect(result).toHaveProperty('finalMessage');
        expect(result).toHaveProperty('iterations');
        expect(result).toHaveProperty('toolCallsExecuted');
        expect(result).toHaveProperty('conversationHistory');
        expect(result).toHaveProperty('toolMetrics');
    });

    it('should pass logger through to executor', async () => {
        const mockLogger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            verbose: vi.fn(),
            silly: vi.fn()
        };

        const config: AgenticConfig = {
            messages: [{ role: 'user', content: 'Query' }],
            tools: mockToolRegistry,
            logger: mockLogger,
        };

        await runAgentic(config);

        expect(mockLogger.debug).toHaveBeenCalled();
    });
});


import { describe, it, expect } from 'vitest';
import type {
    ToolParameter,
    ToolDefinition,
    Tool,
    ToolContext,
    ToolCall,
    ToolResult,
    OpenAITool,
} from '../../src/tools/types';

describe('Tool Types', () => {
    describe('ToolParameter', () => {
        it('should allow string parameter definition', () => {
            const param: ToolParameter = {
                type: 'string',
                description: 'A string parameter',
            };
            expect(param.type).toBe('string');
            expect(param.description).toBe('A string parameter');
        });

        it('should allow number parameter with default', () => {
            const param: ToolParameter = {
                type: 'number',
                description: 'A number parameter',
                default: 10,
            };
            expect(param.type).toBe('number');
            expect(param.default).toBe(10);
        });

        it('should allow array parameter with items', () => {
            const param: ToolParameter = {
                type: 'array',
                description: 'An array parameter',
                items: { type: 'string', description: 'String items' },
            };
            expect(param.type).toBe('array');
            expect(param.items?.type).toBe('string');
        });

        it('should allow object parameter with properties', () => {
            const param: ToolParameter = {
                type: 'object',
                description: 'An object parameter',
                properties: {
                    name: { type: 'string', description: 'Name field' },
                    age: { type: 'number', description: 'Age field' },
                },
                required: ['name'],
            };
            expect(param.type).toBe('object');
            expect(param.properties?.name.type).toBe('string');
            expect(param.required).toContain('name');
        });

        it('should allow enum parameter', () => {
            const param: ToolParameter = {
                type: 'string',
                description: 'An enum parameter',
                enum: ['option1', 'option2', 'option3'],
            };
            expect(param.enum).toContain('option1');
            expect(param.enum).toHaveLength(3);
        });

        it('should allow boolean parameter', () => {
            const param: ToolParameter = {
                type: 'boolean',
                description: 'A boolean parameter',
                default: false,
            };
            expect(param.type).toBe('boolean');
            expect(param.default).toBe(false);
        });
    });

    describe('ToolDefinition', () => {
        it('should define a complete tool definition', () => {
            const toolDef: ToolDefinition = {
                name: 'test_tool',
                description: 'A test tool for unit testing',
                parameters: {
                    type: 'object',
                    properties: {
                        input: { type: 'string', description: 'Input parameter' },
                    },
                    required: ['input'],
                },
            };
            expect(toolDef.name).toBe('test_tool');
            expect(toolDef.parameters.type).toBe('object');
            expect(toolDef.parameters.required).toContain('input');
        });

        it('should support optional required array', () => {
            const toolDef: ToolDefinition = {
                name: 'optional_tool',
                description: 'Tool with optional required field',
                parameters: {
                    type: 'object',
                    properties: {
                        optional: { type: 'string', description: 'Optional param' },
                    },
                },
            };
            expect(toolDef.parameters.required).toBeUndefined();
        });
    });

    describe('Tool', () => {
        it('should define a tool with execute function', async () => {
            const tool: Tool = {
                name: 'async_tool',
                description: 'A tool with async execution',
                parameters: {
                    type: 'object',
                    properties: {
                        value: { type: 'number', description: 'A value' },
                    },
                    required: ['value'],
                },
                execute: async (params) => {
                    return params.value * 2;
                },
            };
            expect(tool.name).toBe('async_tool');
            const result = await tool.execute({ value: 5 });
            expect(result).toBe(10);
        });

        it('should support tool execution with context', async () => {
            const tool: Tool = {
                name: 'context_tool',
                description: 'A tool that uses context',
                parameters: {
                    type: 'object',
                    properties: {
                        action: { type: 'string', description: 'Action to perform' },
                    },
                    required: ['action'],
                },
                execute: async (params, context) => {
                    return {
                        action: params.action,
                        workingDir: context?.workingDirectory,
                    };
                },
            };

            const context: ToolContext = {
                workingDirectory: '/test/path',
                storage: {} as any,
                logger: {} as any,
            };

            const result = await tool.execute({ action: 'test' }, context);
            expect(result.workingDir).toBe('/test/path');
        });
    });

    describe('ToolContext', () => {
        it('should allow complete tool context', () => {
            const context: ToolContext = {
                workingDirectory: '/app',
                storage: { readFile: async () => '' } as any,
                logger: { info: () => {} } as any,
            };
            expect(context.workingDirectory).toBe('/app');
            expect(context.storage).toBeDefined();
            expect(context.logger).toBeDefined();
        });

        it('should allow partial tool context', () => {
            const context: ToolContext = {
                workingDirectory: '/app',
            };
            expect(context.workingDirectory).toBe('/app');
            expect(context.storage).toBeUndefined();
            expect(context.logger).toBeUndefined();
        });

        it('should allow empty tool context', () => {
            const context: ToolContext = {};
            expect(context.workingDirectory).toBeUndefined();
        });
    });

    describe('ToolCall', () => {
        it('should define a tool call', () => {
            const toolCall: ToolCall = {
                id: 'call_123',
                name: 'get_file_history',
                arguments: { filePath: 'src/index.ts', limit: 10 },
            };
            expect(toolCall.id).toBe('call_123');
            expect(toolCall.name).toBe('get_file_history');
            expect(toolCall.arguments.filePath).toBe('src/index.ts');
        });
    });

    describe('ToolResult', () => {
        it('should define a successful tool result', () => {
            const result: ToolResult = {
                id: 'call_123',
                name: 'get_file_history',
                result: 'commit history data',
            };
            expect(result.id).toBe('call_123');
            expect(result.result).toBe('commit history data');
            expect(result.error).toBeUndefined();
        });

        it('should define a failed tool result', () => {
            const result: ToolResult = {
                id: 'call_123',
                name: 'get_file_history',
                result: null,
                error: 'File not found',
            };
            expect(result.error).toBe('File not found');
        });

        it('should allow complex result objects', () => {
            const result: ToolResult = {
                id: 'call_456',
                name: 'analyze_changes',
                result: {
                    files: ['file1.ts', 'file2.ts'],
                    additions: 100,
                    deletions: 50,
                },
            };
            expect(result.result.files).toHaveLength(2);
            expect(result.result.additions).toBe(100);
        });
    });

    describe('OpenAITool', () => {
        it('should define an OpenAI compatible tool', () => {
            const openaiTool: OpenAITool = {
                type: 'function',
                function: {
                    name: 'get_file_content',
                    description: 'Get the complete content of a file',
                    parameters: {
                        type: 'object',
                        properties: {
                            filePath: { type: 'string', description: 'Path to the file' },
                        },
                        required: ['filePath'],
                    },
                },
            };
            expect(openaiTool.type).toBe('function');
            expect(openaiTool.function.name).toBe('get_file_content');
            expect(openaiTool.function.parameters.properties.filePath.type).toBe('string');
        });

        it('should support optional required array in parameters', () => {
            const openaiTool: OpenAITool = {
                type: 'function',
                function: {
                    name: 'search_codebase',
                    description: 'Search for patterns in codebase',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: { type: 'string', description: 'Search query' },
                            limit: { type: 'number', description: 'Result limit' },
                        },
                    },
                },
            };
            expect(openaiTool.function.parameters.required).toBeUndefined();
        });

        it('should support complex nested parameters', () => {
            const openaiTool: OpenAITool = {
                type: 'function',
                function: {
                    name: 'analyze_files',
                    description: 'Analyze multiple files',
                    parameters: {
                        type: 'object',
                        properties: {
                            files: {
                                type: 'array',
                                description: 'Files to analyze',
                            },
                            options: {
                                type: 'object',
                                description: 'Analysis options',
                            },
                        },
                        required: ['files'],
                    },
                },
            };
            expect(openaiTool.function.parameters.properties.files.type).toBe('array');
            expect(openaiTool.function.parameters.required).toContain('files');
        });
    });
});


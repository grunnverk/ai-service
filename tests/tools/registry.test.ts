import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry, createToolRegistry } from '../../src/tools/registry';
import type { Tool } from '../../src/tools/types';

describe('ToolRegistry', () => {
    let registry: ToolRegistry;
    let mockTool1: Tool;
    let mockTool2: Tool;

    beforeEach(() => {
        registry = new ToolRegistry();

        mockTool1 = {
            name: 'tool_one',
            description: 'First test tool',
            parameters: {
                type: 'object',
                properties: { input: { type: 'string', description: 'Input' } },
                required: ['input'],
            },
            execute: vi.fn(async () => 'result1'),
        };

        mockTool2 = {
            name: 'tool_two',
            description: 'Second test tool',
            parameters: {
                type: 'object',
                properties: { value: { type: 'number', description: 'Value' } },
            },
            execute: vi.fn(async () => 'result2'),
        };
    });

    describe('register', () => {
        it('should register a single tool', () => {
            registry.register(mockTool1);
            expect(registry.has('tool_one')).toBe(true);
        });

        it('should throw error when registering duplicate tool', () => {
            registry.register(mockTool1);
            expect(() => registry.register(mockTool1)).toThrow(
                'Tool with name "tool_one" is already registered'
            );
        });

        it('should register multiple tools with different names', () => {
            registry.register(mockTool1);
            registry.register(mockTool2);
            expect(registry.has('tool_one')).toBe(true);
            expect(registry.has('tool_two')).toBe(true);
        });
    });

    describe('registerAll', () => {
        it('should register multiple tools at once', () => {
            registry.registerAll([mockTool1, mockTool2]);
            expect(registry.count()).toBe(2);
            expect(registry.has('tool_one')).toBe(true);
            expect(registry.has('tool_two')).toBe(true);
        });

        it('should throw error if one of the tools is already registered', () => {
            registry.register(mockTool1);
            expect(() => registry.registerAll([mockTool1, mockTool2])).toThrow(
                'Tool with name "tool_one" is already registered'
            );
        });

        it('should handle empty array', () => {
            registry.registerAll([]);
            expect(registry.count()).toBe(0);
        });
    });

    describe('get', () => {
        it('should retrieve a registered tool by name', () => {
            registry.register(mockTool1);
            const retrieved = registry.get('tool_one');
            expect(retrieved).toBe(mockTool1);
        });

        it('should return undefined for non-existent tool', () => {
            const retrieved = registry.get('non_existent');
            expect(retrieved).toBeUndefined();
        });
    });

    describe('getAll', () => {
        it('should return empty array when no tools registered', () => {
            const tools = registry.getAll();
            expect(tools).toEqual([]);
        });

        it('should return all registered tools', () => {
            registry.register(mockTool1);
            registry.register(mockTool2);
            const tools = registry.getAll();
            expect(tools).toHaveLength(2);
            expect(tools).toContain(mockTool1);
            expect(tools).toContain(mockTool2);
        });
    });

    describe('has', () => {
        it('should return true for registered tool', () => {
            registry.register(mockTool1);
            expect(registry.has('tool_one')).toBe(true);
        });

        it('should return false for non-existent tool', () => {
            expect(registry.has('non_existent')).toBe(false);
        });
    });

    describe('execute', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should execute a registered tool', async () => {
            registry.register(mockTool1);
            const result = await registry.execute('tool_one', { input: 'test' });
            expect(mockTool1.execute).toHaveBeenCalledWith({ input: 'test' }, undefined);
            expect(result).toBe('result1');
        });

        it('should execute tool with context', async () => {
            registry = new ToolRegistry({ workingDirectory: '/test/dir' });
            registry.register(mockTool1);

            const result = await registry.execute('tool_one', { input: 'test' });
            expect(mockTool1.execute).toHaveBeenCalledWith(
                { input: 'test' },
                { workingDirectory: '/test/dir' }
            );
        });

        it('should throw error when executing non-existent tool', async () => {
            await expect(registry.execute('non_existent', {})).rejects.toThrow(
                'Tool "non_existent" not found in registry'
            );
        });

        it('should wrap tool execution errors', async () => {
            const errorTool: Tool = {
                name: 'error_tool',
                description: 'Tool that throws error',
                parameters: {
                    type: 'object',
                    properties: {},
                },
                execute: async () => {
                    throw new Error('Tool execution failed');
                },
            };

            registry.register(errorTool);
            await expect(registry.execute('error_tool', {})).rejects.toThrow(
                'Tool "error_tool" execution failed: Tool execution failed'
            );
        });

        it('should pass parameters to tool execution', async () => {
            registry.register(mockTool2);
            const params = { value: 42 };
            await registry.execute('tool_two', params);
            expect(mockTool2.execute).toHaveBeenCalledWith(params, undefined);
        });
    });

    describe('toOpenAIFormat', () => {
        it('should convert tools to OpenAI format', () => {
            registry.register(mockTool1);
            const openaiTools = registry.toOpenAIFormat();

            expect(openaiTools).toHaveLength(1);
            expect(openaiTools[0].type).toBe('function');
            expect(openaiTools[0].function.name).toBe('tool_one');
            expect(openaiTools[0].function.description).toBe('First test tool');
            expect(openaiTools[0].function.parameters).toEqual(mockTool1.parameters);
        });

        it('should convert multiple tools to OpenAI format', () => {
            registry.register(mockTool1);
            registry.register(mockTool2);
            const openaiTools = registry.toOpenAIFormat();

            expect(openaiTools).toHaveLength(2);
            expect(openaiTools.map(t => t.function.name)).toEqual(['tool_one', 'tool_two']);
        });

        it('should return empty array when no tools registered', () => {
            const openaiTools = registry.toOpenAIFormat();
            expect(openaiTools).toEqual([]);
        });

        it('should preserve all tool information in OpenAI format', () => {
            const toolWithRequired: Tool = {
                name: 'test_tool',
                description: 'Test tool',
                parameters: {
                    type: 'object',
                    properties: {
                        param1: { type: 'string', description: 'Param 1' },
                        param2: { type: 'number', description: 'Param 2' },
                    },
                    required: ['param1'],
                },
                execute: vi.fn(),
            };

            registry.register(toolWithRequired);
            const openaiTools = registry.toOpenAIFormat();

            const tool = openaiTools[0];
            expect(tool.function.parameters.required).toContain('param1');
            expect(tool.function.parameters.properties.param1.type).toBe('string');
        });
    });

    describe('getDefinitions', () => {
        it('should return tool definitions without execute functions', () => {
            registry.register(mockTool1);
            registry.register(mockTool2);
            const definitions = registry.getDefinitions();

            expect(definitions).toHaveLength(2);
            expect(definitions[0]).toEqual({
                name: 'tool_one',
                description: 'First test tool',
                parameters: mockTool1.parameters,
            });
            expect(definitions[1]).toEqual({
                name: 'tool_two',
                description: 'Second test tool',
                parameters: mockTool2.parameters,
            });
        });

        it('should not include execute function in definitions', () => {
            registry.register(mockTool1);
            const definitions = registry.getDefinitions();

            expect(definitions[0]).not.toHaveProperty('execute');
        });

        it('should return empty array when no tools registered', () => {
            const definitions = registry.getDefinitions();
            expect(definitions).toEqual([]);
        });
    });

    describe('clear', () => {
        it('should remove all registered tools', () => {
            registry.register(mockTool1);
            registry.register(mockTool2);
            expect(registry.count()).toBe(2);

            registry.clear();
            expect(registry.count()).toBe(0);
            expect(registry.getAll()).toEqual([]);
        });

        it('should allow registering tools after clear', () => {
            registry.register(mockTool1);
            registry.clear();
            registry.register(mockTool1);
            expect(registry.count()).toBe(1);
        });
    });

    describe('count', () => {
        it('should return 0 for empty registry', () => {
            expect(registry.count()).toBe(0);
        });

        it('should return correct count after registrations', () => {
            registry.register(mockTool1);
            expect(registry.count()).toBe(1);

            registry.register(mockTool2);
            expect(registry.count()).toBe(2);
        });

        it('should update count after clear', () => {
            registry.register(mockTool1);
            registry.register(mockTool2);
            registry.clear();
            expect(registry.count()).toBe(0);
        });
    });
});

describe('createToolRegistry', () => {
    it('should create a new tool registry', () => {
        const registry = createToolRegistry();
        expect(registry).toBeInstanceOf(ToolRegistry);
        expect(registry.count()).toBe(0);
    });

    it('should create a registry with context', () => {
        const context = {
            workingDirectory: '/test/path',
            storage: {} as any,
        };
        const registry = createToolRegistry(context);
        expect(registry).toBeInstanceOf(ToolRegistry);

        const tool: Tool = {
            name: 'context_test',
            description: 'Test tool',
            parameters: {
                type: 'object',
                properties: {},
            },
            execute: vi.fn(async (params, ctx) => {
                expect(ctx?.workingDirectory).toBe('/test/path');
                expect(ctx?.storage).toBe(context.storage);
            }),
        };

        registry.register(tool);
        registry.execute('context_test', {});
    });

    it('should create independent registries', () => {
        const registry1 = createToolRegistry();
        const registry2 = createToolRegistry();

        const mockTool: Tool = {
            name: 'test_tool',
            description: 'Test',
            parameters: {
                type: 'object',
                properties: {},
            },
            execute: vi.fn(),
        };

        registry1.register(mockTool);
        expect(registry1.count()).toBe(1);
        expect(registry2.count()).toBe(0);
    });
});


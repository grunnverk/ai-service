import type { Tool, OpenAITool, ToolContext } from './types';

/**
 * Registry for managing tools available to agentic LLM interactions
 */
export class ToolRegistry {
    private tools: Map<string, Tool> = new Map();
    private context?: ToolContext;

    constructor(context?: ToolContext) {
        this.context = context;
    }

    /**
     * Register a tool in the registry
     */
    register(tool: Tool): void {
        if (this.tools.has(tool.name)) {
            throw new Error(`Tool with name "${tool.name}" is already registered`);
        }
        this.tools.set(tool.name, tool);
    }

    /**
     * Register multiple tools at once
     */
    registerAll(tools: Tool[]): void {
        for (const tool of tools) {
            this.register(tool);
        }
    }

    /**
     * Get a tool by name
     */
    get(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    /**
     * Get all registered tools
     */
    getAll(): Tool[] {
        return Array.from(this.tools.values());
    }

    /**
     * Check if a tool exists
     */
    has(name: string): boolean {
        return this.tools.has(name);
    }

    /**
     * Execute a tool by name with given parameters
     */
    async execute(name: string, params: any): Promise<any> {
        const tool = this.tools.get(name);
        if (!tool) {
            throw new Error(`Tool "${name}" not found in registry`);
        }

        try {
            return await tool.execute(params, this.context);
        } catch (error: any) {
            throw new Error(`Tool "${name}" execution failed: ${error.message}`);
        }
    }

    /**
     * Convert tools to OpenAI function calling format
     */
    toOpenAIFormat(): OpenAITool[] {
        return this.getAll().map(tool => ({
            type: 'function' as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
            },
        }));
    }

    /**
     * Get tool definitions (without execute functions) for serialization
     */
    getDefinitions(): Array<{ name: string; description: string; parameters: any }> {
        return this.getAll().map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
        }));
    }

    /**
     * Clear all registered tools
     */
    clear(): void {
        this.tools.clear();
    }

    /**
     * Get count of registered tools
     */
    count(): number {
        return this.tools.size;
    }
}

/**
 * Create a new tool registry with optional context
 */
export function createToolRegistry(context?: ToolContext): ToolRegistry {
    return new ToolRegistry(context);
}


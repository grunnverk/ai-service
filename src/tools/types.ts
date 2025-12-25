/**
 * Tool system for agentic LLM interactions
 */

export interface ToolParameter {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description: string;
    items?: ToolParameter; // For array types
    properties?: Record<string, ToolParameter>; // For object types
    required?: string[]; // For object types
    enum?: string[]; // For enum values
    default?: any;
}

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, ToolParameter>;
        required?: string[];
    };
}

export interface Tool {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, ToolParameter>;
        required?: string[];
    };
    execute: (params: any, context?: ToolContext) => Promise<any>;
}

export interface ToolContext {
    workingDirectory?: string;
    storage?: any;
    logger?: any;
}

export interface ToolCall {
    id: string;
    name: string;
    arguments: any;
}

export interface ToolResult {
    id: string;
    name: string;
    result: any;
    error?: string;
}

// OpenAI-compatible tool format
export interface OpenAITool {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, any>;
            required?: string[];
        };
    };
}


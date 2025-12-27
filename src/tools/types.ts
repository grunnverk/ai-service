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

/**
 * Tool example showing when and how to use the tool
 * Matches riotprompt's ToolExample interface
 */
export interface ToolExample {
    scenario: string;
    params: any;
    expectedResult: string;
}

/**
 * Tool cost indicator for guidance
 * Using riotprompt's cost levels
 */
export type ToolCost = 'cheap' | 'moderate' | 'expensive';

export interface Tool {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, ToolParameter>;
        required?: string[];
    };
    execute: (params: any, context?: ToolContext) => Promise<any>;

    // Enhanced metadata for riotprompt integration
    category?: string; // Tool category for grouping (e.g., 'Understanding', 'Analysis')
    cost?: ToolCost; // Execution cost hint (low/medium/high)
    examples?: ToolExample[]; // Usage examples
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


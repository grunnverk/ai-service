import type { ChatCompletionMessageParam } from 'openai/resources';
import { createCompletionWithRetry } from '../ai';
import type { ToolRegistry } from '../tools/registry';
import type { ToolResult } from '../tools/types';

export interface AgenticConfig {
    messages: ChatCompletionMessageParam[];
    tools: ToolRegistry;
    model?: string;
    maxIterations?: number;
    debug?: boolean;
    debugRequestFile?: string;
    debugResponseFile?: string;
    storage?: any;
    logger?: any;
    openaiReasoning?: 'low' | 'medium' | 'high';
}

export interface AgenticResult {
    finalMessage: string;
    iterations: number;
    toolCallsExecuted: number;
    conversationHistory: ChatCompletionMessageParam[];
}

/**
 * Execute an agentic loop where the LLM can call tools to gather information
 */
export class AgenticExecutor {
    private logger?: any;

    constructor(logger?: any) {
        this.logger = logger;
    }

    /**
     * Run the agentic loop
     */
    async run(config: AgenticConfig): Promise<AgenticResult> {
        const {
            messages: initialMessages,
            tools,
            model = 'gpt-4o',
            maxIterations = 10,
            debug = false,
            debugRequestFile,
            debugResponseFile,
            storage,
            logger,
            openaiReasoning = false,
        } = config;

        const messages = [...initialMessages];
        let iterations = 0;
        let toolCallsExecuted = 0;

        this.log('Starting agentic loop', { maxIterations, toolCount: tools.count() });

        while (iterations < maxIterations) {
            iterations++;
            this.log(`Iteration ${iterations}/${maxIterations}`);

            // Call LLM with tools available
            const response = await createCompletionWithRetry(
                messages,
                {
                    model,
                    openaiReasoning: openaiReasoning || undefined,
                    debug,
                    debugRequestFile: debugRequestFile ? `${debugRequestFile}-iter${iterations}` : undefined,
                    debugResponseFile: debugResponseFile ? `${debugResponseFile}-iter${iterations}` : undefined,
                    storage,
                    logger,
                    tools: tools.toOpenAIFormat(),
                }
            );

            // When tools are enabled, response is the full message object
            const message = typeof response === 'string' ? { role: 'assistant', content: response } : response;

            // Check if there are tool calls in the response
            const toolCalls = message.tool_calls || [];

            if (toolCalls.length === 0) {
                // No tool calls, agent is done
                const finalContent = message.content || '';
                this.log('Agent completed without tool calls', { iterations, toolCallsExecuted });
                messages.push({
                    role: 'assistant',
                    content: finalContent,
                });
                return {
                    finalMessage: finalContent,
                    iterations,
                    toolCallsExecuted,
                    conversationHistory: messages,
                };
            }

            // Add assistant message with tool calls
            messages.push({
                role: 'assistant',
                content: message.content || null,
                tool_calls: toolCalls,
            });

            // Execute tool calls
            this.log(`Executing ${toolCalls.length} tool call(s)`);

            for (const toolCall of toolCalls) {
                try {
                    this.log(`Executing tool: ${toolCall.function.name}`, toolCall.function.arguments);

                    // Parse arguments
                    const args = JSON.parse(toolCall.function.arguments);

                    // Execute the tool
                    const result = await tools.execute(toolCall.function.name, args);

                    // Add tool result to conversation
                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: this.formatToolResult({ id: toolCall.id, name: toolCall.function.name, result }),
                    });

                    toolCallsExecuted++;
                    this.log(`Tool ${toolCall.function.name} succeeded`);
                } catch (error: any) {
                    this.log(`Tool ${toolCall.function.name} failed: ${error.message}`);

                    // Add error result to conversation
                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: `Tool execution failed: ${error.message}`,
                    });
                }
            }

            this.log(`Completed tool execution`, { toolCallsExecuted });
        }

        // Max iterations reached
        this.log('Max iterations reached, forcing completion', { iterations, toolCallsExecuted });

        // Make one final call without tools to get a synthesized response
        messages.push({
            role: 'user',
            content: 'Please provide your final analysis and commit message based on your investigation. Do not request any more tools.',
        });

        const finalResponse = await createCompletionWithRetry(
            messages,
            {
                model,
                openaiReasoning: openaiReasoning || undefined,
                debug,
                storage,
                logger,
            }
        );

        messages.push({
            role: 'assistant',
            content: finalResponse,
        });

        return {
            finalMessage: finalResponse,
            iterations,
            toolCallsExecuted,
            conversationHistory: messages,
        };
    }

    /**
     * Format tool result for inclusion in conversation
     */
    private formatToolResult(result: ToolResult): string {
        if (typeof result.result === 'string') {
            return result.result;
        }
        return JSON.stringify(result.result, null, 2);
    }

    /**
     * Log a message if logger is available
     */
    private log(message: string, data?: any): void {
        if (this.logger?.debug) {
            if (data) {
                this.logger.debug(`[AgenticExecutor] ${message}`, data);
            } else {
                this.logger.debug(`[AgenticExecutor] ${message}`);
            }
        }
    }
}

/**
 * Create and run an agentic executor
 */
export async function runAgentic(config: AgenticConfig): Promise<AgenticResult> {
    const executor = new AgenticExecutor(config.logger);
    return await executor.run(config);
}


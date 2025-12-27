import type { ChatCompletionMessageParam } from 'openai/resources';
import { createCompletionWithRetry } from '../ai';
import type { ToolRegistry } from '../tools/registry';
import type { ToolResult } from '../tools/types';
import { ConversationBuilder, type Model } from '@riotprompt/riotprompt';

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
    // Token budget configuration
    tokenBudget?: {
        max: number;
        reserveForResponse?: number;
        strategy?: 'priority-based' | 'fifo' | 'summarize' | 'adaptive';
        onBudgetExceeded?: 'compress' | 'error' | 'warn' | 'truncate';
    };
}

export interface ToolExecutionMetric {
    name: string;
    success: boolean;
    duration: number;
    error?: string;
    iteration: number;
    timestamp: string;
}

export interface AgenticResult {
    finalMessage: string;
    iterations: number;
    toolCallsExecuted: number;
    conversationHistory: ChatCompletionMessageParam[];
    toolMetrics: ToolExecutionMetric[];
}

/**
 * Execute an agentic loop where the LLM can call tools to gather information
 */
export class AgenticExecutor {
    private logger?: any;
    private toolMetrics: ToolExecutionMetric[] = [];

    constructor(logger?: any) {
        this.logger = logger;
    }

    /**
     * Run the agentic loop with ConversationBuilder
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
            tokenBudget,
        } = config;

        // Create ConversationBuilder for better state management
        const conversation = ConversationBuilder.create({ model: model as Model }, logger);

        // Add initial messages to conversation
        for (const msg of initialMessages) {
            if (msg.role === 'system') {
                conversation.addSystemMessage(msg.content as string);
            } else if (msg.role === 'user') {
                conversation.addUserMessage(msg.content as string);
            }
        }

        // Configure token budget if provided
        if (tokenBudget) {
            this.log('Configuring token budget', tokenBudget);
            conversation.withTokenBudget({
                max: tokenBudget.max,
                reserveForResponse: tokenBudget.reserveForResponse || 4000,
                strategy: tokenBudget.strategy || 'fifo',
                onBudgetExceeded: tokenBudget.onBudgetExceeded || 'compress'
            });
        }

        let iterations = 0;
        let toolCallsExecuted = 0;

        this.log('Starting agentic loop with ConversationBuilder', { maxIterations, toolCount: tools.count() });

        while (iterations < maxIterations) {
            iterations++;
            this.log(`Iteration ${iterations}/${maxIterations}`);

            // Get current messages from conversation
            const messages = conversation.toMessages();

            // Call LLM with tools available
            const response = await createCompletionWithRetry(
                messages as ChatCompletionMessageParam[],
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
                conversation.addAssistantMessage(finalContent);

                return {
                    finalMessage: finalContent,
                    iterations,
                    toolCallsExecuted,
                    conversationHistory: conversation.toMessages() as ChatCompletionMessageParam[],
                    toolMetrics: this.toolMetrics,
                };
            }

            // Add assistant message with tool calls to conversation
            conversation.addAssistantWithToolCalls(message.content || null, toolCalls as any);

            // Execute tool calls
            this.log(`Executing ${toolCalls.length} tool call(s)`);

            for (const toolCall of toolCalls) {
                const startTime = Date.now();
                const toolName = toolCall.function.name;

                try {
                    this.log(`Executing tool: ${toolName}`, toolCall.function.arguments);

                    // Log to info level so user can see tool execution in real-time
                    if (this.logger?.info) {
                        this.logger.info(`🔧 Running tool: ${toolName}`);
                    }

                    // Parse arguments with error handling
                    let args: any;
                    try {
                        args = JSON.parse(toolCall.function.arguments);
                    } catch (parseError: any) {
                        throw new Error(`Failed to parse tool arguments: ${parseError.message}`);
                    }

                    // Execute the tool
                    const result = await tools.execute(toolName, args);

                    const duration = Date.now() - startTime;

                    // Add tool result to conversation using ConversationBuilder
                    const formattedResult = this.formatToolResult({ id: toolCall.id, name: toolName, result });
                    conversation.addToolResult(toolCall.id, formattedResult, toolName);

                    toolCallsExecuted++;

                    // Track successful execution
                    this.toolMetrics.push({
                        name: toolName,
                        success: true,
                        duration,
                        iteration: iterations,
                        timestamp: new Date().toISOString(),
                    });

                    this.log(`Tool ${toolName} succeeded in ${duration}ms`);

                    if (this.logger?.info) {
                        this.logger.info(`✅ Tool ${toolName} completed (${duration}ms)`);
                    }
                } catch (error: any) {
                    const duration = Date.now() - startTime;
                    const errorMessage = error.message || String(error);

                    this.log(`Tool ${toolName} failed: ${errorMessage}`);

                    // Track failed execution
                    this.toolMetrics.push({
                        name: toolName,
                        success: false,
                        duration,
                        error: errorMessage,
                        iteration: iterations,
                        timestamp: new Date().toISOString(),
                    });

                    if (this.logger?.warn) {
                        this.logger.warn(`❌ Tool ${toolName} failed: ${errorMessage}`);
                    }

                    // Add error result to conversation using ConversationBuilder
                    conversation.addToolResult(toolCall.id, `Tool execution failed: ${errorMessage}`, toolName);
                }
            }

            this.log(`Completed tool execution`, { toolCallsExecuted });
        }

        // Max iterations reached
        this.log('Max iterations reached, forcing completion', { iterations, toolCallsExecuted });

        // Make one final call without tools to get a synthesized response
        conversation.addUserMessage('Please provide your final analysis based on your investigation. Do not request any more tools.');

        const finalMessages = conversation.toMessages();
        const finalResponse = await createCompletionWithRetry(
            finalMessages as ChatCompletionMessageParam[],
            {
                model,
                openaiReasoning: openaiReasoning || undefined,
                debug,
                storage,
                logger,
            }
        );

        conversation.addAssistantMessage(finalResponse);

        return {
            finalMessage: finalResponse,
            iterations,
            toolCallsExecuted,
            conversationHistory: conversation.toMessages() as ChatCompletionMessageParam[],
            toolMetrics: this.toolMetrics,
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


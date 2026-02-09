import { OpenAI } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources';
import { safeJsonParse } from '@grunnverk/git-tools';
import { createRequest } from '@kjerneverk/execution';
import type { Message } from '@kjerneverk/execution';
import fs from 'fs';
import { getLogger } from './logger';
import { resolveProvider, buildExecutionOptions } from './provider';
import type { AIConfig, Transcription, StorageAdapter, Logger } from './types';

export interface OpenAIOptions {
    responseFormat?: any;
    model?: string;
    debug?: boolean;
    debugFile?: string;
    debugRequestFile?: string;
    debugResponseFile?: string;
    maxTokens?: number;
    openaiReasoning?: 'low' | 'medium' | 'high';
    openaiMaxOutputTokens?: number;
    storage?: StorageAdapter;
    logger?: Logger;
    tools?: any[]; // Tool definitions (OpenAI format)
    toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
}

export interface TranscriptionOptions {
    model?: string;
    debug?: boolean;
    debugFile?: string;
    debugRequestFile?: string;
    debugResponseFile?: string;
    outputDirectory?: string;
    storage?: StorageAdapter;
    logger?: Logger;
    onArchive?: (audioPath: string, transcriptionText: string) => Promise<void>;
}

/**
 * Get the appropriate model to use based on command-specific configuration
 * Command-specific model overrides the global model setting
 */
export function getModelForCommand(config: AIConfig, commandName: string): string {
    let commandModel: string | undefined;

    switch (commandName) {
        case 'commit':
        case 'audio-commit':
            commandModel = config.commands?.commit?.model;
            break;
        case 'release':
            commandModel = config.commands?.release?.model;
            break;
        case 'review':
        case 'audio-review':
            commandModel = config.commands?.review?.model;
            break;
        default:
            // For other commands, just use global model
            break;
    }

    // Return command-specific model if available, otherwise global model, otherwise auto-detect
    return commandModel || config.model || '';
}

/**
 * Get the reasoning level based on command-specific configuration
 * Only applicable for OpenAI o-series models
 */
export function getReasoningForCommand(config: AIConfig, commandName: string): 'low' | 'medium' | 'high' {
    let commandReasoning: 'low' | 'medium' | 'high' | undefined;

    switch (commandName) {
        case 'commit':
        case 'audio-commit':
            commandReasoning = config.commands?.commit?.reasoning;
            break;
        case 'release':
            commandReasoning = config.commands?.release?.reasoning;
            break;
        case 'review':
        case 'audio-review':
            commandReasoning = config.commands?.review?.reasoning;
            break;
        default:
            // For other commands, just use global reasoning
            break;
    }

    // Return command-specific reasoning if available, otherwise global reasoning
    return commandReasoning || config.reasoning || 'low';
}

/**
 * @deprecated Use getReasoningForCommand instead
 */
export const getOpenAIReasoningForCommand = getReasoningForCommand;

export class LLMError extends Error {
    constructor(message: string, public readonly isTokenLimitError: boolean = false) {
        super(message);
        this.name = 'LLMError';
    }
}

/**
 * @deprecated Use LLMError instead
 */
export const OpenAIError = LLMError;

// Check if an error is a token limit exceeded error
export function isTokenLimitError(error: any): boolean {
    if (!error?.message) return false;

    const message = error.message.toLowerCase();
    return message.includes('maximum context length') ||
           message.includes('context_length_exceeded') ||
           message.includes('token limit') ||
           message.includes('too many tokens') ||
           message.includes('reduce the length') ||
           // Anthropic-specific
           message.includes('prompt is too long') ||
           message.includes('too many input tokens');
}

// Check if an error is a rate limit error
export function isRateLimitError(error: any): boolean {
    if (!error?.message && !error?.code && !error?.status) return false;

    // Check for common HTTP rate limit status
    if (error.status === 429 || error.code === 'rate_limit_exceeded') {
        return true;
    }

    // Only check message if it exists
    if (error.message) {
        const message = error.message.toLowerCase();
        return message.includes('rate limit exceeded') ||
               message.includes('too many requests') ||
               message.includes('quota exceeded') ||
               (message.includes('rate') && message.includes('limit')) ||
               // Anthropic-specific
               message.includes('overloaded');
    }

    return false;
}

/**
 * Convert ChatCompletionMessageParam to kjerneverk Message format
 */
function toExecutionMessages(messages: ChatCompletionMessageParam[]): Message[] {
    return messages.map(msg => ({
        role: msg.role as Message['role'],
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    }));
}

/**
 * Create LLM completion using the best available provider.
 *
 * Delegates to kjerneverk execution providers:
 * - Anthropic (claude-*) if ANTHROPIC_API_KEY is set
 * - OpenAI (gpt-*, o-series) if OPENAI_API_KEY is set
 * - Auto-detects provider from model name or available API keys
 *
 * For tool-calling (agentic) workflows, uses direct SDK calls until
 * kjerneverk providers support tool definitions natively.
 * See: mature-kjerneverk-ai plan for provider tool support.
 *
 * Function signature is preserved for backward compatibility.
 */
export async function createCompletion(
    messages: ChatCompletionMessageParam[],
    options: OpenAIOptions = {}
): Promise<string | any> {
    const logger = options.logger || getLogger();

    try {
        // Resolve provider and model
        const resolved = resolveProvider(options.model);
        const modelToUse = resolved.model;

        // Calculate request size
        const requestSize = JSON.stringify(messages).length;
        const requestSizeKB = (requestSize / 1024).toFixed(2);

        // Log provider, model, and request size
        const reasoningInfo = options.openaiReasoning ? ` | Reasoning: ${options.openaiReasoning}` : '';
        logger.info('🤖 Making request to %s', resolved.providerName);
        logger.info('   Model: %s%s', modelToUse, reasoningInfo);
        logger.info('   Request size: %s KB (%s bytes)', requestSizeKB, requestSize.toLocaleString());

        logger.debug('Sending prompt to %s: %j', resolved.providerName, messages);

        // Use openaiMaxOutputTokens if specified, otherwise fall back to maxTokens, or default
        const maxTokens = options.openaiMaxOutputTokens ?? options.maxTokens ?? 10000;

        // Save request debug file if enabled
        if (options.debug && (options.debugRequestFile || options.debugFile) && options.storage) {
            const requestData = {
                provider: resolved.providerName,
                model: modelToUse,
                messages,
                max_tokens: maxTokens,
                response_format: options.responseFormat,
                reasoning_effort: options.openaiReasoning,
                tools: options.tools ? `[${options.tools.length} tools]` : undefined,
            };
            const debugFile = options.debugRequestFile || options.debugFile;
            await options.storage.writeTemp(debugFile!, JSON.stringify(requestData, null, 2));
            logger.debug('Wrote request debug file to %s', debugFile);
        }

        // Start timing and progress indicator
        const startTime = Date.now();
        let progressIntervalId: NodeJS.Timeout | null = null;
        progressIntervalId = setInterval(() => {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            logger.info('   ⏳ Waiting for response... %ds', elapsed);
        }, 5000);

        // Add timeout wrapper
        const timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS || '300000', 10);
        const validTimeout = isNaN(timeoutMs) || timeoutMs <= 0 ? 300000 : timeoutMs;

        let providerResponse;

        // Tool-calling path: uses direct SDK until kjerneverk providers support tools natively
        if (options.tools && options.tools.length > 0) {
            providerResponse = await executeWithTools(
                messages, options, resolved, modelToUse, maxTokens, validTimeout, logger
            );
        } else {
            // Standard path: delegate to kjerneverk provider
            const request = createRequest(modelToUse);
            for (const msg of toExecutionMessages(messages)) {
                request.addMessage(msg);
            }
            if (options.responseFormat) {
                request.responseFormat = options.responseFormat;
            }

            const executionOptions = buildExecutionOptions(resolved, {
                maxTokens,
                timeout: validTimeout,
            });

            let timeoutId: NodeJS.Timeout | null = null;
            const executionPromise = resolved.provider.execute(request, executionOptions);
            const timeoutPromise = new Promise<never>((_, reject) => {
                timeoutId = setTimeout(
                    () => reject(new LLMError(`API call timed out after ${validTimeout / 1000} seconds`)),
                    validTimeout
                );
            });

            try {
                const raw = await Promise.race([executionPromise, timeoutPromise]);
                // Normalize to common shape
                providerResponse = {
                    content: raw.content,
                    model: raw.model,
                    usage: raw.usage ? {
                        inputTokens: raw.usage.inputTokens,
                        outputTokens: raw.usage.outputTokens,
                    } : undefined,
                    toolCalls: raw.toolCalls,
                };
            } finally {
                if (timeoutId !== null) clearTimeout(timeoutId);
            }
        }

        // Clear progress indicator
        if (progressIntervalId !== null) clearInterval(progressIntervalId);

        const elapsedTime = Date.now() - startTime;

        // Save response debug file if enabled
        if (options.debug && (options.debugResponseFile || options.debugFile) && options.storage) {
            const debugFile = options.debugResponseFile || options.debugFile;
            await options.storage.writeTemp(debugFile!, JSON.stringify(providerResponse, null, 2));
            logger.debug('Wrote response debug file to %s', debugFile);
        }

        // Log elapsed time
        const elapsedTimeFormatted = elapsedTime >= 1000
            ? `${(elapsedTime / 1000).toFixed(1)}s`
            : `${elapsedTime}ms`;

        // If tools are being used, return in the format the AgenticExecutor expects
        if (options.tools && options.tools.length > 0) {
            logger.info('   Time: %s', elapsedTimeFormatted);
            logUsage(logger, providerResponse.usage);

            return {
                role: 'assistant',
                content: providerResponse.content || null,
                tool_calls: providerResponse.toolCalls || undefined,
            };
        }

        // For non-tool calls, return content as string
        const response = providerResponse.content?.trim();
        if (!response) {
            throw new LLMError('No response content received from LLM provider');
        }

        // Log response metrics
        const responseSize = response.length;
        const responseSizeKB = (responseSize / 1024).toFixed(2);
        logger.info('   Response size: %s KB (%s bytes)', responseSizeKB, responseSize.toLocaleString());
        logger.info('   Time: %s', elapsedTimeFormatted);
        logUsage(logger, providerResponse.usage);

        logger.debug('Received response from %s: %s...', resolved.providerName, response.substring(0, 30));
        if (options.responseFormat) {
            return safeJsonParse(response, 'LLM API response');
        } else {
            return response;
        }

    } catch (error: any) {
        logger.error('Error calling LLM API: %s %s', error.message, error.stack);
        const isTokenError = isTokenLimitError(error);
        throw new LLMError(`Failed to create completion: ${error.message}`, isTokenError);
    }
}

/**
 * Log token usage in a provider-agnostic format
 */
function logUsage(logger: Logger, usage?: { inputTokens: number; outputTokens: number }): void {
    if (usage) {
        logger.info('   Token usage: %s input + %s output = %s total',
            usage.inputTokens?.toLocaleString() || '?',
            usage.outputTokens?.toLocaleString() || '?',
            ((usage.inputTokens || 0) + (usage.outputTokens || 0)).toLocaleString()
        );
    }
}

/**
 * Execute a completion with tool definitions using direct SDK calls.
 *
 * The kjerneverk execution providers don't yet support passing tool definitions
 * in the Request object. Until they do (see mature-kjerneverk-ai plan), agentic
 * tool-calling workflows use direct SDK calls routed through the resolved provider.
 *
 * This function handles both OpenAI and Anthropic tool call formats.
 */
async function executeWithTools(
    messages: ChatCompletionMessageParam[],
    options: OpenAIOptions,
    resolved: import('./provider').ResolvedProvider,
    model: string,
    maxTokens: number,
    timeoutMs: number,
    logger: Logger
): Promise<{ content: string; model: string; usage?: { inputTokens: number; outputTokens: number }; toolCalls?: any[] }> {

    if (resolved.providerName === 'openai') {
        // Direct OpenAI SDK call with tools
        const client = new OpenAI({
            apiKey: resolved.apiKey,
            timeout: timeoutMs,
        });

        const apiOptions: any = {
            model,
            messages,
            max_completion_tokens: maxTokens,
            response_format: options.responseFormat,
            tools: options.tools,
            tool_choice: options.toolChoice || 'auto',
        };

        // Add reasoning parameter if applicable
        if (options.openaiReasoning && (model.includes('gpt-5') || model.includes('o3'))) {
            apiOptions.reasoning_effort = options.openaiReasoning;
        }

        const completion = await client.chat.completions.create(apiOptions);
        const message = completion.choices[0]?.message;

        return {
            content: message?.content || '',
            model: completion.model,
            usage: completion.usage ? {
                inputTokens: completion.usage.prompt_tokens,
                outputTokens: completion.usage.completion_tokens,
            } : undefined,
            toolCalls: message?.tool_calls?.filter(tc => tc.type === 'function').map(tc => ({
                id: tc.id,
                type: 'function' as const,
                function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                },
            })),
        };

    } else if (resolved.providerName === 'anthropic') {
        // Direct Anthropic SDK call with tools
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new Anthropic({ apiKey: resolved.apiKey });

        // Separate system prompt (Anthropic requires it separate)
        let systemPrompt = '';
        const anthropicMessages: any[] = [];

        for (const msg of messages) {
            if (msg.role === 'system' || (msg as any).role === 'developer') {
                systemPrompt += (typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)) + '\n\n';
            } else if (msg.role === 'tool') {
                // Convert OpenAI tool result format to Anthropic format
                anthropicMessages.push({
                    role: 'user',
                    content: [{
                        type: 'tool_result',
                        tool_use_id: (msg as any).tool_call_id,
                        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
                    }],
                });
            } else if (msg.role === 'assistant' && (msg as any).tool_calls) {
                // Convert OpenAI assistant+tool_calls to Anthropic format
                const content: any[] = [];
                if (msg.content) {
                    content.push({ type: 'text', text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) });
                }
                for (const tc of (msg as any).tool_calls) {
                    content.push({
                        type: 'tool_use',
                        id: tc.id,
                        name: tc.function.name,
                        input: JSON.parse(tc.function.arguments),
                    });
                }
                anthropicMessages.push({ role: 'assistant', content });
            } else {
                anthropicMessages.push({
                    role: msg.role as 'user' | 'assistant',
                    content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
                });
            }
        }

        // Convert OpenAI tool format to Anthropic tool format
        const anthropicTools = (options.tools || []).map((tool: any) => ({
            name: tool.function.name,
            description: tool.function.description,
            input_schema: tool.function.parameters,
        }));

        const response = await client.messages.create({
            model,
            system: systemPrompt.trim() || undefined,
            messages: anthropicMessages,
            max_tokens: maxTokens,
            tools: anthropicTools,
        });

        // Extract text content and tool calls from response
        let textContent = '';
        const toolCalls: any[] = [];

        for (const block of response.content) {
            if (block.type === 'text') {
                textContent += block.text;
            } else if (block.type === 'tool_use') {
                toolCalls.push({
                    id: block.id,
                    type: 'function' as const,
                    function: {
                        name: block.name,
                        arguments: JSON.stringify(block.input),
                    },
                });
            }
        }

        return {
            content: textContent,
            model: response.model,
            usage: {
                inputTokens: response.usage.input_tokens,
                outputTokens: response.usage.output_tokens,
            },
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        };

    } else {
        throw new LLMError(`Tool calling is not supported for provider: ${resolved.providerName}`);
    }
}

/**
 * Create completion with automatic retry on token limit errors
 */
export async function createCompletionWithRetry(
    messages: ChatCompletionMessageParam[],
    options: OpenAIOptions = {},
    retryCallback?: (attempt: number) => Promise<ChatCompletionMessageParam[]>
): Promise<string | any> {
    const logger = options.logger || getLogger();
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const messagesToSend = attempt === 1 ? messages : (retryCallback ? await retryCallback(attempt) : messages);
            return await createCompletion(messagesToSend, options);
        } catch (error: any) {
            if (error instanceof LLMError && error.isTokenLimitError && attempt < maxRetries && retryCallback) {
                logger.warn('Token limit exceeded on attempt %d/%d, retrying with reduced content...', attempt, maxRetries);
                const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                continue;
            } else if (isRateLimitError(error) && attempt < maxRetries) {
                const backoffMs = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
                logger.warn(`Rate limit hit on attempt ${attempt}/${maxRetries}, waiting ${backoffMs}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                continue;
            }
            throw error;
        }
    }

    // This should never be reached, but TypeScript requires it
    throw new LLMError('Max retries exceeded');
}

/**
 * Transcribe audio file using OpenAI Whisper API
 * NOTE: This remains OpenAI-specific. Will be moved to commands-audio in eliminate-ai-service plan.
 */
export async function transcribeAudio(
    filePath: string,
    options: TranscriptionOptions = { model: "whisper-1" }
): Promise<Transcription> {
    const logger = options.logger || getLogger();
    let openai: OpenAI | null = null;
    let audioStream: fs.ReadStream | null = null;
    let streamClosed = false;

    // Helper function to safely close the stream
    const closeAudioStream = () => {
        if (audioStream && !streamClosed) {
            try {
                if (typeof audioStream.destroy === 'function' && !audioStream.destroyed) {
                    audioStream.destroy();
                }
                streamClosed = true;
                logger.debug('Audio stream closed successfully');
            } catch (streamErr) {
                logger.debug('Failed to destroy audio read stream: %s', (streamErr as Error).message);
                streamClosed = true;
            }
        }
    };

    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new LLMError('OPENAI_API_KEY environment variable is required for audio transcription (Whisper API)');
        }

        const projectId = process.env.OPENAI_PROJECT_ID;
        openai = new OpenAI({
            apiKey: apiKey,
            ...(projectId && { project: projectId }),
        });

        logger.debug('Transcribing audio file: %s', filePath);

        if (options.debug && (options.debugRequestFile || options.debugFile) && options.storage) {
            const requestData = {
                model: options.model || "whisper-1",
                file: filePath,
                response_format: "json",
            };
            const debugFile = options.debugRequestFile || options.debugFile;
            await options.storage.writeTemp(debugFile!, JSON.stringify(requestData, null, 2));
            logger.debug('Wrote request debug file to %s', debugFile);
        }

        audioStream = fs.createReadStream(filePath);

        if (audioStream && typeof audioStream.on === 'function') {
            audioStream.on('error', (streamError) => {
                logger.error('Audio stream error: %s', streamError.message);
                closeAudioStream();
            });
        }

        let transcription;
        try {
            transcription = await openai.audio.transcriptions.create({
                model: options.model || "whisper-1",
                file: audioStream,
                response_format: "json",
            });
            closeAudioStream();
        } catch (apiError) {
            closeAudioStream();
            throw apiError;
        }

        if (options.debug && (options.debugResponseFile || options.debugFile) && options.storage) {
            const debugFile = options.debugResponseFile || options.debugFile;
            await options.storage.writeTemp(debugFile!, JSON.stringify(transcription, null, 2));
            logger.debug('Wrote response debug file to %s', debugFile);
        }

        const response = transcription;
        if (!response) {
            throw new LLMError('No transcription received from OpenAI');
        }

        logger.debug('Received transcription from OpenAI: %s', response);

        if (options.onArchive) {
            try {
                await options.onArchive(filePath, response.text);
            } catch (archiveError: any) {
                logger.warn('Failed to archive audio file: %s', archiveError.message);
            }
        }

        return response;

    } catch (error: any) {
        logger.error('Error transcribing audio file: %s %s', error.message, error.stack);
        throw new LLMError(`Failed to transcribe audio: ${error.message}`);
    } finally {
        closeAudioStream();
    }
}

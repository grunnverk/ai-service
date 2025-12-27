import { OpenAI } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources';
import { safeJsonParse } from '@eldrforge/git-tools';
import fs from 'fs';
import { getLogger } from './logger';
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
    tools?: any[]; // OpenAI tool definitions
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

    // Return command-specific model if available, otherwise global model
    return commandModel || config.model || 'gpt-4o-mini';
}

/**
 * Get the appropriate OpenAI reasoning level based on command-specific configuration
 * Command-specific reasoning overrides the global reasoning setting
 */
export function getOpenAIReasoningForCommand(config: AIConfig, commandName: string): 'low' | 'medium' | 'high' {
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

export class OpenAIError extends Error {
    constructor(message: string, public readonly isTokenLimitError: boolean = false) {
        super(message);
        this.name = 'OpenAIError';
    }
}

// Check if an error is a token limit exceeded error
export function isTokenLimitError(error: any): boolean {
    if (!error?.message) return false;

    const message = error.message.toLowerCase();
    return message.includes('maximum context length') ||
           message.includes('context_length_exceeded') ||
           message.includes('token limit') ||
           message.includes('too many tokens') ||
           message.includes('reduce the length');
}

// Check if an error is a rate limit error
export function isRateLimitError(error: any): boolean {
    if (!error?.message && !error?.code && !error?.status) return false;

    // Check for OpenAI specific rate limit indicators
    if (error.status === 429 || error.code === 'rate_limit_exceeded') {
        return true;
    }

    // Only check message if it exists
    if (error.message) {
        const message = error.message.toLowerCase();
        return message.includes('rate limit exceeded') ||
               message.includes('too many requests') ||
               message.includes('quota exceeded') ||
               (message.includes('rate') && message.includes('limit'));
    }

    return false;
}

/**
 * Create OpenAI completion with optional debug and retry support
 */
export async function createCompletion(
    messages: ChatCompletionMessageParam[],
    options: OpenAIOptions = { model: "gpt-4o-mini" }
): Promise<string | any> {
    const logger = options.logger || getLogger();
    let openai: OpenAI | null = null;

    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new OpenAIError('OPENAI_API_KEY environment variable is not set');
        }

        // Create the client which we'll close in the finally block.
        const timeoutMs = parseInt(process.env.OPENAI_TIMEOUT_MS || '300000', 10); // Default to 5 minutes
        if (isNaN(timeoutMs) || timeoutMs <= 0) {
            throw new OpenAIError('Invalid OPENAI_TIMEOUT_MS value - must be a positive number');
        }
        openai = new OpenAI({
            apiKey: apiKey,
            timeout: timeoutMs,
        });

        const modelToUse = options.model || "gpt-4o-mini";

        // Calculate request size
        const requestSize = JSON.stringify(messages).length;
        const requestSizeKB = (requestSize / 1024).toFixed(2);

        // Log model, reasoning level, and request size
        const reasoningInfo = options.openaiReasoning ? ` | Reasoning: ${options.openaiReasoning}` : '';
        logger.info('🤖 Making request to OpenAI');
        logger.info('   Model: %s%s', modelToUse, reasoningInfo);
        logger.info('   Request size: %s KB (%s bytes)', requestSizeKB, requestSize.toLocaleString());

        logger.debug('Sending prompt to OpenAI: %j', messages);

        // Use openaiMaxOutputTokens if specified (highest priority), otherwise fall back to maxTokens, or default to 10000
        const maxCompletionTokens = options.openaiMaxOutputTokens ?? options.maxTokens ?? 10000;

        // Save request debug file if enabled
        if (options.debug && (options.debugRequestFile || options.debugFile) && options.storage) {
            const requestData = {
                model: modelToUse,
                messages,
                max_completion_tokens: maxCompletionTokens,
                response_format: options.responseFormat,
                reasoning_effort: options.openaiReasoning,
            };
            const debugFile = options.debugRequestFile || options.debugFile;
            await options.storage.writeTemp(debugFile!, JSON.stringify(requestData, null, 2));
            logger.debug('Wrote request debug file to %s', debugFile);
        }

        // Prepare the API call options
        const apiOptions: any = {
            model: modelToUse,
            messages,
            max_completion_tokens: maxCompletionTokens,
            response_format: options.responseFormat,
        };

        // Add tools if provided
        if (options.tools && options.tools.length > 0) {
            apiOptions.tools = options.tools;
            apiOptions.tool_choice = options.toolChoice || 'auto';
        }

        // Add reasoning parameter if specified and model supports it
        if (options.openaiReasoning && (modelToUse.includes('gpt-5') || modelToUse.includes('o3'))) {
            apiOptions.reasoning_effort = options.openaiReasoning;
        }

        // Add timeout wrapper to the OpenAI API call
        const startTime = Date.now();
        const completionPromise = openai.chat.completions.create(apiOptions);

        // Create timeout promise with proper cleanup to prevent memory leaks
        let timeoutId: NodeJS.Timeout | null = null;
        const timeoutPromise = new Promise<never>((_, reject) => {
            const timeoutMs = parseInt(process.env.OPENAI_TIMEOUT_MS || '300000', 10); // Default to 5 minutes
            const validTimeout = isNaN(timeoutMs) || timeoutMs <= 0 ? 300000 : timeoutMs;
            timeoutId = setTimeout(() => reject(new OpenAIError(`OpenAI API call timed out after ${validTimeout/1000} seconds`)), validTimeout);
        });

        // Add progress indicator that updates every 5 seconds
        let progressIntervalId: NodeJS.Timeout | null = null;
        progressIntervalId = setInterval(() => {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            logger.info('   ⏳ Waiting for response... %ds', elapsed);
        }, 5000);

        let completion;
        try {
            completion = await Promise.race([completionPromise, timeoutPromise]);
        } finally {
            // Clear the timeout to prevent memory leaks
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
            }
            // Clear the progress interval
            if (progressIntervalId !== null) {
                clearInterval(progressIntervalId);
            }
        }

        const elapsedTime = Date.now() - startTime;

        // Save response debug file if enabled
        if (options.debug && (options.debugResponseFile || options.debugFile) && options.storage) {
            const debugFile = options.debugResponseFile || options.debugFile;
            await options.storage.writeTemp(debugFile!, JSON.stringify(completion, null, 2));
            logger.debug('Wrote response debug file to %s', debugFile);
        }

        const message = completion.choices[0]?.message;
        if (!message) {
            throw new OpenAIError('No response message received from OpenAI');
        }

        // If tools are being used, return the full message object (includes tool_calls)
        if (options.tools && options.tools.length > 0) {
            // Log elapsed time
            const elapsedTimeFormatted = elapsedTime >= 1000
                ? `${(elapsedTime / 1000).toFixed(1)}s`
                : `${elapsedTime}ms`;
            logger.info('   Time: %s', elapsedTimeFormatted);

            // Log token usage if available
            if (completion.usage) {
                logger.info('   Token usage: %s prompt + %s completion = %s total',
                    completion.usage.prompt_tokens?.toLocaleString() || '?',
                    completion.usage.completion_tokens?.toLocaleString() || '?',
                    completion.usage.total_tokens?.toLocaleString() || '?'
                );
            }

            return message; // Return full message object for tool handling
        }

        // For non-tool calls, return content as string
        const response = message.content?.trim();
        if (!response) {
            throw new OpenAIError('No response content received from OpenAI');
        }

        // Calculate and log response size
        const responseSize = response.length;
        const responseSizeKB = (responseSize / 1024).toFixed(2);
        logger.info('   Response size: %s KB (%s bytes)', responseSizeKB, responseSize.toLocaleString());

        // Log elapsed time
        const elapsedTimeFormatted = elapsedTime >= 1000
            ? `${(elapsedTime / 1000).toFixed(1)}s`
            : `${elapsedTime}ms`;
        logger.info('   Time: %s', elapsedTimeFormatted);

        // Log token usage if available
        if (completion.usage) {
            logger.info('   Token usage: %s prompt + %s completion = %s total',
                completion.usage.prompt_tokens?.toLocaleString() || '?',
                completion.usage.completion_tokens?.toLocaleString() || '?',
                completion.usage.total_tokens?.toLocaleString() || '?'
            );
        }

        logger.debug('Received response from OpenAI: %s...', response.substring(0, 30));
        if (options.responseFormat) {
            return safeJsonParse(response, 'OpenAI API response');
        } else {
            return response;
        }

    } catch (error: any) {
        logger.error('Error calling OpenAI API: %s %s', error.message, error.stack);
        const isTokenError = isTokenLimitError(error);
        throw new OpenAIError(`Failed to create completion: ${error.message}`, isTokenError);
    } finally {
        // OpenAI client cleanup is handled automatically by the library
        // No manual cleanup needed for newer versions
    }
}

/**
 * Create completion with automatic retry on token limit errors
 */
export async function createCompletionWithRetry(
    messages: ChatCompletionMessageParam[],
    options: OpenAIOptions = { model: "gpt-4o-mini" },
    retryCallback?: (attempt: number) => Promise<ChatCompletionMessageParam[]>
): Promise<string | any> {
    const logger = options.logger || getLogger();
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const messagesToSend = attempt === 1 ? messages : (retryCallback ? await retryCallback(attempt) : messages);
            return await createCompletion(messagesToSend, options);
        } catch (error: any) {
            if (error instanceof OpenAIError && error.isTokenLimitError && attempt < maxRetries && retryCallback) {
                logger.warn('Token limit exceeded on attempt %d/%d, retrying with reduced content...', attempt, maxRetries);
                // Add exponential backoff for token limit errors
                const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                continue;
            } else if (isRateLimitError(error) && attempt < maxRetries) {
                // Handle rate limiting with exponential backoff
                const backoffMs = Math.min(2000 * Math.pow(2, attempt - 1), 15000); // More reasonable backoff: 2s, 4s, 8s, max 15s
                logger.warn(`Rate limit hit on attempt ${attempt}/${maxRetries}, waiting ${backoffMs}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                continue;
            }
            throw error;
        }
    }

    // This should never be reached, but TypeScript requires it
    throw new OpenAIError('Max retries exceeded');
}

/**
 * Transcribe audio file using OpenAI Whisper API
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
                // Only call destroy if it exists and the stream isn't already destroyed
                if (typeof audioStream.destroy === 'function' && !audioStream.destroyed) {
                    audioStream.destroy();
                }
                streamClosed = true;
                logger.debug('Audio stream closed successfully');
            } catch (streamErr) {
                logger.debug('Failed to destroy audio read stream: %s', (streamErr as Error).message);
                streamClosed = true; // Mark as closed even if destroy failed
            }
        }
    };

    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new OpenAIError('OPENAI_API_KEY environment variable is not set');
        }

        openai = new OpenAI({
            apiKey: apiKey,
        });

        logger.debug('Transcribing audio file: %s', filePath);

        // Save request debug file if enabled
        if (options.debug && (options.debugRequestFile || options.debugFile) && options.storage) {
            const requestData = {
                model: options.model || "whisper-1",
                file: filePath, // Can't serialize the stream, so just save the file path
                response_format: "json",
            };
            const debugFile = options.debugRequestFile || options.debugFile;
            await options.storage.writeTemp(debugFile!, JSON.stringify(requestData, null, 2));
            logger.debug('Wrote request debug file to %s', debugFile);
        }

        audioStream = fs.createReadStream(filePath);

        // Set up error handler for the stream to ensure cleanup on stream errors
        // Only add handler if the stream has the 'on' method (real streams)
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
            // Close the stream immediately after successful API call to prevent race conditions
            closeAudioStream();
        } catch (apiError) {
            // Close the stream immediately if the API call fails
            closeAudioStream();
            throw apiError;
        }

        // Save response debug file if enabled
        if (options.debug && (options.debugResponseFile || options.debugFile) && options.storage) {
            const debugFile = options.debugResponseFile || options.debugFile;
            await options.storage.writeTemp(debugFile!, JSON.stringify(transcription, null, 2));
            logger.debug('Wrote response debug file to %s', debugFile);
        }

        const response = transcription;
        if (!response) {
            throw new OpenAIError('No transcription received from OpenAI');
        }

        logger.debug('Received transcription from OpenAI: %s', response);

        // Archive the audio file and transcription if callback provided
        if (options.onArchive) {
            try {
                await options.onArchive(filePath, response.text);
            } catch (archiveError: any) {
                // Don't fail the transcription if archiving fails, just log the error
                logger.warn('Failed to archive audio file: %s', archiveError.message);
            }
        }

        return response;

    } catch (error: any) {
        logger.error('Error transcribing audio file: %s %s', error.message, error.stack);
        throw new OpenAIError(`Failed to transcribe audio: ${error.message}`);
    } finally {
        // Ensure the audio stream is properly closed to release file handles
        closeAudioStream();
        // OpenAI client cleanup is handled automatically by the library
        // No manual cleanup needed for newer versions
    }
}


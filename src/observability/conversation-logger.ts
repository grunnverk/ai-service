/**
 * Conversation logging for debugging and analysis
 *
 * Provides simple wrappers for logging agentic conversations
 * to disk for later analysis.
 */

import { ConversationLogger, type LogConfig } from '@riotprompt/riotprompt';
import type { Logger, StorageAdapter } from '../types';
import path from 'path';

export interface ConversationLoggerConfig {
    outputDir: string;
    format?: 'json' | 'markdown';
    includeMetadata?: boolean;
    storage?: StorageAdapter;
    logger?: Logger;
}

/**
 * Create a conversation logger instance
 *
 * @example
 * ```typescript
 * const logger = createConversationLogger({
 *     outputDir: 'output/conversations',
 *     storage,
 *     logger
 * });
 *
 * // Log conversation
 * await logger.save(conversationId, messages, metadata);
 * ```
 */
export function createConversationLogger(config: ConversationLoggerConfig) {
    const {
        outputDir,
        format = 'json',
        storage,
        logger
    } = config;

    return {
        /**
         * Save a conversation to disk
         */
        async save(
            conversationId: string,
            messages: any[],
            metadata?: Record<string, any>
        ): Promise<string> {
            try {
                if (!storage) {
                    throw new Error('Storage adapter required');
                }

                const conversation = {
                    id: conversationId,
                    timestamp: new Date().toISOString(),
                    messages,
                    metadata: metadata || {}
                };

                const filename = `${conversationId}.${format}`;
                const filepath = path.join(outputDir, filename);

                const content = format === 'json'
                    ? JSON.stringify(conversation, null, 2)
                    : formatConversationAsMarkdown(conversation);

                await storage.writeOutput(filename, content);

                if (logger) {
                    logger.debug(`Logged conversation ${conversationId} to ${filepath}`);
                }

                return filepath;
            } catch (error: any) {
                if (logger) {
                    logger.warn(`Failed to log conversation ${conversationId}: ${error.message}`);
                }
                throw error;
            }
        },

        /**
         * Load a conversation from disk
         */
        async load(conversationId: string) {
            try {
                if (!storage) {
                    throw new Error('Storage adapter required');
                }

                const filename = `${conversationId}.${format}`;
                const content = await storage.readFile(path.join(outputDir, filename), 'utf-8');

                let conversation: any;
                if (format === 'json') {
                    try {
                        conversation = JSON.parse(content);
                    } catch (parseError: any) {
                        throw new Error(`Failed to parse conversation JSON: ${parseError.message}`);
                    }
                } else {
                    conversation = content;
                }

                if (logger) {
                    logger.info(`Loaded conversation ${conversationId}`);
                }

                return conversation;
            } catch (error: any) {
                if (logger) {
                    logger.warn(`Failed to load conversation ${conversationId}: ${error.message}`);
                }
                throw error;
            }
        },

        /**
         * Get conversation summary
         */
        async getSummary(conversationId: string) {
            try {
                const conversation = await this.load(conversationId);

                return {
                    id: conversation.id,
                    timestamp: conversation.timestamp,
                    messageCount: conversation.messages?.length || 0,
                    metadata: conversation.metadata
                };
            } catch (error: any) {
                if (logger) {
                    logger.warn(`Failed to get summary for ${conversationId}: ${error.message}`);
                }
                throw error;
            }
        },

        /**
         * Create riotprompt ConversationLogger instance for advanced usage
         */
        createRiotLogger(): ConversationLogger {
            const logConfig: LogConfig = {
                enabled: true,
                outputPath: outputDir,
                format: format as 'json' | 'markdown' | 'jsonl',
                includeMetadata: true
            };

            return new ConversationLogger(logConfig, logger);
        }
    };
}

/**
 * Format conversation as markdown
 */
function formatConversationAsMarkdown(conversation: any): string {
    const lines: string[] = [];

    lines.push(`# Conversation: ${conversation.id}`);
    lines.push('');
    lines.push(`**Timestamp:** ${conversation.timestamp}`);

    if (conversation.metadata) {
        lines.push('');
        lines.push('## Metadata');
        lines.push('```json');
        lines.push(JSON.stringify(conversation.metadata, null, 2));
        lines.push('```');
    }

    lines.push('');
    lines.push('## Messages');
    lines.push('');

    for (let i = 0; i < conversation.messages.length; i++) {
        const msg = conversation.messages[i];
        lines.push(`### Message ${i + 1}: ${msg.role}`);
        lines.push('');
        lines.push(msg.content || '(no content)');
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Helper to generate conversation ID
 */
export function generateConversationId(command: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
    return `${command}-${timestamp}`;
}

export type ConversationLoggerInstance = ReturnType<typeof createConversationLogger>;

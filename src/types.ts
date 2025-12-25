/**
 * Type definitions for AI service
 */

/**
 * AI model reasoning effort levels
 */
export type ReasoningLevel = 'low' | 'medium' | 'high';

/**
 * Configuration for AI operations
 */
export interface AIConfig {
  /** OpenAI API key */
  apiKey?: string;

  /** Model to use (e.g., 'gpt-4o-mini', 'gpt-4o') */
  model?: string;

  /** Reasoning effort level */
  reasoning?: ReasoningLevel;

  /** Command-specific configurations */
  commands?: {
    commit?: {
      model?: string;
      reasoning?: ReasoningLevel;
    };
    release?: {
      model?: string;
      reasoning?: ReasoningLevel;
    };
    review?: {
      model?: string;
      reasoning?: ReasoningLevel;
    };
  };
}

/**
 * Result from AI transcription
 */
export interface Transcription {
  text: string;
}

/**
 * Storage interface for file operations
 * Consumers can provide their own implementation
 */
export interface StorageAdapter {
  writeOutput(fileName: string, content: string): Promise<void>;
  readTemp(fileName: string): Promise<string>;
  writeTemp(fileName: string, content: string): Promise<void>;
  readFile(fileName: string, encoding?: string): Promise<string>;
}

/**
 * Logger interface for optional logging
 * Compatible with winston but not required
 */
export interface Logger {
  info(message: string, ...meta: unknown[]): void;
  error(message: string, ...meta: unknown[]): void;
  warn(message: string, ...meta: unknown[]): void;
  debug(message: string, ...meta: unknown[]): void;
}

/**
 * Choice for interactive prompts
 */
export interface Choice {
  key: string;
  label: string;
}

/**
 * Options for interactive prompts
 */
export interface InteractiveOptions {
  nonTtyErrorSuggestions?: string[];
  logger?: Logger;
}

/**
 * Options for editor integration
 */
export interface EditorOptions {
  editor?: string;
  tempDir?: string;
  extension?: string;
  logger?: Logger;
}

/**
 * Options for LLM feedback loop
 */
export interface FeedbackOptions {
  initialContent: string;
  systemMessage: string;
  aiConfig: AIConfig;
  commandName: string;
  storage?: StorageAdapter;
  outputPrefix?: string;
  editor?: EditorOptions;
  logger?: Logger;
}

/**
 * Re-export Prompt type from riotprompt for convenience
 */
export type { Prompt, ContentItem } from '@riotprompt/riotprompt';


/**
 * @grunnverk/ai-service
 *
 * AI-powered content generation for automation tools.
 * Provides multi-provider LLM integration (Anthropic, OpenAI) with
 * structured prompts for generating commit messages, release notes,
 * and code reviews.
 */

// Core functionality
export * from './types';
export * from './logger';
export * from './ai';
export * from './provider';
export * from './interactive';
export * from './prompts';

// Agentic functionality
export * from './agentic/executor';
export * from './agentic/commit';
export * from './agentic/release';
export * from './agentic/publish';
export * from './agentic/dependency';
export { createDependencyTools } from './tools/dependency-tools';
export * from './tools/types';
export * from './tools/registry';
export * from './tools/commit-tools';
export * from './tools/release-tools';
export * from './tools/publish-tools';

// Observability
export * from './observability';

/**
 * Provider selection and resolution logic
 *
 * Determines which LLM provider to use based on:
 * 1. Explicit model name (claude-* → Anthropic, gpt-* → OpenAI)
 * 2. Available API keys in the environment
 * 3. Default preference: Anthropic (claude-sonnet-4-20250514)
 */

import type { Provider, ExecutionOptions } from '@kjerneverk/execution';
import { OpenAIProvider } from '@kjerneverk/execution-openai';
import { AnthropicProvider } from '@kjerneverk/execution-anthropic';
import { getLogger } from './logger';

// Default models per provider
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

/**
 * Result of provider resolution
 */
export interface ResolvedProvider {
    /** The provider instance */
    provider: Provider;
    /** The model to use */
    model: string;
    /** The API key being used */
    apiKey: string;
    /** The provider name ('anthropic' or 'openai') */
    providerName: string;
}

/**
 * Cached provider instances to avoid creating new SDK clients on every call
 */
let cachedAnthropicProvider: AnthropicProvider | null = null;
let cachedOpenAIProvider: OpenAIProvider | null = null;

function getAnthropicProvider(): AnthropicProvider {
    if (!cachedAnthropicProvider) {
        cachedAnthropicProvider = new AnthropicProvider();
    }
    return cachedAnthropicProvider;
}

function getOpenAIProvider(): OpenAIProvider {
    if (!cachedOpenAIProvider) {
        cachedOpenAIProvider = new OpenAIProvider();
    }
    return cachedOpenAIProvider;
}

/**
 * Detect which provider a model belongs to based on its name
 */
export function detectProviderForModel(model: string): 'anthropic' | 'openai' | 'unknown' {
    if (!model) return 'unknown';

    const lower = model.toLowerCase();

    // Anthropic models
    if (lower.startsWith('claude')) return 'anthropic';

    // OpenAI models
    if (lower.startsWith('gpt')) return 'openai';
    if (/^o\d/.test(lower)) return 'openai'; // o1, o3, o4 series
    if (lower.startsWith('chatgpt')) return 'openai';

    return 'unknown';
}

/**
 * Resolve which provider, model, and API key to use.
 *
 * Resolution order:
 * 1. If a model is specified, detect provider from model name
 * 2. If no model, pick based on available API keys (prefer Anthropic)
 * 3. Validate that the required API key is available
 *
 * @param model Optional model name (e.g., 'claude-sonnet-4-20250514', 'gpt-4o')
 * @param explicitApiKey Optional explicit API key (overrides environment)
 * @returns ResolvedProvider with provider instance, model, and API key
 */
export function resolveProvider(model?: string, explicitApiKey?: string): ResolvedProvider {
    const logger = getLogger();

    const anthropicKey = explicitApiKey || process.env.ANTHROPIC_API_KEY;
    const openaiKey = explicitApiKey || process.env.OPENAI_API_KEY;

    // Case 1: Model specified — detect provider from model name
    if (model) {
        const detectedProvider = detectProviderForModel(model);

        if (detectedProvider === 'anthropic') {
            if (!anthropicKey) {
                throw new Error(
                    `Model '${model}' requires ANTHROPIC_API_KEY. ` +
                    `Set it in your environment or kodrdriv config.`
                );
            }
            logger.info('🔌 Provider: Anthropic (detected from model: %s)', model);
            return {
                provider: getAnthropicProvider(),
                model,
                apiKey: anthropicKey,
                providerName: 'anthropic',
            };
        }

        if (detectedProvider === 'openai') {
            if (!openaiKey) {
                throw new Error(
                    `Model '${model}' requires OPENAI_API_KEY. ` +
                    `Set it in your environment or kodrdriv config.`
                );
            }
            logger.info('🔌 Provider: OpenAI (detected from model: %s)', model);
            return {
                provider: getOpenAIProvider(),
                model,
                apiKey: openaiKey,
                providerName: 'openai',
            };
        }

        // Unknown model — try to use it with whatever key is available
        logger.warn('Unknown model family for "%s", attempting auto-detection from available keys', model);
    }

    // Case 2: No model (or unknown model) — pick based on available API keys
    // Prefer Anthropic (claude-sonnet-4-20250514 is the default)
    if (anthropicKey) {
        const resolvedModel = model || DEFAULT_ANTHROPIC_MODEL;
        logger.info('🔌 Provider: Anthropic (auto-detected from ANTHROPIC_API_KEY)');
        logger.info('   Model: %s', resolvedModel);
        return {
            provider: getAnthropicProvider(),
            model: resolvedModel,
            apiKey: anthropicKey,
            providerName: 'anthropic',
        };
    }

    if (openaiKey) {
        const resolvedModel = model || DEFAULT_OPENAI_MODEL;
        logger.info('🔌 Provider: OpenAI (auto-detected from OPENAI_API_KEY)');
        logger.info('   Model: %s', resolvedModel);
        return {
            provider: getOpenAIProvider(),
            model: resolvedModel,
            apiKey: openaiKey,
            providerName: 'openai',
        };
    }

    // Case 3: No API keys available
    throw new Error(
        'No LLM API key found. Set one of the following environment variables:\n' +
        '  • ANTHROPIC_API_KEY (recommended, for Claude models)\n' +
        '  • OPENAI_API_KEY (for GPT models)\n' +
        '\n' +
        'Or configure an API key in your kodrdriv config file.'
    );
}

/**
 * Build ExecutionOptions from the resolved provider and additional options
 */
export function buildExecutionOptions(
    resolved: ResolvedProvider,
    options: {
        maxTokens?: number;
        timeout?: number;
        temperature?: number;
    } = {}
): ExecutionOptions {
    return {
        apiKey: resolved.apiKey,
        model: resolved.model,
        maxTokens: options.maxTokens,
        timeout: options.timeout || parseInt(process.env.LLM_TIMEOUT_MS || '300000', 10),
        temperature: options.temperature,
    };
}

/**
 * Reset cached providers (useful for testing)
 */
export function resetProviderCache(): void {
    cachedAnthropicProvider = null;
    cachedOpenAIProvider = null;
}

/**
 * Get the default model name
 */
export function getDefaultModel(): string {
    if (process.env.ANTHROPIC_API_KEY) {
        return DEFAULT_ANTHROPIC_MODEL;
    }
    if (process.env.OPENAI_API_KEY) {
        return DEFAULT_OPENAI_MODEL;
    }
    return DEFAULT_ANTHROPIC_MODEL; // Still prefer Anthropic as the default name
}

export { DEFAULT_ANTHROPIC_MODEL, DEFAULT_OPENAI_MODEL };

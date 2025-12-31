import type { ChatCompletionMessageParam } from 'openai/resources';
import { runAgentic, type AgenticConfig, type ToolExecutionMetric } from './executor';
import { createToolRegistry } from '../tools/registry';
import { createCommitTools } from '../tools/commit-tools';
import type { StorageAdapter, Logger } from '../types';
import { generateToolGuidance } from '@riotprompt/riotprompt';

export interface AgenticCommitConfig {
    changedFiles: string[];
    diffContent: string;
    userDirection?: string;
    logContext?: string;
    model?: string;
    maxIterations?: number;
    debug?: boolean;
    debugRequestFile?: string;
    debugResponseFile?: string;
    storage?: StorageAdapter;
    logger?: Logger;
    openaiReasoning?: 'low' | 'medium' | 'high';
    tokenBudget?: {
        max: number;
        reserveForResponse?: number;
        strategy?: 'priority-based' | 'fifo' | 'summarize' | 'adaptive';
        onBudgetExceeded?: 'compress' | 'error' | 'warn' | 'truncate';
    };
}

export interface AgenticCommitResult {
    commitMessage: string;
    iterations: number;
    toolCallsExecuted: number;
    suggestedSplits: Array<{
        files: string[];
        message: string;
        rationale: string;
    }>;
    conversationHistory: ChatCompletionMessageParam[];
    toolMetrics: ToolExecutionMetric[];
}

/**
 * Run agentic commit message generation
 */
export async function runAgenticCommit(config: AgenticCommitConfig): Promise<AgenticCommitResult> {
    const {
        changedFiles,
        diffContent,
        userDirection,
        logContext,
        model = 'gpt-4o',
        maxIterations = 10,
        debug = false,
        debugRequestFile,
        debugResponseFile,
        storage,
        logger,
        openaiReasoning,
        tokenBudget,
    } = config;

    // Create tool registry with context
    const toolRegistry = createToolRegistry({
        workingDirectory: process.cwd(),
        storage,
        logger,
    });

    // Register commit-specific tools
    const tools = createCommitTools();
    toolRegistry.registerAll(tools);

    // Generate automatic tool guidance from riotprompt
    const toolGuidance = generateToolGuidance(tools, {
        strategy: 'adaptive',
        includeExamples: true,
        explainWhenToUse: true,
        includeCategories: true,
    });

    // Build initial system prompt with tool guidance
    const systemPrompt = buildSystemPrompt(toolGuidance);

    // Build initial user message
    const userMessage = buildUserMessage(changedFiles, diffContent, userDirection, logContext);

    // Prepare messages for agentic loop
    const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
    ];

    // Run agentic loop with optional token budget
    const agenticConfig: AgenticConfig = {
        messages,
        tools: toolRegistry,
        model,
        maxIterations,
        debug,
        debugRequestFile,
        debugResponseFile,
        storage,
        logger,
        openaiReasoning,
        tokenBudget: tokenBudget || {
            max: 150000,
            reserveForResponse: 4000,
            strategy: 'fifo',
            onBudgetExceeded: 'compress'
        },
    };

    const result = await runAgentic(agenticConfig);

    // Parse the final message to extract commit message and suggested splits
    const parsed = parseAgenticResult(result.finalMessage);

    return {
        commitMessage: parsed.commitMessage,
        iterations: result.iterations,
        toolCallsExecuted: result.toolCallsExecuted,
        suggestedSplits: parsed.suggestedSplits,
        conversationHistory: result.conversationHistory,
        toolMetrics: result.toolMetrics,
    };
}

/**
 * Build the system prompt for agentic commit generation
 */
function buildSystemPrompt(toolGuidance: string): string {
    return `You are a professional software engineer writing commit messages for your team.

${toolGuidance}

## Your Task

Write a commit message that clearly explains what changed and why. Your message should help teammates understand the changes without needing to read the diff.

Think about:
- What problem does this solve?
- How do the changes work together?
- What should reviewers focus on?
- Are there any important implications?

Use the available tools to investigate the changes. The more you understand, the better your message will be.

**Important**: If additional context is provided (from context files or other sources), use your judgment:
- If the context is relevant to these specific changes, incorporate it
- If the context describes unrelated changes or other packages, ignore it
- Don't force connections between unrelated information
- Focus on accurately describing what actually changed in this commit

## Investigation Approach

Use tools based on what you need to know:
- group_files_by_concern - understand how files relate
- get_file_content - see full context when diffs are unclear
- get_file_history - understand how code evolved
- get_file_dependencies - assess impact of changes
- get_recent_commits - avoid duplicate messages
- get_related_tests - understand behavior changes
- search_codebase - find usage patterns

## Writing Style

Write naturally and directly:
- Use plain language, not corporate speak
- Be specific and concrete
- Avoid buzzwords and jargon
- No emojis or excessive punctuation
- No phrases like "this commit" or "this PR"
- No meta-commentary about the commit itself

Follow conventional commit format when appropriate (feat:, fix:, refactor:, docs:, test:, chore:), but prioritize clarity over formality.

## Output Format

When ready, format your response as:

COMMIT_MESSAGE:
[Your commit message here]

If changes should be split into multiple commits:

SUGGESTED_SPLITS:
Split 1:
Files: [list of files]
Rationale: [why these belong together]
Message: [commit message for this split]

Split 2:
...

Output only the commit message and splits. No conversational remarks or follow-up offers.`;
}

/**
 * Build the initial user message
 */
function buildUserMessage(
    changedFiles: string[],
    diffContent: string,
    userDirection?: string,
    logContext?: string
): string {
    let message = `I have staged changes that need a commit message.

Changed files (${changedFiles.length}):
${changedFiles.map(f => `  - ${f}`).join('\n')}

Diff:
${diffContent}`;

    if (userDirection) {
        message += `\n\nUser direction: ${userDirection}`;
    }

    if (logContext) {
        message += `\n\nRecent commit history for context:
${logContext}`;
    }

    message += `\n\nAnalyze these changes and write a clear commit message. Consider:
- What problem does this solve?
- How do the changes work together?
- Should this be one commit or multiple?

If context information is provided, use it only if relevant to these specific changes.
Don't force connections that don't exist - if context doesn't apply to this package,
simply ignore it and focus on the actual changes.

Investigate as needed to write an accurate, helpful message.`;

    return message;
}

/**
 * Parse the agentic result to extract commit message and splits
 */
function parseAgenticResult(finalMessage: string): {
    commitMessage: string;
    suggestedSplits: Array<{ files: string[]; message: string; rationale: string }>;
} {
    // Look for COMMIT_MESSAGE: marker
    const commitMatch = finalMessage.match(/COMMIT_MESSAGE:\s*\n([\s\S]*?)(?=\n\nSUGGESTED_SPLITS:|$)/);
    const commitMessage = commitMatch ? commitMatch[1].trim() : finalMessage.trim();

    // Look for SUGGESTED_SPLITS: section
    const suggestedSplits: Array<{ files: string[]; message: string; rationale: string }> = [];
    const splitsMatch = finalMessage.match(/SUGGESTED_SPLITS:\s*\n([\s\S]*)/);

    if (splitsMatch) {
        const splitsText = splitsMatch[1];
        // Parse each split
        const splitRegex = /Split \d+:\s*\nFiles: ([\s\S]*?)\nRationale: ([\s\S]*?)\nMessage: ([\s\S]*?)(?=\n\nSplit \d+:|$)/g;
        let match;

        while ((match = splitRegex.exec(splitsText)) !== null) {
            const filesText = match[1].trim();
            const files = filesText
                .split('\n')
                .map(line => line.trim().replace(/^[-*]\s*/, ''))
                .filter(line => line.length > 0);

            suggestedSplits.push({
                files,
                rationale: match[2].trim(),
                message: match[3].trim(),
            });
        }
    }

    return { commitMessage, suggestedSplits };
}


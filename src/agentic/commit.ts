import type { ChatCompletionMessageParam } from 'openai/resources';
import { runAgentic, type AgenticConfig, type ToolExecutionMetric } from './executor';
import { createToolRegistry } from '../tools/registry';
import { createCommitTools } from '../tools/commit-tools';
import type { StorageAdapter, Logger } from '../types';

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

    // Build initial system prompt
    const systemPrompt = buildSystemPrompt();

    // Build initial user message
    const userMessage = buildUserMessage(changedFiles, diffContent, userDirection, logContext);

    // Prepare messages for agentic loop
    const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
    ];

    // Run agentic loop
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
function buildSystemPrompt(): string {
    return `You are an expert software engineer tasked with generating meaningful commit messages.

You have access to tools to understand changes deeply. Use them strategically based on what you see:

## When to Use Each Tool

**Understanding What Changed:**
- get_file_content: Use when you need full context. Good for: seeing entire class/function being modified, checking imports, understanding overall structure
- analyze_diff_section: Use when diff is confusing. Good for: expanding context around small changes, seeing how code integrates
- get_file_dependencies: Use for import/refactor changes. Good for: understanding what's being moved/reorganized, checking dependency impact

**Understanding Why:**
- get_file_history: Use to see evolution. Good for: understanding if this continues previous work, checking for patterns
- get_recent_commits: Use to check recent context. Good for: avoiding duplicate messages, understanding if this is part of a series
- search_codebase: Use to understand usage. Good for: seeing if changes affect multiple places, finding patterns

**Organizing Changes:**
- group_files_by_concern: Use when multiple files changed. Good for: identifying logical groupings, determining if split is needed
- get_related_tests: Use for logic changes. Good for: understanding intent from test changes, verifying behavior changes

## Investigation Strategy

For simple changes (1-3 files, obvious purpose):
- Use 1-2 tools: get_recent_commits to avoid duplicates, get_related_tests if logic changed

For moderate changes (4-10 files, clear theme):
- Use 2-4 tools: group_files_by_concern, get_file_content for key files, get_recent_commits, get_related_tests

For complex changes (10+ files, or unclear purpose):
- Use 4-6 tools: group_files_by_concern, get_file_history, get_file_content for key files, get_file_dependencies, get_related_tests, search_codebase

Always use tools to understand context - don't rely only on the diff.

## Guidelines
- Follow conventional commit format when appropriate (feat:, fix:, refactor:, docs:, test:, chore:)
- Consider suggesting split commits for unrelated changes
- Output only the commit message and/or splits - no conversational remarks
- NEVER include phrases like "If you want" or "Let me know" or offer follow-up actions

Output format:
When you're ready to provide the final commit message, format it as:

COMMIT_MESSAGE:
[Your generated commit message here]

If you recommend splitting into multiple commits, also include:

SUGGESTED_SPLITS:
Split 1:
Files: [list of files]
Rationale: [why these belong together]
Message: [commit message for this split]

Split 2:
...

If changes should remain as one commit, do not include SUGGESTED_SPLITS section.`;
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

    message += `\n\nPlease investigate these changes and generate an appropriate commit message.
Use the available tools to gather additional context as needed.
If these changes should be split into multiple commits, suggest the groupings.`;

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


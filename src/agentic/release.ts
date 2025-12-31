import type { ChatCompletionMessageParam } from 'openai/resources';
import { runAgentic, type AgenticConfig, type ToolExecutionMetric } from './executor';
import { createToolRegistry } from '../tools/registry';
import { createReleaseTools } from '../tools/release-tools';
import type { StorageAdapter, Logger } from '../types';
import { generateToolGuidance } from '@riotprompt/riotprompt';

export interface AgenticReleaseConfig {
    fromRef: string;
    toRef: string;
    logContent: string;
    diffContent: string;
    milestoneIssues?: string;
    releaseFocus?: string;
    userContext?: string;
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

export interface AgenticReleaseResult {
    releaseNotes: {
        title: string;
        body: string;
    };
    iterations: number;
    toolCallsExecuted: number;
    conversationHistory: ChatCompletionMessageParam[];
    toolMetrics: ToolExecutionMetric[];
}

/**
 * Run agentic release notes generation
 */
export async function runAgenticRelease(config: AgenticReleaseConfig): Promise<AgenticReleaseResult> {
    const {
        fromRef,
        toRef,
        logContent,
        diffContent,
        milestoneIssues,
        releaseFocus,
        userContext,
        model = 'gpt-4o',
        maxIterations = 30,
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

    // Register release-specific tools
    const tools = createReleaseTools();
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
    const userMessage = buildUserMessage({
        fromRef,
        toRef,
        logContent,
        diffContent,
        milestoneIssues,
        releaseFocus,
        userContext,
    });

    // Prepare messages for agentic loop
    const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
    ];

    // Run agentic loop with token budget (larger for release notes)
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
            max: 200000,
            reserveForResponse: 8000,
            strategy: 'fifo',
            onBudgetExceeded: 'compress'
        },
    };

    const result = await runAgentic(agenticConfig);

    // Parse the final message to extract release notes
    const parsed = parseAgenticResult(result.finalMessage);

    return {
        releaseNotes: parsed.releaseNotes,
        iterations: result.iterations,
        toolCallsExecuted: result.toolCallsExecuted,
        conversationHistory: result.conversationHistory,
        toolMetrics: result.toolMetrics,
    };
}

/**
 * Build the system prompt for agentic release notes generation
 */
function buildSystemPrompt(toolGuidance: string): string {
    return `You are a professional software engineer writing release notes for your team and users.

${toolGuidance}

## Your Task

Write release notes that clearly explain what's in this release and why it matters. Your notes should help users and developers understand what changed without needing to read every commit.

Focus on:
- What problems does this release solve?
- What new capabilities does it add?
- What's the impact on users and developers?
- Are there breaking changes or important considerations?

Use the available tools to investigate the changes. The more you understand, the better your notes will be.

**Important**: If additional context is provided (from context files or other sources), use your judgment:
- If the context is relevant to this specific package/release, incorporate it appropriately
- If the context describes changes in other packages or unrelated work, ignore it
- Don't fabricate connections between this package and unrelated context
- Be honest about what changed - only mention what actually happened in this release
- Context is supplemental information, not a requirement to include

## Investigation Approach

Use tools based on what you need to know:

**Context:**
- get_tag_history - understand release patterns
- get_release_stats - quantify scope
- compare_previous_release - see how this compares

**Understanding:**
- group_files_by_concern - identify themes
- analyze_commit_patterns - detect patterns
- get_file_content - see full context
- analyze_diff_section - expand unclear changes
- get_file_history - understand evolution

**Impact:**
- get_file_dependencies - assess reach
- search_codebase - find usage patterns
- get_related_tests - understand behavior changes
- get_breaking_changes - identify breaking changes (always use)

## Writing Style

Write naturally and directly:
- Use plain language that users can understand
- Be specific about what changed and why
- Avoid marketing speak and buzzwords
- No emojis or excessive punctuation
- No phrases like "we're excited to announce"
- No meta-commentary about the release itself
- Focus on facts and implications, not enthusiasm

Structure your notes logically:
- Start with the most important changes
- Group related changes together
- Explain breaking changes clearly
- Include practical examples when helpful

## Output Format

When ready, format your response as JSON:

RELEASE_NOTES:
{
  "title": "Clear, factual title describing the main changes",
  "body": "Detailed release notes in Markdown format"
}

Output only the JSON. No conversational remarks or follow-up offers.`;
}

/**
 * Build the initial user message
 */
function buildUserMessage(params: {
    fromRef: string;
    toRef: string;
    logContent: string;
    diffContent: string;
    milestoneIssues?: string;
    releaseFocus?: string;
    userContext?: string;
}): string {
    const { fromRef, toRef, logContent, diffContent, milestoneIssues, releaseFocus, userContext } = params;

    let message = `I need comprehensive release notes for changes from ${fromRef} to ${toRef}.

## Commit Log
${logContent}

## Diff Summary
${diffContent}`;

    if (milestoneIssues) {
        message += `\n\n## Resolved Issues from Milestone
${milestoneIssues}`;
    }

    if (releaseFocus) {
        message += `\n\n## Release Focus
${releaseFocus}

This is the PRIMARY GUIDE for how to frame and structure the release notes. Use this to determine emphasis and narrative.`;
    }

    if (userContext) {
        message += `\n\n## Additional Context
${userContext}`;
    }

    message += `\n\nAnalyze these changes and write clear release notes. Consider:
- What's the main story of this release?
- What problems does it solve?
- What's the impact on users and developers?
- Are there breaking changes?

If context information is provided, use it only if relevant to this specific package.
Don't force connections that don't exist - if context describes changes in other packages
or unrelated features, simply ignore it and focus on what actually changed in this release.

Investigate as needed to write accurate, helpful release notes.`;

    return message;
}

/**
 * Parse the agentic result to extract release notes
 */
function parseAgenticResult(finalMessage: string): {
    releaseNotes: { title: string; body: string };
} {
    // Look for RELEASE_NOTES: marker with JSON
    const jsonMatch = finalMessage.match(/RELEASE_NOTES:\s*\n([\s\S]*)/);

    if (jsonMatch) {
        try {
            const jsonStr = jsonMatch[1].trim();
            // Try to parse the JSON with error handling
            let parsed: any;
            try {
                parsed = JSON.parse(jsonStr);
            } catch {
                // Failed to parse JSON, will use fallback parsing below
                parsed = null;
            }

            if (parsed && parsed.title && parsed.body) {
                return {
                    releaseNotes: {
                        title: parsed.title,
                        body: parsed.body,
                    },
                };
            }
        } catch {
            // JSON parsing failed, fall through to fallback
        }
    }

    // Fallback: try to extract title and body from the message
    const lines = finalMessage.split('\n');
    let title = '';
    let body = '';
    let inBody = false;

    for (const line of lines) {
        if (!title && line.trim() && !line.startsWith('#')) {
            title = line.trim();
        } else if (title && line.trim()) {
            inBody = true;
        }

        if (inBody) {
            body += line + '\n';
        }
    }

    // If we still don't have good content, use the whole message
    if (!title || !body) {
        title = 'Release Notes';
        body = finalMessage;
    }

    return {
        releaseNotes: {
            title: title.trim(),
            body: body.trim(),
        },
    };
}


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
    return `You are an expert software engineer and technical writer tasked with generating comprehensive, thoughtful release notes.

${toolGuidance}
- get_tag_history: Use early to understand release cadence. Good for: establishing context about project versioning patterns

**Analyzing Current Changes:**
- get_file_content: Use when diff alone isn't enough. Good for: understanding APIs, seeing full class/function context, checking imports
- analyze_diff_section: Use to expand context around cryptic changes. Good for: seeing surrounding code, understanding integration points
- get_file_dependencies: Use for refactors/moves. Good for: assessing impact scope, identifying what depends on changed code
- search_codebase: Use to find usage patterns. Good for: checking if APIs are widely used, finding similar patterns elsewhere

**Pattern Recognition:**
- group_files_by_concern: Use when many files changed. Good for: organizing changes into logical themes, identifying what actually happened
- analyze_commit_patterns: Use for many commits. Good for: detecting themes across commits, identifying if work is focused or scattered
- get_release_stats: Use to quantify scope. Good for: getting concrete metrics on scale of changes

**Risk Assessment:**
- get_breaking_changes: Always use. Good for: identifying API changes, finding removals/signature changes that could break users
- get_related_tests: Use for significant logic changes. Good for: understanding what behavior changed, verifying test coverage exists

## Your Investigation Strategy

1. **Start broad** (2-3 tools): get_tag_history, get_release_stats, analyze_commit_patterns
2. **Identify themes** (1-2 tools): group_files_by_concern if many files, compare_previous_release for context
3. **Deep dive** (3-5 tools): get_file_content for key changes, get_file_dependencies for refactors, analyze_diff_section for unclear changes
4. **Verify understanding** (2-3 tools): get_related_tests for logic changes, search_codebase for impact
5. **Check risks** (1 tool): get_breaking_changes always

Use at least 6-8 tools per release to ensure comprehensive analysis. Each tool provides a different lens on the changes.

Output format:
When you're ready to provide the final release notes, format them as JSON:

RELEASE_NOTES:
{
  "title": "A concise, single-line title capturing the most significant changes",
  "body": "The detailed release notes in Markdown format, following best practices for structure, depth, and analysis"
}

The release notes should:
- Demonstrate genuine understanding of the changes
- Provide context and explain implications
- Connect related changes to reveal patterns
- Be substantial and analytical, not formulaic
- Sound like they were written by a human who studied the changes
- Be grounded in actual commits and issues (no hallucinations)
- Be standalone documentation that can be published as-is
- NEVER include conversational elements like "If you want, I can also..." or "Let me know if..."
- NEVER offer follow-up actions, questions, or suggestions for additional work
- End with substantive content, not conversational closing remarks`;
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

    message += `\n\nPlease investigate these changes thoroughly and generate comprehensive release notes that:
1. Demonstrate deep understanding of what changed and why
2. Provide context about how changes relate to each other
3. Explain implications for users and developers
4. Connect this release to previous releases and project evolution
5. Identify any breaking changes or significant architectural shifts
6. Follow best practices for technical writing and release notes

Use the available tools to gather additional context as needed. Take your time to understand the changes deeply before writing the release notes.`;

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


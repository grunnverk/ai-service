import type { ChatCompletionMessageParam } from 'openai/resources';
import { runAgentic, type AgenticConfig, type ToolExecutionMetric } from './executor';
import { createToolRegistry } from '../tools/registry';
import { createReleaseTools } from '../tools/release-tools';
import type { StorageAdapter, Logger } from '../types';

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

    // Build initial system prompt
    const systemPrompt = buildSystemPrompt();

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
function buildSystemPrompt(): string {
    return `You are an expert software engineer and technical writer tasked with generating comprehensive, thoughtful release notes.

You have access to tools that let you investigate the release in detail:
- get_file_history: View commit history for specific files
- get_file_content: Read full file contents to understand context
- search_codebase: Search for patterns across the codebase
- get_related_tests: Find test files to understand functionality
- get_file_dependencies: Understand file dependencies and impact
- analyze_diff_section: Get expanded context around specific changes
- get_recent_commits: See recent commits to the same files
- group_files_by_concern: Identify logical groupings of changes
- get_tag_history: View previous release tags and patterns
- compare_previous_release: Compare with previous releases
- get_release_stats: Get comprehensive statistics about the release
- get_breaking_changes: Identify potential breaking changes
- analyze_commit_patterns: Identify themes and patterns in commits

Your process should be:
1. Analyze the commit log and diff to understand the overall scope of changes
2. Use tools strategically to investigate significant changes that need more context
3. Look at previous releases to understand how this release fits into the project's evolution
4. Identify patterns, themes, and connections between changes
5. Check for breaking changes and significant architectural shifts
6. Understand the "why" behind changes by examining commit messages, issues, and code
7. Synthesize findings into comprehensive, thoughtful release notes

Guidelines:
- Use tools strategically - focus on understanding significant changes
- Look at test changes to understand intent and functionality
- Check previous releases to provide context and compare scope
- Identify patterns and themes across multiple commits
- Consider the audience and what context they need
- Be thorough and analytical, especially for large releases
- Follow the release notes format and best practices provided

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
- Be grounded in actual commits and issues (no hallucinations)`;
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
            // Try to parse the JSON
            const parsed = JSON.parse(jsonStr);

            if (parsed.title && parsed.body) {
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


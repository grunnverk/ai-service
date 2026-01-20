import type { ChatCompletionMessageParam } from 'openai/resources';
import { runAgentic, type AgenticConfig, type ToolExecutionMetric } from './executor';
import { createToolRegistry } from '../tools/registry';
import { createReleaseTools } from '../tools/release-tools';
import type { StorageAdapter, Logger } from '../types';

export interface AgenticReleaseConfig {
    fromRef: string;
    toRef: string;
    logContent?: string; // Optional - AI can use tools to get commit log
    diffContent?: string; // Optional - AI can use tools to get diffs
    milestoneIssues?: string;
    releaseFocus?: string;
    userContext?: string;
    targetVersion?: string; // Explicit version for the release (e.g., "1.0.0")
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
        logContent: _logContent, // Optional - AI can use tools to get commit log
        diffContent: _diffContent, // Optional - AI can use tools to get diffs
        milestoneIssues,
        releaseFocus,
        userContext,
        targetVersion,
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

    // Build initial system prompt (no tool guidance - tools are registered, AI can discover them)
    const systemPrompt = buildSystemPrompt();

    // Build initial user message (minimal - AI will use tools to investigate)
    const userMessage = buildUserMessage({
        fromRef,
        toRef,
        milestoneIssues,
        releaseFocus,
        userContext,
        targetVersion,
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
function buildSystemPrompt(): string {
    return `You are a professional software engineer writing release notes for your team and users.

## Available Tools

You have access to tools to investigate the release:
- \`get_tag_history\` - Understand release patterns
- \`get_release_stats\` - Quantify scope of changes
- \`compare_previous_release\` - See how this compares to previous releases
- \`group_files_by_concern\` - Identify themes in changes
- \`analyze_commit_patterns\` - Detect patterns in commits
- \`get_file_content\` - Read file contents or diffs
- \`analyze_diff_section\` - Expand unclear changes
- \`get_file_history\` - Understand how code evolved
- \`get_file_dependencies\` - Assess impact and reach
- \`search_codebase\` - Find usage patterns
- \`get_related_tests\` - Understand behavior changes
- \`get_breaking_changes\` - Identify breaking changes (always use this)

Use these tools to investigate the changes rather than asking for information upfront.

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

When ready, output your release notes in this exact format:

RELEASE_TITLE:
[A clear, factual title describing the main changes]

RELEASE_BODY:
[Detailed release notes in Markdown format]

Do not include any JSON, code blocks, or wrapper syntax. Output plain text and markdown only.
No conversational remarks or follow-up offers.`;
}

/**
 * Build the initial user message - minimal context, AI will use tools to investigate
 */
function buildUserMessage(params: {
    fromRef: string;
    toRef: string;
    milestoneIssues?: string;
    releaseFocus?: string;
    userContext?: string;
    targetVersion?: string;
}): string {
    const { fromRef, toRef, milestoneIssues, releaseFocus, userContext, targetVersion } = params;

    let message = `I need comprehensive release notes for changes from ${fromRef} to ${toRef}.`;

    if (targetVersion) {
        // Strip any 'v' prefix if present for display
        const versionNumber = targetVersion.replace(/^v/, '');
        message += `\n\n**CRITICAL VERSION INSTRUCTION: This is a release for version ${versionNumber}. You MUST use EXACTLY "${versionNumber}" in your release title. DO NOT use any development/prerelease version numbers you may see in the diff (like ${versionNumber}-dev.0 or similar). The release version is ${versionNumber}.**`;
    }

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

    message += `\n\n## Your Analysis Task

Use your tools to investigate the changes between ${fromRef} and ${toRef}:
1. Use \`get_release_stats\` to understand the scope of changes
2. Use \`get_tag_history\` or \`compare_previous_release\` to see release patterns
3. Use \`analyze_commit_patterns\` to detect themes
4. Use \`group_files_by_concern\` to identify logical groupings
5. Use \`get_breaking_changes\` to identify breaking changes (always check this)
6. Use \`get_file_content\` or \`analyze_diff_section\` to understand specific changes
7. Use \`get_file_dependencies\` and \`search_codebase\` to assess impact

Write clear release notes that answer:
- What's the main story of this release?
- What problems does it solve?
- What's the impact on users and developers?
- Are there breaking changes?

If context information is provided, use it only if relevant to this specific package.
Don't force connections that don't exist - if context describes changes in other packages
or unrelated features, simply ignore it and focus on what actually changed in this release.

Start by gathering statistics and understanding the scope, then investigate specific changes as needed.`;

    return message;
}

/**
 * Parse the agentic result to extract release notes
 */
function parseAgenticResult(finalMessage: string): {
    releaseNotes: { title: string; body: string };
} {
    // Look for RELEASE_TITLE: and RELEASE_BODY: markers
    const titleMatch = finalMessage.match(/RELEASE_TITLE:\s*\n(.*?)(?=\n\nRELEASE_BODY:|\n\s*\nRELEASE_BODY:)/s);
    const bodyMatch = finalMessage.match(/RELEASE_BODY:\s*\n([\s\S]*)/);

    if (titleMatch && bodyMatch) {
        const title = titleMatch[1].trim();
        let body = bodyMatch[1].trim();

        // Clean up any JSON artifacts that might have leaked through
        body = cleanJsonArtifacts(body);

        return {
            releaseNotes: {
                title,
                body,
            },
        };
    }

    // Fallback: try to extract title and body from the message
    const lines = finalMessage.split('\n');
    let title = '';
    let body = '';
    let inBody = false;

    for (const line of lines) {
        if (!title && line.trim() && !line.startsWith('#') && !line.startsWith('RELEASE_')) {
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

    // Clean up any JSON artifacts from the body
    body = cleanJsonArtifacts(body);

    return {
        releaseNotes: {
            title: title.trim(),
            body: body.trim(),
        },
    };
}

/**
 * Clean up JSON artifacts that might have leaked into the output
 */
function cleanJsonArtifacts(text: string): string {
    // Remove JSON wrapper patterns like { "title": "...", "body": "...
    text = text.replace(/^\s*\{\s*"title":\s*"[^"]*",?\s*"body":\s*"/m, '');

    // Remove trailing JSON closing patterns
    text = text.replace(/"\s*\}\s*$/m, '');

    // Remove code fence markers that might wrap the content
    text = text.replace(/^```json\s*\n/gm, '');
    text = text.replace(/^```\s*$/gm, '');

    // Remove escaped quotes that might appear in JSON strings
    text = text.replace(/\\"/g, '"');
    text = text.replace(/\\n/g, '\n');

    return text.trim();
}


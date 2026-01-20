import type { ChatCompletionMessageParam } from 'openai/resources';
import { runAgentic, type AgenticConfig, type ToolExecutionMetric } from './executor';
import { createToolRegistry } from '../tools/registry';
import { createCommitTools } from '../tools/commit-tools';
import type { StorageAdapter, Logger } from '../types';

export interface AgenticCommitConfig {
    changedFiles: string[];
    diffContent?: string; // Optional - AI can use tools to read files
    userDirection?: string;
    logContext?: string; // Optional - AI can use get_recent_commits tool
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
        diffContent: _diffContent, // Optional - AI can use tools to read files
        userDirection,
        logContext: _logContext, // Optional - AI can use get_recent_commits tool
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

    // Build initial system prompt (no tool guidance - tools are registered, AI can discover them)
    const systemPrompt = buildSystemPrompt();

    // Build initial user message (minimal - AI will use tools to investigate)
    const userMessage = buildUserMessage(changedFiles, userDirection);

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
function buildSystemPrompt(): string {
    return `You are a professional software engineer writing commit messages for your team.

## Available Tools

You have access to tools to investigate the changes:
- \`get_file_content\` - Read file contents or diffs for specific files
- \`get_file_modification_times\` - See when files were modified relative to each other
- \`group_files_by_concern\` - Understand how files relate by type/purpose
- \`get_recent_commits\` - Get recent commit history to avoid duplicates
- \`get_file_history\` - Understand how code evolved
- \`get_file_dependencies\` - Assess impact of changes
- \`get_related_tests\` - Find related test files
- \`search_codebase\` - Search for usage patterns

Use these tools to investigate the changes rather than asking for information upfront.

## Your Task

Analyze the staged changes and determine the best way to commit them. Your primary goal is to create **meaningful, atomic commits** that each represent a single logical change.

**CRITICAL**: When there are many changed files, especially after a long work session (multiple hours), you should almost always split them into multiple commits. A single commit with 10+ files usually indicates multiple distinct changes that should be separated.

Think about:
- What distinct features, fixes, or improvements are represented?
- Are there natural groupings by functionality, module, or purpose?
- When were files modified relative to each other?
- What should reviewers focus on in each commit?

## Investigation Strategy

For any non-trivial set of changes, gather multiple signals to understand how to group commits:

1. **Check file modification times** using \`get_file_modification_times\`
   - This reveals *when* files were changed relative to each other
   - Files modified close together *may* be part of the same logical change
   - Large temporal gaps *can* indicate separate work sessions
   - Note: temporal proximity is one signal, not a guarantee of relatedness

2. **Understand logical relationships** using \`group_files_by_concern\`
   - Groups by module, type (tests, docs, source), and directory structure
   - Reveals which files are functionally related regardless of when they were modified

3. **Cross-reference both signals** to make informed decisions:
   - Files modified together AND logically related → strong candidate for same commit
   - Files modified apart BUT logically related → might still belong together
   - Files modified together BUT logically unrelated → consider splitting
   - Use your judgment - neither signal is definitive on its own

4. **Investigate further** as needed:
   - get_file_content - see full context when diffs are unclear
   - get_file_history - understand how code evolved
   - get_file_dependencies - assess impact of changes
   - get_recent_commits - avoid duplicate messages
   - get_related_tests - understand behavior changes
   - search_codebase - find usage patterns

## When to Split Commits

**Prefer multiple commits when:**
- Changes span multiple hours of work (check modification times!)
- Different logical features or fixes are included
- Test changes could be separated from production code changes
- Documentation updates are unrelated to code changes
- Refactoring is mixed with feature work
- Configuration changes are mixed with implementation changes
- Files in different modules/packages are changed for different reasons

**Keep as one commit when:**
- All changes are part of a single, cohesive feature
- Files were modified together in a focused work session
- Test changes directly test the production code changes
- The changes tell a single coherent story

**Default bias**: When in doubt about whether to split, **prefer splitting**. It's better to have too many focused commits than too few bloated ones. A good commit should be understandable and reviewable in isolation.

## Important Context Guidelines

If additional context is provided (from context files or other sources), use your judgment:
- If the context is relevant to these specific changes, incorporate it
- If the context describes unrelated changes or other packages, ignore it
- Don't force connections between unrelated information
- Focus on accurately describing what actually changed

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
[Your commit message here - only for the FIRST group of changes if splitting]

If changes should be split into multiple commits (which is often the case with large changesets):

SUGGESTED_SPLITS:
Split 1:
Files: [list of files]
Rationale: [why these belong together - mention temporal clustering and/or logical relationship]
Message: [commit message for this split]

Split 2:
Files: [list of files]
Rationale: [why these belong together]
Message: [commit message for this split]

Split 3:
...

Output only the commit message and splits. No conversational remarks or follow-up offers.`;
}

/**
 * Build the initial user message - minimal context, AI will use tools to investigate
 */
function buildUserMessage(
    changedFiles: string[],
    userDirection?: string
): string {
    const fileCount = changedFiles.length;
    const manyFiles = fileCount >= 5;

    let message = `I have staged changes that need a commit message.

Changed files (${fileCount}):
${changedFiles.map(f => `  - ${f}`).join('\n')}`;

    if (userDirection) {
        message += `\n\nUser direction: ${userDirection}`;
    }

    message += `\n\n## Your Analysis Task

${manyFiles ? `With ${fileCount} files changed, investigate whether these represent multiple distinct changes that should be split into separate commits.

` : ''}Use your tools to investigate the changes:
1. Use \`get_file_content\` to read the actual changes in the files
2. Use \`get_file_modification_times\` to see when files were modified relative to each other
3. Use \`group_files_by_concern\` to understand how files relate by type/purpose
4. Use \`get_recent_commits\` to check recent commit history and avoid duplicates
5. Cross-reference temporal proximity and logical relatedness to determine the best commit structure

Consider:
- What distinct features, fixes, or improvements are included?
- Are files that were modified together also logically related?
- Would separate commits make the history more understandable?

${manyFiles ? 'With many files, consider whether multiple focused commits would be clearer than one large commit.' : 'If changes represent multiple logical concerns, suggest splits.'}

Start by reading the file contents to understand what actually changed.`;

    return message;
}

/**
 * Sanitize a file path from AI response
 * Handles: quotes, annotations in parentheses, bullet prefixes, extra whitespace
 * e.g., '"package.json" (only add "semver")' -> 'package.json'
 * e.g., '- src/file.ts' -> 'src/file.ts'
 * e.g., '  - src/file.ts' -> 'src/file.ts'
 */
function sanitizeFilePath(filePath: string): string {
    return filePath
        // First trim leading/trailing whitespace
        .trim()
        // Remove bullet point prefix (- or *)
        .replace(/^[-*]\s*/, '')
        // Remove surrounding quotes (both single and double)
        .replace(/^["']|["']$/g, '')
        // Remove any annotation in parentheses at the end (e.g., "(only add semver)")
        .replace(/\s*\([^)]*\)\s*$/, '')
        // Remove surrounding quotes again (in case annotation had quotes)
        .replace(/^["']|["']$/g, '')
        .trim();
}

/**
 * Parse files text from AI response into an array of file paths
 * Handles three formats:
 * 1. Bracket format: [file1, file2, file3]
 * 2. Multi-line format with bullets: - file1\n  - file2
 * 3. Inline comma-separated with quotes: "file1", "file2", "file3" (annotation)
 */
function parseFilesText(filesText: string): string[] {
    // Format 1: Bracket format
    if (filesText.startsWith('[') && filesText.includes(']')) {
        // Extract content up to the closing bracket (ignore anything after)
        const closeIndex = filesText.indexOf(']');
        const bracketed = filesText.slice(1, closeIndex);
        return bracketed
            .split(',')
            .map(f => sanitizeFilePath(f))
            .filter(f => f.length > 0);
    }

    // Format 3: Inline comma-separated with quotes (e.g., "file1", "file2", "file3")
    // Detect by checking if it starts with a quote and contains ", " pattern
    if (filesText.match(/^["']/) && filesText.includes('", "')) {
        // Split by the pattern: quote, comma, optional space, quote
        return filesText
            .split(/["'],\s*["']/)
            .map(f => sanitizeFilePath(f))
            .filter(f => f.length > 0);
    }

    // Format 2: Multi-line format with bullets or just newlines
    return filesText
        .split('\n')
        .map(line => sanitizeFilePath(line))
        .filter(line => line.length > 0);
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
            const files = parseFilesText(filesText);

            suggestedSplits.push({
                files,
                rationale: match[2].trim(),
                message: match[3].trim(),
            });
        }
    }

    return { commitMessage, suggestedSplits };
}


import type { ChatCompletionMessageParam } from 'openai/resources';
import { AgenticExecutor } from './executor';
import { createToolRegistry } from '../tools/registry';
import { createPublishTools } from '../tools/publish-tools';
import type { ToolContext } from '../tools/types';

export interface AgenticPublishConfig {
    targetBranch: string;
    sourceBranch: string;
    issue: 'branch_sync' | 'uncommitted_changes' | 'merge_conflicts' | 'unknown';
    issueDetails?: string;
    workingDirectory?: string;
    model?: string;
    maxIterations?: number;
    debug?: boolean;
    storage?: any;
    logger?: any;
    dryRun?: boolean;
}

export interface AgenticPublishResult {
    success: boolean;
    message: string;
    actionsTaken: string[];
    iterations: number;
    toolCallsExecuted: number;
    requiresManualIntervention: boolean;
    manualSteps?: string[];
}

/**
 * Run agentic publish recovery
 */
export async function runAgenticPublish(config: AgenticPublishConfig): Promise<AgenticPublishResult> {
    const {
        targetBranch,
        sourceBranch,
        issue,
        issueDetails,
        workingDirectory = process.cwd(),
        model = 'gpt-4o',
        maxIterations = 10,
        debug = false,
        storage,
        logger,
        dryRun = false,
    } = config;

    // Create tool context
    const toolContext: ToolContext = {
        workingDirectory,
        storage,
        logger,
    };

    // Create tool registry with publish tools
    const tools = createToolRegistry(toolContext);
    tools.registerAll(createPublishTools());

    // Build the system prompt
    const systemPrompt = buildSystemPrompt(issue, dryRun);

    // Build the user prompt with specific issue details
    const userPrompt = buildUserPrompt({
        issue,
        targetBranch,
        sourceBranch,
        issueDetails,
    });

    // Prepare messages
    const messages: ChatCompletionMessageParam[] = [
        {
            role: 'system',
            content: systemPrompt,
        },
        {
            role: 'user',
            content: userPrompt,
        },
    ];

    // Run the agentic executor
    const executor = new AgenticExecutor(logger);
    const result = await executor.run({
        messages,
        tools,
        model,
        maxIterations,
        debug,
        storage,
        logger,
    });

    // Parse the final message to extract actions and recommendations
    const analysis = parseAgentResponse(result.finalMessage);

    return {
        success: analysis.success,
        message: result.finalMessage,
        actionsTaken: analysis.actionsTaken,
        iterations: result.iterations,
        toolCallsExecuted: result.toolCallsExecuted,
        requiresManualIntervention: analysis.requiresManualIntervention,
        manualSteps: analysis.manualSteps,
    };
}

/**
 * Build system prompt for agentic publish
 */
function buildSystemPrompt(issue: string, dryRun: boolean): string {
    const modeNote = dryRun
        ? '\n\nIMPORTANT: This is a DRY RUN. Do not use tools that make destructive changes (like reset_branch or sync_branch). Only use diagnostic tools to analyze the issue and provide recommendations.'
        : '';

    return `You are an expert Git operations assistant helping to diagnose and fix issues that prevent publishing a software package.

Your role is to:
1. Use the available tools to investigate the problem
2. Analyze the root cause of the issue
3. ${dryRun ? 'Recommend' : 'Attempt to fix'} the issue using best practices
4. Provide clear explanations of what you found and ${dryRun ? 'would do' : 'did'}

Available tools allow you to:
- Check git status and branch information
- Analyze divergence between branches
- View commit logs and diff statistics
- Check for potential merge conflicts
${dryRun ? '' : '- Sync branches with remote\n- Reset branches to match remote refs'}

Guidelines:
- Always diagnose before taking action
- Prefer safe, non-destructive operations when possible
- If a situation requires manual intervention, clearly state why and provide steps
- Be thorough in your analysis
- Consider the impact of each action on the repository state

Current issue type: ${issue}${modeNote}`;
}

/**
 * Build user prompt with specific issue details
 */
function buildUserPrompt(params: {
    issue: string;
    targetBranch: string;
    sourceBranch: string;
    issueDetails?: string;
}): string {
    const { issue, targetBranch, sourceBranch, issueDetails } = params;

    const issueDescriptions = {
        branch_sync: `The target branch '${targetBranch}' is not synchronized with its remote counterpart. This prevents the publish workflow from proceeding safely.`,
        uncommitted_changes: `There are uncommitted changes in the working directory on branch '${sourceBranch}'. The publish workflow requires a clean working directory.`,
        merge_conflicts: `There are merge conflicts between '${sourceBranch}' and '${targetBranch}' that need to be resolved before publishing.`,
        unknown: `An unknown issue is preventing the publish workflow from proceeding.`,
    };

    const basePrompt = `I'm trying to run a publish workflow that will:
1. Create a release from source branch '${sourceBranch}'
2. Merge it into target branch '${targetBranch}'
3. Publish the package

However, I'm encountering an issue:

${issueDescriptions[issue as keyof typeof issueDescriptions] || issueDescriptions.unknown}`;

    const detailsSection = issueDetails
        ? `\n\nAdditional details:\n${issueDetails}`
        : '';

    return `${basePrompt}${detailsSection}

Please investigate this issue and ${process.env.DRY_RUN ? 'recommend how to fix it' : 'attempt to fix it if possible'}. Use the available tools to:

1. Diagnose the exact problem
2. Understand what caused it (e.g., what commits are causing divergence)
3. ${process.env.DRY_RUN ? 'Recommend a solution' : 'Attempt to resolve it safely'}
4. Explain what ${process.env.DRY_RUN ? 'should be' : 'was'} done and why

If the issue requires manual intervention, please explain why and provide clear steps.`;
}

/**
 * Parse agent response to extract structured information
 */
function parseAgentResponse(message: string): {
    success: boolean;
    actionsTaken: string[];
    requiresManualIntervention: boolean;
    manualSteps: string[];
} {
    // Look for indicators of success/failure
    const successIndicators = [
        'successfully',
        'resolved',
        'fixed',
        'synced',
        'safe to proceed',
        'ready to publish',
    ];

    const manualInterventionIndicators = [
        'requires manual',
        'manual intervention',
        'cannot automatically',
        'you will need to',
        'please manually',
    ];

    const messageLower = message.toLowerCase();
    const hasSuccessIndicator = successIndicators.some(indicator => messageLower.includes(indicator));
    const hasManualIndicator = manualInterventionIndicators.some(indicator => messageLower.includes(indicator));

    // Extract actions taken (look for past tense verbs and tool usage patterns)
    const actionsTaken: string[] = [];
    const actionPatterns = [
        /(?:I |We )?(checked|analyzed|found|discovered|synced|reset|merged|fetched|pulled|compared|investigated)\s+([^.\n]+)/gi,
        /(?:Successfully|Successfully)\s+([^.\n]+)/gi,
    ];

    for (const pattern of actionPatterns) {
        const matches = message.matchAll(pattern);
        for (const match of matches) {
            actionsTaken.push(match[0].trim());
        }
    }

    // Extract manual steps (look for numbered lists or bullet points)
    const manualSteps: string[] = [];
    const stepPatterns = [
        /(?:Step \d+:|^\d+\.)\s*(.+)$/gim,
        /^[-*]\s+(.+)$/gim,
    ];

    if (hasManualIndicator) {
        // Only extract steps if manual intervention is needed
        for (const pattern of stepPatterns) {
            const matches = message.matchAll(pattern);
            for (const match of matches) {
                const step = match[1]?.trim();
                if (step && step.length > 10) { // Filter out very short matches
                    manualSteps.push(step);
                }
            }
        }
    }

    return {
        success: hasSuccessIndicator && !hasManualIndicator,
        actionsTaken: [...new Set(actionsTaken)], // Remove duplicates
        requiresManualIntervention: hasManualIndicator,
        manualSteps: [...new Set(manualSteps)], // Remove duplicates
    };
}

/**
 * Create a friendly summary of the agentic publish result
 */
export function formatAgenticPublishResult(result: AgenticPublishResult): string {
    const lines: string[] = [];

    lines.push('');
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('         AGENTIC PUBLISH RECOVERY REPORT');
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('');

    if (result.success) {
        lines.push('✅ Status: RESOLVED');
    } else if (result.requiresManualIntervention) {
        lines.push('⚠️  Status: MANUAL INTERVENTION REQUIRED');
    } else {
        lines.push('❌ Status: UNRESOLVED');
    }

    lines.push('');
    lines.push(`Iterations: ${result.iterations}`);
    lines.push(`Tools executed: ${result.toolCallsExecuted}`);
    lines.push('');

    if (result.actionsTaken.length > 0) {
        lines.push('Actions taken:');
        for (const action of result.actionsTaken) {
            lines.push(`  • ${action}`);
        }
        lines.push('');
    }

    if (result.requiresManualIntervention && result.manualSteps && result.manualSteps.length > 0) {
        lines.push('Manual steps required:');
        for (let i = 0; i < result.manualSteps.length; i++) {
            lines.push(`  ${i + 1}. ${result.manualSteps[i]}`);
        }
        lines.push('');
    }

    lines.push('Detailed analysis:');
    lines.push('───────────────────────────────────────────────────────────');
    lines.push(result.message);
    lines.push('───────────────────────────────────────────────────────────');
    lines.push('');

    if (result.success) {
        lines.push('You can now retry the publish command.');
    } else if (result.requiresManualIntervention) {
        lines.push('Please complete the manual steps above, then retry the publish command.');
    } else {
        lines.push('The issue could not be resolved automatically. Please review the analysis above.');
    }

    lines.push('');

    return lines.join('\n');
}


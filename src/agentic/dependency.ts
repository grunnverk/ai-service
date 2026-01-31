/**
 * Agentic Dependency Analysis
 *
 * Uses AI to analyze dependency conflicts and make upgrade recommendations
 * across a monorepo based on the dependency report.
 */

import type { ChatCompletionMessageParam } from 'openai/resources';
import { runAgentic, type AgenticConfig, type ToolExecutionMetric } from './executor';
import { createToolRegistry } from '../tools/registry';
import { createDependencyTools } from '../tools/dependency-tools';
import type { StorageAdapter, Logger } from '../types';
import { generateToolGuidance } from '@kjerneverk/riotprompt';

export interface DependencyConflict {
    packageName: string;
    versions: string[];
    usages: Array<{
        version: string;
        usedBy: string[];
    }>;
}

export interface DependencyReportData {
    packageCount: number;
    totalDependencies: number;
    uniqueDependencies: number;
    conflictCount: number;
    conflicts: DependencyConflict[];
    sharedDependencies: Array<{
        name: string;
        versions: string[];
        packageCount: number;
    }>;
    packageSummaries: Array<{
        name: string;
        deps: number;
        devDeps: number;
        peerDeps: number;
        total: number;
    }>;
}

export interface AgenticDependencyConfig {
    reportData: DependencyReportData;
    strategy?: 'latest' | 'conservative' | 'compatible';
    focusPackages?: string[]; // Specific packages to focus on
    model?: string;
    maxIterations?: number;
    debug?: boolean;
    debugRequestFile?: string;
    debugResponseFile?: string;
    storage?: StorageAdapter;
    logger?: Logger;
    openaiReasoning?: 'low' | 'medium' | 'high';
}

export interface DependencyRecommendation {
    packageName: string;
    currentVersions: string[];
    recommendedVersion: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
    updateOrder: number;
    affectedProjects: string[];
    breakingChanges?: boolean;
}

export interface AgenticDependencyResult {
    recommendations: DependencyRecommendation[];
    summary: string;
    upgradeOrder: string[];
    warnings: string[];
    iterations: number;
    toolCallsExecuted: number;
    conversationHistory: ChatCompletionMessageParam[];
    toolMetrics: ToolExecutionMetric[];
}

/**
 * Run agentic dependency analysis
 */
export async function runAgenticDependencyAnalysis(config: AgenticDependencyConfig): Promise<AgenticDependencyResult> {
    const {
        reportData,
        strategy = 'latest',
        focusPackages,
        model = 'gpt-4o',
        maxIterations = 15,
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

    // Register dependency analysis tools
    const tools = createDependencyTools();
    toolRegistry.registerAll(tools);

    // Generate automatic tool guidance from riotprompt
    const toolGuidance = generateToolGuidance(tools, {
        strategy: 'adaptive',
        includeExamples: true,
        explainWhenToUse: true,
        includeCategories: true,
    });

    // Build initial system prompt with tool guidance
    const systemPrompt = buildSystemPrompt(strategy, toolGuidance);

    // Build initial user message with report data
    const userMessage = buildUserMessage(reportData, strategy, focusPackages);

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
        tokenBudget: {
            max: 100000,
            reserveForResponse: 4000,
            strategy: 'fifo',
            onBudgetExceeded: 'compress',
        },
    };

    const result = await runAgentic(agenticConfig);

    // Parse the final message to extract recommendations
    const analysis = parseAgentResponse(result.finalMessage, reportData);

    return {
        recommendations: analysis.recommendations,
        summary: analysis.summary,
        upgradeOrder: analysis.upgradeOrder,
        warnings: analysis.warnings,
        iterations: result.iterations,
        toolCallsExecuted: result.toolCallsExecuted,
        conversationHistory: result.conversationHistory,
        toolMetrics: result.toolMetrics,
    };
}

/**
 * Build system prompt for dependency analysis
 */
function buildSystemPrompt(strategy: string, toolGuidance: string): string {
    return `You are an expert dependency management advisor for JavaScript/TypeScript monorepos.

Your goal is to analyze dependency conflicts and version inconsistencies across a monorepo and provide actionable recommendations for version alignment and upgrades.

## Your Strategy: ${strategy.toUpperCase()}

${strategy === 'latest' ? `
- Prioritize upgrading to the latest stable versions
- Security and new features are important
- Breaking changes are acceptable if the benefits outweigh the migration cost
` : strategy === 'conservative' ? `
- Prefer the most commonly used version across projects
- Minimize disruption to the codebase
- Only recommend upgrades when there's a clear benefit
` : `
- Find versions that work for all packages
- Prioritize compatibility over new features
- Recommend the minimum viable upgrade
`}

## Analysis Process

1. **Review Conflicts**: Examine each version conflict in the report
2. **Research Packages**: Use tools to look up package information and peer dependencies
3. **Check Compatibility**: Verify that recommended versions are compatible
4. **Create Upgrade Plan**: Determine the order in which packages should be updated
5. **Identify Breaking Changes**: Flag any upgrades that might require code changes

## Tools Available

${toolGuidance}

## Output Format

After your analysis, provide recommendations in this format:

### SUMMARY
A brief overview of the analysis findings.

### RECOMMENDATIONS
For each recommendation:
- **Package**: package name
- **Current**: list of current versions in use
- **Recommended**: the version to align on
- **Priority**: high/medium/low
- **Reason**: why this upgrade is recommended
- **Breaking Changes**: yes/no and what to watch for
- **Affected Projects**: which projects need to be updated

### UPGRADE ORDER
List the packages in the order they should be upgraded (dependencies first).

### WARNINGS
Any concerns or things to watch out for.

Be thorough but concise. Focus on the most impactful changes first.`;
}

/**
 * Build user message with dependency report data
 */
function buildUserMessage(
    reportData: DependencyReportData,
    strategy: string,
    focusPackages?: string[]
): string {
    const conflictsSummary = reportData.conflicts.map(c => {
        const usageInfo = c.usages.map(u => `${u.version} (used by: ${u.usedBy.join(', ')})`).join('\n    - ');
        return `  - ${c.packageName}:\n    - ${usageInfo}`;
    }).join('\n');

    const sharedSummary = reportData.sharedDependencies
        .slice(0, 20)
        .map(s => `  - ${s.name}: ${s.versions.join(' | ')} (${s.packageCount} packages)`)
        .join('\n');

    const packagesSummary = reportData.packageSummaries
        .map(p => `  - ${p.name}: ${p.deps} deps, ${p.devDeps} devDeps, ${p.total} total`)
        .join('\n');

    let focusNote = '';
    if (focusPackages && focusPackages.length > 0) {
        focusNote = `\n\n**FOCUS**: Please pay special attention to these packages: ${focusPackages.join(', ')}`;
    }

    return `Please analyze the following dependency report and provide upgrade recommendations using the "${strategy}" strategy.

## Dependency Report Summary

- **Packages in monorepo**: ${reportData.packageCount}
- **Total dependencies**: ${reportData.totalDependencies}
- **Unique dependencies**: ${reportData.uniqueDependencies}
- **Version conflicts**: ${reportData.conflictCount}

## Version Conflicts (${reportData.conflictCount} packages)

${conflictsSummary || 'No version conflicts found.'}

## Most Shared Dependencies (top 20)

${sharedSummary}

## Package Summary

${packagesSummary}
${focusNote}

Please use the available tools to research these packages, check their peer dependencies, and provide a comprehensive upgrade plan.`;
}

/**
 * Parse agent response to extract structured recommendations
 */
function parseAgentResponse(response: string, reportData: DependencyReportData): {
    recommendations: DependencyRecommendation[];
    summary: string;
    upgradeOrder: string[];
    warnings: string[];
} {
    const recommendations: DependencyRecommendation[] = [];
    const warnings: string[] = [];
    let summary = '';
    let upgradeOrder: string[] = [];

    // Extract summary section
    const summaryMatch = response.match(/###\s*SUMMARY\s*\n([\s\S]*?)(?=###|$)/i);
    if (summaryMatch) {
        summary = summaryMatch[1].trim();
    }

    // Extract recommendations section
    const recsMatch = response.match(/###\s*RECOMMENDATIONS?\s*\n([\s\S]*?)(?=###|$)/i);
    if (recsMatch) {
        const recsText = recsMatch[1];

        // Parse individual recommendations
        const recBlocks = recsText.split(/\n(?=\*\*Package\*\*:|\d+\.\s+\*\*)/);

        let order = 1;
        for (const block of recBlocks) {
            if (!block.trim()) continue;

            const packageMatch = block.match(/\*\*Package\*\*:\s*([^\n]+)/i);
            const currentMatch = block.match(/\*\*Current\*\*:\s*([^\n]+)/i);
            const recommendedMatch = block.match(/\*\*Recommended\*\*:\s*([^\n]+)/i);
            const priorityMatch = block.match(/\*\*Priority\*\*:\s*(high|medium|low)/i);
            const reasonMatch = block.match(/\*\*Reason\*\*:\s*([^\n]+)/i);
            const breakingMatch = block.match(/\*\*Breaking\s*Changes?\*\*:\s*([^\n]+)/i);
            const affectedMatch = block.match(/\*\*Affected\s*Projects?\*\*:\s*([^\n]+)/i);

            if (packageMatch) {
                recommendations.push({
                    packageName: packageMatch[1].trim(),
                    currentVersions: currentMatch ? currentMatch[1].split(/[,|]/).map(v => v.trim()) : [],
                    recommendedVersion: recommendedMatch ? recommendedMatch[1].trim() : 'unknown',
                    priority: (priorityMatch ? priorityMatch[1].toLowerCase() : 'medium') as 'high' | 'medium' | 'low',
                    reason: reasonMatch ? reasonMatch[1].trim() : '',
                    updateOrder: order++,
                    affectedProjects: affectedMatch ? affectedMatch[1].split(/[,|]/).map(p => p.trim()) : [],
                    breakingChanges: breakingMatch ? breakingMatch[1].toLowerCase().includes('yes') : false,
                });
            }
        }
    }

    // Extract upgrade order
    const orderMatch = response.match(/###\s*UPGRADE\s*ORDER\s*\n([\s\S]*?)(?=###|$)/i);
    if (orderMatch) {
        const orderText = orderMatch[1];
        upgradeOrder = orderText
            .split('\n')
            .filter(line => line.trim())
            .map(line => line.replace(/^[\d.*-]+\s*/, '').trim())
            .filter(Boolean);
    }

    // Extract warnings
    const warningsMatch = response.match(/###\s*WARNINGS?\s*\n([\s\S]*?)(?=###|$)/i);
    if (warningsMatch) {
        const warningsText = warningsMatch[1];
        warnings.push(...warningsText
            .split('\n')
            .filter(line => line.trim())
            .map(line => line.replace(/^[-*]+\s*/, '').trim())
            .filter(Boolean)
        );
    }

    // If no structured recommendations found, create from conflicts
    if (recommendations.length === 0 && reportData.conflicts.length > 0) {
        for (const conflict of reportData.conflicts.slice(0, 10)) {
            recommendations.push({
                packageName: conflict.packageName,
                currentVersions: conflict.versions,
                recommendedVersion: 'See analysis',
                priority: 'medium',
                reason: 'Version conflict detected - manual review recommended',
                updateOrder: recommendations.length + 1,
                affectedProjects: conflict.usages.flatMap(u => u.usedBy),
                breakingChanges: false,
            });
        }
        summary = response.slice(0, 500) + '...';
    }

    return {
        recommendations,
        summary: summary || 'Analysis complete. See recommendations below.',
        upgradeOrder,
        warnings,
    };
}

/**
 * Format agentic analysis result as a readable report
 */
export function formatDependencyAnalysisReport(result: AgenticDependencyResult): string {
    const lines: string[] = [];

    lines.push('');
    lines.push('╔═══════════════════════════════════════════════════════════════════╗');
    lines.push('║           🤖 AI DEPENDENCY ANALYSIS REPORT                        ║');
    lines.push('╚═══════════════════════════════════════════════════════════════════╝');
    lines.push('');
    lines.push(`📊 Analysis completed in ${result.iterations} iterations with ${result.toolCallsExecuted} tool calls`);
    lines.push('');

    // Summary
    lines.push('┌─ 📝 SUMMARY');
    lines.push('│');
    const summaryLines = result.summary.split('\n');
    for (const line of summaryLines) {
        lines.push(`│  ${line}`);
    }
    lines.push('');

    // Recommendations
    if (result.recommendations.length > 0) {
        lines.push('┌─ 💡 RECOMMENDATIONS');
        lines.push('│');

        // Sort by priority and order
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const sortedRecs = [...result.recommendations].sort((a, b) => {
            const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
            return pDiff !== 0 ? pDiff : a.updateOrder - b.updateOrder;
        });

        for (let i = 0; i < sortedRecs.length; i++) {
            const rec = sortedRecs[i];
            const isLast = i === sortedRecs.length - 1;
            const priorityIcon = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
            const breakingIcon = rec.breakingChanges ? ' ⚠️' : '';

            lines.push(`│  ${isLast ? '└─' : '├─'} ${priorityIcon} ${rec.packageName}${breakingIcon}`);
            lines.push(`│  ${isLast ? '  ' : '│ '}    Current: ${rec.currentVersions.join(', ')}`);
            lines.push(`│  ${isLast ? '  ' : '│ '}    Recommended: ${rec.recommendedVersion}`);
            lines.push(`│  ${isLast ? '  ' : '│ '}    Reason: ${rec.reason}`);
            if (rec.affectedProjects.length > 0) {
                lines.push(`│  ${isLast ? '  ' : '│ '}    Affects: ${rec.affectedProjects.slice(0, 5).join(', ')}${rec.affectedProjects.length > 5 ? ` +${rec.affectedProjects.length - 5} more` : ''}`);
            }
        }
        lines.push('');
    }

    // Upgrade order
    if (result.upgradeOrder.length > 0) {
        lines.push('┌─ 📋 UPGRADE ORDER');
        lines.push('│');
        for (let i = 0; i < result.upgradeOrder.length; i++) {
            const pkg = result.upgradeOrder[i];
            const isLast = i === result.upgradeOrder.length - 1;
            lines.push(`│  ${isLast ? '└─' : '├─'} ${i + 1}. ${pkg}`);
        }
        lines.push('');
    }

    // Warnings
    if (result.warnings.length > 0) {
        lines.push('┌─ ⚠️  WARNINGS');
        lines.push('│');
        for (let i = 0; i < result.warnings.length; i++) {
            const warning = result.warnings[i];
            const isLast = i === result.warnings.length - 1;
            lines.push(`│  ${isLast ? '└─' : '├─'} ${warning}`);
        }
        lines.push('');
    }

    lines.push('╔═══════════════════════════════════════════════════════════════════╗');
    lines.push('║                    END OF AI ANALYSIS                             ║');
    lines.push('╚═══════════════════════════════════════════════════════════════════╝');
    lines.push('');

    return lines.join('\n');
}


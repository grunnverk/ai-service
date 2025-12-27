/**
 * Self-reflection report generation
 *
 * Provides enhanced reflection reports for agentic workflows.
 * Uses our custom implementation optimized for commit and release workflows.
 */

import type { Logger, StorageAdapter } from '../types';
import type { ToolExecutionMetric } from '../agentic/executor';

export interface ReflectionOptions {
    iterations: number;
    toolCallsExecuted: number;
    maxIterations: number;
    toolMetrics: ToolExecutionMetric[];
    conversationHistory?: any[];
    commitMessage?: string;
    suggestedSplits?: any[];
    releaseNotes?: any;
    logger?: Logger;
}

/**
 * Generate a comprehensive self-reflection report
 *
 * @example
 * ```typescript
 * const report = await generateReflectionReport({
 *     iterations: result.iterations,
 *     toolCallsExecuted: result.toolCallsExecuted,
 *     maxIterations: 10,
 *     toolMetrics: result.toolMetrics,
 *     commitMessage: result.commitMessage,
 *     logger
 * });
 *
 * await saveReflectionReport(report, 'output/reflection.md', storage);
 * ```
 */
export async function generateReflectionReport(options: ReflectionOptions): Promise<string> {
    const {
        iterations,
        toolCallsExecuted,
        maxIterations,
        toolMetrics,
        conversationHistory,
        commitMessage,
        suggestedSplits,
        releaseNotes,
        logger
    } = options;

    const sections: string[] = [];

    // Header
    sections.push('# Agentic Workflow - Self-Reflection Report');
    sections.push('');
    sections.push(`Generated: ${new Date().toISOString()}`);
    sections.push('');

    // Execution Summary
    sections.push('## Execution Summary');
    sections.push('');
    sections.push(`- **Iterations**: ${iterations}${iterations >= maxIterations ? ' (max reached)' : ''}`);
    sections.push(`- **Tool Calls**: ${toolCallsExecuted}`);
    sections.push(`- **Unique Tools**: ${new Set(toolMetrics.map(m => m.name)).size}`);
    sections.push('');

    // Calculate tool statistics
    const toolStats = calculateToolStats(toolMetrics);

    // Tool Effectiveness
    sections.push('## Tool Effectiveness Analysis');
    sections.push('');

    if (toolStats.size === 0) {
        sections.push('*No tools were executed during this run.*');
    } else {
        sections.push('| Tool | Calls | Success | Failures | Success Rate | Avg Duration |');
        sections.push('|------|-------|---------|----------|--------------|--------------|');

        for (const [toolName, stats] of Array.from(toolStats.entries()).sort((a, b) => b[1].total - a[1].total)) {
            const successRate = stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : '0.0';
            const avgDuration = stats.total > 0 ? (stats.totalDuration / stats.total).toFixed(0) : '0';
            sections.push(`| ${toolName} | ${stats.total} | ${stats.success} | ${stats.failures} | ${successRate}% | ${avgDuration}ms |`);
        }
    }
    sections.push('');

    // Performance Insights
    if (toolStats.size > 0) {
        sections.push('### Tool Performance Insights');
        sections.push('');

        const failedTools = Array.from(toolStats.entries()).filter(([_, stats]) => stats.failures > 0);
        if (failedTools.length > 0) {
            sections.push('**Tools with Failures:**');
            for (const [toolName, stats] of failedTools) {
                const failureRate = stats.total > 0 ? ((stats.failures / stats.total) * 100).toFixed(1) : '0.0';
                sections.push(`- ${toolName}: ${stats.failures}/${stats.total} failures (${failureRate}%)`);
            }
            sections.push('');
        }

        const slowTools = Array.from(toolStats.entries())
            .filter(([_, stats]) => stats.total > 0 && (stats.totalDuration / stats.total) > 1000)
            .sort((a, b) => {
                const avgA = a[1].total > 0 ? a[1].totalDuration / a[1].total : 0;
                const avgB = b[1].total > 0 ? b[1].totalDuration / b[1].total : 0;
                return avgB - avgA;
            });

        if (slowTools.length > 0) {
            sections.push('**Slow Tools (>1s average):**');
            for (const [toolName, stats] of slowTools) {
                const avgDuration = stats.total > 0 ? (stats.totalDuration / stats.total / 1000).toFixed(2) : '0.00';
                sections.push(`- ${toolName}: ${avgDuration}s average`);
            }
            sections.push('');
        }

        sections.push('**Most Frequently Used:**');
        const topTools = Array.from(toolStats.entries()).slice(0, 3);
        for (const [toolName, stats] of topTools) {
            sections.push(`- ${toolName}: ${stats.total} calls`);
        }
        sections.push('');
    }

    // Recommendations
    sections.push('## Recommendations for Improvement');
    sections.push('');

    const recommendations = generateRecommendations(options, toolStats);
    if (recommendations.length === 0) {
        sections.push('*No specific recommendations at this time. Execution appears optimal.*');
    } else {
        for (const rec of recommendations) {
            sections.push(rec);
        }
    }
    sections.push('');

    // Execution Timeline
    sections.push('## Detailed Execution Timeline');
    sections.push('');

    if (toolMetrics.length === 0) {
        sections.push('*No tool execution timeline available.*');
    } else {
        sections.push('| Time | Iteration | Tool | Result | Duration |');
        sections.push('|------|-----------|------|--------|----------|');

        for (const metric of toolMetrics) {
            const time = new Date(metric.timestamp).toLocaleTimeString();
            const result = metric.success ? '✅ Success' : `❌ ${metric.error || 'Failed'}`;
            sections.push(`| ${time} | ${metric.iteration} | ${metric.name} | ${result} | ${metric.duration}ms |`);
        }
        sections.push('');
    }

    // Conversation History
    if (conversationHistory && conversationHistory.length > 0) {
        sections.push('## Conversation History');
        sections.push('');
        sections.push('<details>');
        sections.push('<summary>Click to expand full agentic interaction</summary>');
        sections.push('');
        sections.push('```json');
        sections.push(JSON.stringify(conversationHistory, null, 2));
        sections.push('```');
        sections.push('');
        sections.push('</details>');
        sections.push('');
    }

    // Generated Output
    if (commitMessage) {
        sections.push('## Generated Commit Message');
        sections.push('');
        sections.push('```');
        sections.push(commitMessage);
        sections.push('```');
        sections.push('');

        if (suggestedSplits && suggestedSplits.length > 1) {
            sections.push('## Suggested Commit Splits');
            sections.push('');
            for (let i = 0; i < suggestedSplits.length; i++) {
                const split = suggestedSplits[i];
                sections.push(`### Split ${i + 1}`);
                sections.push('');
                sections.push(`**Files**: ${split.files.join(', ')}`);
                sections.push('');
                sections.push(`**Rationale**: ${split.rationale}`);
                sections.push('');
                sections.push(`**Message**:`);
                sections.push('```');
                sections.push(split.message);
                sections.push('```');
                sections.push('');
            }
        }
    }

    if (releaseNotes) {
        sections.push('## Generated Release Notes');
        sections.push('');
        sections.push('### Title');
        sections.push('```');
        sections.push(releaseNotes.title);
        sections.push('```');
        sections.push('');
        sections.push('### Body');
        sections.push('```markdown');
        sections.push(releaseNotes.body);
        sections.push('```');
        sections.push('');
    }

    if (logger) {
        logger.debug(`Generated reflection report with ${toolStats.size} unique tools`);
    }

    return sections.join('\n');
}

/**
 * Calculate tool statistics
 */
function calculateToolStats(toolMetrics: ToolExecutionMetric[]): Map<string, { total: number; success: number; failures: number; totalDuration: number }> {
    const stats = new Map();

    for (const metric of toolMetrics) {
        if (!stats.has(metric.name)) {
            stats.set(metric.name, { total: 0, success: 0, failures: 0, totalDuration: 0 });
        }
        const toolStat = stats.get(metric.name);
        toolStat.total++;
        toolStat.totalDuration += metric.duration;
        if (metric.success) {
            toolStat.success++;
        } else {
            toolStat.failures++;
        }
    }

    return stats;
}

/**
 * Generate recommendations based on metrics
 */
function generateRecommendations(
    options: ReflectionOptions,
    toolStats: Map<string, { total: number; success: number; failures: number; totalDuration: number }>
): string[] {
    const recommendations: string[] = [];

    // Check for tool failures
    const toolsWithFailures = Array.from(toolStats.entries()).filter(([_, stats]) => stats.failures > 0);
    if (toolsWithFailures.length > 0) {
        recommendations.push('- **Tool Failures**: Investigate and fix tools that are failing. This may indicate issues with error handling or tool implementation.');
    }

    // Check for slow tools
    const slowTools = Array.from(toolStats.entries())
        .filter(([_, stats]) => stats.total > 0 && (stats.totalDuration / stats.total) > 1000);
    if (slowTools.length > 0) {
        recommendations.push('- **Performance**: Consider optimizing slow tools or caching results to improve execution speed.');
    }

    // Check for max iterations reached
    if (options.iterations >= options.maxIterations) {
        recommendations.push('- **Max Iterations Reached**: The agent reached maximum iterations. Consider increasing the limit or improving tool efficiency to allow the agent to complete naturally.');
    }

    // Check for underutilized tools
    const underutilizedTools = Array.from(toolStats.entries()).filter(([_, stats]) => stats.total === 1);
    if (underutilizedTools.length > 3) {
        recommendations.push('- **Underutilized Tools**: Many tools were called only once. Consider whether all tools are necessary or if the agent needs better guidance on when to use them.');
    }

    // Check tool diversity
    const uniqueTools = toolStats.size;
    if (uniqueTools === 1 && options.toolCallsExecuted > 3) {
        recommendations.push('- **Low Tool Diversity**: Only one tool was used despite multiple calls. Consider if the agent needs better guidance to use a variety of tools.');
    }

    return recommendations;
}

/**
 * Save reflection report to file
 */
export async function saveReflectionReport(
    report: string,
    outputPath: string,
    storage?: StorageAdapter
): Promise<void> {
    if (!storage) {
        throw new Error('Storage adapter required to save report');
    }

    // Extract filename from path
    const filename = outputPath.split('/').pop() || 'reflection.md';
    await storage.writeOutput(filename, report);
}

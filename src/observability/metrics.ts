/**
 * Metrics collection for agentic workflows
 *
 * Provides integration with riotprompt's MetricsCollector while
 * maintaining compatibility with existing tool metrics.
 */

import { MetricsCollector, type AgenticExecutionMetrics } from '@riotprompt/riotprompt';
import type { Logger } from '../types';

export interface ToolExecutionMetric {
    name: string;
    timestamp: number;
    duration: number;
    success: boolean;
    iteration: number;
    error?: string;
}

export interface MetricsConfig {
    logger?: Logger;
}

/**
 * Create a metrics collector for agentic workflows
 *
 * This wraps riotprompt's MetricsCollector and provides compatibility
 * with existing tool metrics format.
 */
export function createMetricsCollector(config: MetricsConfig = {}) {
    const { logger } = config;
    const collector = new MetricsCollector(logger);
    const toolMetrics: ToolExecutionMetric[] = [];

    return {
        /**
         * Record a tool execution
         */
        recordToolExecution(metric: ToolExecutionMetric) {
            toolMetrics.push(metric);

            // Also record in riotprompt's collector
            collector.recordToolCall(
                metric.name,
                metric.iteration,
                metric.duration,
                metric.success,
                metric.error
            );

            if (logger) {
                const status = metric.success ? 'success' : 'failed';
                logger.debug(`Tool ${metric.name} ${status} in ${metric.duration}ms`);
            }
        },

        /**
         * Record an iteration
         */
        recordIteration() {
            collector.incrementIteration();

            if (logger) {
                logger.debug(`Iteration incremented`);
            }
        },

        /**
         * Get tool metrics in legacy format (for backward compatibility)
         */
        getToolMetrics(): ToolExecutionMetric[] {
            return [...toolMetrics];
        },

        /**
         * Generate execution metrics report
         */
        generateReport(): AgenticExecutionMetrics {
            return collector.getMetrics([]);
        },

        /**
         * Get summary statistics
         */
        getSummary() {
            const report = collector.getMetrics([]);
            return {
                totalIterations: report.iterations,
                totalToolCalls: report.toolCallsExecuted,
                totalDuration: report.totalDuration,
                toolMetrics: report.toolMetrics,
                toolStats: report.toolStats
            };
        },

        /**
         * Reset all metrics
         */
        reset() {
            toolMetrics.length = 0;
            // Note: MetricsCollector doesn't have reset, create new instance if needed
        }
    };
}

export type MetricsCollectorInstance = ReturnType<typeof createMetricsCollector>;


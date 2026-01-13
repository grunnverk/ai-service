import { describe, it, expect, vi, beforeEach } from 'vitest';

// Define the mock class inside the mock factory to avoid hoisting issues
vi.mock('@riotprompt/riotprompt', () => {
    const MockMetricsCollector = class {
        recordToolCall = vi.fn();
        incrementIteration = vi.fn();
        getMetrics = vi.fn(() => ({
            iterations: 5,
            toolCallsExecuted: 10,
            totalDuration: 5000,
            toolMetrics: [],
            toolStats: {}
        }));
    };
    return {
        MetricsCollector: MockMetricsCollector
    };
});

import { createMetricsCollector, type ToolExecutionMetric } from '../../src/observability/metrics';

describe('Metrics Collector', () => {
    const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createMetricsCollector', () => {
        it('should create a metrics collector', () => {
            const collector = createMetricsCollector();

            expect(collector).toBeDefined();
            expect(collector.recordToolExecution).toBeDefined();
            expect(collector.recordIteration).toBeDefined();
            expect(collector.getToolMetrics).toBeDefined();
            expect(collector.generateReport).toBeDefined();
            expect(collector.getSummary).toBeDefined();
            expect(collector.reset).toBeDefined();
        });

        it('should create collector with logger', () => {
            const collector = createMetricsCollector({ logger: mockLogger as any });

            expect(collector).toBeDefined();
        });
    });

    describe('recordToolExecution', () => {
        it('should record successful tool execution', () => {
            const collector = createMetricsCollector({ logger: mockLogger as any });

            const metric: ToolExecutionMetric = {
                name: 'read_file',
                timestamp: Date.now(),
                duration: 100,
                success: true,
                iteration: 1
            };

            collector.recordToolExecution(metric);

            const metrics = collector.getToolMetrics();
            expect(metrics).toHaveLength(1);
            expect(metrics[0].name).toBe('read_file');
            expect(metrics[0].success).toBe(true);
            expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('success'));
        });

        it('should record failed tool execution', () => {
            const collector = createMetricsCollector({ logger: mockLogger as any });

            const metric: ToolExecutionMetric = {
                name: 'run_command',
                timestamp: Date.now(),
                duration: 50,
                success: false,
                iteration: 2,
                error: 'Command failed'
            };

            collector.recordToolExecution(metric);

            const metrics = collector.getToolMetrics();
            expect(metrics).toHaveLength(1);
            expect(metrics[0].success).toBe(false);
            expect(metrics[0].error).toBe('Command failed');
            expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('failed'));
        });

        it('should record multiple tool executions', () => {
            const collector = createMetricsCollector();

            collector.recordToolExecution({
                name: 'read_file',
                timestamp: Date.now(),
                duration: 100,
                success: true,
                iteration: 1
            });

            collector.recordToolExecution({
                name: 'write_file',
                timestamp: Date.now(),
                duration: 200,
                success: true,
                iteration: 1
            });

            collector.recordToolExecution({
                name: 'read_file',
                timestamp: Date.now(),
                duration: 150,
                success: false,
                iteration: 2,
                error: 'File not found'
            });

            const metrics = collector.getToolMetrics();
            expect(metrics).toHaveLength(3);
        });
    });

    describe('recordIteration', () => {
        it('should record iteration', () => {
            const collector = createMetricsCollector({ logger: mockLogger as any });

            collector.recordIteration();

            expect(mockLogger.debug).toHaveBeenCalledWith('Iteration incremented');
        });

        it('should record iteration without logger', () => {
            const collector = createMetricsCollector();

            // Should not throw
            expect(() => collector.recordIteration()).not.toThrow();
        });
    });

    describe('getToolMetrics', () => {
        it('should return copy of tool metrics', () => {
            const collector = createMetricsCollector();

            collector.recordToolExecution({
                name: 'test',
                timestamp: Date.now(),
                duration: 100,
                success: true,
                iteration: 1
            });

            const metrics1 = collector.getToolMetrics();
            const metrics2 = collector.getToolMetrics();

            // Should be different array instances
            expect(metrics1).not.toBe(metrics2);
            // But same content
            expect(metrics1).toEqual(metrics2);
        });

        it('should return empty array when no metrics recorded', () => {
            const collector = createMetricsCollector();

            const metrics = collector.getToolMetrics();

            expect(metrics).toEqual([]);
        });
    });

    describe('generateReport', () => {
        it('should generate execution metrics report', () => {
            const collector = createMetricsCollector();

            const report = collector.generateReport();

            expect(report).toBeDefined();
            expect(report.iterations).toBe(5);
            expect(report.toolCallsExecuted).toBe(10);
        });
    });

    describe('getSummary', () => {
        it('should return summary statistics', () => {
            const collector = createMetricsCollector();

            const summary = collector.getSummary();

            expect(summary.totalIterations).toBe(5);
            expect(summary.totalToolCalls).toBe(10);
            expect(summary.totalDuration).toBe(5000);
        });
    });

    describe('reset', () => {
        it('should reset all metrics', () => {
            const collector = createMetricsCollector();

            collector.recordToolExecution({
                name: 'test',
                timestamp: Date.now(),
                duration: 100,
                success: true,
                iteration: 1
            });

            expect(collector.getToolMetrics()).toHaveLength(1);

            collector.reset();

            expect(collector.getToolMetrics()).toHaveLength(0);
        });
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    generateReflectionReport,
    saveReflectionReport,
    type ReflectionOptions
} from '../../src/observability/reflection';

describe('Reflection Report', () => {
    const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    };

    const mockStorage = {
        writeOutput: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('generateReflectionReport', () => {
        it('should generate basic reflection report', async () => {
            const options: ReflectionOptions = {
                iterations: 5,
                toolCallsExecuted: 10,
                maxIterations: 15,
                toolMetrics: []
            };

            const report = await generateReflectionReport(options);

            expect(report).toContain('# Agentic Workflow - Self-Reflection Report');
            expect(report).toContain('**Iterations**: 5');
            expect(report).toContain('**Tool Calls**: 10');
            expect(report).toContain('**Unique Tools**: 0');
        });

        it('should generate report with tool metrics', async () => {
            const now = new Date().toISOString();
            const options: ReflectionOptions = {
                iterations: 3,
                toolCallsExecuted: 6,
                maxIterations: 10,
                toolMetrics: [
                    { name: 'read_file', timestamp: now, duration: 100, success: true, iteration: 1 },
                    { name: 'read_file', timestamp: now, duration: 150, success: true, iteration: 1 },
                    { name: 'run_command', timestamp: now, duration: 500, success: true, iteration: 2 },
                    { name: 'run_command', timestamp: now, duration: 200, success: false, iteration: 2, error: 'Failed' },
                    { name: 'write_file', timestamp: now, duration: 50, success: true, iteration: 3 }
                ],
                logger: mockLogger as any
            };

            const report = await generateReflectionReport(options);

            expect(report).toContain('## Tool Effectiveness Analysis');
            expect(report).toContain('read_file');
            expect(report).toContain('run_command');
            expect(report).toContain('write_file');
            expect(report).toContain('Success Rate');
            expect(mockLogger.debug).toHaveBeenCalled();
        });

        it('should include performance insights for failed tools', async () => {
            const now = new Date().toISOString();
            const options: ReflectionOptions = {
                iterations: 2,
                toolCallsExecuted: 4,
                maxIterations: 10,
                toolMetrics: [
                    { name: 'read_file', timestamp: now, duration: 100, success: true, iteration: 1 },
                    { name: 'run_command', timestamp: now, duration: 500, success: false, iteration: 1, error: 'Error 1' },
                    { name: 'run_command', timestamp: now, duration: 600, success: false, iteration: 2, error: 'Error 2' }
                ]
            };

            const report = await generateReflectionReport(options);

            expect(report).toContain('Tools with Failures');
            expect(report).toContain('run_command');
        });

        it('should include insights for slow tools', async () => {
            const now = new Date().toISOString();
            const options: ReflectionOptions = {
                iterations: 2,
                toolCallsExecuted: 3,
                maxIterations: 10,
                toolMetrics: [
                    { name: 'slow_tool', timestamp: now, duration: 2000, success: true, iteration: 1 },
                    { name: 'slow_tool', timestamp: now, duration: 1500, success: true, iteration: 2 },
                    { name: 'fast_tool', timestamp: now, duration: 50, success: true, iteration: 2 }
                ]
            };

            const report = await generateReflectionReport(options);

            expect(report).toContain('Slow Tools');
            expect(report).toContain('slow_tool');
        });

        it('should include most frequently used tools', async () => {
            const now = new Date().toISOString();
            const options: ReflectionOptions = {
                iterations: 3,
                toolCallsExecuted: 10,
                maxIterations: 10,
                toolMetrics: [
                    { name: 'read_file', timestamp: now, duration: 100, success: true, iteration: 1 },
                    { name: 'read_file', timestamp: now, duration: 100, success: true, iteration: 1 },
                    { name: 'read_file', timestamp: now, duration: 100, success: true, iteration: 2 },
                    { name: 'read_file', timestamp: now, duration: 100, success: true, iteration: 2 },
                    { name: 'read_file', timestamp: now, duration: 100, success: true, iteration: 3 },
                    { name: 'write_file', timestamp: now, duration: 50, success: true, iteration: 3 }
                ]
            };

            const report = await generateReflectionReport(options);

            expect(report).toContain('Most Frequently Used');
            expect(report).toContain('read_file');
        });

        it('should generate recommendations for tool failures', async () => {
            const now = new Date().toISOString();
            const options: ReflectionOptions = {
                iterations: 2,
                toolCallsExecuted: 4,
                maxIterations: 10,
                toolMetrics: [
                    { name: 'failing_tool', timestamp: now, duration: 100, success: false, iteration: 1, error: 'Error' }
                ]
            };

            const report = await generateReflectionReport(options);

            expect(report).toContain('## Recommendations');
            expect(report).toContain('Tool Failures');
        });

        it('should generate recommendations when max iterations reached', async () => {
            const options: ReflectionOptions = {
                iterations: 10,
                toolCallsExecuted: 20,
                maxIterations: 10,
                toolMetrics: []
            };

            const report = await generateReflectionReport(options);

            expect(report).toContain('(max reached)');
            expect(report).toContain('Max Iterations Reached');
        });

        it('should generate recommendations for underutilized tools', async () => {
            const now = new Date().toISOString();
            const options: ReflectionOptions = {
                iterations: 5,
                toolCallsExecuted: 10,
                maxIterations: 15,
                toolMetrics: [
                    { name: 'tool1', timestamp: now, duration: 100, success: true, iteration: 1 },
                    { name: 'tool2', timestamp: now, duration: 100, success: true, iteration: 2 },
                    { name: 'tool3', timestamp: now, duration: 100, success: true, iteration: 3 },
                    { name: 'tool4', timestamp: now, duration: 100, success: true, iteration: 4 },
                    { name: 'tool5', timestamp: now, duration: 100, success: true, iteration: 5 }
                ]
            };

            const report = await generateReflectionReport(options);

            expect(report).toContain('Underutilized Tools');
        });

        it('should generate recommendations for low tool diversity', async () => {
            const now = new Date().toISOString();
            const options: ReflectionOptions = {
                iterations: 5,
                toolCallsExecuted: 5,
                maxIterations: 15,
                toolMetrics: [
                    { name: 'read_file', timestamp: now, duration: 100, success: true, iteration: 1 },
                    { name: 'read_file', timestamp: now, duration: 100, success: true, iteration: 2 },
                    { name: 'read_file', timestamp: now, duration: 100, success: true, iteration: 3 },
                    { name: 'read_file', timestamp: now, duration: 100, success: true, iteration: 4 }
                ]
            };

            const report = await generateReflectionReport(options);

            expect(report).toContain('Low Tool Diversity');
        });

        it('should include commit message when provided', async () => {
            const options: ReflectionOptions = {
                iterations: 3,
                toolCallsExecuted: 5,
                maxIterations: 10,
                toolMetrics: [],
                commitMessage: 'feat: Add new feature\n\nThis adds a new feature with great functionality.'
            };

            const report = await generateReflectionReport(options);

            expect(report).toContain('## Generated Commit Message');
            expect(report).toContain('feat: Add new feature');
        });

        it('should include suggested splits when provided', async () => {
            const options: ReflectionOptions = {
                iterations: 3,
                toolCallsExecuted: 5,
                maxIterations: 10,
                toolMetrics: [],
                commitMessage: 'chore: Multiple changes',
                suggestedSplits: [
                    {
                        files: ['src/a.ts', 'src/b.ts'],
                        rationale: 'Related to feature A',
                        message: 'feat: Add feature A'
                    },
                    {
                        files: ['src/c.ts'],
                        rationale: 'Related to feature B',
                        message: 'feat: Add feature B'
                    }
                ]
            };

            const report = await generateReflectionReport(options);

            expect(report).toContain('## Suggested Commit Splits');
            expect(report).toContain('Split 1');
            expect(report).toContain('Split 2');
            expect(report).toContain('feature A');
        });

        it('should include release notes when provided', async () => {
            const options: ReflectionOptions = {
                iterations: 3,
                toolCallsExecuted: 5,
                maxIterations: 10,
                toolMetrics: [],
                releaseNotes: {
                    title: 'v1.0.0 - Major Release',
                    body: '## What\'s New\n\n- Feature 1\n- Feature 2\n\n## Bug Fixes\n\n- Fix 1'
                }
            };

            const report = await generateReflectionReport(options);

            expect(report).toContain('## Generated Release Notes');
            expect(report).toContain('### Title');
            expect(report).toContain('v1.0.0');
            expect(report).toContain('### Body');
            expect(report).toContain('What\'s New');
        });

        it('should include conversation history when provided', async () => {
            const options: ReflectionOptions = {
                iterations: 2,
                toolCallsExecuted: 3,
                maxIterations: 10,
                toolMetrics: [],
                conversationHistory: [
                    { role: 'system', content: 'You are helpful.' },
                    { role: 'user', content: 'Analyze this.' },
                    { role: 'assistant', content: 'Analysis complete.' }
                ]
            };

            const report = await generateReflectionReport(options);

            expect(report).toContain('## Conversation History');
            expect(report).toContain('Click to expand');
            expect(report).toContain('You are helpful');
        });

        it('should include detailed execution timeline', async () => {
            const now = new Date().toISOString();
            const later = new Date(Date.now() + 1000).toISOString();
            const options: ReflectionOptions = {
                iterations: 2,
                toolCallsExecuted: 3,
                maxIterations: 10,
                toolMetrics: [
                    { name: 'read_file', timestamp: now, duration: 100, success: true, iteration: 1 },
                    { name: 'run_command', timestamp: later, duration: 500, success: false, iteration: 2, error: 'Failed' }
                ]
            };

            const report = await generateReflectionReport(options);

            expect(report).toContain('## Detailed Execution Timeline');
            expect(report).toContain('read_file');
            expect(report).toContain('✅ Success');
            expect(report).toContain('❌ Failed');
        });

        it('should show no recommendations when execution is optimal', async () => {
            const now = new Date().toISOString();
            const options: ReflectionOptions = {
                iterations: 3,
                toolCallsExecuted: 6,
                maxIterations: 10,
                toolMetrics: [
                    { name: 'read_file', timestamp: now, duration: 100, success: true, iteration: 1 },
                    { name: 'write_file', timestamp: now, duration: 50, success: true, iteration: 1 },
                    { name: 'read_file', timestamp: now, duration: 100, success: true, iteration: 2 },
                    { name: 'run_command', timestamp: now, duration: 200, success: true, iteration: 2 },
                    { name: 'read_file', timestamp: now, duration: 100, success: true, iteration: 3 },
                    { name: 'write_file', timestamp: now, duration: 50, success: true, iteration: 3 }
                ]
            };

            const report = await generateReflectionReport(options);

            expect(report).toContain('No specific recommendations');
            expect(report).toContain('Execution appears optimal');
        });
    });

    describe('saveReflectionReport', () => {
        it('should save report to file', async () => {
            mockStorage.writeOutput.mockResolvedValue(undefined);

            const report = '# Test Report\n\nContent here.';

            await saveReflectionReport(report, 'output/reflection.md', mockStorage as any);

            expect(mockStorage.writeOutput).toHaveBeenCalledWith('reflection.md', report);
        });

        it('should throw error when storage is not provided', async () => {
            const report = '# Test Report';

            await expect(saveReflectionReport(report, 'output/test.md')).rejects.toThrow('Storage adapter required');
        });

        it('should extract filename from path', async () => {
            mockStorage.writeOutput.mockResolvedValue(undefined);

            const report = '# Test Report';

            await saveReflectionReport(report, 'deep/nested/path/report.md', mockStorage as any);

            expect(mockStorage.writeOutput).toHaveBeenCalledWith('report.md', report);
        });
    });
});


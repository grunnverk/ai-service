import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    runAgenticDependencyAnalysis,
    formatDependencyAnalysisReport,
    type DependencyReportData,
    type AgenticDependencyConfig,
    type AgenticDependencyResult
} from '../../src/agentic/dependency';

// Mock the executor
vi.mock('../../src/agentic/executor', () => ({
    runAgentic: vi.fn()
}));

// Mock riotprompt
vi.mock('@riotprompt/riotprompt', () => ({
    generateToolGuidance: vi.fn(() => 'Mocked tool guidance')
}));

// Mock tool registry
vi.mock('../../src/tools/registry', () => ({
    createToolRegistry: vi.fn(() => ({
        registerAll: vi.fn()
    }))
}));

// Mock dependency tools
vi.mock('../../src/tools/dependency-tools', () => ({
    createDependencyTools: vi.fn(() => [])
}));

describe('Agentic Dependency Analysis', () => {
    const mockReportData: DependencyReportData = {
        packageCount: 5,
        totalDependencies: 100,
        uniqueDependencies: 50,
        conflictCount: 3,
        conflicts: [
            {
                packageName: 'lodash',
                versions: ['^4.17.0', '^4.18.0'],
                usages: [
                    { version: '^4.17.0', usedBy: ['package-a', 'package-b'] },
                    { version: '^4.18.0', usedBy: ['package-c'] }
                ]
            },
            {
                packageName: 'typescript',
                versions: ['^5.0.0', '^5.3.0'],
                usages: [
                    { version: '^5.0.0', usedBy: ['package-a'] },
                    { version: '^5.3.0', usedBy: ['package-b', 'package-c'] }
                ]
            }
        ],
        sharedDependencies: [
            { name: 'lodash', versions: ['^4.17.0', '^4.18.0'], packageCount: 3 },
            { name: 'typescript', versions: ['^5.0.0', '^5.3.0'], packageCount: 3 }
        ],
        packageSummaries: [
            { name: 'package-a', deps: 10, devDeps: 5, peerDeps: 2, total: 17 },
            { name: 'package-b', deps: 8, devDeps: 3, peerDeps: 1, total: 12 }
        ]
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('runAgenticDependencyAnalysis', () => {
        it('should run agentic analysis with default options', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');
            (runAgentic as any).mockResolvedValue({
                finalMessage: `### SUMMARY
The monorepo has 3 version conflicts that need addressing.

### RECOMMENDATIONS
**Package**: lodash
**Current**: ^4.17.0, ^4.18.0
**Recommended**: ^4.18.0
**Priority**: medium
**Reason**: Latest minor version with security fixes
**Breaking Changes**: No
**Affected Projects**: package-a, package-b

### UPGRADE ORDER
1. lodash
2. typescript

### WARNINGS
- Review lodash changelog before upgrading`,
                iterations: 3,
                toolCallsExecuted: 5,
                conversationHistory: [],
                toolMetrics: []
            });

            const config: AgenticDependencyConfig = {
                reportData: mockReportData
            };

            const result = await runAgenticDependencyAnalysis(config);

            expect(result.iterations).toBe(3);
            expect(result.toolCallsExecuted).toBe(5);
            expect(result.recommendations.length).toBeGreaterThan(0);
            expect(result.summary).toContain('conflicts');
        });

        it('should handle analysis with focus packages', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');
            (runAgentic as any).mockResolvedValue({
                finalMessage: '### SUMMARY\nFocused on lodash.\n\n### RECOMMENDATIONS\nNone needed.',
                iterations: 2,
                toolCallsExecuted: 2,
                conversationHistory: [],
                toolMetrics: []
            });

            const config: AgenticDependencyConfig = {
                reportData: mockReportData,
                focusPackages: ['lodash'],
                strategy: 'conservative'
            };

            const result = await runAgenticDependencyAnalysis(config);

            expect(result.summary).toContain('lodash');
        });

        it('should handle analysis with latest strategy', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');
            (runAgentic as any).mockResolvedValue({
                finalMessage: '### SUMMARY\nUpgrading to latest versions.\n\n### WARNINGS\nCheck breaking changes.',
                iterations: 2,
                toolCallsExecuted: 3,
                conversationHistory: [],
                toolMetrics: []
            });

            const config: AgenticDependencyConfig = {
                reportData: mockReportData,
                strategy: 'latest',
                model: 'gpt-4o',
                maxIterations: 10
            };

            const result = await runAgenticDependencyAnalysis(config);

            expect(result.warnings.length).toBeGreaterThan(0);
        });

        it('should create fallback recommendations when none found', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');
            (runAgentic as any).mockResolvedValue({
                finalMessage: 'Analysis complete with some general notes about dependencies.',
                iterations: 1,
                toolCallsExecuted: 0,
                conversationHistory: [],
                toolMetrics: []
            });

            const config: AgenticDependencyConfig = {
                reportData: mockReportData
            };

            const result = await runAgenticDependencyAnalysis(config);

            // Should create fallback recommendations from conflicts
            expect(result.recommendations.length).toBeGreaterThan(0);
        });
    });

    describe('formatDependencyAnalysisReport', () => {
        it('should format a complete report', () => {
            const result: AgenticDependencyResult = {
                recommendations: [
                    {
                        packageName: 'lodash',
                        currentVersions: ['^4.17.0', '^4.18.0'],
                        recommendedVersion: '^4.18.0',
                        reason: 'Latest version with security fixes',
                        priority: 'high',
                        updateOrder: 1,
                        affectedProjects: ['package-a', 'package-b', 'package-c'],
                        breakingChanges: false
                    },
                    {
                        packageName: 'typescript',
                        currentVersions: ['^5.0.0', '^5.3.0'],
                        recommendedVersion: '^5.3.0',
                        reason: 'Better type checking',
                        priority: 'medium',
                        updateOrder: 2,
                        affectedProjects: ['package-a'],
                        breakingChanges: true
                    }
                ],
                summary: 'Found 2 packages needing updates.',
                upgradeOrder: ['lodash', 'typescript'],
                warnings: ['Review breaking changes in typescript'],
                iterations: 5,
                toolCallsExecuted: 10,
                conversationHistory: [],
                toolMetrics: []
            };

            const report = formatDependencyAnalysisReport(result);

            expect(report).toContain('AI DEPENDENCY ANALYSIS REPORT');
            expect(report).toContain('5 iterations');
            expect(report).toContain('10 tool calls');
            expect(report).toContain('SUMMARY');
            expect(report).toContain('RECOMMENDATIONS');
            expect(report).toContain('lodash');
            expect(report).toContain('typescript');
            expect(report).toContain('UPGRADE ORDER');
            expect(report).toContain('WARNINGS');
            expect(report).toContain('🔴'); // High priority
            expect(report).toContain('🟡'); // Medium priority
            expect(report).toContain('⚠️'); // Breaking changes
        });

        it('should format report with low priority items', () => {
            const result: AgenticDependencyResult = {
                recommendations: [
                    {
                        packageName: 'chalk',
                        currentVersions: ['^4.0.0'],
                        recommendedVersion: '^5.0.0',
                        reason: 'New ESM version',
                        priority: 'low',
                        updateOrder: 1,
                        affectedProjects: ['package-a'],
                        breakingChanges: false
                    }
                ],
                summary: 'Minor updates available.',
                upgradeOrder: ['chalk'],
                warnings: [],
                iterations: 2,
                toolCallsExecuted: 3,
                conversationHistory: [],
                toolMetrics: []
            };

            const report = formatDependencyAnalysisReport(result);

            expect(report).toContain('🟢'); // Low priority
        });

        it('should handle empty recommendations', () => {
            const result: AgenticDependencyResult = {
                recommendations: [],
                summary: 'No updates needed.',
                upgradeOrder: [],
                warnings: [],
                iterations: 1,
                toolCallsExecuted: 1,
                conversationHistory: [],
                toolMetrics: []
            };

            const report = formatDependencyAnalysisReport(result);

            expect(report).toContain('AI DEPENDENCY ANALYSIS REPORT');
            expect(report).toContain('No updates needed');
        });

        it('should truncate long affected projects list', () => {
            const result: AgenticDependencyResult = {
                recommendations: [
                    {
                        packageName: 'lodash',
                        currentVersions: ['^4.17.0'],
                        recommendedVersion: '^4.18.0',
                        reason: 'Update',
                        priority: 'medium',
                        updateOrder: 1,
                        affectedProjects: ['pkg-1', 'pkg-2', 'pkg-3', 'pkg-4', 'pkg-5', 'pkg-6', 'pkg-7'],
                        breakingChanges: false
                    }
                ],
                summary: 'Updates needed.',
                upgradeOrder: [],
                warnings: [],
                iterations: 1,
                toolCallsExecuted: 1,
                conversationHistory: [],
                toolMetrics: []
            };

            const report = formatDependencyAnalysisReport(result);

            expect(report).toContain('+2 more');
        });
    });
});


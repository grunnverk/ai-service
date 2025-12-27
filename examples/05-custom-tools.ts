#!/usr/bin/env node
/**
 * Example 5: Custom Tool Integration
 *
 * This example demonstrates how to create and register custom tools
 * that extend the AI's capabilities for your specific use case.
 *
 * Usage:
 *   npx tsx examples/05-custom-tools.ts
 */

/* eslint-disable no-console */

import {
    createToolRegistry,
    runAgentic,
    type Tool,
    type ToolContext,
} from '@eldrforge/ai-service';
import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Custom tool: Check test coverage
 */
const checkTestCoverage: Tool = {
    name: 'check_test_coverage',
    description: 'Check test coverage for the project or specific files',
    parameters: {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: 'Optional specific file to check coverage for',
            },
        },
    },
    execute: async (params: { filePath?: string }, context?: ToolContext) => {
        try {
            const cmd = params.filePath
                ? `npm test -- --coverage --testPathPattern="${params.filePath}"`
                : 'npm test -- --coverage --silent 2>&1';

            const output = execSync(cmd, {
                encoding: 'utf8',
                cwd: context?.workingDirectory || process.cwd(),
            });

            // Parse coverage from output
            const coverageMatch = output.match(/All files.*?(\d+\.?\d*)/);
            const coverage = coverageMatch ? parseFloat(coverageMatch[1]) : 0;

            return {
                success: true,
                coverage: `${coverage}%`,
                message: `Test coverage: ${coverage}%`,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    },
};

/**
 * Custom tool: Check for linter errors
 */
const checkLinterErrors: Tool = {
    name: 'check_linter_errors',
    description: 'Check for linter/ESLint errors in the codebase',
    parameters: {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: 'Optional specific file to lint',
            },
        },
    },
    execute: async (params: { filePath?: string }, context?: ToolContext) => {
        try {
            const target = params.filePath || '.';
            const cmd = `npx eslint ${target} --format json`;

            const output = execSync(cmd, {
                encoding: 'utf8',
                cwd: context?.workingDirectory || process.cwd(),
            });

            const results = JSON.parse(output);
            const errorCount = results.reduce((sum: number, file: any) => sum + file.errorCount, 0);
            const warningCount = results.reduce((sum: number, file: any) => sum + file.warningCount, 0);

            return {
                success: errorCount === 0,
                errors: errorCount,
                warnings: warningCount,
                message: `Found ${errorCount} errors and ${warningCount} warnings`,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    },
};

/**
 * Custom tool: Analyze package dependencies
 */
const analyzePackageDeps: Tool = {
    name: 'analyze_package_dependencies',
    description: 'Analyze package.json dependencies and check for outdated packages',
    parameters: {
        type: 'object',
        properties: {},
    },
    execute: async (_params: any, context?: ToolContext) => {
        try {
            const packageJsonPath = path.join(
                context?.workingDirectory || process.cwd(),
                'package.json'
            );

            const packageJson = JSON.parse(
                await fs.readFile(packageJsonPath, 'utf8')
            );

            const deps = packageJson.dependencies || {};
            const devDeps = packageJson.devDependencies || {};
            const totalDeps = Object.keys(deps).length + Object.keys(devDeps).length;

            // Check for outdated packages
            let outdatedOutput = '';
            try {
                outdatedOutput = execSync('npm outdated --json', {
                    encoding: 'utf8',
                    cwd: context?.workingDirectory || process.cwd(),
                });
            } catch {
                // npm outdated exits with code 1 if there are outdated packages
            }

            const outdated = outdatedOutput ? JSON.parse(outdatedOutput) : {};
            const outdatedCount = Object.keys(outdated).length;

            return {
                success: true,
                totalDependencies: totalDeps,
                outdatedPackages: outdatedCount,
                dependencies: Object.keys(deps),
                devDependencies: Object.keys(devDeps),
                outdatedDetails: outdated,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    },
};

async function main() {
    try {
        console.log('🔧 Creating tool registry with custom tools...\n');

        // Create tool registry
        const registry = createToolRegistry({
            workingDirectory: process.cwd(),
        });

        // Register custom tools
        registry.register(checkTestCoverage);
        registry.register(checkLinterErrors);
        registry.register(analyzePackageDeps);

        console.log('✅ Registered custom tools:');
        console.log('   - check_test_coverage');
        console.log('   - check_linter_errors');
        console.log('   - analyze_package_dependencies');
        console.log('');

        // Create a conversation that uses these tools
        const messages = [
            {
                role: 'system' as const,
                content: `You are a code quality analyst. Use the available tools to assess the project's health.

Your task:
1. Check test coverage
2. Check for linter errors
3. Analyze package dependencies

Then provide a summary report of the project's code quality status.`,
            },
            {
                role: 'user' as const,
                content: 'Please analyze the current project and provide a code quality report.',
            },
        ];

        console.log('🤖 Running AI analysis with custom tools...\n');

        const result = await runAgentic({
            messages,
            tools: registry,
            model: 'gpt-4o-mini',
            maxIterations: 10,
        });

        console.log('✨ Analysis Complete!\n');
        console.log('═'.repeat(70));
        console.log(result.finalMessage);
        console.log('═'.repeat(70));
        console.log('');
        console.log(`📊 Tool calls made: ${result.toolCallsExecuted}`);
        console.log(`🔄 Iterations: ${result.iterations}`);
        console.log('');

        // Show which tools were used
        const toolUsage: Record<string, number> = {};
        result.toolMetrics.forEach(metric => {
            toolUsage[metric.name] = (toolUsage[metric.name] || 0) + 1;
        });

        console.log('🔧 Tools used:');
        Object.entries(toolUsage).forEach(([tool, count]) => {
            console.log(`   - ${tool}: ${count}x`);
        });

    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

main();


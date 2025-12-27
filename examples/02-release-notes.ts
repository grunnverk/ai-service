#!/usr/bin/env node
/**
 * Example 2: Generate Release Notes
 *
 * This example generates comprehensive release notes between two git refs.
 * The AI will use multiple tools to analyze the changes and create
 * detailed, context-aware release notes.
 *
 * Usage:
 *   npx tsx examples/02-release-notes.ts v1.0.0 v1.1.0
 *   npx tsx examples/02-release-notes.ts v1.0.0 HEAD
 */

/* eslint-disable no-console */

import { runAgenticRelease } from '@eldrforge/ai-service';
import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: npx tsx 02-release-notes.ts <from-ref> <to-ref>');
        console.log('Example: npx tsx 02-release-notes.ts v1.0.0 v1.1.0');
        process.exit(1);
    }

    const [fromRef, toRef] = args;

    try {
        console.log(`📋 Generating release notes from ${fromRef} to ${toRef}...\n`);

        // Verify refs exist
        try {
            execSync(`git rev-parse ${fromRef}`, { stdio: 'ignore' });
            execSync(`git rev-parse ${toRef}`, { stdio: 'ignore' });
        } catch {
            console.error(`❌ Invalid git reference: ${fromRef} or ${toRef}`);
            process.exit(1);
        }

        // Get commit log
        console.log('📖 Fetching commit history...');
        const logContent = execSync(
            `git log ${fromRef}..${toRef} --pretty=format:"%h %s (%an)" --abbrev-commit`,
            { encoding: 'utf8' }
        );

        // Get diff stats
        console.log('📊 Analyzing changes...');
        const diffContent = execSync(
            `git diff ${fromRef}..${toRef} --stat`,
            { encoding: 'utf8' }
        );

        // Count commits
        const commitCount = logContent.split('\n').filter(line => line.trim()).length;
        console.log(`   Found ${commitCount} commits\n`);

        // Run agentic release notes generation
        console.log('🤖 AI is analyzing the release...');
        console.log('   (This may take 1-3 minutes for thorough analysis)\n');

        const result = await runAgenticRelease({
            fromRef,
            toRef,
            logContent,
            diffContent,
            model: 'gpt-4o',
            maxIterations: 30,
        });

        console.log('✅ Release notes generated!\n');
        console.log('═'.repeat(70));
        console.log(`TITLE: ${result.releaseNotes.title}`);
        console.log('═'.repeat(70));
        console.log('');
        console.log(result.releaseNotes.body);
        console.log('');
        console.log('═'.repeat(70));
        console.log('');
        console.log(`📊 Metrics:`);
        console.log(`   - Iterations: ${result.iterations}`);
        console.log(`   - Tool calls: ${result.toolCallsExecuted}`);
        console.log('');

        // Show which tools were used
        const toolUsage: Record<string, number> = {};
        result.toolMetrics.forEach(metric => {
            toolUsage[metric.name] = (toolUsage[metric.name] || 0) + 1;
        });

        console.log('🔧 Tools used:');
        Object.entries(toolUsage)
            .sort((a, b) => b[1] - a[1])
            .forEach(([tool, count]) => {
                console.log(`   - ${tool}: ${count}x`);
            });
        console.log('');

        // Save to file
        const outputDir = path.join(process.cwd(), 'output');
        await fs.mkdir(outputDir, { recursive: true });

        const releaseFile = path.join(outputDir, 'RELEASE_NOTES.md');
        await fs.writeFile(releaseFile, result.releaseNotes.body, 'utf8');

        const titleFile = path.join(outputDir, 'RELEASE_TITLE.txt');
        await fs.writeFile(titleFile, result.releaseNotes.title, 'utf8');

        console.log('💾 Saved to:');
        console.log(`   - ${releaseFile}`);
        console.log(`   - ${titleFile}`);

    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

main();


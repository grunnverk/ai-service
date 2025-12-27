#!/usr/bin/env node
/**
 * Example 1: Simple Commit Message Generation
 *
 * This example shows the most basic usage of the library to generate
 * a commit message from staged git changes.
 *
 * Usage:
 *   1. Stage some changes: git add .
 *   2. Run: npx tsx examples/01-simple-commit.ts
 */

/* eslint-disable no-console */

import { runAgenticCommit } from '@eldrforge/ai-service';
import { execSync } from 'child_process';

async function main() {
    try {
        console.log('🔍 Checking for staged changes...\n');

        // Get the diff of staged changes
        const diffContent = execSync('git diff --staged', { encoding: 'utf8' });

        if (!diffContent.trim()) {
            console.log('❌ No staged changes found.');
            console.log('   Stage some changes first with: git add <files>');
            process.exit(1);
        }

        // Get list of changed files
        const statusOutput = execSync('git status --porcelain', { encoding: 'utf8' });
        const changedFiles = statusOutput
            .split('\n')
            .filter(line => line.trim())
            .map(line => line.substring(3));

        console.log('📝 Files changed:', changedFiles.length);
        changedFiles.forEach(file => console.log(`   - ${file}`));
        console.log('');

        console.log('🤖 Generating commit message...\n');

        // Generate commit message using agentic mode
        const result = await runAgenticCommit({
            changedFiles,
            diffContent,
            model: 'gpt-4o-mini', // Using mini for faster/cheaper generation
            maxIterations: 10,
        });

        console.log('✨ Generated Commit Message:\n');
        console.log('─'.repeat(60));
        console.log(result.commitMessage);
        console.log('─'.repeat(60));
        console.log('');
        console.log(`📊 Stats: ${result.toolCallsExecuted} tool calls, ${result.iterations} iterations`);

        // Show suggested splits if any
        if (result.suggestedSplits.length > 0) {
            console.log('\n💡 Suggested Commit Splits:');
            console.log('   The AI recommends splitting this into multiple commits:\n');

            result.suggestedSplits.forEach((split, idx) => {
                console.log(`   Split ${idx + 1}:`);
                console.log(`   Files: ${split.files.join(', ')}`);
                console.log(`   Rationale: ${split.rationale}`);
                console.log(`   Message: ${split.message}`);
                console.log('');
            });
        }

    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

main();


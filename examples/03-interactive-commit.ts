#!/usr/bin/env node
/**
 * Example 3: Interactive Commit Workflow
 *
 * This example demonstrates an interactive workflow where the user can:
 * - Generate an initial commit message
 * - Review and choose to confirm, edit, or regenerate
 * - Optionally add user feedback for improvement
 * - Automatically create the commit
 *
 * Usage:
 *   1. Stage changes: git add .
 *   2. Run: npx tsx examples/03-interactive-commit.ts
 */

/* eslint-disable no-console */

import {
    runAgenticCommit,
    getUserChoice,
    editContentInEditor,
    STANDARD_CHOICES,
} from '@eldrforge/ai-service';
import { execSync } from 'child_process';

async function main() {
    try {
    // Check for staged changes
        const diffContent = execSync('git diff --staged', { encoding: 'utf8' });

        if (!diffContent.trim()) {
            console.log('❌ No staged changes found.');
            console.log('   Stage some changes first with: git add <files>');
            process.exit(1);
        }

        // Get changed files
        const statusOutput = execSync('git status --porcelain', { encoding: 'utf8' });
        const changedFiles = statusOutput
            .split('\n')
            .filter(line => line.trim())
            .map(line => line.substring(3));

        console.log('📝 Changed files:', changedFiles.length);
        changedFiles.forEach(file => console.log(`   - ${file}`));
        console.log('');

        // Generate initial commit message
        console.log('🤖 Generating commit message...\n');

        const result = await runAgenticCommit({
            changedFiles,
            diffContent,
            model: 'gpt-4o-mini',
            maxIterations: 10,
        });

        let currentMessage = result.commitMessage;
        let shouldContinue = true;

        while (shouldContinue) {
            // Display current message
            console.log('\n✨ Commit Message:\n');
            console.log('─'.repeat(60));
            console.log(currentMessage);
            console.log('─'.repeat(60));
            console.log('');

            // Get user choice
            const choice = await getUserChoice(
                'What would you like to do?',
                [
                    STANDARD_CHOICES.CONFIRM,
                    STANDARD_CHOICES.EDIT,
                    STANDARD_CHOICES.SKIP,
                ],
                {
                    nonTtyErrorSuggestions: [
                        'Run in a terminal environment',
                        'Use examples/01-simple-commit.ts for non-interactive mode',
                    ],
                }
            );

            switch (choice) {
                case 'c': { // Confirm
                    console.log('\n📝 Creating commit...');

                    try {
                        execSync('git', ['commit', '-m', currentMessage], {
                            stdio: 'inherit',
                        });
                        console.log('✅ Commit created successfully!');
                    } catch (commitError) {
                        console.error('❌ Failed to create commit:', commitError);
                    }

                    shouldContinue = false;
                    break;
                }

                case 'e': { // Edit
                    console.log('\n📝 Opening editor...');

                    const edited = await editContentInEditor(
                        currentMessage,
                        [
                            '# Edit your commit message below',
                            '# Lines starting with # will be removed',
                            '# Save and close the editor when done',
                        ],
                        '.txt'
                    );

                    if (edited.wasEdited) {
                        currentMessage = edited.content;
                        console.log('\n✅ Commit message updated!');
                    } else {
                        console.log('\n⚠️  No changes made');
                    }
                    break;
                }

                case 's': // Skip
                    console.log('\n⏭️  Commit cancelled. Your changes are still staged.');
                    shouldContinue = false;
                    break;

                default:
                    console.log('\n❌ Invalid choice');
                    break;
            }
        }

    } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

// Check if running in TTY
if (!process.stdin.isTTY) {
    console.error('❌ This example requires a terminal (TTY).');
    console.error('   Run it directly in your terminal, not piped or in CI.');
    console.error('   For non-interactive mode, use: examples/01-simple-commit.ts');
    process.exit(1);
}

main();


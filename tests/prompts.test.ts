import { describe, it, expect } from 'vitest';
import {
    createCommitPrompt,
    createReleasePrompt,
    createReviewPrompt,
} from '../src/prompts';

describe('Prompt Builders', () => {
    describe('createCommitPrompt', () => {
        it('should create a prompt with diff content', async () => {
            const prompt = await createCommitPrompt(
                { overrides: false },
                {
                    diffContent: 'diff --git a/file.ts b/file.ts\n+new line',
                }
            );

            expect(prompt).toBeDefined();
            // RiotPrompt returns a Prompt object, not necessarily with messages property
            expect(typeof prompt).toBe('object');
        });

        it('should include user direction in prompt', async () => {
            const prompt = await createCommitPrompt(
                { overrides: false },
                {
                    diffContent: 'diff --git a/file.ts b/file.ts\n+new line',
                    userDirection: 'Focus on performance improvements',
                }
            );

            const promptText = JSON.stringify(prompt);
            expect(promptText.toLowerCase()).toContain('performance');
        });

        it('should handle file content mode', async () => {
            const prompt = await createCommitPrompt(
                { overrides: false },
                {
                    diffContent: 'function test() { return true; }',
                    isFileContent: true,
                }
            );

            expect(prompt).toBeDefined();
            expect(typeof prompt).toBe('object');
        });

        it('should include optional context', async () => {
            const prompt = await createCommitPrompt(
                { overrides: false },
                {
                    diffContent: 'diff content',
                },
                {
                    logContext: 'recent commits',
                    context: 'working on auth',
                    directories: ['src/'],
                }
            );

            expect(prompt).toBeDefined();
            expect(typeof prompt).toBe('object');
        });
    });

    describe('createReleasePrompt', () => {
        it('should create a prompt with log and diff content', async () => {
            const result = await createReleasePrompt(
                { overrides: false },
                {
                    logContent: 'commit 1\ncommit 2\ncommit 3',
                    diffContent: 'diff content',
                }
            );

            expect(result).toBeDefined();
            expect(result.prompt).toBeDefined();
            expect(typeof result.prompt).toBe('object');
            expect(result.maxTokens).toBeDefined();
            expect(result.isLargeRelease).toBeDefined();
        });

        it('should detect normal sized releases', async () => {
            const result = await createReleasePrompt(
                { overrides: false },
                {
                    logContent: 'commit 1\ncommit 2',
                    diffContent: 'small diff',
                }
            );

            expect(result.isLargeRelease).toBe(false);
            expect(result.maxTokens).toBe(10000);
        });

        it('should detect large releases by log line count', async () => {
            // Create log with >60 lines
            const largeLog = Array(70).fill('commit line').join('\n');

            const result = await createReleasePrompt(
                { overrides: false },
                {
                    logContent: largeLog,
                    diffContent: 'diff content',
                }
            );

            expect(result.isLargeRelease).toBe(true);
            expect(result.maxTokens).toBe(25000);
        });

        it('should detect large releases by diff size', async () => {
            // Create diff with >500 lines
            const largeDiff = Array(600).fill('diff line').join('\n');

            const result = await createReleasePrompt(
                { overrides: false },
                {
                    logContent: 'small log',
                    diffContent: largeDiff,
                }
            );

            expect(result.isLargeRelease).toBe(true);
            expect(result.maxTokens).toBe(25000);
        });

        it('should include release focus and milestone issues', async () => {
            const result = await createReleasePrompt(
                { overrides: false },
                {
                    logContent: 'commits',
                    diffContent: 'diff',
                    releaseFocus: 'Bug fixes and performance',
                    milestoneIssues: 'Issue #1\nIssue #2',
                }
            );

            expect(result.prompt).toBeDefined();
            expect(typeof result.prompt).toBe('object');
        });
    });

    describe('createReviewPrompt', () => {
        it('should create a prompt with review notes', async () => {
            const prompt = await createReviewPrompt(
                { overrides: false },
                {
                    notes: 'Review notes about the project',
                }
            );

            expect(prompt).toBeDefined();
            expect(typeof prompt).toBe('object');
        });

        it('should include optional context', async () => {
            const prompt = await createReviewPrompt(
                { overrides: false },
                {
                    notes: 'Review notes',
                },
                {
                    logContext: 'recent commits',
                    diffContext: 'current diff',
                    releaseNotesContext: 'recent release',
                    issuesContext: 'existing issues',
                    context: 'additional context',
                    directories: ['src/'],
                }
            );

            expect(prompt).toBeDefined();
            expect(typeof prompt).toBe('object');
        });
    });
});


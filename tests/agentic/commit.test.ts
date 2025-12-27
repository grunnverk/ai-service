import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAgenticCommit } from '../../src/agentic/commit';
import type { AgenticCommitConfig } from '../../src/agentic/commit';
import type { StorageAdapter } from '../../src/types';

// Mock dependencies
vi.mock('../../src/agentic/executor', () => ({
    runAgentic: vi.fn(),
}));

vi.mock('../../src/tools/registry', () => ({
    createToolRegistry: vi.fn(() => ({
        registerAll: vi.fn(),
        count: vi.fn(() => 8),
        toOpenAIFormat: vi.fn(() => []),
    })),
}));

vi.mock('../../src/tools/commit-tools', () => ({
    createCommitTools: vi.fn(() => []),
}));

describe('runAgenticCommit', () => {
    let mockStorage: StorageAdapter;
    let mockLogger: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockStorage = {
            readFile: vi.fn(),
            writeFile: vi.fn(),
            ensureDirectory: vi.fn(),
        } as any;

        mockLogger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            verbose: vi.fn(),
            silly: vi.fn(),
        };
    });

    describe('basic commit generation', () => {
        it('should generate a simple commit message', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');

            (runAgentic as any).mockResolvedValue({
                finalMessage: `COMMIT_MESSAGE:
feat: Add new feature to the system`,
                iterations: 3,
                toolCallsExecuted: 2,
                conversationHistory: [],
                toolMetrics: [],
            });

            const result = await runAgenticCommit({
                changedFiles: ['src/feature.ts'],
                diffContent: 'diff content',
                storage: mockStorage,
                logger: mockLogger,
            });

            expect(result.commitMessage).toBe('feat: Add new feature to the system');
            expect(result.iterations).toBe(3);
            expect(result.toolCallsExecuted).toBe(2);
        });

        it('should use default model and maxIterations', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');

            (runAgentic as any).mockResolvedValue({
                finalMessage: 'COMMIT_MESSAGE:\nTest commit',
                iterations: 1,
                toolCallsExecuted: 0,
                conversationHistory: [],
                toolMetrics: [],
            });

            await runAgenticCommit({
                changedFiles: ['file.ts'],
                diffContent: 'diff',
            });

            const call = (runAgentic as any).mock.calls[0][0];
            expect(call.model).toBe('gpt-4o');
            expect(call.maxIterations).toBe(10);
        });

        it('should use custom model and maxIterations', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');

            (runAgentic as any).mockResolvedValue({
                finalMessage: 'COMMIT_MESSAGE:\nTest',
                iterations: 1,
                toolCallsExecuted: 0,
                conversationHistory: [],
                toolMetrics: [],
            });

            await runAgenticCommit({
                changedFiles: ['file.ts'],
                diffContent: 'diff',
                model: 'gpt-4-turbo',
                maxIterations: 20,
            });

            const call = (runAgentic as any).mock.calls[0][0];
            expect(call.model).toBe('gpt-4-turbo');
            expect(call.maxIterations).toBe(20);
        });
    });

    describe('system and user message building', () => {
        it('should include changed files in user message', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');

            (runAgentic as any).mockResolvedValue({
                finalMessage: 'COMMIT_MESSAGE:\nTest',
                iterations: 1,
                toolCallsExecuted: 0,
                conversationHistory: [],
                toolMetrics: [],
            });

            await runAgenticCommit({
                changedFiles: ['src/file1.ts', 'src/file2.ts', 'README.md'],
                diffContent: 'diff content',
            });

            const call = (runAgentic as any).mock.calls[0][0];
            const userMessage = call.messages[1].content;
            expect(userMessage).toContain('src/file1.ts');
            expect(userMessage).toContain('src/file2.ts');
            expect(userMessage).toContain('README.md');
            expect(userMessage).toContain('3)'); // Number of files
        });

        it('should include diff content in user message', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');

            (runAgentic as any).mockResolvedValue({
                finalMessage: 'COMMIT_MESSAGE:\nTest',
                iterations: 1,
                toolCallsExecuted: 0,
                conversationHistory: [],
                toolMetrics: [],
            });

            const diffContent = `--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
-old line
+new line`;

            await runAgenticCommit({
                changedFiles: ['file.ts'],
                diffContent,
            });

            const call = (runAgentic as any).mock.calls[0][0];
            const userMessage = call.messages[1].content;
            expect(userMessage).toContain(diffContent);
        });

        it('should include user direction if provided', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');

            (runAgentic as any).mockResolvedValue({
                finalMessage: 'COMMIT_MESSAGE:\nTest',
                iterations: 1,
                toolCallsExecuted: 0,
                conversationHistory: [],
                toolMetrics: [],
            });

            const userDirection = 'This is a major refactoring effort';

            await runAgenticCommit({
                changedFiles: ['file.ts'],
                diffContent: 'diff',
                userDirection,
            });

            const call = (runAgentic as any).mock.calls[0][0];
            const userMessage = call.messages[1].content;
            expect(userMessage).toContain('User direction');
            expect(userMessage).toContain(userDirection);
        });

        it('should include log context if provided', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');

            (runAgentic as any).mockResolvedValue({
                finalMessage: 'COMMIT_MESSAGE:\nTest',
                iterations: 1,
                toolCallsExecuted: 0,
                conversationHistory: [],
                toolMetrics: [],
            });

            const logContext = 'abc1234 - Previous commit\nxyz5678 - Even older commit';

            await runAgenticCommit({
                changedFiles: ['file.ts'],
                diffContent: 'diff',
                logContext,
            });

            const call = (runAgentic as any).mock.calls[0][0];
            const userMessage = call.messages[1].content;
            expect(userMessage).toContain('Recent commit history');
            expect(userMessage).toContain(logContext);
        });

        it('should have system prompt with tool descriptions', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');

            (runAgentic as any).mockResolvedValue({
                finalMessage: 'COMMIT_MESSAGE:\nTest',
                iterations: 1,
                toolCallsExecuted: 0,
                conversationHistory: [],
                toolMetrics: [],
            });

            await runAgenticCommit({
                changedFiles: ['file.ts'],
                diffContent: 'diff',
            });

            const call = (runAgentic as any).mock.calls[0][0];
            const systemPrompt = call.messages[0].content;
            // Since we now use automatic tool guidance generation from riotprompt,
            // verify the system prompt structure includes both auto-generated
            // tool documentation and our custom strategy guidance
            expect(systemPrompt).toContain('Investigation Strategy'); // Our custom strategy section
            expect(systemPrompt).toContain('conventional commit format'); // Guidelines
            expect(systemPrompt.length).toBeGreaterThan(500); // Should include substantial tool guidance
        });
    });

    describe('commit message parsing', () => {
        it('should extract commit message from COMMIT_MESSAGE marker', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');

            (runAgentic as any).mockResolvedValue({
                finalMessage: `COMMIT_MESSAGE:
feat: Implement new authentication system

This adds JWT-based authentication with support for refresh tokens.`,
                iterations: 5,
                toolCallsExecuted: 3,
                conversationHistory: [],
                toolMetrics: [],
            });

            const result = await runAgenticCommit({
                changedFiles: ['auth.ts'],
                diffContent: 'diff',
            });

            expect(result.commitMessage).toContain('feat: Implement new authentication system');
            expect(result.commitMessage).toContain('JWT-based authentication');
        });

        it('should use full message as commit if no marker found', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');

            const plainMessage = 'This is a plain commit message without markers';

            (runAgentic as any).mockResolvedValue({
                finalMessage: plainMessage,
                iterations: 1,
                toolCallsExecuted: 0,
                conversationHistory: [],
                toolMetrics: [],
            });

            const result = await runAgenticCommit({
                changedFiles: ['file.ts'],
                diffContent: 'diff',
            });

            expect(result.commitMessage).toBe(plainMessage);
        });

        it('should parse suggested splits from SUGGESTED_SPLITS section', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');

            (runAgentic as any).mockResolvedValue({
                finalMessage: `COMMIT_MESSAGE:
feat: Multiple changes

SUGGESTED_SPLITS:
Split 1:
Files: - src/auth.ts
  - src/auth.test.ts
Rationale: Authentication module with tests
Message: feat: Implement JWT authentication

Split 2:
Files: - src/database.ts
  - docs/database.md
Rationale: Database schema and documentation
Message: docs: Add database documentation`,
                iterations: 4,
                toolCallsExecuted: 2,
                conversationHistory: [],
                toolMetrics: [],
            });

            const result = await runAgenticCommit({
                changedFiles: ['src/auth.ts', 'src/auth.test.ts', 'src/database.ts', 'docs/database.md'],
                diffContent: 'diff',
            });

            expect(result.suggestedSplits).toHaveLength(2);

            expect(result.suggestedSplits[0].files).toContain('src/auth.ts');
            expect(result.suggestedSplits[0].files).toContain('src/auth.test.ts');
            expect(result.suggestedSplits[0].message).toBe('feat: Implement JWT authentication');
            expect(result.suggestedSplits[0].rationale).toContain('Authentication module');

            expect(result.suggestedSplits[1].files).toContain('src/database.ts');
            expect(result.suggestedSplits[1].files).toContain('docs/database.md');
            expect(result.suggestedSplits[1].message).toBe('docs: Add database documentation');
        });

        it('should handle files with bullet points in suggested splits', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');

            (runAgentic as any).mockResolvedValue({
                finalMessage: `COMMIT_MESSAGE:
Test

SUGGESTED_SPLITS:
Split 1:
Files: - src/file1.ts
  - src/file2.ts
  - src/file3.ts
Rationale: Test split
Message: Test message`,
                iterations: 1,
                toolCallsExecuted: 0,
                conversationHistory: [],
                toolMetrics: [],
            });

            const result = await runAgenticCommit({
                changedFiles: ['src/file1.ts', 'src/file2.ts', 'src/file3.ts'],
                diffContent: 'diff',
            });

            expect(result.suggestedSplits).toHaveLength(1);
            expect(result.suggestedSplits[0].files).toEqual([
                'src/file1.ts',
                'src/file2.ts',
                'src/file3.ts',
            ]);
        });

        it('should not include empty suggested splits', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');

            (runAgentic as any).mockResolvedValue({
                finalMessage: `COMMIT_MESSAGE:
Single commit message

No splits suggested.`,
                iterations: 2,
                toolCallsExecuted: 1,
                conversationHistory: [],
                toolMetrics: [],
            });

            const result = await runAgenticCommit({
                changedFiles: ['file.ts'],
                diffContent: 'diff',
            });

            expect(result.suggestedSplits).toHaveLength(0);
        });
    });

    describe('tool registry creation', () => {
        it('should create tool registry with storage and logger', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');
            const { createToolRegistry } = await import('../../src/tools/registry');

            (runAgentic as any).mockResolvedValue({
                finalMessage: 'COMMIT_MESSAGE:\nTest',
                iterations: 1,
                toolCallsExecuted: 0,
                conversationHistory: [],
                toolMetrics: [],
            });

            await runAgenticCommit({
                changedFiles: ['file.ts'],
                diffContent: 'diff',
                storage: mockStorage,
                logger: mockLogger,
            });

            expect(createToolRegistry).toHaveBeenCalledWith(
                expect.objectContaining({
                    workingDirectory: process.cwd(),
                    storage: mockStorage,
                    logger: mockLogger,
                })
            );
        });

        it('should register commit tools with registry', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');
            const { createToolRegistry } = await import('../../src/tools/registry');

            let registryInstance: any;
            (createToolRegistry as any).mockImplementation((context: any) => {
                registryInstance = {
                    registerAll: vi.fn(),
                    count: vi.fn(() => 8),
                    toOpenAIFormat: vi.fn(() => []),
                };
                return registryInstance;
            });

            (runAgentic as any).mockResolvedValue({
                finalMessage: 'COMMIT_MESSAGE:\nTest',
                iterations: 1,
                toolCallsExecuted: 0,
                conversationHistory: [],
                toolMetrics: [],
            });

            const { createCommitTools } = await import('../../src/tools/commit-tools');

            await runAgenticCommit({
                changedFiles: ['file.ts'],
                diffContent: 'diff',
            });

            expect(createCommitTools).toHaveBeenCalled();
            expect(registryInstance?.registerAll).toHaveBeenCalled();
        });
    });

    describe('return value', () => {
        it('should return complete agentic commit result', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');

            const mockMetrics = [
                {
                    name: 'get_file_history',
                    success: true,
                    duration: 150,
                    iteration: 1,
                    timestamp: '2024-01-01T00:00:00Z',
                },
            ];

            (runAgentic as any).mockResolvedValue({
                finalMessage: 'COMMIT_MESSAGE:\nfeat: New feature',
                iterations: 3,
                toolCallsExecuted: 2,
                conversationHistory: [
                    { role: 'system', content: 'System' },
                    { role: 'user', content: 'User' },
                ],
                toolMetrics: mockMetrics,
            });

            const result = await runAgenticCommit({
                changedFiles: ['file.ts'],
                diffContent: 'diff',
            });

            expect(result).toHaveProperty('commitMessage');
            expect(result).toHaveProperty('iterations', 3);
            expect(result).toHaveProperty('toolCallsExecuted', 2);
            expect(result).toHaveProperty('suggestedSplits');
            expect(result).toHaveProperty('conversationHistory');
            expect(result).toHaveProperty('toolMetrics', mockMetrics);
        });
    });

    describe('debug options', () => {
        it('should pass debug options to executor', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');

            (runAgentic as any).mockResolvedValue({
                finalMessage: 'COMMIT_MESSAGE:\nTest',
                iterations: 1,
                toolCallsExecuted: 0,
                conversationHistory: [],
                toolMetrics: [],
            });

            await runAgenticCommit({
                changedFiles: ['file.ts'],
                diffContent: 'diff',
                debug: true,
                debugRequestFile: 'req.json',
                debugResponseFile: 'res.json',
            });

            const call = (runAgentic as any).mock.calls[0][0];
            expect(call.debug).toBe(true);
            expect(call.debugRequestFile).toBe('req.json');
            expect(call.debugResponseFile).toBe('res.json');
        });

        it('should pass openaiReasoning option', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');

            (runAgentic as any).mockResolvedValue({
                finalMessage: 'COMMIT_MESSAGE:\nTest',
                iterations: 1,
                toolCallsExecuted: 0,
                conversationHistory: [],
                toolMetrics: [],
            });

            await runAgenticCommit({
                changedFiles: ['file.ts'],
                diffContent: 'diff',
                openaiReasoning: 'high',
            });

            const call = (runAgentic as any).mock.calls[0][0];
            expect(call.openaiReasoning).toBe('high');
        });
    });

    describe('edge cases', () => {
        it('should handle empty changed files array', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');

            (runAgentic as any).mockResolvedValue({
                finalMessage: 'COMMIT_MESSAGE:\nNo changes',
                iterations: 1,
                toolCallsExecuted: 0,
                conversationHistory: [],
                toolMetrics: [],
            });

            const result = await runAgenticCommit({
                changedFiles: [],
                diffContent: 'diff',
            });

            expect(result.commitMessage).toBe('No changes');
        });

        it('should handle very long diff content', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');

            (runAgentic as any).mockResolvedValue({
                finalMessage: 'COMMIT_MESSAGE:\nLarge diff processed',
                iterations: 5,
                toolCallsExecuted: 3,
                conversationHistory: [],
                toolMetrics: [],
            });

            const longDiff = 'diff line\n'.repeat(1000);

            const result = await runAgenticCommit({
                changedFiles: ['large-file.ts'],
                diffContent: longDiff,
            });

            expect(result.commitMessage).toBe('Large diff processed');
        });

        it('should handle malformed suggested splits gracefully', async () => {
            const { runAgentic } = await import('../../src/agentic/executor');

            (runAgentic as any).mockResolvedValue({
                finalMessage: `COMMIT_MESSAGE:
Main commit

SUGGESTED_SPLITS:
This is malformed and not in the expected format.`,
                iterations: 1,
                toolCallsExecuted: 0,
                conversationHistory: [],
                toolMetrics: [],
            });

            const result = await runAgenticCommit({
                changedFiles: ['file.ts'],
                diffContent: 'diff',
            });

            expect(result.suggestedSplits).toHaveLength(0);
            expect(result.commitMessage).toContain('Main commit');
        });
    });
});


import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAgenticRelease } from '../../src/agentic/release';
import type { StorageAdapter } from '../../src/types';

// Mock dependencies
vi.mock('../../src/agentic/executor', () => ({
    runAgentic: vi.fn(),
}));

vi.mock('../../src/tools/registry', () => ({
    createToolRegistry: vi.fn(() => ({
        registerAll: vi.fn(),
        count: vi.fn(() => 13),
        toOpenAIFormat: vi.fn(() => []),
    })),
}));

vi.mock('../../src/tools/release-tools', () => ({
    createReleaseTools: vi.fn(() => []),
}));

describe('runAgenticRelease', () => {
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

    it('should run agentic release notes generation', async () => {
        const { runAgentic } = await import('../../src/agentic/executor');

        (runAgentic as any).mockResolvedValue({
            finalMessage: `RELEASE_TITLE:
Test Release

RELEASE_BODY:
This is a test release with some changes.`,
            iterations: 5,
            toolCallsExecuted: 10,
            conversationHistory: [],
            toolMetrics: [],
        });

        const result = await runAgenticRelease({
            fromRef: 'v1.0.0',
            toRef: 'HEAD',
            logContent: 'commit 1\ncommit 2',
            diffContent: 'diff content',
            model: 'gpt-4o',
            maxIterations: 30,
            storage: mockStorage,
            logger: mockLogger,
        });

        expect(result.releaseNotes.title).toBe('Test Release');
        expect(result.releaseNotes.body).toBe('This is a test release with some changes.');
        expect(result.iterations).toBe(5);
        expect(result.toolCallsExecuted).toBe(10);
    });

    it('should include milestone issues in the prompt', async () => {
        const { runAgentic } = await import('../../src/agentic/executor');

        (runAgentic as any).mockResolvedValue({
            finalMessage: `RELEASE_TITLE:
Release with Issues

RELEASE_BODY:
Fixed several issues.`,
            iterations: 3,
            toolCallsExecuted: 5,
            conversationHistory: [],
            toolMetrics: [],
        });

        const result = await runAgenticRelease({
            fromRef: 'v1.0.0',
            toRef: 'HEAD',
            logContent: 'commit 1',
            diffContent: 'diff',
            milestoneIssues: 'Issue #1: Bug fix\nIssue #2: Feature',
            storage: mockStorage,
            logger: mockLogger,
        });

        expect(result.releaseNotes.title).toBe('Release with Issues');
        expect(runAgentic).toHaveBeenCalled();

        // Check that milestone issues were included in the user message
        const call = (runAgentic as any).mock.calls[0][0];
        const userMessage = call.messages[1].content;
        expect(userMessage).toContain('Resolved Issues from Milestone');
        expect(userMessage).toContain('Issue #1: Bug fix');
    });

    it('should include release focus in the prompt', async () => {
        const { runAgentic } = await import('../../src/agentic/executor');

        (runAgentic as any).mockResolvedValue({
            finalMessage: `RELEASE_TITLE:
Focused Release

RELEASE_BODY:
This release focuses on performance.`,
            iterations: 4,
            toolCallsExecuted: 8,
            conversationHistory: [],
            toolMetrics: [],
        });

        const result = await runAgenticRelease({
            fromRef: 'v1.0.0',
            toRef: 'HEAD',
            logContent: 'commit 1',
            diffContent: 'diff',
            releaseFocus: 'Performance improvements',
            storage: mockStorage,
            logger: mockLogger,
        });

        expect(result.releaseNotes.title).toBe('Focused Release');

        // Check that release focus was included in the user message
        const call = (runAgentic as any).mock.calls[0][0];
        const userMessage = call.messages[1].content;
        expect(userMessage).toContain('Release Focus');
        expect(userMessage).toContain('Performance improvements');
    });

    it('should include user context in the prompt', async () => {
        const { runAgentic } = await import('../../src/agentic/executor');

        (runAgentic as any).mockResolvedValue({
            finalMessage: `RELEASE_TITLE:
Contextual Release

RELEASE_BODY:
Release with additional context.`,
            iterations: 2,
            toolCallsExecuted: 4,
            conversationHistory: [],
            toolMetrics: [],
        });

        const result = await runAgenticRelease({
            fromRef: 'v1.0.0',
            toRef: 'HEAD',
            logContent: 'commit 1',
            diffContent: 'diff',
            userContext: 'This is a major release',
            storage: mockStorage,
            logger: mockLogger,
        });

        expect(result.releaseNotes.title).toBe('Contextual Release');

        // Check that user context was included
        const call = (runAgentic as any).mock.calls[0][0];
        const userMessage = call.messages[1].content;
        expect(userMessage).toContain('Additional Context');
        expect(userMessage).toContain('This is a major release');
    });

    it('should use default maxIterations of 30', async () => {
        const { runAgentic } = await import('../../src/agentic/executor');

        (runAgentic as any).mockResolvedValue({
            finalMessage: `RELEASE_TITLE:
Default Iterations

RELEASE_BODY:
Test`,
            iterations: 1,
            toolCallsExecuted: 2,
            conversationHistory: [],
            toolMetrics: [],
        });

        await runAgenticRelease({
            fromRef: 'v1.0.0',
            toRef: 'HEAD',
            logContent: 'commit 1',
            diffContent: 'diff',
            storage: mockStorage,
            logger: mockLogger,
        });

        const call = (runAgentic as any).mock.calls[0][0];
        expect(call.maxIterations).toBe(30);
    });

    it('should handle custom maxIterations', async () => {
        const { runAgentic } = await import('../../src/agentic/executor');

        (runAgentic as any).mockResolvedValue({
            finalMessage: `RELEASE_TITLE:
Custom Iterations

RELEASE_BODY:
Test`,
            iterations: 1,
            toolCallsExecuted: 2,
            conversationHistory: [],
            toolMetrics: [],
        });

        await runAgenticRelease({
            fromRef: 'v1.0.0',
            toRef: 'HEAD',
            logContent: 'commit 1',
            diffContent: 'diff',
            maxIterations: 40,
            storage: mockStorage,
            logger: mockLogger,
        });

        const call = (runAgentic as any).mock.calls[0][0];
        expect(call.maxIterations).toBe(40);
    });

    it('should parse release notes from new format', async () => {
        const { runAgentic } = await import('../../src/agentic/executor');

        (runAgentic as any).mockResolvedValue({
            finalMessage: `RELEASE_TITLE:
Format Test Release

RELEASE_BODY:
Release notes in the new format`,
            iterations: 3,
            toolCallsExecuted: 6,
            conversationHistory: [],
            toolMetrics: [],
        });

        const result = await runAgenticRelease({
            fromRef: 'v1.0.0',
            toRef: 'HEAD',
            logContent: 'commit 1',
            diffContent: 'diff',
            storage: mockStorage,
            logger: mockLogger,
        });

        expect(result.releaseNotes.title).toBe('Format Test Release');
        expect(result.releaseNotes.body).toBe('Release notes in the new format');
    });

    it('should handle fallback parsing when format markers are missing', async () => {
        const { runAgentic } = await import('../../src/agentic/executor');

        (runAgentic as any).mockResolvedValue({
            finalMessage: 'This is a plain text release note without format markers',
            iterations: 2,
            toolCallsExecuted: 3,
            conversationHistory: [],
            toolMetrics: [],
        });

        const result = await runAgenticRelease({
            fromRef: 'v1.0.0',
            toRef: 'HEAD',
            logContent: 'commit 1',
            diffContent: 'diff',
            storage: mockStorage,
            logger: mockLogger,
        });

        expect(result.releaseNotes.title).toBe('Release Notes');
        expect(result.releaseNotes.body).toContain('This is a plain text release note');
    });

    it('should return tool metrics', async () => {
        const { runAgentic } = await import('../../src/agentic/executor');

        const mockMetrics = [
            { name: 'get_file_history', success: true, duration: 100, iteration: 1, timestamp: '2024-01-01T00:00:00Z' },
            { name: 'get_tag_history', success: true, duration: 150, iteration: 2, timestamp: '2024-01-01T00:00:01Z' },
        ];

        (runAgentic as any).mockResolvedValue({
            finalMessage: `RELEASE_TITLE:
With Metrics

RELEASE_BODY:
Test`,
            iterations: 3,
            toolCallsExecuted: 2,
            conversationHistory: [],
            toolMetrics: mockMetrics,
        });

        const result = await runAgenticRelease({
            fromRef: 'v1.0.0',
            toRef: 'HEAD',
            logContent: 'commit 1',
            diffContent: 'diff',
            storage: mockStorage,
            logger: mockLogger,
        });

        expect(result.toolMetrics).toEqual(mockMetrics);
        expect(result.toolMetrics).toHaveLength(2);
    });

    it('should pass debug options through to executor', async () => {
        const { runAgentic } = await import('../../src/agentic/executor');

        (runAgentic as any).mockResolvedValue({
            finalMessage: `RELEASE_TITLE:
Debug Mode

RELEASE_BODY:
Test`,
            iterations: 1,
            toolCallsExecuted: 1,
            conversationHistory: [],
            toolMetrics: [],
        });

        await runAgenticRelease({
            fromRef: 'v1.0.0',
            toRef: 'HEAD',
            logContent: 'commit 1',
            diffContent: 'diff',
            debug: true,
            debugRequestFile: 'request.json',
            debugResponseFile: 'response.json',
            storage: mockStorage,
            logger: mockLogger,
        });

        const call = (runAgentic as any).mock.calls[0][0];
        expect(call.debug).toBe(true);
        expect(call.debugRequestFile).toBe('request.json');
        expect(call.debugResponseFile).toBe('response.json');
    });

    it('should clean JSON artifacts from leaked output', async () => {
        const { runAgentic } = await import('../../src/agentic/executor');

        // Simulate LLM accidentally outputting JSON wrapper
        (runAgentic as any).mockResolvedValue({
            finalMessage: `RELEASE_TITLE:
Bug Fix Release

RELEASE_BODY:
{ "title": "Bug Fix Release", "body": "Fixed several critical bugs in the codebase.\n\nThis release includes:\n- Fix for memory leak\n- Improved error handling" }`,
            iterations: 2,
            toolCallsExecuted: 4,
            conversationHistory: [],
            toolMetrics: [],
        });

        const result = await runAgenticRelease({
            fromRef: 'v1.0.0',
            toRef: 'HEAD',
            logContent: 'commit 1',
            diffContent: 'diff',
            storage: mockStorage,
            logger: mockLogger,
        });

        expect(result.releaseNotes.title).toBe('Bug Fix Release');
        // The body should be cleaned of JSON artifacts
        expect(result.releaseNotes.body).not.toContain('{ "title"');
        expect(result.releaseNotes.body).not.toContain('"body"');
        expect(result.releaseNotes.body).toContain('Fixed several critical bugs');
        expect(result.releaseNotes.body).toContain('- Fix for memory leak');
    });
});


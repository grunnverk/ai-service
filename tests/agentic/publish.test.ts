import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    formatAgenticPublishResult,
    type AgenticPublishResult
} from '../../src/agentic/publish';

// For testing runAgenticPublish, we need complex mocking that's hard with vi.mock hoisting
// So we'll focus on testing the helper functions which don't require mocking the executor

describe('Agentic Publish', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('formatAgenticPublishResult', () => {
        it('should format successful result', () => {
            const result: AgenticPublishResult = {
                success: true,
                message: 'Successfully synced branches and resolved conflicts.',
                actionsTaken: ['Checked git status', 'Synced branch with remote', 'Verified changes'],
                iterations: 3,
                toolCallsExecuted: 5,
                requiresManualIntervention: false
            };

            const formatted = formatAgenticPublishResult(result);

            expect(formatted).toContain('RESOLVED');
            expect(formatted).toContain('✅');
            expect(formatted).toContain('Iterations: 3');
            expect(formatted).toContain('Tools executed: 5');
            expect(formatted).toContain('Actions taken');
            expect(formatted).toContain('retry the publish command');
        });

        it('should format result requiring manual intervention', () => {
            const result: AgenticPublishResult = {
                success: false,
                message: 'Merge conflicts detected.',
                actionsTaken: ['Analyzed divergence', 'Found conflicts'],
                iterations: 2,
                toolCallsExecuted: 4,
                requiresManualIntervention: true,
                manualSteps: ['Resolve conflicts in src/index.ts', 'Run git add', 'Run git commit']
            };

            const formatted = formatAgenticPublishResult(result);

            expect(formatted).toContain('MANUAL INTERVENTION REQUIRED');
            expect(formatted).toContain('⚠️');
            expect(formatted).toContain('Manual steps required');
            expect(formatted).toContain('Resolve conflicts');
            expect(formatted).toContain('complete the manual steps');
        });

        it('should format unresolved result', () => {
            const result: AgenticPublishResult = {
                success: false,
                message: 'Could not determine the issue.',
                actionsTaken: [],
                iterations: 1,
                toolCallsExecuted: 1,
                requiresManualIntervention: false
            };

            const formatted = formatAgenticPublishResult(result);

            expect(formatted).toContain('UNRESOLVED');
            expect(formatted).toContain('❌');
            expect(formatted).toContain('could not be resolved automatically');
        });

        it('should include detailed analysis', () => {
            const result: AgenticPublishResult = {
                success: true,
                message: 'Detailed analysis:\n- Branch is 3 commits behind\n- No uncommitted changes\n- Merged successfully',
                actionsTaken: ['Synced branch'],
                iterations: 2,
                toolCallsExecuted: 3,
                requiresManualIntervention: false
            };

            const formatted = formatAgenticPublishResult(result);

            expect(formatted).toContain('Detailed analysis');
            expect(formatted).toContain('3 commits behind');
        });

        it('should format result with empty actions', () => {
            const result: AgenticPublishResult = {
                success: true,
                message: 'Issue resolved automatically.',
                actionsTaken: [],
                iterations: 1,
                toolCallsExecuted: 1,
                requiresManualIntervention: false
            };

            const formatted = formatAgenticPublishResult(result);

            expect(formatted).toContain('RESOLVED');
            expect(formatted).not.toContain('Actions taken');
        });

        it('should handle result with manual steps but no manualSteps array', () => {
            const result: AgenticPublishResult = {
                success: false,
                message: 'Manual intervention needed.',
                actionsTaken: ['Analyzed situation'],
                iterations: 1,
                toolCallsExecuted: 2,
                requiresManualIntervention: true,
                manualSteps: undefined
            };

            const formatted = formatAgenticPublishResult(result);

            expect(formatted).toContain('MANUAL INTERVENTION REQUIRED');
            expect(formatted).not.toContain('Manual steps required:');
        });

        it('should include report header', () => {
            const result: AgenticPublishResult = {
                success: true,
                message: 'Done.',
                actionsTaken: [],
                iterations: 1,
                toolCallsExecuted: 1,
                requiresManualIntervention: false
            };

            const formatted = formatAgenticPublishResult(result);

            expect(formatted).toContain('AGENTIC PUBLISH RECOVERY REPORT');
            expect(formatted).toContain('═');
        });
    });
});

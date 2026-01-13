import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDependencyTools } from '../../src/tools/dependency-tools';

describe('Dependency Tools', () => {
    let tools: ReturnType<typeof createDependencyTools>;

    beforeEach(() => {
        vi.clearAllMocks();
        tools = createDependencyTools();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should create all dependency tools', () => {
        expect(tools).toHaveLength(6);

        const toolNames = tools.map(t => t.name);
        expect(toolNames).toContain('get_npm_package_info');
        expect(toolNames).toContain('check_peer_dependencies');
        expect(toolNames).toContain('get_latest_versions');
        expect(toolNames).toContain('analyze_version_compatibility');
        expect(toolNames).toContain('get_package_changelog');
        expect(toolNames).toContain('suggest_version_alignment');
    });

    describe('get_npm_package_info', () => {
        it('should have correct metadata', () => {
            const tool = tools.find(t => t.name === 'get_npm_package_info');
            expect(tool).toBeDefined();
            expect(tool?.category).toBe('Research');
            expect(tool?.cost).toBe('moderate');
            expect(tool?.parameters.required).toContain('packageName');
            expect(tool?.description).toContain('npm package');
        });

        it('should have examples', () => {
            const tool = tools.find(t => t.name === 'get_npm_package_info');
            expect(tool?.examples).toBeDefined();
            expect(tool?.examples?.length).toBeGreaterThan(0);
        });
    });

    describe('check_peer_dependencies', () => {
        it('should have correct metadata', () => {
            const tool = tools.find(t => t.name === 'check_peer_dependencies');
            expect(tool).toBeDefined();
            expect(tool?.category).toBe('Analysis');
            expect(tool?.cost).toBe('moderate');
            expect(tool?.parameters.required).toContain('packageName');
            expect(tool?.parameters.required).toContain('packageVersion');
            expect(tool?.parameters.required).toContain('dependencyName');
            expect(tool?.parameters.required).toContain('dependencyVersion');
        });

        it('should have examples', () => {
            const tool = tools.find(t => t.name === 'check_peer_dependencies');
            expect(tool?.examples).toBeDefined();
            expect(tool?.examples?.length).toBeGreaterThan(0);
        });
    });

    describe('get_latest_versions', () => {
        it('should have correct metadata', () => {
            const tool = tools.find(t => t.name === 'get_latest_versions');
            expect(tool).toBeDefined();
            expect(tool?.category).toBe('Research');
            expect(tool?.cost).toBe('moderate');
            expect(tool?.parameters.required).toContain('packages');
        });

        it('should have examples', () => {
            const tool = tools.find(t => t.name === 'get_latest_versions');
            expect(tool?.examples).toBeDefined();
            expect(tool?.examples?.length).toBeGreaterThan(0);
        });
    });

    describe('analyze_version_compatibility', () => {
        it('should have correct metadata', () => {
            const tool = tools.find(t => t.name === 'analyze_version_compatibility');
            expect(tool).toBeDefined();
            expect(tool?.category).toBe('Analysis');
            expect(tool?.cost).toBe('expensive');
            expect(tool?.parameters.required).toContain('packageName');
            expect(tool?.parameters.required).toContain('targetVersion');
            expect(tool?.parameters.required).toContain('currentDependencies');
        });
    });

    describe('get_package_changelog', () => {
        it('should have correct metadata', () => {
            const tool = tools.find(t => t.name === 'get_package_changelog');
            expect(tool).toBeDefined();
            expect(tool?.category).toBe('Research');
            expect(tool?.cost).toBe('moderate');
            expect(tool?.parameters.required).toContain('packageName');
        });
    });

    describe('suggest_version_alignment', () => {
        it('should have correct metadata', () => {
            const tool = tools.find(t => t.name === 'suggest_version_alignment');
            expect(tool).toBeDefined();
            expect(tool?.category).toBe('Planning');
            expect(tool?.cost).toBe('cheap');
            expect(tool?.parameters.required).toContain('conflicts');
            expect(tool?.parameters.required).toContain('strategy');
        });

        it('should suggest version alignment with latest strategy', async () => {
            const tool = tools.find(t => t.name === 'suggest_version_alignment')!;

            const result = await tool.execute({
                conflicts: [
                    { packageName: 'lodash', versions: ['^4.17.0', '^4.18.0'], usedBy: ['pkg-a', 'pkg-b'] }
                ],
                strategy: 'latest'
            });

            expect(result.strategy).toBe('latest');
            expect(result.recommendations).toHaveLength(1);
            expect(result.recommendations[0].recommendedVersion).toBe('^4.18.0');
        });

        it('should suggest version alignment with conservative strategy', async () => {
            const tool = tools.find(t => t.name === 'suggest_version_alignment')!;

            const result = await tool.execute({
                conflicts: [
                    { packageName: 'lodash', versions: ['^4.17.0', '^4.17.0', '^4.18.0'], usedBy: ['pkg-a', 'pkg-b', 'pkg-c'] }
                ],
                strategy: 'conservative'
            });

            expect(result.strategy).toBe('conservative');
            expect(result.recommendations[0].reason).toContain('Most commonly used');
        });

        it('should suggest version alignment with compatible strategy', async () => {
            const tool = tools.find(t => t.name === 'suggest_version_alignment')!;

            const result = await tool.execute({
                conflicts: [
                    { packageName: 'lodash', versions: ['^4.17.0', '^4.18.0'], usedBy: ['pkg-a', 'pkg-b'] }
                ],
                strategy: 'compatible'
            });

            expect(result.strategy).toBe('compatible');
            expect(result.recommendations[0].recommendedVersion).toBe('^4.17.0');
            expect(result.recommendations[0].reason).toContain('compatibility');
        });

        it('should handle multiple conflicts', async () => {
            const tool = tools.find(t => t.name === 'suggest_version_alignment')!;

            const result = await tool.execute({
                conflicts: [
                    { packageName: 'lodash', versions: ['^4.17.0', '^4.18.0'], usedBy: ['pkg-a'] },
                    { packageName: 'typescript', versions: ['^5.0.0', '^5.3.0'], usedBy: ['pkg-b'] }
                ],
                strategy: 'latest'
            });

            expect(result.recommendations).toHaveLength(2);
            expect(result.summary).toContain('2 packages');
        });

        it('should handle empty conflicts array', async () => {
            const tool = tools.find(t => t.name === 'suggest_version_alignment')!;

            const result = await tool.execute({
                conflicts: [],
                strategy: 'latest'
            });

            expect(result.recommendations).toHaveLength(0);
            expect(result.summary).toContain('0 packages');
        });
    });
});

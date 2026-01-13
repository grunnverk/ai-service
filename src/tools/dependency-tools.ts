/**
 * Tools for agentic dependency analysis
 *
 * These tools allow the AI agent to analyze and make recommendations
 * about dependency management across a monorepo.
 */

import type { Tool, ToolContext } from './types';

/**
 * Create all dependency analysis tools
 */
export function createDependencyTools(): Tool[] {
    return [
        createGetNpmPackageInfoTool(),
        createCheckPeerDependenciesTool(),
        createGetLatestVersionsTool(),
        createAnalyzeVersionCompatibilityTool(),
        createGetPackageChangelogTool(),
        createSuggestVersionAlignmentTool(),
    ];
}

/**
 * Tool to get information about an npm package
 */
function createGetNpmPackageInfoTool(): Tool {
    return {
        name: 'get_npm_package_info',
        description: 'Get detailed information about an npm package including latest version, description, peer dependencies, and recent versions. Use this to understand what version is available and what its requirements are.',
        category: 'Research',
        cost: 'moderate',
        parameters: {
            type: 'object',
            properties: {
                packageName: {
                    type: 'string',
                    description: 'The npm package name (e.g., "openai", "@riotprompt/riotprompt")',
                },
            },
            required: ['packageName'],
        },
        examples: [
            {
                scenario: 'Check latest version of openai package',
                params: { packageName: 'openai' },
                expectedResult: '{ "name": "openai", "version": "6.16.0", "peerDependencies": { "zod": "^3.23.8" }, "versions": ["6.16.0", "6.15.0", ...] }',
            },
        ],
        execute: async (params: { packageName: string }, _context?: ToolContext) => {
            const { packageName } = params;

            try {
                const { exec } = await import('child_process');
                const { promisify } = await import('util');
                const execAsync = promisify(exec);

                // Get package info from npm registry
                const { stdout } = await execAsync(`npm view ${packageName} --json`, {
                    timeout: 30000,
                });

                const info = JSON.parse(stdout);

                return {
                    name: info.name,
                    version: info.version,
                    description: info.description,
                    peerDependencies: info.peerDependencies || {},
                    peerDependenciesMeta: info.peerDependenciesMeta || {},
                    dependencies: Object.keys(info.dependencies || {}).length,
                    versions: (info.versions || []).slice(-10), // Last 10 versions
                    repository: info.repository?.url || null,
                    homepage: info.homepage || null,
                };
            } catch (error: any) {
                return {
                    error: `Failed to get package info for ${packageName}: ${error.message}`,
                };
            }
        },
    };
}

/**
 * Tool to check peer dependency requirements
 */
function createCheckPeerDependenciesTool(): Tool {
    return {
        name: 'check_peer_dependencies',
        description: 'Check if a specific version of a package is compatible with another package based on peer dependency requirements. Use this to verify if updating one package would break compatibility with another.',
        category: 'Analysis',
        cost: 'moderate',
        parameters: {
            type: 'object',
            properties: {
                packageName: {
                    type: 'string',
                    description: 'The package to check peer dependencies for',
                },
                packageVersion: {
                    type: 'string',
                    description: 'The version of the package to check',
                },
                dependencyName: {
                    type: 'string',
                    description: 'The dependency to check compatibility with',
                },
                dependencyVersion: {
                    type: 'string',
                    description: 'The version of the dependency currently installed',
                },
            },
            required: ['packageName', 'packageVersion', 'dependencyName', 'dependencyVersion'],
        },
        examples: [
            {
                scenario: 'Check if @riotprompt/riotprompt@0.0.21 is compatible with openai@4.104.0',
                params: {
                    packageName: '@riotprompt/riotprompt',
                    packageVersion: '0.0.21',
                    dependencyName: 'openai',
                    dependencyVersion: '4.104.0',
                },
                expectedResult: '{ "compatible": false, "required": "^6.15.0", "current": "4.104.0", "recommendation": "Upgrade openai to ^6.15.0" }',
            },
        ],
        execute: async (params: { packageName: string; packageVersion: string; dependencyName: string; dependencyVersion: string }) => {
            const { packageName, packageVersion, dependencyName, dependencyVersion } = params;

            try {
                const { exec } = await import('child_process');
                const { promisify } = await import('util');
                const execAsync = promisify(exec);
                const semver = await import('semver');

                // Get specific version info
                const { stdout } = await execAsync(`npm view ${packageName}@${packageVersion} peerDependencies peerDependenciesMeta --json`, {
                    timeout: 30000,
                });

                const info = JSON.parse(stdout);
                const peerDeps = info.peerDependencies || info || {};
                const peerDepsMeta = info.peerDependenciesMeta || {};

                const requiredRange = peerDeps[dependencyName];

                if (!requiredRange) {
                    return {
                        compatible: true,
                        reason: `${packageName}@${packageVersion} does not have a peer dependency on ${dependencyName}`,
                    };
                }

                const isOptional = peerDepsMeta[dependencyName]?.optional === true;
                const satisfies = semver.satisfies(dependencyVersion, requiredRange);

                return {
                    compatible: satisfies,
                    required: requiredRange,
                    current: dependencyVersion,
                    optional: isOptional,
                    recommendation: satisfies
                        ? 'Current version is compatible'
                        : `${isOptional ? '(Optional) ' : ''}Update ${dependencyName} to ${requiredRange} to satisfy peer dependency`,
                };
            } catch (error: any) {
                return {
                    error: `Failed to check peer dependencies: ${error.message}`,
                };
            }
        },
    };
}

/**
 * Tool to get latest versions of multiple packages
 */
function createGetLatestVersionsTool(): Tool {
    return {
        name: 'get_latest_versions',
        description: 'Get the latest versions of multiple npm packages at once. Use this to quickly check if packages are outdated.',
        category: 'Research',
        cost: 'moderate',
        parameters: {
            type: 'object',
            properties: {
                packages: {
                    type: 'array',
                    description: 'Array of package names to check',
                    items: {
                        type: 'string',
                        description: 'Package name',
                    },
                },
            },
            required: ['packages'],
        },
        examples: [
            {
                scenario: 'Check latest versions of openai and zod',
                params: { packages: ['openai', 'zod'] },
                expectedResult: '{ "openai": "6.16.0", "zod": "3.25.76" }',
            },
        ],
        execute: async (params: { packages: string[] }) => {
            const { packages } = params;
            const results: Record<string, string | { error: string }> = {};

            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);

            // Process packages in parallel (with limit)
            const batchSize = 5;
            for (let i = 0; i < packages.length; i += batchSize) {
                const batch = packages.slice(i, i + batchSize);
                await Promise.all(
                    batch.map(async (pkg) => {
                        try {
                            const { stdout } = await execAsync(`npm view ${pkg} version`, {
                                timeout: 15000,
                            });
                            results[pkg] = stdout.trim();
                        } catch (error: any) {
                            results[pkg] = { error: error.message };
                        }
                    })
                );
            }

            return results;
        },
    };
}

/**
 * Tool to analyze version compatibility across packages
 */
function createAnalyzeVersionCompatibilityTool(): Tool {
    return {
        name: 'analyze_version_compatibility',
        description: 'Analyze if a target version of a package is compatible with the current project setup by checking all peer dependencies recursively. Use this before recommending an upgrade.',
        category: 'Analysis',
        cost: 'expensive',
        parameters: {
            type: 'object',
            properties: {
                packageName: {
                    type: 'string',
                    description: 'The package to analyze upgrading to',
                },
                targetVersion: {
                    type: 'string',
                    description: 'The target version to upgrade to',
                },
                currentDependencies: {
                    type: 'object',
                    description: 'Current dependencies and their versions (as key-value pairs)',
                },
            },
            required: ['packageName', 'targetVersion', 'currentDependencies'],
        },
        execute: async (params: { packageName: string; targetVersion: string; currentDependencies: Record<string, string> }) => {
            const { packageName, targetVersion, currentDependencies } = params;

            try {
                const { exec } = await import('child_process');
                const { promisify } = await import('util');
                const execAsync = promisify(exec);
                const semver = await import('semver');

                // Get peer dependencies of target version
                const { stdout } = await execAsync(`npm view ${packageName}@${targetVersion} peerDependencies peerDependenciesMeta --json`, {
                    timeout: 30000,
                });

                const info = JSON.parse(stdout);
                const peerDeps = info.peerDependencies || info || {};
                const peerDepsMeta = info.peerDependenciesMeta || {};

                const conflicts: Array<{
                    dependency: string;
                    required: string;
                    current: string;
                    optional: boolean;
                }> = [];

                const compatible: Array<{
                    dependency: string;
                    required: string;
                    current: string;
                }> = [];

                for (const [dep, requiredRange] of Object.entries(peerDeps)) {
                    const currentVersion = currentDependencies[dep];
                    const isOptional = peerDepsMeta[dep]?.optional === true;

                    if (!currentVersion) {
                        if (!isOptional) {
                            conflicts.push({
                                dependency: dep,
                                required: requiredRange as string,
                                current: 'not installed',
                                optional: false,
                            });
                        }
                        continue;
                    }

                    // Clean the version (remove ^ or ~ prefix for comparison)
                    const cleanCurrent = currentVersion.replace(/^[\^~]/, '');
                    const satisfies = semver.satisfies(cleanCurrent, requiredRange as string);

                    if (satisfies) {
                        compatible.push({
                            dependency: dep,
                            required: requiredRange as string,
                            current: currentVersion,
                        });
                    } else {
                        conflicts.push({
                            dependency: dep,
                            required: requiredRange as string,
                            current: currentVersion,
                            optional: isOptional,
                        });
                    }
                }

                return {
                    canUpgrade: conflicts.filter(c => !c.optional).length === 0,
                    packageName,
                    targetVersion,
                    conflicts,
                    compatible,
                    summary: conflicts.length === 0
                        ? `Safe to upgrade ${packageName} to ${targetVersion}`
                        : `Upgrading ${packageName} to ${targetVersion} requires updating: ${conflicts.map(c => `${c.dependency} to ${c.required}`).join(', ')}`,
                };
            } catch (error: any) {
                return {
                    error: `Failed to analyze compatibility: ${error.message}`,
                };
            }
        },
    };
}

/**
 * Tool to get recent changelog or release notes for a package
 */
function createGetPackageChangelogTool(): Tool {
    return {
        name: 'get_package_changelog',
        description: 'Get recent release notes or changelog information for a package to understand what changed between versions. Use this when evaluating whether to upgrade.',
        category: 'Research',
        cost: 'moderate',
        parameters: {
            type: 'object',
            properties: {
                packageName: {
                    type: 'string',
                    description: 'The npm package name',
                },
                fromVersion: {
                    type: 'string',
                    description: 'The version to compare from (optional)',
                },
                toVersion: {
                    type: 'string',
                    description: 'The version to compare to (optional, defaults to latest)',
                },
            },
            required: ['packageName'],
        },
        execute: async (params: { packageName: string; fromVersion?: string; toVersion?: string }) => {
            const { packageName, fromVersion } = params;

            try {
                const { exec } = await import('child_process');
                const { promisify } = await import('util');
                const execAsync = promisify(exec);

                // Get package info including repository
                const { stdout: infoJson } = await execAsync(`npm view ${packageName} repository.url homepage --json`, {
                    timeout: 15000,
                });

                const info = JSON.parse(infoJson);
                const repoUrl = info['repository.url'] || info.repository?.url || '';
                const homepage = info.homepage || '';

                // Get version history
                const { stdout: versionsJson } = await execAsync(`npm view ${packageName} time --json`, {
                    timeout: 15000,
                });

                const times = JSON.parse(versionsJson);

                // Get relevant versions between from and to
                const versions = Object.entries(times)
                    .filter(([v]) => v !== 'created' && v !== 'modified')
                    .map(([version, time]) => ({ version, time: time as string }))
                    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
                    .slice(0, 10); // Last 10 versions

                // Try to construct GitHub releases URL
                let releasesUrl = '';
                if (repoUrl.includes('github.com')) {
                    const match = repoUrl.match(/github\.com[/:]([^/]+\/[^/.]+)/);
                    if (match) {
                        releasesUrl = `https://github.com/${match[1]}/releases`;
                    }
                }

                return {
                    packageName,
                    currentVersion: fromVersion || 'unknown',
                    latestVersion: versions[0]?.version || 'unknown',
                    recentVersions: versions,
                    releasesUrl: releasesUrl || 'Unable to determine releases URL',
                    homepage,
                    note: 'Check the releases URL for detailed changelog information',
                };
            } catch (error: any) {
                return {
                    error: `Failed to get changelog info: ${error.message}`,
                };
            }
        },
    };
}

/**
 * Tool to suggest version alignment strategy
 */
function createSuggestVersionAlignmentTool(): Tool {
    return {
        name: 'suggest_version_alignment',
        description: 'Given a list of packages with version conflicts, suggest which versions to align on and in what order to update them. Use this to create a coherent upgrade plan.',
        category: 'Planning',
        cost: 'cheap',
        parameters: {
            type: 'object',
            properties: {
                conflicts: {
                    type: 'array',
                    description: 'Array of version conflicts',
                    items: {
                        type: 'object',
                        description: 'A version conflict entry',
                        properties: {
                            packageName: { type: 'string', description: 'Package name' },
                            versions: {
                                type: 'array',
                                description: 'Different versions in use',
                                items: { type: 'string', description: 'Version string' },
                            },
                            usedBy: {
                                type: 'array',
                                description: 'Which projects use each version',
                                items: { type: 'string', description: 'Project name' },
                            },
                        },
                    },
                },
                strategy: {
                    type: 'string',
                    description: 'Alignment strategy: "latest" (prefer latest), "conservative" (prefer most common), "compatible" (prefer most compatible)',
                    enum: ['latest', 'conservative', 'compatible'],
                },
            },
            required: ['conflicts', 'strategy'],
        },
        execute: async (params: { conflicts: Array<{ packageName: string; versions: string[]; usedBy: string[] }>; strategy: string }) => {
            const { conflicts, strategy } = params;
            const semver = await import('semver');

            const recommendations: Array<{
                packageName: string;
                currentVersions: string[];
                recommendedVersion: string;
                reason: string;
                updateOrder: number;
            }> = [];

            for (const conflict of conflicts) {
                const { packageName, versions } = conflict;

                // Sort versions
                const sortedVersions = [...versions]
                    .map(v => v.replace(/^[\^~]/, ''))
                    .filter(v => semver.valid(v))
                    .sort((a, b) => semver.compare(b, a)); // Descending

                let recommendedVersion: string;
                let reason: string;

                switch (strategy) {
                    case 'latest':
                        recommendedVersion = `^${sortedVersions[0]}`;
                        reason = 'Using latest version for newest features and security fixes';
                        break;
                    case 'conservative': {
                        // Find most common version
                        const versionCounts = new Map<string, number>();
                        for (const v of versions) {
                            const clean = v.replace(/^[\^~]/, '');
                            versionCounts.set(clean, (versionCounts.get(clean) || 0) + 1);
                        }
                        const mostCommon = [...versionCounts.entries()].sort((a, b) => b[1] - a[1])[0];
                        recommendedVersion = `^${mostCommon[0]}`;
                        reason = `Most commonly used version (${mostCommon[1]} packages)`;
                        break;
                    }
                    case 'compatible':
                    default:
                        // Find lowest version that works for all
                        recommendedVersion = `^${sortedVersions[sortedVersions.length - 1]}`;
                        reason = 'Lowest common version for maximum compatibility';
                        break;
                }

                recommendations.push({
                    packageName,
                    currentVersions: versions,
                    recommendedVersion,
                    reason,
                    updateOrder: recommendations.length + 1,
                });
            }

            return {
                strategy,
                recommendations,
                summary: `Analyzed ${conflicts.length} packages with version conflicts. Strategy: ${strategy}`,
            };
        },
    };
}


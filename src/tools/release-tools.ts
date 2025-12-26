import type { Tool, ToolContext } from './types';
import { run } from '@eldrforge/git-tools';
import * as path from 'path';

/**
 * Create tools for release notes generation
 */
export function createReleaseTools(): Tool[] {
    return [
        createGetFileHistoryTool(),
        createGetFileContentTool(),
        createSearchCodebaseTool(),
        createGetRelatedTestsTool(),
        createGetFileDependenciesTool(),
        createAnalyzeDiffSectionTool(),
        createGetRecentCommitsTool(),
        createGroupFilesByConcernTool(),
        createGetTagHistoryTool(),
        createComparePreviousReleaseTool(),
        createGetReleaseStatsTool(),
        createGetBreakingChangesTool(),
        createAnalyzeCommitPatternsTool(),
    ];
}

/**
 * Get git commit history for specific files
 */
function createGetFileHistoryTool(): Tool {
    return {
        name: 'get_file_history',
        description: 'Get git commit history for one or more files to understand their evolution and past changes',
        parameters: {
            type: 'object',
            properties: {
                filePaths: {
                    type: 'array',
                    description: 'Array of file paths to get history for',
                    items: { type: 'string', description: 'File path' },
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of commits to return (default: 10)',
                    default: 10,
                },
                format: {
                    type: 'string',
                    description: 'Output format: "summary" for brief or "detailed" for full messages',
                    enum: ['summary', 'detailed'],
                    default: 'summary',
                },
            },
            required: ['filePaths'],
        },
        execute: async (params: { filePaths: string[]; limit?: number; format?: 'summary' | 'detailed' }, context?: ToolContext) => {
            const { filePaths, limit = 10, format = 'summary' } = params;
            const workingDir = context?.workingDirectory || process.cwd();

            const formatArg = format === 'detailed' ? '--format=%H%n%an (%ae)%n%ad%n%s%n%n%b%n---' : '--format=%h - %s (%an, %ar)';
            const fileArgs = filePaths.join(' ');
            const command = `git log ${formatArg} -n ${limit} -- ${fileArgs}`;

            try {
                const output = await run(command, { cwd: workingDir });
                return output.stdout || 'No history found for specified files';
            } catch (error: any) {
                throw new Error(`Failed to get file history: ${error.message}`);
            }
        },
    };
}

/**
 * Get the full current content of a file
 */
function createGetFileContentTool(): Tool {
    return {
        name: 'get_file_content',
        description: 'Get the complete current content of a file to understand context around changes',
        parameters: {
            type: 'object',
            properties: {
                filePath: {
                    type: 'string',
                    description: 'Path to the file',
                },
                includeLineNumbers: {
                    type: 'boolean',
                    description: 'Include line numbers in output (default: false)',
                    default: false,
                },
            },
            required: ['filePath'],
        },
        execute: async (params: { filePath: string; includeLineNumbers?: boolean }, context?: ToolContext) => {
            const { filePath, includeLineNumbers = false } = params;
            const storage = context?.storage;

            if (!storage) {
                throw new Error('Storage adapter not available in context');
            }

            try {
                const content = await storage.readFile(filePath, 'utf-8');

                if (includeLineNumbers) {
                    const lines = content.split('\n');
                    return lines.map((line: string, idx: number) => `${idx + 1}: ${line}`).join('\n');
                }

                return content;
            } catch (error: any) {
                throw new Error(`Failed to read file: ${error.message}`);
            }
        },
    };
}

/**
 * Search for code patterns or identifiers across the codebase
 */
function createSearchCodebaseTool(): Tool {
    return {
        name: 'search_codebase',
        description: 'Search for code patterns, function names, or text across the codebase using git grep',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search pattern (can be plain text or regex)',
                },
                fileTypes: {
                    type: 'array',
                    description: 'Limit search to specific file extensions (e.g., ["ts", "js"])',
                    items: { type: 'string', description: 'File extension' },
                },
                contextLines: {
                    type: 'number',
                    description: 'Number of context lines to show around matches (default: 2)',
                    default: 2,
                },
            },
            required: ['query'],
        },
        execute: async (params: { query: string; fileTypes?: string[]; contextLines?: number }, context?: ToolContext) => {
            const { query, fileTypes, contextLines = 2 } = params;
            const workingDir = context?.workingDirectory || process.cwd();

            // Build command with proper git grep syntax: pattern comes BEFORE pathspec
            let command = `git grep -n -C ${contextLines} "${query}"`;

            if (fileTypes && fileTypes.length > 0) {
                // Use separate quoted patterns for each file type to avoid shell expansion issues
                const patterns = fileTypes.map(ext => `'*.${ext}'`).join(' ');
                command += ` -- ${patterns}`;
            }

            try {
                const output = await run(command, { cwd: workingDir });
                return output.stdout || 'No matches found';
            } catch (error: any) {
                // git grep returns exit code 1 when no matches found
                if (error.message.includes('exit code 1')) {
                    return 'No matches found';
                }
                throw new Error(`Search failed: ${error.message}`);
            }
        },
    };
}

/**
 * Find test files related to changed production files
 */
function createGetRelatedTestsTool(): Tool {
    return {
        name: 'get_related_tests',
        description: 'Find test files related to production files to understand what the code is supposed to do',
        parameters: {
            type: 'object',
            properties: {
                filePaths: {
                    type: 'array',
                    description: 'Production file paths',
                    items: { type: 'string', description: 'File path' },
                },
            },
            required: ['filePaths'],
        },
        execute: async (params: { filePaths: string[] }, context?: ToolContext) => {
            const { filePaths } = params;
            const storage = context?.storage;

            if (!storage) {
                throw new Error('Storage adapter not available in context');
            }

            const relatedTests: string[] = [];

            for (const filePath of filePaths) {
                // Common test patterns
                const patterns = [
                    filePath.replace(/\.(ts|js|tsx|jsx)$/, '.test.$1'),
                    filePath.replace(/\.(ts|js|tsx|jsx)$/, '.spec.$1'),
                    filePath.replace('/src/', '/tests/').replace('/lib/', '/tests/'),
                    path.join('tests', filePath),
                    path.join('test', filePath),
                ];

                for (const pattern of patterns) {
                    try {
                        await storage.readFile(pattern, 'utf-8');
                        relatedTests.push(pattern);
                    } catch {
                        // File doesn't exist, continue
                    }
                }
            }

            if (relatedTests.length === 0) {
                return 'No related test files found';
            }

            return `Found related test files:\n${relatedTests.join('\n')}`;
        },
    };
}

/**
 * Understand what files import/depend on changed files
 */
function createGetFileDependenciesTool(): Tool {
    return {
        name: 'get_file_dependencies',
        description: 'Find which files import or depend on the changed files to assess change impact',
        parameters: {
            type: 'object',
            properties: {
                filePaths: {
                    type: 'array',
                    description: 'Files to analyze dependencies for',
                    items: { type: 'string', description: 'File path' },
                },
            },
            required: ['filePaths'],
        },
        execute: async (params: { filePaths: string[] }, context?: ToolContext) => {
            const { filePaths } = params;
            const workingDir = context?.workingDirectory || process.cwd();

            const results: string[] = [];

            for (const filePath of filePaths) {
                // Extract filename without extension for searching imports
                const fileName = path.basename(filePath, path.extname(filePath));

                // Search for imports of this file
                const searchPatterns = [
                    `from.*['"].*${fileName}`,
                    `import.*['"].*${fileName}`,
                    `require\\(['"].*${fileName}`,
                ];

                for (const pattern of searchPatterns) {
                    try {
                        const command = `git grep -l "${pattern}"`;
                        const output = await run(command, { cwd: workingDir });
                        if (output.stdout) {
                            results.push(`Files importing ${filePath}:\n${output.stdout}`);
                            break; // Found matches, no need to try other patterns
                        }
                    } catch {
                        // No matches or error, continue
                    }
                }
            }

            return results.length > 0
                ? results.join('\n\n')
                : 'No files found that import the specified files';
        },
    };
}

/**
 * Get detailed analysis of specific lines in a diff
 */
function createAnalyzeDiffSectionTool(): Tool {
    return {
        name: 'analyze_diff_section',
        description: 'Get expanded context around specific lines in a file to better understand changes',
        parameters: {
            type: 'object',
            properties: {
                filePath: {
                    type: 'string',
                    description: 'File containing the section to analyze',
                },
                startLine: {
                    type: 'number',
                    description: 'Starting line number',
                },
                endLine: {
                    type: 'number',
                    description: 'Ending line number',
                },
                contextLines: {
                    type: 'number',
                    description: 'Number of additional context lines to show before and after (default: 10)',
                    default: 10,
                },
            },
            required: ['filePath', 'startLine', 'endLine'],
        },
        execute: async (params: { filePath: string; startLine: number; endLine: number; contextLines?: number }, context?: ToolContext) => {
            const { filePath, startLine, endLine, contextLines = 10 } = params;
            const storage = context?.storage;

            if (!storage) {
                throw new Error('Storage adapter not available in context');
            }

            try {
                const content = await storage.readFile(filePath, 'utf-8');
                const lines = content.split('\n');

                const actualStart = Math.max(0, startLine - contextLines - 1);
                const actualEnd = Math.min(lines.length, endLine + contextLines);

                const section = lines.slice(actualStart, actualEnd)
                    .map((line: string, idx: number) => `${actualStart + idx + 1}: ${line}`)
                    .join('\n');

                return `Lines ${actualStart + 1}-${actualEnd} from ${filePath}:\n\n${section}`;
            } catch (error: any) {
                throw new Error(`Failed to analyze diff section: ${error.message}`);
            }
        },
    };
}

/**
 * Get recent commits that touched the same files
 */
function createGetRecentCommitsTool(): Tool {
    return {
        name: 'get_recent_commits',
        description: 'Get recent commits that modified the same files to understand recent work in this area',
        parameters: {
            type: 'object',
            properties: {
                filePaths: {
                    type: 'array',
                    description: 'Files to check for recent commits',
                    items: { type: 'string', description: 'File path' },
                },
                since: {
                    type: 'string',
                    description: 'Time period to look back (e.g., "1 week ago", "2 days ago")',
                    default: '1 week ago',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of commits to return (default: 5)',
                    default: 5,
                },
            },
            required: ['filePaths'],
        },
        execute: async (params: { filePaths: string[]; since?: string; limit?: number }, context?: ToolContext) => {
            const { filePaths, since = '1 week ago', limit = 5 } = params;
            const workingDir = context?.workingDirectory || process.cwd();

            const fileArgs = filePaths.join(' ');
            const command = `git log --format="%h - %s (%an, %ar)" --since="${since}" -n ${limit} -- ${fileArgs}`;

            try {
                const output = await run(command, { cwd: workingDir });
                return output.stdout || `No commits found in the specified time period (${since})`;
            } catch (error: any) {
                throw new Error(`Failed to get recent commits: ${error.message}`);
            }
        },
    };
}

/**
 * Analyze changed files and suggest logical groupings
 */
function createGroupFilesByConcernTool(): Tool {
    return {
        name: 'group_files_by_concern',
        description: 'Analyze changed files and suggest logical groupings that might represent separate concerns',
        parameters: {
            type: 'object',
            properties: {
                filePaths: {
                    type: 'array',
                    description: 'All changed files to analyze',
                    items: { type: 'string', description: 'File path' },
                },
            },
            required: ['filePaths'],
        },
        execute: async (params: { filePaths: string[] }) => {
            const { filePaths } = params;

            // Group files by directory and type
            const groups: Record<string, string[]> = {};

            for (const filePath of filePaths) {
                const dir = path.dirname(filePath);
                const ext = path.extname(filePath);
                const basename = path.basename(filePath, ext);

                // Determine category
                let category = 'other';

                if (basename.includes('.test') || basename.includes('.spec') || dir.includes('test')) {
                    category = 'tests';
                } else if (filePath.includes('package.json') || filePath.includes('package-lock.json')) {
                    category = 'dependencies';
                } else if (ext === '.md' || basename === 'README') {
                    category = 'documentation';
                } else if (dir.includes('src') || dir.includes('lib')) {
                    // Group by module/subdirectory
                    category = `source:${dir.split('/').slice(0, 3).join('/')}`;
                }

                if (!groups[category]) {
                    groups[category] = [];
                }
                groups[category].push(filePath);
            }

            // Format the groupings
            const output = Object.entries(groups)
                .map(([category, files]) => {
                    return `${category} (${files.length} files):\n${files.map(f => `  - ${f}`).join('\n')}`;
                })
                .join('\n\n');

            const groupCount = Object.keys(groups).length;
            const suggestion = groupCount > 1
                ? `\n\nSuggestion: These ${groupCount} groups represent different concerns in the release.`
                : '\n\nSuggestion: All files appear to be related to a single concern.';

            return output + suggestion;
        },
    };
}

/**
 * Get history of previous release tags
 */
function createGetTagHistoryTool(): Tool {
    return {
        name: 'get_tag_history',
        description: 'Get the history of previous release tags to understand release patterns and versioning',
        parameters: {
            type: 'object',
            properties: {
                limit: {
                    type: 'number',
                    description: 'Number of recent tags to retrieve (default: 10)',
                    default: 10,
                },
                pattern: {
                    type: 'string',
                    description: 'Filter tags by pattern (e.g., "v*" for version tags)',
                },
            },
        },
        execute: async (params: { limit?: number; pattern?: string }, context?: ToolContext) => {
            const { limit = 10, pattern } = params;
            const workingDir = context?.workingDirectory || process.cwd();

            let command = 'git tag --sort=-creatordate';
            if (pattern) {
                command += ` -l "${pattern}"`;
            }
            command += ` | head -n ${limit}`;

            try {
                const output = await run(command, { cwd: workingDir });
                if (!output.stdout) {
                    return 'No tags found in repository';
                }

                // Get detailed info for each tag
                const tags = output.stdout.trim().split('\n');
                const detailedInfo: string[] = [];

                for (const tag of tags) {
                    try {
                        const tagInfo = await run(`git show --quiet --format="%ci - %s" ${tag}`, { cwd: workingDir });
                        detailedInfo.push(`${tag}: ${tagInfo.stdout.trim()}`);
                    } catch {
                        detailedInfo.push(`${tag}: (no info available)`);
                    }
                }

                return `Recent release tags:\n${detailedInfo.join('\n')}`;
            } catch (error: any) {
                throw new Error(`Failed to get tag history: ${error.message}`);
            }
        },
    };
}

/**
 * Compare this release with a previous release
 */
function createComparePreviousReleaseTool(): Tool {
    return {
        name: 'compare_previous_release',
        description: 'Compare this release with a previous release to understand what changed between versions',
        parameters: {
            type: 'object',
            properties: {
                previousTag: {
                    type: 'string',
                    description: 'Previous release tag to compare against',
                },
                currentRef: {
                    type: 'string',
                    description: 'Current reference (default: HEAD)',
                    default: 'HEAD',
                },
                statsOnly: {
                    type: 'boolean',
                    description: 'Return only statistics, not full diff (default: true)',
                    default: true,
                },
            },
            required: ['previousTag'],
        },
        execute: async (params: { previousTag: string; currentRef?: string; statsOnly?: boolean }, context?: ToolContext) => {
            const { previousTag, currentRef = 'HEAD', statsOnly = true } = params;
            const workingDir = context?.workingDirectory || process.cwd();

            try {
                // Get commit count
                const commitCountCmd = `git rev-list --count ${previousTag}..${currentRef}`;
                const commitCount = await run(commitCountCmd, { cwd: workingDir });

                // Get file change stats
                const statsCmd = `git diff --stat ${previousTag}..${currentRef}`;
                const stats = await run(statsCmd, { cwd: workingDir });

                let result = `Comparison between ${previousTag} and ${currentRef}:\n\n`;
                result += `Commits: ${commitCount.stdout.trim()}\n\n`;
                result += `File changes:\n${stats.stdout}`;

                if (!statsOnly) {
                    // Get short log of commits
                    const logCmd = `git log --oneline ${previousTag}..${currentRef}`;
                    const log = await run(logCmd, { cwd: workingDir });
                    result += `\n\nCommit summary:\n${log.stdout}`;
                }

                return result;
            } catch (error: any) {
                throw new Error(`Failed to compare releases: ${error.message}`);
            }
        },
    };
}

/**
 * Get statistics about the release
 */
function createGetReleaseStatsTool(): Tool {
    return {
        name: 'get_release_stats',
        description: 'Get comprehensive statistics about the release including contributors, file changes, and commit patterns',
        parameters: {
            type: 'object',
            properties: {
                fromRef: {
                    type: 'string',
                    description: 'Starting reference for the release range',
                },
                toRef: {
                    type: 'string',
                    description: 'Ending reference for the release range (default: HEAD)',
                    default: 'HEAD',
                },
            },
            required: ['fromRef'],
        },
        execute: async (params: { fromRef: string; toRef?: string }, context?: ToolContext) => {
            const { fromRef, toRef = 'HEAD' } = params;
            const workingDir = context?.workingDirectory || process.cwd();

            try {
                const results: string[] = [];

                // Commit count
                const commitCount = await run(`git rev-list --count ${fromRef}..${toRef}`, { cwd: workingDir });
                results.push(`Total commits: ${commitCount.stdout.trim()}`);

                // Contributors
                const contributors = await run(
                    `git shortlog -sn ${fromRef}..${toRef}`,
                    { cwd: workingDir }
                );
                results.push(`\nContributors:\n${contributors.stdout}`);

                // File change summary
                const fileStats = await run(
                    `git diff --shortstat ${fromRef}..${toRef}`,
                    { cwd: workingDir }
                );
                results.push(`\nFile changes: ${fileStats.stdout.trim()}`);

                // Most changed files
                const topFiles = await run(
                    `git diff --stat ${fromRef}..${toRef} | sort -k2 -rn | head -n 10`,
                    { cwd: workingDir }
                );
                results.push(`\nTop 10 most changed files:\n${topFiles.stdout}`);

                return results.join('\n');
            } catch (error: any) {
                throw new Error(`Failed to get release stats: ${error.message}`);
            }
        },
    };
}

/**
 * Identify potential breaking changes
 */
function createGetBreakingChangesTool(): Tool {
    return {
        name: 'get_breaking_changes',
        description: 'Search for potential breaking changes by looking for specific patterns in commits and diffs',
        parameters: {
            type: 'object',
            properties: {
                fromRef: {
                    type: 'string',
                    description: 'Starting reference for the release range',
                },
                toRef: {
                    type: 'string',
                    description: 'Ending reference for the release range (default: HEAD)',
                    default: 'HEAD',
                },
            },
            required: ['fromRef'],
        },
        execute: async (params: { fromRef: string; toRef?: string }, context?: ToolContext) => {
            const { fromRef, toRef = 'HEAD' } = params;
            const workingDir = context?.workingDirectory || process.cwd();

            const results: string[] = [];

            try {
                // Search for BREAKING CHANGE in commit messages
                const breakingCommits = await run(
                    `git log --grep="BREAKING CHANGE" --oneline ${fromRef}..${toRef}`,
                    { cwd: workingDir }
                );
                if (breakingCommits.stdout) {
                    results.push(`Commits with BREAKING CHANGE:\n${breakingCommits.stdout}`);
                }

                // Search for removed exports
                const removedExports = await run(
                    `git diff ${fromRef}..${toRef} | grep "^-export"`,
                    { cwd: workingDir }
                );
                if (removedExports.stdout) {
                    results.push(`\nRemoved exports (potential breaking):\n${removedExports.stdout}`);
                }

                // Search for changed function signatures
                const changedSignatures = await run(
                    `git diff ${fromRef}..${toRef} | grep -E "^[-+].*function|^[-+].*const.*=.*=>|^[-+].*interface|^[-+].*type.*="`,
                    { cwd: workingDir }
                );
                if (changedSignatures.stdout) {
                    results.push(`\nChanged function/type signatures (review for breaking changes):\n${changedSignatures.stdout.split('\n').slice(0, 20).join('\n')}`);
                }

                if (results.length === 0) {
                    return 'No obvious breaking changes detected. Manual review recommended for API changes.';
                }

                return results.join('\n\n');
            } catch {
                // Some commands may fail if no matches found
                if (results.length > 0) {
                    return results.join('\n\n');
                }
                return 'No obvious breaking changes detected. Manual review recommended for API changes.';
            }
        },
    };
}

/**
 * Analyze commit patterns to identify themes
 */
function createAnalyzeCommitPatternsTool(): Tool {
    return {
        name: 'analyze_commit_patterns',
        description: 'Analyze commit messages to identify patterns and themes in the release',
        parameters: {
            type: 'object',
            properties: {
                fromRef: {
                    type: 'string',
                    description: 'Starting reference for the release range',
                },
                toRef: {
                    type: 'string',
                    description: 'Ending reference for the release range (default: HEAD)',
                    default: 'HEAD',
                },
            },
            required: ['fromRef'],
        },
        execute: async (params: { fromRef: string; toRef?: string }, context?: ToolContext) => {
            const { fromRef, toRef = 'HEAD' } = params;
            const workingDir = context?.workingDirectory || process.cwd();

            try {
                const results: string[] = [];

                // Get all commit messages
                const commits = await run(
                    `git log --format="%s" ${fromRef}..${toRef}`,
                    { cwd: workingDir }
                );

                const messages = commits.stdout.trim().split('\n');

                // Count conventional commit types
                const types: Record<string, number> = {};
                const keywords: Record<string, number> = {};

                for (const msg of messages) {
                    // Check for conventional commit format
                    const conventionalMatch = msg.match(/^(\w+)(\(.+?\))?:/);
                    if (conventionalMatch) {
                        const type = conventionalMatch[1];
                        types[type] = (types[type] || 0) + 1;
                    }

                    // Extract keywords (words longer than 4 chars)
                    const words = msg.toLowerCase().match(/\b\w{5,}\b/g) || [];
                    for (const word of words) {
                        keywords[word] = (keywords[word] || 0) + 1;
                    }
                }

                // Format commit types
                if (Object.keys(types).length > 0) {
                    results.push('Commit types:');
                    const sortedTypes = Object.entries(types)
                        .sort((a, b) => b[1] - a[1])
                        .map(([type, count]) => `  ${type}: ${count}`)
                        .join('\n');
                    results.push(sortedTypes);
                }

                // Format top keywords
                const topKeywords = Object.entries(keywords)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 15)
                    .map(([word, count]) => `  ${word}: ${count}`)
                    .join('\n');

                if (topKeywords) {
                    results.push('\nTop keywords in commits:');
                    results.push(topKeywords);
                }

                return results.join('\n');
            } catch (error: any) {
                throw new Error(`Failed to analyze commit patterns: ${error.message}`);
            }
        },
    };
}


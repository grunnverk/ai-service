import type { Tool, ToolContext } from './types';
import { run } from '@eldrforge/git-tools';
import * as path from 'path';

/**
 * Create tools for commit message generation
 */
export function createCommitTools(): Tool[] {
    return [
        createGetFileHistoryTool(),
        createGetFileContentTool(),
        createSearchCodebaseTool(),
        createGetRelatedTestsTool(),
        createGetFileDependenciesTool(),
        createAnalyzeDiffSectionTool(),
        createGetRecentCommitsTool(),
        createGroupFilesByConcernTool(),
    ];
}

/**
 * Get git commit history for specific files
 */
function createGetFileHistoryTool(): Tool {
    return {
        name: 'get_file_history',
        description: 'Get git commit history for one or more files to understand their evolution and past changes',
        category: 'Understanding',
        cost: 'cheap',
        examples: [
            {
                scenario: 'Check if file has recent refactoring',
                params: { filePaths: ['src/auth.ts'], limit: 5 },
                expectedResult: 'List of recent commits affecting auth.ts'
            },
            {
                scenario: 'Understand evolution of multiple related files',
                params: { filePaths: ['src/user.ts', 'src/auth.ts'], limit: 10, format: 'detailed' },
                expectedResult: 'Detailed commit history for both files'
            }
        ],
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

            // Use proper shell quoting to avoid issues with parentheses in format strings
            const formatArg = format === 'detailed' ? '--format="%H%n%an (%ae)%n%ad%n%s%n%n%b%n---"' : '--format="%h - %s (%an, %ar)"';
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
        description: 'Get the complete current content of a file to understand context around changes. Returns a message if the file does not exist (e.g., if it was deleted).',
        category: 'Understanding',
        cost: 'moderate',
        examples: [
            {
                scenario: 'See full class definition for modified method',
                params: { filePath: 'src/services/auth.ts', includeLineNumbers: true },
                expectedResult: 'Complete file content with line numbers'
            },
            {
                scenario: 'Check imports and structure',
                params: { filePath: 'src/utils/helpers.ts' },
                expectedResult: 'Full file content showing imports and exports'
            }
        ],
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
                // Handle file not found gracefully - common for deleted files in diffs
                if (error.code === 'ENOENT' || error.message?.includes('ENOENT')) {
                    return `File not found: ${filePath}\n\nThis file may have been deleted in this release or does not exist in the current working tree. Check the diff to see if this file was removed.`;
                }
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
        category: 'Analysis',
        cost: 'moderate',
        examples: [
            {
                scenario: 'Find all uses of a renamed function',
                params: { query: 'oldFunctionName', fileTypes: ['ts', 'tsx'] },
                expectedResult: 'List of files and lines containing the function'
            },
            {
                scenario: 'Check if pattern exists elsewhere',
                params: { query: 'pattern.*string', contextLines: 3 },
                expectedResult: 'Matching lines with surrounding context'
            }
        ],
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
                // Add glob patterns for each file type with proper quoting
                const patterns = fileTypes.map(ext => `'*.${ext}'`).join(' ');
                command += ` -- ${patterns}`;
            }

            try {
                const output = await run(command, { cwd: workingDir });
                return output.stdout || 'No matches found';
            } catch (error: any) {
                // git grep returns exit code 1 when no matches found
                if (error.message.includes('exit code 1') || error.stderr?.includes('did not match any file')) {
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
        category: 'Understanding',
        cost: 'cheap',
        examples: [{ scenario: 'Find tests for modified service', params: { filePaths: ['src/services/auth.ts'] }, expectedResult: 'List of related test files' }],
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
        category: 'Analysis',
        cost: 'moderate',
        examples: [{ scenario: 'Check impact of util function change', params: { filePaths: ['src/utils/format.ts'] }, expectedResult: 'Files that import format.ts' }],
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
        category: 'Understanding',
        cost: 'cheap',
        examples: [{ scenario: 'See context around confusing change', params: { filePath: 'src/auth.ts', startLine: 45, endLine: 52, contextLines: 15 }, expectedResult: 'Expanded code section with context' }],
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
        category: 'Understanding',
        cost: 'cheap',
        examples: [{ scenario: 'Check for duplicate commit messages', params: { filePaths: ['src/auth.ts'], since: '1 week ago', limit: 5 }, expectedResult: 'Recent commits to auth.ts' }],
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
        description: 'Analyze changed files and suggest logical groupings that might represent separate commits',
        category: 'Organization',
        cost: 'cheap',
        examples: [
            {
                scenario: 'Check if multiple unrelated changes should be split',
                params: { filePaths: ['src/auth.ts', 'README.md', 'tests/auth.test.ts', 'package.json'] },
                expectedResult: 'Files grouped by concern with split suggestions'
            }
        ],
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
                ? `\n\nSuggestion: These ${groupCount} groups might be better as separate commits if they represent different concerns.`
                : '\n\nSuggestion: All files appear to be related and should be in a single commit.';

            return output + suggestion;
        },
    };
}


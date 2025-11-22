#!/usr/bin/env node
import { getLogger } from './logger';
import type { Logger, Choice, InteractiveOptions } from './types';
import { spawnSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

/**
 * Get user choice interactively from terminal input
 * @param prompt The prompt message to display
 * @param choices Array of available choices
 * @param options Additional options for customizing behavior
 * @returns Promise resolving to the selected choice key
 */
export async function getUserChoice(
    prompt: string,
    choices: Choice[],
    options: InteractiveOptions = {}
): Promise<string> {
    const logger = options.logger || getLogger();

    logger.info(prompt);
    choices.forEach(choice => {
        logger.info(`   [${choice.key}] ${choice.label}`);
    });
    logger.info('');

    // Check if stdin is a TTY (terminal) or piped
    if (!process.stdin.isTTY) {
        logger.error('⚠️  STDIN is piped but interactive mode is enabled');
        logger.error('   Interactive prompts cannot be used when input is piped');
        logger.error('   Solutions:');
        logger.error('   • Use terminal input instead of piping');

        // Add any additional suggestions
        if (options.nonTtyErrorSuggestions) {
            options.nonTtyErrorSuggestions.forEach(suggestion => {
                logger.error(`   • ${suggestion}`);
            });
        }

        return 's'; // Default to skip
    }

    return new Promise((resolve, reject) => {
        let isResolved = false;
        let dataHandler: ((key: Buffer) => void) | null = null;
        let errorHandler: ((error: Error) => void) | null = null;

        const cleanup = () => {
            if (dataHandler) {
                process.stdin.removeListener('data', dataHandler);
            }
            if (errorHandler) {
                process.stdin.removeListener('error', errorHandler);
            }

            try {
                if (process.stdin.setRawMode) {
                    process.stdin.setRawMode(false);
                }
                process.stdin.pause();
                // Detach stdin again now that we're done
                if (typeof process.stdin.unref === 'function') {
                    process.stdin.unref();
                }
            } catch {
                // Ignore cleanup errors
            }
        };

        const safeResolve = (value: string) => {
            if (!isResolved) {
                isResolved = true;
                cleanup();
                resolve(value);
            }
        };

        const safeReject = (error: Error) => {
            if (!isResolved) {
                isResolved = true;
                cleanup();
                reject(error);
            }
        };

        try {
            // Ensure stdin is referenced so the process doesn't exit while waiting for input
            if (typeof process.stdin.ref === 'function') {
                process.stdin.ref();
            }

            process.stdin.setRawMode(true);
            process.stdin.resume();

            dataHandler = (key: Buffer) => {
                try {
                    const keyStr = key.toString().toLowerCase();
                    const choice = choices.find(c => c.key === keyStr);
                    if (choice) {
                        logger.info(`Selected: ${choice.label}\n`);
                        safeResolve(choice.key);
                    }
                } catch (error) {
                    safeReject(error instanceof Error ? error : new Error('Unknown error processing input'));
                }
            };

            errorHandler = (error: Error) => {
                safeReject(error);
            };

            process.stdin.on('data', dataHandler);
            process.stdin.on('error', errorHandler);

        } catch (error) {
            safeReject(error instanceof Error ? error : new Error('Failed to setup input handlers'));
        }
    });
}

/**
 * Secure temporary file handle that prevents TOCTOU vulnerabilities
 */
export class SecureTempFile {
    private fd: fs.FileHandle | null = null;
    private filePath: string;
    private isCleanedUp = false;
    private logger: Logger;

    private constructor(filePath: string, fd: fs.FileHandle, logger?: Logger) {
        this.filePath = filePath;
        this.fd = fd;
        this.logger = logger || getLogger();
    }

    /**
     * Create a secure temporary file with proper permissions and atomic operations
     * @param prefix Prefix for the temporary filename
     * @param extension File extension (e.g., '.txt', '.md')
     * @param logger Optional logger instance
     * @returns Promise resolving to SecureTempFile instance
     */
    static async create(prefix: string = 'ai-service', extension: string = '.txt', logger?: Logger): Promise<SecureTempFile> {
        const tmpDir = os.tmpdir();
        const log = logger || getLogger();

        // Ensure temp directory exists and is writable (skip check in test environments)
        if (!process.env.VITEST) {
            try {
                await fs.access(tmpDir, fs.constants.W_OK);
            } catch (error: any) {
                // Try to create the directory if it doesn't exist
                try {
                    await fs.mkdir(tmpDir, { recursive: true, mode: 0o700 });
                } catch (mkdirError: any) {
                    throw new Error(`Temp directory not writable: ${tmpDir} - ${error.message}. Failed to create: ${mkdirError.message}`);
                }
            }
        }

        const tmpFilePath = path.join(tmpDir, `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}${extension}`);

        // Create file with exclusive access and restrictive permissions (owner read/write only)
        // Using 'wx' flag ensures exclusive creation (fails if file exists)
        let fd: fs.FileHandle;
        try {
            fd = await fs.open(tmpFilePath, 'wx', 0o600);
        } catch (error: any) {
            if (error.code === 'EEXIST') {
                // Highly unlikely with timestamp + random suffix, but handle it
                throw new Error(`Temporary file already exists: ${tmpFilePath}`);
            }
            throw new Error(`Failed to create temporary file: ${error.message}`);
        }

        return new SecureTempFile(tmpFilePath, fd, log);
    }

    /**
     * Get the file path (use with caution in external commands)
     */
    get path(): string {
        if (this.isCleanedUp) {
            throw new Error('Temp file has been cleaned up');
        }
        return this.filePath;
    }

    /**
     * Write content to the temporary file
     */
    async writeContent(content: string): Promise<void> {
        if (!this.fd || this.isCleanedUp) {
            throw new Error('Temp file is not available for writing');
        }
        await this.fd.writeFile(content, 'utf8');
    }

    /**
     * Read content from the temporary file
     */
    async readContent(): Promise<string> {
        if (!this.fd || this.isCleanedUp) {
            throw new Error('Temp file is not available for reading');
        }
        const content = await this.fd.readFile('utf8');
        return content;
    }

    /**
     * Close the file handle
     */
    async close(): Promise<void> {
        if (this.fd && !this.isCleanedUp) {
            await this.fd.close();
            this.fd = null;
        }
    }

    /**
     * Securely cleanup the temporary file - prevents TOCTOU by using file descriptor
     */
    async cleanup(): Promise<void> {
        if (this.isCleanedUp) {
            return; // Already cleaned up
        }

        try {
            // Close file descriptor first if still open
            if (this.fd) {
                await this.fd.close();
                this.fd = null;
            }

            // Now safely remove the file
            // Use fs.unlink which is safer than checking existence first
            await fs.unlink(this.filePath);
        } catch (error: any) {
            // Only ignore ENOENT (file not found) errors
            if (error.code !== 'ENOENT') {
                this.logger.warn(`Failed to cleanup temp file ${this.filePath}: ${error.message}`);
                // Don't throw here to avoid masking main operations
            }
        } finally {
            this.isCleanedUp = true;
        }
    }
}

/**
 * Create a secure temporary file for editing with proper permissions
 * @param prefix Prefix for the temporary filename
 * @param extension File extension (e.g., '.txt', '.md')
 * @param logger Optional logger instance
 * @returns Promise resolving to the temporary file path
 * @deprecated Use SecureTempFile.create() for better security
 */
export async function createSecureTempFile(prefix: string = 'ai-service', extension: string = '.txt', logger?: Logger): Promise<string> {
    const secureTempFile = await SecureTempFile.create(prefix, extension, logger);
    await secureTempFile.close();
    return secureTempFile.path;
}

/**
 * Clean up a temporary file
 * @param filePath Path to the temporary file to clean up
 * @param logger Optional logger instance
 * @deprecated Use SecureTempFile.cleanup() for better security
 */
export async function cleanupTempFile(filePath: string, logger?: Logger): Promise<void> {
    const log = logger || getLogger();
    try {
        await fs.unlink(filePath);
    } catch (error: any) {
        // Only ignore ENOENT (file not found) errors
        if (error.code !== 'ENOENT') {
            log.warn(`Failed to cleanup temp file ${filePath}: ${error.message}`);
        }
    }
}

export interface EditorResult {
    content: string;
    wasEdited: boolean;
}

/**
 * Open content in user's editor for editing
 * @param content Initial content to edit
 * @param templateLines Additional template lines to include (will be filtered out)
 * @param fileExtension File extension for syntax highlighting
 * @param editor Editor command to use (defaults to EDITOR/VISUAL env var or 'vi')
 * @param logger Optional logger instance
 * @returns Promise resolving to the edited content
 */
export async function editContentInEditor(
    content: string,
    templateLines: string[] = [],
    fileExtension: string = '.txt',
    editor?: string,
    logger?: Logger
): Promise<EditorResult> {
    const log = logger || getLogger();
    const editorCmd = editor || process.env.EDITOR || process.env.VISUAL || 'vi';

    const secureTempFile = await SecureTempFile.create('ai-service_edit', fileExtension, log);
    try {
        // Build template content
        const templateContent = [
            ...templateLines,
            ...(templateLines.length > 0 ? [''] : []), // Add separator if we have template lines
            content,
            '',
        ].join('\n');

        await secureTempFile.writeContent(templateContent);
        await secureTempFile.close(); // Close before external editor access

        log.info(`📝 Opening ${editorCmd} to edit content...`);

        // Open the editor synchronously
        const result = spawnSync(editorCmd, [secureTempFile.path], { stdio: 'inherit' });

        if (result.error) {
            throw new Error(`Failed to launch editor '${editorCmd}': ${result.error.message}`);
        }

        // Read the file back in, stripping comment lines
        const fileContent = (await fs.readFile(secureTempFile.path, 'utf8'))
            .split('\n')
            .filter(line => !line.trim().startsWith('#'))
            .join('\n')
            .trim();

        if (!fileContent) {
            throw new Error('Content is empty after editing');
        }

        log.info('✅ Content updated successfully');

        return {
            content: fileContent,
            wasEdited: fileContent !== content.trim()
        };

    } finally {
        // Always clean up the temp file securely
        await secureTempFile.cleanup();
    }
}

/**
 * Standard choices for interactive feedback loops
 */
export const STANDARD_CHOICES = {
    CONFIRM: { key: 'c', label: 'Confirm and proceed' },
    EDIT: { key: 'e', label: 'Edit in editor' },
    SKIP: { key: 's', label: 'Skip and abort' },
    IMPROVE: { key: 'i', label: 'Improve with LLM feedback' }
} as const;

/**
 * Get text input from the user
 * @param prompt The prompt message to display
 * @param options Additional options for customizing behavior
 * @returns Promise resolving to the user's text input
 */
export async function getUserTextInput(
    prompt: string,
    options: InteractiveOptions = {}
): Promise<string> {
    const logger = options.logger || getLogger();

    // Check if stdin is a TTY (terminal) or piped
    if (!process.stdin.isTTY) {
        logger.error('⚠️  STDIN is piped but interactive text input is required');
        logger.error('   Interactive text input cannot be used when input is piped');
        logger.error('   Solutions:');
        logger.error('   • Use terminal input instead of piping');

        // Add any additional suggestions
        if (options.nonTtyErrorSuggestions) {
            options.nonTtyErrorSuggestions.forEach(suggestion => {
                logger.error(`   • ${suggestion}`);
            });
        }

        throw new Error('Interactive text input requires a terminal');
    }

    logger.info(prompt);
    logger.info('(Press Enter when done, or type Ctrl+C to cancel)');
    logger.info('');

    return new Promise((resolve, reject) => {
        let inputBuffer = '';
        let isResolved = false;
        let dataHandler: ((chunk: string) => void) | null = null;
        let errorHandler: ((error: Error) => void) | null = null;

        const cleanup = () => {
            if (dataHandler) {
                process.stdin.removeListener('data', dataHandler);
            }
            if (errorHandler) {
                process.stdin.removeListener('error', errorHandler);
            }

            try {
                process.stdin.pause();
                // Detach stdin again now that we're done
                if (typeof process.stdin.unref === 'function') {
                    process.stdin.unref();
                }
            } catch {
                // Ignore cleanup errors
            }
        };

        const safeResolve = (value: string) => {
            if (!isResolved) {
                isResolved = true;
                cleanup();
                resolve(value);
            }
        };

        const safeReject = (error: Error) => {
            if (!isResolved) {
                isResolved = true;
                cleanup();
                reject(error);
            }
        };

        try {
            // Ensure stdin is referenced so the process doesn't exit while waiting for input
            if (typeof process.stdin.ref === 'function') {
                process.stdin.ref();
            }

            process.stdin.setEncoding('utf8');
            process.stdin.resume();

            dataHandler = (chunk: string) => {
                try {
                    inputBuffer += chunk;

                    // Check if user pressed Enter (newline character)
                    if (inputBuffer.includes('\n')) {
                        const userInput = inputBuffer.replace(/\n$/, '').trim();

                        if (userInput === '') {
                            logger.warn('Empty input received. Please provide feedback text.');
                            safeReject(new Error('Empty input received'));
                        } else {
                            logger.info(`✅ Received feedback: "${userInput}"\n`);
                            safeResolve(userInput);
                        }
                    }
                } catch (error) {
                    safeReject(error instanceof Error ? error : new Error('Unknown error processing input'));
                }
            };

            errorHandler = (error: Error) => {
                safeReject(error);
            };

            process.stdin.on('data', dataHandler);
            process.stdin.on('error', errorHandler);

        } catch (error) {
            safeReject(error instanceof Error ? error : new Error('Failed to setup input handlers'));
        }
    });
}

/**
 * Get LLM improvement feedback from the user using the editor
 * @param contentType Type of content being improved (e.g., 'commit message', 'release notes')
 * @param currentContent The current content to be improved
 * @param editor Optional editor command
 * @param logger Optional logger instance
 * @returns Promise resolving to the user's feedback text
 */
export async function getLLMFeedbackInEditor(
    contentType: string,
    currentContent: string,
    editor?: string,
    logger?: Logger
): Promise<string> {
    const templateLines = [
        '# Provide Your Instructions and Guidance for a Revision Here',
        '#',
        '# Type your guidance above this line. Be specific about what you want changed,',
        '# added, or improved. You can also edit the original content below directly',
        '# to provide examples or show desired changes.',
        '#',
        '# Lines starting with "#" will be ignored.',
        '',
        '### YOUR FEEDBACK AND GUIDANCE:',
        '',
        '# (Type your improvement instructions here)',
        '',
        `### ORIGINAL ${contentType.toUpperCase()}:`,
        ''
    ];

    const result = await editContentInEditor(
        currentContent,
        templateLines,
        '.md',
        editor,
        logger
    );

    // Extract just the feedback section (everything before the original content)
    const lines = result.content.split('\n');
    const originalSectionIndex = lines.findIndex(line =>
        line.trim().toLowerCase().startsWith('### original')
    );

    let feedback: string;
    if (originalSectionIndex >= 0) {
        // Take everything before the "### ORIGINAL" section
        feedback = lines.slice(0, originalSectionIndex).join('\n').trim();
    } else {
        // If no original section found, take everything
        feedback = result.content.trim();
    }

    // Remove the feedback header if it exists
    feedback = feedback.replace(/^### YOUR FEEDBACK AND GUIDANCE:\s*/i, '').trim();

    if (!feedback) {
        throw new Error('No feedback provided. Please provide improvement instructions.');
    }

    return feedback;
}

/**
 * Check if interactive mode is available (TTY check)
 * @param errorMessage Custom error message to throw if TTY not available
 * @param logger Optional logger instance
 * @throws Error if not in TTY environment
 */
export function requireTTY(errorMessage: string = 'Interactive mode requires a terminal. Use --dry-run instead.', logger?: Logger): void {
    const log = logger || getLogger();
    if (!process.stdin.isTTY) {
        log.error('❌ Interactive mode requires a terminal (TTY)');
        log.error('   Solutions:');
        log.error('   • Run without piping input');
        log.error('   • Use --dry-run to see the generated content');
        throw new Error(errorMessage);
    }
}


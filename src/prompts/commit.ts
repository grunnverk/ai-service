import { Prompt, cook, type ContentItem } from '@riotprompt/riotprompt';
import path from 'path';
import { fileURLToPath } from 'url';
import { TemplateNames } from './templates';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Types for the commit prompt
export type CommitContent = {
    diffContent: string;
    userDirection?: string;
    isFileContent?: boolean; // Flag to indicate if diffContent is actually file content
    githubIssuesContext?: string; // GitHub issues related to current version/milestone
};

export type CommitContext = {
    logContext?: string;
    context?: string;
    directories?: string[];
};

export type CommitConfig = {
    overridePaths?: string[];
    overrides?: boolean;
}

/**
 * Build a commit prompt using RiotPrompt Recipes.
 *
 * This prompt is configured to generate multiline commit messages by default,
 * with separate lines/bullet points for different groups of changes rather
 * than squeezing everything into single lines.
 *
 * @param config      The configuration for overrides
 * @param content     Mandatory content inputs (e.g. diff)
 * @param ctx         Optional contextual inputs configured by the user
 */
export const createCommitPrompt = async (
    { overridePaths: _overridePaths, overrides: _overrides }: CommitConfig,
    { diffContent, userDirection, isFileContent, githubIssuesContext }: CommitContent,
    { logContext, context, directories }: CommitContext = {}
): Promise<Prompt> => {
    const basePath = __dirname;

    // Build content items for the prompt
    const contentItems: ContentItem[] = [];
    const contextItems: ContentItem[] = [];

    // Developer Note: Direction is injected first as the highest-priority prompt input
    // This ensures user guidance takes precedence over other context sources like
    // GitHub issues or commit history.
    if (userDirection) {
        contentItems.push({ content: userDirection, title: 'User Direction' });
    }
    if (diffContent) {
        const contentTitle = isFileContent ? 'Project Files' : 'Diff';
        contentItems.push({ content: diffContent, title: contentTitle });
    }
    if (githubIssuesContext) {
        contentItems.push({ content: githubIssuesContext, title: 'Recent GitHub Issues' });
    }

    // IMPORTANT: Log context provides background but can contaminate output if too large.
    // LLMs tend to pattern-match against recent commits instead of describing the actual diff.
    // Keep messageLimit low (3-5) to minimize contamination.
    if (logContext) {
        contextItems.push({ content: logContext, title: 'Log Context' });
    }
    if (context) {
        contextItems.push({ content: context, title: 'User Context' });
    }
    if (directories && directories.length > 0) {
        contextItems.push({ directories, title: 'Directories' });
    }

    // Use declarative cook() API with registered template
    return cook({
        basePath,
        template: TemplateNames.COMMIT,
        overridePaths: _overridePaths ?? [],
        overrides: _overrides ?? true,
        content: contentItems,
        context: contextItems
    });
};


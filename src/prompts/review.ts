import { Prompt, cook, type ContentItem } from '@riotprompt/riotprompt';
import path from 'path';
import { fileURLToPath } from 'url';
import { TemplateNames } from './templates';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type ReviewConfig = {
    overridePaths?: string[];
    overrides?: boolean;
}

export type ReviewContent = {
    notes: string;
};

export type ReviewContext = {
    logContext?: string;
    diffContext?: string;
    releaseNotesContext?: string;
    issuesContext?: string;
    context?: string;
    directories?: string[];
};

/**
 * Build a review prompt using RiotPrompt Recipes.
 */
export const createReviewPrompt = async (
    { overridePaths: _overridePaths, overrides: _overrides }: ReviewConfig,
    { notes }: ReviewContent,
    { logContext, diffContext, releaseNotesContext, issuesContext, context, directories }: ReviewContext = {}
): Promise<Prompt> => {
    const basePath = __dirname;

    // Build content items for the prompt
    const contentItems: ContentItem[] = [];
    const contextItems: ContentItem[] = [];

    if (notes) {
        contentItems.push({ content: notes, title: 'Review Notes' });
    }

    if (logContext) {
        contextItems.push({ content: logContext, title: 'Log Context' });
    }
    if (diffContext) {
        contextItems.push({ content: diffContext, title: 'Diff Context' });
    }
    if (releaseNotesContext) {
        contextItems.push({ content: releaseNotesContext, title: 'Release Notes Context' });
    }
    if (issuesContext) {
        contextItems.push({ content: issuesContext, title: 'Issues Context' });
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
        template: TemplateNames.REVIEW,
        overridePaths: _overridePaths ?? [],
        overrides: _overrides ?? true,
        content: contentItems,
        context: contextItems
    });
};


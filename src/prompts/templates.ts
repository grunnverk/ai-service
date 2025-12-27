/**
 * RiotPrompt Template Registry
 *
 * This module registers reusable prompt templates that can be used
 * across different prompt builders. Templates define common patterns
 * for personas, instructions, and structure.
 */

import { registerTemplates, type TemplateConfig } from '@riotprompt/riotprompt';

/**
 * Initialize and register all prompt templates.
 * This should be called once during application initialization.
 */
export const initializeTemplates = (): void => {
    const templates: Record<string, TemplateConfig> = {
        // Commit message generation template
        'commit': {
            persona: { path: 'personas/you.md' },
            instructions: [{ path: 'instructions/commit.md' }]
        },

        // Release notes generation template
        'release': {
            persona: { path: 'personas/releaser.md' },
            instructions: [{ path: 'instructions/release.md' }]
        },

        // Code review template
        'review': {
            persona: { path: 'personas/you.md' },
            instructions: [{ path: 'instructions/review.md' }]
        }
    };

    registerTemplates(templates);
};

/**
 * Template names for type-safe template references
 */
export const TemplateNames = {
    COMMIT: 'commit',
    RELEASE: 'release',
    REVIEW: 'review'
} as const;

export type TemplateName = typeof TemplateNames[keyof typeof TemplateNames];


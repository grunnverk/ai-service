# @eldrforge/ai-service

AI-powered content generation for automation tools with agentic capabilities.

## Overview

This package provides OpenAI integration with structured prompts and agentic workflows for generating:
- **Commit messages** (traditional and agentic with tool-calling)
- **Release notes** (traditional and agentic with tool-calling)
- **Code review analyses**

Extracted from the kodrdriv project for reusability and broader ecosystem use.

## Installation

```bash
npm install @eldrforge/ai-service
```

## Dependencies

- `openai` - OpenAI API client
- `@riotprompt/riotprompt` - Structured prompt builder
- `@eldrforge/git-tools` - Utility functions

## Features

### Traditional Content Generation
- Structured prompt generation for commits, releases, and reviews
- OpenAI API integration with retry logic
- Interactive user feedback and editing
- Audio transcription support

### Agentic Mode (NEW)
- **Tool-calling capabilities** for AI-powered investigation
- **13 specialized tools** for release analysis
- **8 tools** for commit analysis
- **Self-reflection** reports with tool effectiveness metrics
- **Iterative refinement** with configurable limits

## Usage

### Release Notes Generation

#### Traditional Mode

```typescript
import { createReleasePrompt, createCompletionWithRetry } from '@eldrforge/ai-service';

// Create prompt
const { prompt, maxTokens, isLargeRelease } = await createReleasePrompt(
  { overridePaths: [], overrides: true },
  {
    logContent: 'git log output',
    diffContent: 'git diff output',
    releaseFocus: 'Performance improvements',
    milestoneIssues: 'Issue #1: Bug fix',
  },
  {
    context: 'Major release',
    directories: ['src'],
  }
);

// Generate release notes
const result = await createCompletionWithRetry(
  prompt.messages,
  {
    model: 'gpt-4o',
    maxTokens,
    responseFormat: { type: 'json_object' },
  }
);
```

#### Agentic Mode (NEW)

```typescript
import { runAgenticRelease } from '@eldrforge/ai-service';

const result = await runAgenticRelease({
  fromRef: 'v1.0.0',
  toRef: 'HEAD',
  logContent: 'git log output',
  diffContent: 'git diff output',
  milestoneIssues: 'Issue #1: Bug fix',
  releaseFocus: 'Performance improvements',
  userContext: 'Major release',
  model: 'gpt-4o',
  maxIterations: 30, // Default for releases
  storage: storageAdapter,
  logger: loggerAdapter,
});

// result.releaseNotes = { title: string, body: string }
// result.iterations = number of iterations used
// result.toolCallsExecuted = number of tool calls made
// result.toolMetrics = detailed metrics for each tool call
```

### Commit Message Generation

#### Traditional Mode

```typescript
import { createCommitPrompt, createCompletionWithRetry } from '@eldrforge/ai-service';

const { prompt } = await createCommitPrompt(
  { overridePaths: [], overrides: true },
  {
    diffContent: 'git diff --staged',
    logContext: 'Recent commits',
    userDirection: 'Focus on API changes',
  },
  {
    context: 'Refactoring',
    directories: ['src/api'],
  }
);

const commitMessage = await createCompletionWithRetry(
  prompt.messages,
  { model: 'gpt-4o' }
);
```

#### Agentic Mode

```typescript
import { runAgenticCommit } from '@eldrforge/ai-service';

const result = await runAgenticCommit({
  changedFiles: ['src/api/users.ts', 'src/api/auth.ts'],
  diffContent: 'git diff --staged',
  userDirection: 'Focus on API changes',
  logContext: 'Recent commits',
  model: 'gpt-4o',
  maxIterations: 10, // Default for commits
  storage: storageAdapter,
  logger: loggerAdapter,
});

// result.commitMessage = string
// result.suggestedSplits = array of split suggestions
// result.toolMetrics = detailed metrics
```

## Agentic Mode

### Release-Specific Tools (13 total)

**Investigation Tools** (inherited from commit generation):
1. `get_file_history` - View commit history for files
2. `get_file_content` - Read full file contents
3. `search_codebase` - Search for patterns
4. `get_related_tests` - Find related test files
5. `get_file_dependencies` - Analyze dependencies
6. `analyze_diff_section` - Get expanded context
7. `get_recent_commits` - See recent changes
8. `group_files_by_concern` - Identify logical groupings

**Release-Specific Tools** (unique to release generation):
9. `get_tag_history` - View previous release tags
10. `compare_previous_release` - Compare with previous versions
11. `get_release_stats` - Get comprehensive statistics
12. `get_breaking_changes` - Identify breaking changes
13. `analyze_commit_patterns` - Find themes and patterns

### Commit-Specific Tools (8 total)

Tools 1-8 from above (investigation tools only).

### Tool Registry

```typescript
import { createToolRegistry, createReleaseTools, createCommitTools } from '@eldrforge/ai-service';

// For release notes
const registry = createToolRegistry({
  workingDirectory: process.cwd(),
  storage: storageAdapter,
  logger: loggerAdapter,
});
const tools = createReleaseTools();
registry.registerAll(tools);

// For commits
const commitTools = createCommitTools();
registry.registerAll(commitTools);
```

## Interactive Features

```typescript
import {
  getUserChoice,
  editContentInEditor,
  getLLMFeedbackInEditor,
  requireTTY,
  STANDARD_CHOICES,
} from '@eldrforge/ai-service';

// Get user choice
const choice = await getUserChoice(
  'What would you like to do?',
  [STANDARD_CHOICES.CONFIRM, STANDARD_CHOICES.EDIT],
  { nonTtyErrorSuggestions: ['Use --dry-run'] }
);

// Edit in editor
const result = await editContentInEditor(
  'Initial content',
  ['# Instructions', '# Edit below'],
  '.md'
);

// Get LLM feedback
const feedback = await getLLMFeedbackInEditor(
  'release notes',
  'Current content'
);

// Require TTY
requireTTY('This feature requires a terminal');
```

## API Reference

### Types

```typescript
// Release Types
interface AgenticReleaseConfig {
  fromRef: string;
  toRef: string;
  logContent: string;
  diffContent: string;
  milestoneIssues?: string;
  releaseFocus?: string;
  userContext?: string;
  model?: string;
  maxIterations?: number; // Default: 30
  debug?: boolean;
  storage?: StorageAdapter;
  logger?: Logger;
  openaiReasoning?: 'low' | 'medium' | 'high';
}

interface AgenticReleaseResult {
  releaseNotes: { title: string; body: string };
  iterations: number;
  toolCallsExecuted: number;
  conversationHistory: ChatCompletionMessageParam[];
  toolMetrics: ToolExecutionMetric[];
}

// Commit Types
interface AgenticCommitConfig {
  changedFiles: string[];
  diffContent: string;
  userDirection?: string;
  logContext?: string;
  model?: string;
  maxIterations?: number; // Default: 10
  debug?: boolean;
  storage?: StorageAdapter;
  logger?: Logger;
  openaiReasoning?: 'low' | 'medium' | 'high';
}

interface AgenticCommitResult {
  commitMessage: string;
  iterations: number;
  toolCallsExecuted: number;
  suggestedSplits: Array<{
    files: string[];
    message: string;
    rationale: string;
  }>;
  conversationHistory: ChatCompletionMessageParam[];
  toolMetrics: ToolExecutionMetric[];
}

// Tool Metrics
interface ToolExecutionMetric {
  name: string;
  success: boolean;
  duration: number;
  error?: string;
  iteration: number;
  timestamp: string;
}
```

### Exports

```typescript
// Prompt generation
export { createCommitPrompt } from './prompts/commit';
export { createReleasePrompt } from './prompts/release';
export { createReviewPrompt } from './prompts/review';

// Agentic execution
export { runAgenticCommit } from './agentic/commit';
export { runAgenticRelease } from './agentic/release';
export { runAgentic } from './agentic/executor';

// Tools
export { createToolRegistry } from './tools/registry';
export { createCommitTools } from './tools/commit-tools';
export { createReleaseTools } from './tools/release-tools';

// OpenAI integration
export {
  createCompletion,
  createCompletionWithRetry,
  transcribeAudio,
} from './ai';

// Interactive features
export {
  getUserChoice,
  getUserText,
  editContentInEditor,
  getLLMFeedbackInEditor,
  requireTTY,
  STANDARD_CHOICES,
} from './interactive';

// Types
export type { StorageAdapter, Logger } from './types';
export type { Tool, ToolContext } from './tools/types';
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Test
npm run test

# Lint
npm run lint
```

## License

Apache-2.0

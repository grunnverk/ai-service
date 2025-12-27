# @eldrforge/ai-service

AI-powered content generation library with agentic capabilities for commit messages, release notes, and code reviews.

## Overview

`@eldrforge/ai-service` is a TypeScript library that provides intelligent content generation powered by OpenAI's GPT models. It was extracted from the [kodrdriv](https://github.com/calenvarek/kodrdriv) automation tool to enable standalone use in any Node.js application.

### Key Features

- **🤖 Agentic AI Mode**: Advanced tool-calling capabilities that allow the AI to investigate codebases, analyze history, and understand context deeply before generating content
- **📝 Traditional Mode**: Direct prompt-based generation for faster, simpler use cases
- **🔧 Extensible Tool System**: 13+ specialized tools for codebase investigation and analysis
- **💬 Interactive Features**: Built-in user prompts, editor integration, and feedback loops
- **🎯 Structured Prompts**: Leverages [@riotprompt/riotprompt](https://www.npmjs.com/package/@riotprompt/riotprompt) for consistent, high-quality prompt engineering
- **📊 Detailed Metrics**: Track tool usage, iterations, and AI reasoning effectiveness
- **🔌 Flexible Integration**: Adapter-based design for easy integration with any storage or logging system

### Use Cases

- Generate commit messages from staged changes
- Create comprehensive release notes from version diffs
- Perform code review analysis
- Automate documentation generation
- Integrate AI-powered code understanding into your tools

## Installation

```bash
npm install @eldrforge/ai-service
```

### Required Dependencies

```bash
npm install openai @riotprompt/riotprompt @eldrforge/git-tools
```

### Optional Dependencies

```bash
npm install winston  # For logging support
```

## Quick Start

### 1. Setup OpenAI API Key

```typescript
import { createCompletion } from '@eldrforge/ai-service';

// Set your OpenAI API key
process.env.OPENAI_API_KEY = 'sk-...';
```

### 2. Generate a Commit Message (Traditional Mode)

```typescript
import { createCommitPrompt, createCompletionWithRetry } from '@eldrforge/ai-service';
import { execSync } from 'child_process';

// Get staged diff
const diffContent = execSync('git diff --staged', { encoding: 'utf8' });

// Create prompt
const { prompt } = await createCommitPrompt(
  { overridePaths: [], overrides: true },
  { diffContent },
  { context: 'Feature development', directories: ['src'] }
);

// Generate commit message
const response = await createCompletionWithRetry(prompt.messages, {
  model: 'gpt-4o-mini',
});

console.log('Suggested commit message:', response.choices[0].message.content);
```

### 3. Generate Release Notes (Agentic Mode)

```typescript
import { runAgenticRelease } from '@eldrforge/ai-service';
import { execSync } from 'child_process';

// Get git log and diff between versions
const logContent = execSync('git log v1.0.0..HEAD --oneline', { encoding: 'utf8' });
const diffContent = execSync('git diff v1.0.0..HEAD --stat', { encoding: 'utf8' });

// Run agentic release notes generation
const result = await runAgenticRelease({
  fromRef: 'v1.0.0',
  toRef: 'HEAD',
  logContent,
  diffContent,
  releaseFocus: 'Performance improvements and bug fixes',
  model: 'gpt-4o',
  maxIterations: 30,
});

console.log('Title:', result.releaseNotes.title);
console.log('Body:', result.releaseNotes.body);
console.log('Iterations:', result.iterations);
console.log('Tools used:', result.toolCallsExecuted);
```

## Complete Examples

### Example 1: Standalone Commit Message Generator

Create a complete CLI tool for generating commit messages:

```typescript
#!/usr/bin/env node
import { runAgenticCommit } from '@eldrforge/ai-service';
import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

// Simple storage adapter that writes to ./output
const storageAdapter = {
  async writeOutput(fileName: string, content: string): Promise<void> {
    const dir = path.join(process.cwd(), 'output');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, fileName), content, 'utf8');
  },
  async readTemp(fileName: string): Promise<string> {
    return fs.readFile(path.join('/tmp', fileName), 'utf8');
  },
  async writeTemp(fileName: string, content: string): Promise<void> {
    await fs.writeFile(path.join('/tmp', fileName), content, 'utf8');
  },
  async readFile(fileName: string): Promise<string> {
    return fs.readFile(fileName, 'utf8');
  },
};

// Simple console logger
const logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
  debug: (msg: string) => console.debug(`[DEBUG] ${msg}`),
};

async function main() {
  try {
    // Get staged changes
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    const changedFiles = status
      .split('\n')
      .filter(line => line.startsWith('M ') || line.startsWith('A '))
      .map(line => line.substring(3));

    if (changedFiles.length === 0) {
      console.log('No staged changes found. Stage some changes first with: git add <files>');
      process.exit(1);
    }

    // Get the diff
    const diffContent = execSync('git diff --staged', { encoding: 'utf8' });

    // Get recent commits for context
    const logContext = execSync('git log --oneline -5', { encoding: 'utf8' });

    console.log('🤖 Generating commit message...\n');

    // Run agentic commit generation
    const result = await runAgenticCommit({
      changedFiles,
      diffContent,
      logContext,
      model: 'gpt-4o-mini',
      maxIterations: 10,
      storage: storageAdapter,
      logger,
    });

    console.log('\n✨ Suggested Commit Message:\n');
    console.log(result.commitMessage);
    console.log('\n---');
    console.log(`📊 Used ${result.toolCallsExecuted} tool calls in ${result.iterations} iterations`);

    // Show suggested splits if any
    if (result.suggestedSplits.length > 0) {
      console.log('\n💡 Suggested Commit Splits:\n');
      result.suggestedSplits.forEach((split, idx) => {
        console.log(`\nSplit ${idx + 1}:`);
        console.log(`Files: ${split.files.join(', ')}`);
        console.log(`Rationale: ${split.rationale}`);
        console.log(`Message: ${split.message}`);
      });
    }

    // Optionally save the message to a file
    await storageAdapter.writeOutput('commit-message.txt', result.commitMessage);
    console.log('\n💾 Commit message saved to: output/commit-message.txt');

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
```

Save as `generate-commit.ts` and run with:

```bash
npx tsx generate-commit.ts
```

### Example 2: Release Notes Generator for GitHub Releases

Automatically generate release notes and create GitHub releases:

```typescript
import { runAgenticRelease } from '@eldrforge/ai-service';
import { execSync } from 'child_process';
import { Octokit } from '@octokit/rest';
import * as fs from 'fs/promises';

interface ReleaseConfig {
  owner: string;
  repo: string;
  fromTag: string;
  toTag?: string;
  githubToken: string;
}

async function createGitHubRelease(config: ReleaseConfig) {
  const { owner, repo, fromTag, toTag = 'HEAD', githubToken } = config;

  // Simple storage adapter
  const storage = {
    writeOutput: async (fileName: string, content: string) => {
      await fs.mkdir('output', { recursive: true });
      await fs.writeFile(`output/${fileName}`, content);
    },
    readTemp: async (fileName: string) => fs.readFile(`/tmp/${fileName}`, 'utf8'),
    writeTemp: async (fileName: string, content: string) =>
      fs.writeFile(`/tmp/${fileName}`, content),
    readFile: async (fileName: string) => fs.readFile(fileName, 'utf8'),
  };

  const logger = {
    info: console.log,
    error: console.error,
    warn: console.warn,
    debug: console.debug,
  };

  try {
    // Get git information
    const logContent = execSync(
      `git log ${fromTag}..${toTag} --pretty=format:"%h %s (%an)" --abbrev-commit`,
      { encoding: 'utf8' }
    );

    const diffContent = execSync(
      `git diff ${fromTag}..${toTag} --stat`,
      { encoding: 'utf8' }
    );

    console.log(`🔍 Analyzing changes from ${fromTag} to ${toTag}...\n`);

    // Generate release notes using agentic mode
    const result = await runAgenticRelease({
      fromRef: fromTag,
      toRef: toTag,
      logContent,
      diffContent,
      model: 'gpt-4o',
      maxIterations: 30,
      storage,
      logger,
    });

    console.log('✅ Release notes generated!\n');
    console.log(`Title: ${result.releaseNotes.title}`);
    console.log(`\nBody:\n${result.releaseNotes.body}`);
    console.log(`\n📊 Metrics: ${result.toolCallsExecuted} tool calls, ${result.iterations} iterations`);

    // Save to file
    await storage.writeOutput('release-notes.md', result.releaseNotes.body);
    await storage.writeOutput('release-title.txt', result.releaseNotes.title);

    // Create GitHub release
    const octokit = new Octokit({ auth: githubToken });

    const release = await octokit.repos.createRelease({
      owner,
      repo,
      tag_name: toTag === 'HEAD' ? 'v1.0.0' : toTag, // Adjust as needed
      name: result.releaseNotes.title,
      body: result.releaseNotes.body,
      draft: true, // Create as draft for review
    });

    console.log(`\n🎉 Draft release created: ${release.data.html_url}`);

    return result;
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

// Usage
createGitHubRelease({
  owner: 'yourorg',
  repo: 'yourrepo',
  fromTag: 'v0.1.0',
  toTag: 'v0.2.0',
  githubToken: process.env.GITHUB_TOKEN || '',
});
```

### Example 3: Custom Tool Integration

Create custom tools for domain-specific analysis:

```typescript
import {
  createToolRegistry,
  type Tool,
  type ToolContext,
  runAgentic
} from '@eldrforge/ai-service';

// Create a custom tool
const checkTestCoverage: Tool = {
  name: 'check_test_coverage',
  description: 'Check test coverage for specific files or entire project',
  parameters: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Optional file path to check coverage for. If omitted, checks entire project.',
      },
    },
  },
  execute: async (params: { filePath?: string }, context?: ToolContext) => {
    const { execSync } = await import('child_process');

    try {
      // Run coverage check
      const cmd = params.filePath
        ? `npm test -- --coverage --testPathPattern="${params.filePath}"`
        : 'npm test -- --coverage';

      const output = execSync(cmd, {
        encoding: 'utf8',
        cwd: context?.workingDirectory || process.cwd(),
      });

      // Parse coverage output
      const coverageMatch = output.match(/All files.*?(\d+\.?\d*)\s*\|/);
      const coverage = coverageMatch ? parseFloat(coverageMatch[1]) : 0;

      return {
        success: true,
        coverage,
        message: `Coverage: ${coverage}%`,
        details: output,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// Use custom tool in agentic workflow
async function analyzeWithCustomTools() {
  const registry = createToolRegistry({
    workingDirectory: process.cwd(),
  });

  // Register custom tool
  registry.register(checkTestCoverage);

  // You can also register built-in tools
  const { createCommitTools } = await import('@eldrforge/ai-service');
  const commitTools = createCommitTools();
  registry.registerAll(commitTools);

  // Run agentic analysis with custom tools
  const messages = [
    {
      role: 'system' as const,
      content: 'You are a code quality analyst. Use available tools to assess code changes.',
    },
    {
      role: 'user' as const,
      content: 'Analyze the current changes and check if test coverage is adequate.',
    },
  ];

  const result = await runAgentic({
    messages,
    tools: registry,
    model: 'gpt-4o',
    maxIterations: 15,
  });

  console.log('Analysis Result:', result.finalMessage);
  console.log('Tools used:', result.toolCallsExecuted);

  return result;
}
```

### Example 4: Interactive Commit Flow

Create an interactive commit workflow with user feedback:

```typescript
import {
  runAgenticCommit,
  getUserChoice,
  editContentInEditor,
  STANDARD_CHOICES
} from '@eldrforge/ai-service';
import { execSync } from 'child_process';

async function interactiveCommit() {
  // Get staged changes
  const diffContent = execSync('git diff --staged', { encoding: 'utf8' });
  const statusOutput = execSync('git status --porcelain', { encoding: 'utf8' });
  const changedFiles = statusOutput
    .split('\n')
    .filter(line => line.trim())
    .map(line => line.substring(3));

  if (changedFiles.length === 0) {
    console.log('No staged changes. Run: git add <files>');
    return;
  }

  console.log('📝 Changed files:', changedFiles.join(', '), '\n');

  // Generate initial commit message
  const result = await runAgenticCommit({
    changedFiles,
    diffContent,
    model: 'gpt-4o-mini',
  });

  console.log('\n✨ Generated Commit Message:\n');
  console.log(result.commitMessage);
  console.log('\n---\n');

  // Interactive loop
  let finalMessage = result.commitMessage;
  let shouldContinue = true;

  while (shouldContinue) {
    const choice = await getUserChoice(
      'What would you like to do?',
      [
        STANDARD_CHOICES.CONFIRM,
        STANDARD_CHOICES.EDIT,
        STANDARD_CHOICES.SKIP,
      ]
    );

    switch (choice) {
      case 'c': // Confirm
        // Create the commit
        execSync(`git commit -m "${finalMessage.replace(/"/g, '\\"')}"`, {
          stdio: 'inherit',
        });
        console.log('✅ Commit created successfully!');
        shouldContinue = false;
        break;

      case 'e': // Edit
        const edited = await editContentInEditor(
          finalMessage,
          ['# Edit your commit message below', '# Lines starting with # will be removed'],
          '.txt'
        );
        finalMessage = edited.content;
        console.log('\n📝 Updated commit message:\n');
        console.log(finalMessage);
        console.log('\n---\n');
        break;

      case 's': // Skip
        console.log('⏭️  Commit cancelled.');
        shouldContinue = false;
        break;
    }
  }
}

interactiveCommit();
```

## Core Concepts

### Agentic vs Traditional Mode

**Traditional Mode**:
- Direct prompt-based generation
- Fast and straightforward
- Good for simple use cases
- Lower token usage

**Agentic Mode**:
- AI uses tools to investigate the codebase
- More thorough and context-aware
- Better for complex changes
- Higher token usage but more accurate results

### Tool System

The library provides built-in tools for code analysis:

#### Commit Tools (8 tools)
1. `get_file_history` - View commit history for files
2. `get_file_content` - Read full file contents
3. `search_codebase` - Search for patterns
4. `get_related_tests` - Find related test files
5. `get_file_dependencies` - Analyze import dependencies
6. `analyze_diff_section` - Get expanded diff context
7. `get_recent_commits` - See recent commit messages
8. `group_files_by_concern` - Identify logical groupings

#### Release Tools (13 tools)
- All commit tools plus:
9. `get_tag_history` - View previous release tags
10. `compare_previous_release` - Compare with previous versions
11. `get_release_stats` - Get comprehensive statistics
12. `get_breaking_changes` - Identify breaking changes
13. `analyze_commit_patterns` - Find themes and patterns

### Adapters

The library uses adapters to remain flexible and framework-agnostic:

#### Storage Adapter

```typescript
interface StorageAdapter {
  writeOutput(fileName: string, content: string): Promise<void>;
  readTemp(fileName: string): Promise<string>;
  writeTemp(fileName: string, content: string): Promise<void>;
  readFile(fileName: string, encoding?: string): Promise<string>;
}
```

#### Logger Adapter

```typescript
interface Logger {
  info(message: string, ...meta: unknown[]): void;
  error(message: string, ...meta: unknown[]): void;
  warn(message: string, ...meta: unknown[]): void;
  debug(message: string, ...meta: unknown[]): void;
}
```

## API Reference

### Agentic Functions

#### `runAgenticCommit(config: AgenticCommitConfig): Promise<AgenticCommitResult>`

Generate commit messages with AI tool-calling capabilities.

**Config Options:**
```typescript
interface AgenticCommitConfig {
  changedFiles: string[];              // List of changed file paths
  diffContent: string;                 // Git diff output
  userDirection?: string;              // Optional user guidance
  logContext?: string;                 // Recent commit history
  model?: string;                      // OpenAI model (default: 'gpt-4o')
  maxIterations?: number;              // Max tool-calling iterations (default: 10)
  debug?: boolean;                     // Enable debug output
  debugRequestFile?: string;           // File to save debug requests
  debugResponseFile?: string;          // File to save debug responses
  storage?: StorageAdapter;            // Storage adapter for file operations
  logger?: Logger;                     // Logger adapter
  openaiReasoning?: 'low' | 'medium' | 'high'; // Reasoning effort level
}
```

**Returns:**
```typescript
interface AgenticCommitResult {
  commitMessage: string;               // Generated commit message
  iterations: number;                  // Number of iterations used
  toolCallsExecuted: number;           // Number of tool calls made
  suggestedSplits: Array<{            // Optional split suggestions
    files: string[];
    message: string;
    rationale: string;
  }>;
  conversationHistory: ChatCompletionMessageParam[]; // Full conversation
  toolMetrics: ToolExecutionMetric[];  // Tool usage metrics
}
```

#### `runAgenticRelease(config: AgenticReleaseConfig): Promise<AgenticReleaseResult>`

Generate release notes with AI tool-calling capabilities.

**Config Options:**
```typescript
interface AgenticReleaseConfig {
  fromRef: string;                     // Starting git ref (e.g., 'v1.0.0')
  toRef: string;                       // Ending git ref (e.g., 'HEAD')
  logContent: string;                  // Git log output
  diffContent: string;                 // Git diff output
  milestoneIssues?: string;            // GitHub milestone issues
  releaseFocus?: string;               // Focus area for release
  userContext?: string;                // Additional context
  model?: string;                      // OpenAI model (default: 'gpt-4o')
  maxIterations?: number;              // Max iterations (default: 30)
  debug?: boolean;                     // Enable debug output
  debugRequestFile?: string;           // Debug request file
  debugResponseFile?: string;          // Debug response file
  storage?: StorageAdapter;            // Storage adapter
  logger?: Logger;                     // Logger adapter
  openaiReasoning?: 'low' | 'medium' | 'high'; // Reasoning level
}
```

**Returns:**
```typescript
interface AgenticReleaseResult {
  releaseNotes: {
    title: string;                     // Release title
    body: string;                      // Release notes markdown
  };
  iterations: number;                  // Iterations used
  toolCallsExecuted: number;           // Tool calls made
  conversationHistory: ChatCompletionMessageParam[]; // Full conversation
  toolMetrics: ToolExecutionMetric[];  // Tool usage metrics
}
```

#### `runAgentic(config: AgenticConfig): Promise<AgenticResult>`

Low-level agentic execution for custom workflows.

### Traditional Prompt Functions

#### `createCommitPrompt(pathConfig, promptConfig, commandConfig)`

Create a structured prompt for commit message generation.

```typescript
const { prompt, maxTokens } = await createCommitPrompt(
  { overridePaths: [], overrides: true },
  {
    diffContent: string,
    logContext?: string,
    userDirection?: string,
    transcriptionText?: string,
  },
  {
    context?: string,
    directories?: string[],
  }
);
```

#### `createReleasePrompt(pathConfig, promptConfig, commandConfig)`

Create a structured prompt for release notes generation.

```typescript
const { prompt, maxTokens, isLargeRelease } = await createReleasePrompt(
  { overridePaths: [], overrides: true },
  {
    logContent: string,
    diffContent: string,
    releaseFocus?: string,
    milestoneIssues?: string,
    transcriptionText?: string,
  },
  {
    context?: string,
    directories?: string[],
  }
);
```

#### `createReviewPrompt(pathConfig, promptConfig, commandConfig)`

Create a structured prompt for code review analysis.

### OpenAI Integration

#### `createCompletion(messages, options)`

Create a chat completion with OpenAI.

```typescript
const response = await createCompletion(
  messages: ChatCompletionMessageParam[],
  {
    model?: string,
    maxTokens?: number,
    temperature?: number,
    responseFormat?: { type: 'json_object' | 'text' },
  }
);
```

#### `createCompletionWithRetry(messages, options, maxRetries?)`

Create a chat completion with automatic retry logic.

```typescript
const response = await createCompletionWithRetry(
  messages,
  options,
  maxRetries: number = 3
);
```

#### `transcribeAudio(audioPath, options?)`

Transcribe audio files using OpenAI Whisper.

```typescript
const transcription = await transcribeAudio(
  audioPath: string,
  {
    model?: string,
    language?: string,
    prompt?: string,
  }
);
```

### Interactive Functions

#### `getUserChoice(prompt, choices, options?)`

Get a single-key choice from the user.

```typescript
const choice = await getUserChoice(
  'What would you like to do?',
  [
    { key: 'c', label: 'Confirm' },
    { key: 'e', label: 'Edit' },
    { key: 's', label: 'Skip' },
  ],
  { nonTtyErrorSuggestions: ['Use --dry-run'] }
);
```

#### `getUserTextInput(prompt, options?)`

Get multi-line text input from the user.

```typescript
const userInput = await getUserTextInput(
  'Provide additional context:',
  { logger }
);
```

#### `editContentInEditor(content, templateLines?, extension?, editor?, logger?)`

Open content in user's editor for editing.

```typescript
const result = await editContentInEditor(
  'Initial content',
  ['# Edit your content below'],
  '.md',
  process.env.EDITOR,
  logger
);

console.log(result.content);
console.log(result.wasEdited);
```

#### `getLLMFeedbackInEditor(contentType, currentContent, editor?, logger?)`

Get structured feedback from user via editor for LLM improvement loop.

```typescript
const feedback = await getLLMFeedbackInEditor(
  'commit message',
  currentCommitMessage,
  undefined,
  logger
);
```

#### `requireTTY(errorMessage?, logger?)`

Ensure the process is running in a TTY (terminal).

```typescript
requireTTY('This feature requires a terminal');
```

### Tool System

#### `createToolRegistry(context)`

Create a tool registry for managing tools.

```typescript
const registry = createToolRegistry({
  workingDirectory: process.cwd(),
  storage: storageAdapter,
  logger: loggerAdapter,
});
```

#### `createCommitTools()`

Get all commit-specific tools.

```typescript
const tools = createCommitTools();
registry.registerAll(tools);
```

#### `createReleaseTools()`

Get all release-specific tools (includes commit tools).

```typescript
const tools = createReleaseTools();
registry.registerAll(tools);
```

## Configuration

### Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-...           # Your OpenAI API key

# Optional
EDITOR=code --wait              # Editor for interactive editing
OPENAI_BASE_URL=https://...     # Custom OpenAI API endpoint
```

### Model Selection

Choose the appropriate model based on your needs:

```typescript
// Fast and economical
model: 'gpt-4o-mini'

// Balanced performance
model: 'gpt-4o'

// Maximum capability (reasoning models)
model: 'o1-preview'
model: 'o1-mini'
```

### Reasoning Levels

For reasoning models, control the effort level:

```typescript
openaiReasoning: 'low'     // Faster, less thorough
openaiReasoning: 'medium'  // Balanced
openaiReasoning: 'high'    // Most thorough, slower
```

## Advanced Usage

### Custom Storage Backend

Implement your own storage backend:

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const s3Storage = {
  async writeOutput(fileName: string, content: string): Promise<void> {
    const s3 = new S3Client({ region: 'us-east-1' });
    await s3.send(new PutObjectCommand({
      Bucket: 'my-bucket',
      Key: `output/${fileName}`,
      Body: content,
    }));
  },

  async readTemp(fileName: string): Promise<string> {
    // Implementation
  },

  async writeTemp(fileName: string, content: string): Promise<void> {
    // Implementation
  },

  async readFile(fileName: string): Promise<string> {
    // Implementation
  },
};

// Use with agentic functions
await runAgenticCommit({
  changedFiles,
  diffContent,
  storage: s3Storage,
});
```

### Custom Logger Integration

Use Winston, Pino, or any other logger:

```typescript
import winston from 'winston';

const winstonLogger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

await runAgenticRelease({
  fromRef: 'v1.0.0',
  toRef: 'HEAD',
  logContent,
  diffContent,
  logger: winstonLogger,
});
```

### Monitoring Tool Usage

Track which tools are being used and how effective they are:

```typescript
const result = await runAgenticCommit({
  changedFiles,
  diffContent,
  model: 'gpt-4o',
});

// Analyze tool metrics
result.toolMetrics.forEach(metric => {
  console.log(`Tool: ${metric.name}`);
  console.log(`  Success: ${metric.success}`);
  console.log(`  Duration: ${metric.duration}ms`);
  console.log(`  Iteration: ${metric.iteration}`);
  if (metric.error) {
    console.log(`  Error: ${metric.error}`);
  }
});

// Identify most used tools
const toolUsage = result.toolMetrics.reduce((acc, metric) => {
  acc[metric.name] = (acc[metric.name] || 0) + 1;
  return acc;
}, {} as Record<string, number>);

console.log('Tool usage:', toolUsage);
```

### Debugging

Enable debug mode to see all AI interactions:

```typescript
const result = await runAgenticCommit({
  changedFiles,
  diffContent,
  debug: true,
  debugRequestFile: 'debug/request.json',
  debugResponseFile: 'debug/response.json',
  storage: storageAdapter,
});

// Check the debug files to see:
// - All messages sent to OpenAI
// - Tool calls and responses
// - Complete conversation history
```

## Best Practices

### 1. Choose the Right Mode

- Use **Traditional Mode** for:
  - Simple, obvious changes
  - Quick iterations during development
  - Cost-sensitive operations
  - Well-understood codebases

- Use **Agentic Mode** for:
  - Complex multi-file changes
  - Release notes requiring deep analysis
  - Unfamiliar codebases
  - High-quality, thorough documentation

### 2. Provide Context

The more context you provide, the better the results:

```typescript
await runAgenticCommit({
  changedFiles,
  diffContent,
  userDirection: 'This refactors the authentication system to use OAuth2',
  logContext: recentCommits,  // Provide recent commit history
});
```

### 3. Configure Iteration Limits

Balance thoroughness with cost:

```typescript
// For commits: 5-15 iterations is usually sufficient
maxIterations: 10

// For releases: 20-40 iterations for comprehensive analysis
maxIterations: 30
```

### 4. Handle Errors Gracefully

```typescript
try {
  const result = await runAgenticCommit({
    changedFiles,
    diffContent,
  });

  // Use the result
  console.log(result.commitMessage);
} catch (error) {
  if (error.message.includes('API key')) {
    console.error('OpenAI API key not configured');
  } else if (error.message.includes('rate limit')) {
    console.error('Rate limit exceeded, try again later');
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### 5. Implement Rate Limiting

If you're processing many requests:

```typescript
import pLimit from 'p-limit';

const limit = pLimit(3); // Max 3 concurrent requests

const commits = await Promise.all(
  changedFileSets.map(files =>
    limit(() => runAgenticCommit({ changedFiles: files, diffContent }))
  )
);
```

## Troubleshooting

### "OpenAI API key not found"

Ensure your API key is set:

```bash
export OPENAI_API_KEY=sk-...
```

Or set it programmatically:

```typescript
process.env.OPENAI_API_KEY = 'sk-...';
```

### "Interactive mode requires a terminal"

This error occurs when trying to use interactive features in non-TTY environments (e.g., CI/CD):

```typescript
// Check before using interactive features
if (process.stdin.isTTY) {
  const choice = await getUserChoice(prompt, choices);
} else {
  // Use default behavior
  console.log('Non-interactive mode, using defaults');
}
```

### "Rate limit exceeded"

OpenAI has rate limits. Implement retry logic:

```typescript
import { createCompletionWithRetry } from '@eldrforge/ai-service';

// This already includes retry logic
const response = await createCompletionWithRetry(
  messages,
  options,
  5  // Max 5 retries
);
```

### "Tool execution failed"

Tool failures are logged in the metrics. Check them:

```typescript
const result = await runAgenticCommit({ ... });

const failedTools = result.toolMetrics.filter(m => !m.success);
failedTools.forEach(tool => {
  console.error(`Tool ${tool.name} failed: ${tool.error}`);
});
```

### "Model not found"

Ensure you're using a valid OpenAI model:

```typescript
// Valid models as of 2024
const validModels = [
  'gpt-4o',
  'gpt-4o-mini',
  'o1-preview',
  'o1-mini',
  'gpt-4-turbo',
  'gpt-3.5-turbo',
];
```

## TypeScript Support

The library is written in TypeScript and exports all types:

```typescript
import type {
  AgenticCommitConfig,
  AgenticCommitResult,
  AgenticReleaseConfig,
  AgenticReleaseResult,
  StorageAdapter,
  Logger,
  Tool,
  ToolContext,
  ToolExecutionMetric,
  Choice,
  InteractiveOptions,
  EditorOptions,
  AIConfig,
} from '@eldrforge/ai-service';
```

## Performance Considerations

### Token Usage

Agentic mode uses more tokens due to tool-calling:

- **Commit generation**: ~5,000-20,000 tokens
- **Release generation**: ~20,000-100,000 tokens

Monitor usage with the `toolMetrics` data.

### Execution Time

- **Traditional mode**: 2-10 seconds
- **Agentic mode (commits)**: 10-60 seconds
- **Agentic mode (releases)**: 30-180 seconds

### Cost Optimization

1. Use `gpt-4o-mini` for development and testing
2. Limit `maxIterations` for cost control
3. Cache results when possible
4. Use traditional mode for simple cases

## Contributing

Contributions are welcome! This library was extracted from [kodrdriv](https://github.com/calenvarek/kodrdriv).

### Development Setup

```bash
git clone https://github.com/calenvarek/ai-service.git
cd ai-service
npm install
npm run build
npm test
```

### Running Tests

```bash
npm test                    # Run all tests
npm test -- --watch        # Watch mode
npm test -- --coverage     # With coverage
```

## License

Apache-2.0

## Related Projects

- **[kodrdriv](https://github.com/calenvarek/kodrdriv)** - Full automation toolkit that uses this library
- **[@eldrforge/git-tools](https://www.npmjs.com/package/@eldrforge/git-tools)** - Git utility functions
- **[@riotprompt/riotprompt](https://www.npmjs.com/package/@riotprompt/riotprompt)** - Structured prompt builder

## Support

- 📖 [Full Documentation](https://github.com/calenvarek/ai-service)
- 🐛 [Issue Tracker](https://github.com/calenvarek/ai-service/issues)
- 💬 [Discussions](https://github.com/calenvarek/ai-service/discussions)

## Changelog

See [RELEASE_NOTES.md](./RELEASE_NOTES.md) for version history and changes.

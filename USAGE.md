# Usage Guide

Comprehensive guide for using `@eldrforge/ai-service` as a standalone library.

## Table of Contents

- [Installation](#installation)
- [Basic Concepts](#basic-concepts)
- [Agentic vs Traditional Mode](#agentic-vs-traditional-mode)
- [Commit Message Generation](#commit-message-generation)
- [Release Notes Generation](#release-notes-generation)
- [Code Review Analysis](#code-review-analysis)
- [Interactive Features](#interactive-features)
- [Custom Adapters](#custom-adapters)
- [Tool System](#tool-system)
- [Advanced Patterns](#advanced-patterns)
- [Best Practices](#best-practices)

## Installation

### Basic Installation

```bash
npm install @eldrforge/ai-service
```

### Required Dependencies

```bash
npm install openai @riotprompt/riotprompt @eldrforge/git-tools
```

### Optional Dependencies

```bash
npm install winston  # For enhanced logging
```

### TypeScript Support

The library is written in TypeScript and includes full type definitions. No additional `@types` packages needed.

## Basic Concepts

### API Key Configuration

Set your OpenAI API key as an environment variable:

```bash
export OPENAI_API_KEY=sk-...
```

Or set it programmatically:

```typescript
process.env.OPENAI_API_KEY = 'sk-...';
```

### Models

Choose the appropriate model for your use case:

| Model | Speed | Quality | Cost | Best For |
|-------|-------|---------|------|----------|
| gpt-4o-mini | Fast | Good | Low | Development, simple commits |
| gpt-4o | Medium | Excellent | Medium | Production, releases |
| o1-preview | Slow | Best | High | Complex analysis |
| o1-mini | Medium | Very Good | Medium | Balanced reasoning |

### Reasoning Levels

For reasoning models (o1-preview, o1-mini), control the effort:

```typescript
openaiReasoning: 'low'     // Faster, less thorough
openaiReasoning: 'medium'  // Balanced (default)
openaiReasoning: 'high'    // Most thorough, slower
```

## Agentic vs Traditional Mode

### Traditional Mode

**How it works:**
- Single prompt sent to OpenAI
- Direct response generation
- No tool calling

**Pros:**
- Fast (2-10 seconds)
- Lower token usage
- Predictable cost
- Simple to use

**Cons:**
- Limited context understanding
- Can't investigate codebase
- May miss important details

**When to use:**
- Simple, obvious changes
- Quick iterations
- Cost-sensitive operations
- Well-understood codebases

**Example:**

```typescript
import { createCommitPrompt, createCompletionWithRetry } from '@eldrforge/ai-service';

const { prompt } = await createCommitPrompt(
  { overridePaths: [], overrides: true },
  { diffContent: '...' },
  { context: 'Bug fix' }
);

const response = await createCompletionWithRetry(prompt.messages, {
  model: 'gpt-4o-mini',
});
```

### Agentic Mode

**How it works:**
- AI uses tools to investigate
- Iterative analysis process
- Deep context gathering

**Pros:**
- Thorough analysis
- Context-aware results
- Better quality output
- Can handle complexity

**Cons:**
- Slower (10-180 seconds)
- Higher token usage
- Variable cost
- More complex

**When to use:**
- Complex multi-file changes
- Release notes
- Unfamiliar codebases
- High-quality requirements

**Example:**

```typescript
import { runAgenticCommit } from '@eldrforge/ai-service';

const result = await runAgenticCommit({
  changedFiles: ['src/api.ts', 'src/types.ts'],
  diffContent: '...',
  model: 'gpt-4o',
  maxIterations: 10,
});
```

## Commit Message Generation

### Basic Agentic Commit

```typescript
import { runAgenticCommit } from '@eldrforge/ai-service';
import { execSync } from 'child_process';

// Get staged changes
const diffContent = execSync('git diff --staged', { encoding: 'utf8' });
const statusOutput = execSync('git status --porcelain', { encoding: 'utf8' });
const changedFiles = statusOutput
  .split('\n')
  .filter(line => line.trim())
  .map(line => line.substring(3));

// Generate commit message
const result = await runAgenticCommit({
  changedFiles,
  diffContent,
  model: 'gpt-4o-mini',
  maxIterations: 10,
});

console.log(result.commitMessage);
```

### With User Direction

Provide guidance to the AI:

```typescript
const result = await runAgenticCommit({
  changedFiles,
  diffContent,
  userDirection: 'This refactors the authentication system to use OAuth2',
  model: 'gpt-4o-mini',
});
```

### With Recent Commit Context

Help the AI understand the project's commit style:

```typescript
const logContext = execSync('git log --oneline -10', { encoding: 'utf8' });

const result = await runAgenticCommit({
  changedFiles,
  diffContent,
  logContext,
  model: 'gpt-4o-mini',
});
```

### Handling Suggested Splits

The AI may suggest splitting changes into multiple commits:

```typescript
const result = await runAgenticCommit({
  changedFiles,
  diffContent,
  model: 'gpt-4o-mini',
});

if (result.suggestedSplits.length > 0) {
  console.log('AI suggests splitting into multiple commits:');

  result.suggestedSplits.forEach((split, idx) => {
    console.log(`\nCommit ${idx + 1}:`);
    console.log(`Files: ${split.files.join(', ')}`);
    console.log(`Rationale: ${split.rationale}`);
    console.log(`Message: ${split.message}`);
  });
}
```

### Traditional Commit Generation

For faster, simpler generation:

```typescript
import { createCommitPrompt, createCompletionWithRetry } from '@eldrforge/ai-service';

const { prompt } = await createCommitPrompt(
  { overridePaths: [], overrides: true },
  {
    diffContent,
    logContext,
    userDirection: 'Focus on API changes',
  },
  {
    context: 'Feature development',
    directories: ['src/api'],
  }
);

const response = await createCompletionWithRetry(prompt.messages, {
  model: 'gpt-4o-mini',
});

const commitMessage = response.choices[0].message.content;
```

## Release Notes Generation

### Basic Agentic Release

```typescript
import { runAgenticRelease } from '@eldrforge/ai-service';
import { execSync } from 'child_process';

const fromRef = 'v1.0.0';
const toRef = 'v1.1.0';

// Get commit log
const logContent = execSync(
  `git log ${fromRef}..${toRef} --pretty=format:"%h %s (%an)"`,
  { encoding: 'utf8' }
);

// Get diff stats
const diffContent = execSync(
  `git diff ${fromRef}..${toRef} --stat`,
  { encoding: 'utf8' }
);

// Generate release notes
const result = await runAgenticRelease({
  fromRef,
  toRef,
  logContent,
  diffContent,
  model: 'gpt-4o',
  maxIterations: 30,
});

console.log('Title:', result.releaseNotes.title);
console.log('\nBody:\n', result.releaseNotes.body);
```

### With Release Focus

Guide the narrative and emphasis:

```typescript
const result = await runAgenticRelease({
  fromRef,
  toRef,
  logContent,
  diffContent,
  releaseFocus: `This release focuses on performance improvements and bug fixes.

Key themes:
- 40% reduction in API response times
- Fixed critical memory leak in data processing
- Improved error handling across the application`,
  model: 'gpt-4o',
});
```

### With Milestone Issues

Include GitHub issues from a milestone:

```typescript
const milestoneIssues = `
Resolved Issues:
- #123: Fix memory leak in data processor
- #124: Improve API response times
- #125: Add error handling to webhook processor
`;

const result = await runAgenticRelease({
  fromRef,
  toRef,
  logContent,
  diffContent,
  milestoneIssues,
  model: 'gpt-4o',
});
```

### With Additional Context

Provide extra information:

```typescript
const result = await runAgenticRelease({
  fromRef,
  toRef,
  logContent,
  diffContent,
  userContext: `This is a major release with breaking changes.

Migration guide:
- Update configuration format (see docs/migration.md)
- Replace deprecated API endpoints
- Update authentication flow`,
  model: 'gpt-4o',
});
```

### Analyzing Tool Usage

See which tools the AI used:

```typescript
const result = await runAgenticRelease({
  fromRef,
  toRef,
  logContent,
  diffContent,
  model: 'gpt-4o',
});

// Analyze tool metrics
const toolUsage: Record<string, number> = {};
result.toolMetrics.forEach(metric => {
  toolUsage[metric.name] = (toolUsage[metric.name] || 0) + 1;
});

console.log('Tools used:');
Object.entries(toolUsage)
  .sort((a, b) => b[1] - a[1])
  .forEach(([tool, count]) => {
    console.log(`  ${tool}: ${count}x`);
  });
```

## Code Review Analysis

### Basic Review Prompt

```typescript
import { createReviewPrompt, createCompletionWithRetry } from '@eldrforge/ai-service';

const { prompt } = await createReviewPrompt(
  { overridePaths: [], overrides: true },
  {
    diffContent,
    prTitle: 'Add user authentication',
    prDescription: 'Implements OAuth2 authentication flow',
  },
  {
    context: 'Security review',
    directories: ['src/auth'],
  }
);

const response = await createCompletionWithRetry(prompt.messages, {
  model: 'gpt-4o',
});

const review = response.choices[0].message.content;
```

## Interactive Features

### User Choice Prompts

Get single-key input from users:

```typescript
import { getUserChoice, STANDARD_CHOICES } from '@eldrforge/ai-service';

const choice = await getUserChoice(
  'What would you like to do?',
  [
    STANDARD_CHOICES.CONFIRM,
    STANDARD_CHOICES.EDIT,
    STANDARD_CHOICES.SKIP,
  ],
  {
    nonTtyErrorSuggestions: [
      'Use --dry-run for non-interactive mode',
    ],
  }
);

switch (choice) {
  case 'c':
    console.log('Confirmed!');
    break;
  case 'e':
    console.log('Editing...');
    break;
  case 's':
    console.log('Skipped');
    break;
}
```

### Custom Choices

```typescript
const choice = await getUserChoice(
  'Select an option:',
  [
    { key: 'a', label: 'Option A' },
    { key: 'b', label: 'Option B' },
    { key: 'c', label: 'Option C' },
  ]
);
```

### Editor Integration

Open content in user's editor:

```typescript
import { editContentInEditor } from '@eldrforge/ai-service';

const result = await editContentInEditor(
  'Initial commit message',
  [
    '# Edit your commit message below',
    '# Lines starting with # will be removed',
  ],
  '.txt',  // File extension for syntax highlighting
  process.env.EDITOR  // Optional: specify editor
);

console.log('Edited content:', result.content);
console.log('Was edited:', result.wasEdited);
```

### LLM Feedback Loop

Get structured feedback for improvement:

```typescript
import { getLLMFeedbackInEditor } from '@eldrforge/ai-service';

const feedback = await getLLMFeedbackInEditor(
  'commit message',
  currentCommitMessage,
  process.env.EDITOR
);

// Use feedback to regenerate with improvements
const improvedResult = await runAgenticCommit({
  changedFiles,
  diffContent,
  userDirection: feedback,
  model: 'gpt-4o-mini',
});
```

### TTY Requirement Check

Ensure interactive features are available:

```typescript
import { requireTTY } from '@eldrforge/ai-service';

try {
  requireTTY('This feature requires a terminal');

  // Interactive code here
  const choice = await getUserChoice(...);
} catch (error) {
  console.log('Running in non-interactive mode');
  // Fallback behavior
}
```

## Custom Adapters

### Storage Adapter

Implement custom storage for AI-generated content:

```typescript
import { type StorageAdapter } from '@eldrforge/ai-service';
import * as fs from 'fs/promises';
import * as path from 'path';

class MyStorageAdapter implements StorageAdapter {
  constructor(private baseDir: string) {}

  async writeOutput(fileName: string, content: string): Promise<void> {
    const filePath = path.join(this.baseDir, 'output', fileName);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
  }

  async readTemp(fileName: string): Promise<string> {
    const filePath = path.join(this.baseDir, 'temp', fileName);
    return fs.readFile(filePath, 'utf8');
  }

  async writeTemp(fileName: string, content: string): Promise<void> {
    const filePath = path.join(this.baseDir, 'temp', fileName);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
  }

  async readFile(fileName: string): Promise<string> {
    return fs.readFile(fileName, 'utf8');
  }
}

// Use it
const storage = new MyStorageAdapter('/my/project');

const result = await runAgenticCommit({
  changedFiles,
  diffContent,
  storage,
});
```

### Cloud Storage Example

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

class S3StorageAdapter implements StorageAdapter {
  private s3: S3Client;
  private bucket: string;

  constructor(bucket: string, region: string = 'us-east-1') {
    this.s3 = new S3Client({ region });
    this.bucket = bucket;
  }

  async writeOutput(fileName: string, content: string): Promise<void> {
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: `ai-output/${fileName}`,
      Body: content,
      ContentType: 'text/plain',
    }));
  }

  // Implement other methods...
}
```

### Logger Adapter

Integrate with your logging system:

```typescript
import { type Logger } from '@eldrforge/ai-service';
import winston from 'winston';

const winstonLogger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// Use it
const result = await runAgenticCommit({
  changedFiles,
  diffContent,
  logger: winstonLogger,
});
```

### Custom Console Logger

```typescript
const customLogger: Logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
  debug: (msg: string) => console.debug(`[DEBUG] ${msg}`),
};

const result = await runAgenticCommit({
  changedFiles,
  diffContent,
  logger: customLogger,
});
```

## Tool System

### Using Built-in Tools

The library provides 13 tools for release analysis and 8 for commit analysis.

**Commit Tools:**
1. `get_file_history` - View commit history
2. `get_file_content` - Read file contents
3. `search_codebase` - Search patterns
4. `get_related_tests` - Find tests
5. `get_file_dependencies` - Analyze imports
6. `analyze_diff_section` - Expand context
7. `get_recent_commits` - Recent changes
8. `group_files_by_concern` - Logical groupings

**Release Tools (includes all commit tools plus):**
9. `get_tag_history` - Previous releases
10. `compare_previous_release` - Version comparison
11. `get_release_stats` - Statistics
12. `get_breaking_changes` - API changes
13. `analyze_commit_patterns` - Themes

### Creating Custom Tools

```typescript
import { type Tool, createToolRegistry } from '@eldrforge/ai-service';

const myCustomTool: Tool = {
  name: 'check_security',
  description: 'Check for common security issues in code',
  parameters: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'File to check for security issues',
      },
    },
    required: ['filePath'],
  },
  execute: async (params, context) => {
    // Your implementation
    const { filePath } = params;

    // Read file
    const content = await context?.storage?.readFile(filePath);

    // Analyze for security issues
    const issues = analyzeSecurityIssues(content);

    return {
      success: true,
      issuesFound: issues.length,
      issues,
    };
  },
};
```

### Registering Custom Tools

```typescript
import { createToolRegistry, createCommitTools } from '@eldrforge/ai-service';

const registry = createToolRegistry({
  workingDirectory: process.cwd(),
  storage: myStorageAdapter,
  logger: myLogger,
});

// Register built-in tools
const commitTools = createCommitTools();
registry.registerAll(commitTools);

// Register custom tool
registry.register(myCustomTool);

// Use in agentic workflow
const result = await runAgentic({
  messages: [...],
  tools: registry,
  model: 'gpt-4o',
});
```

## Advanced Patterns

### Batch Processing

Process multiple commits:

```typescript
import pLimit from 'p-limit';

const limit = pLimit(3); // Max 3 concurrent requests

const commits = [
  { files: ['a.ts'], diff: '...' },
  { files: ['b.ts'], diff: '...' },
  { files: ['c.ts'], diff: '...' },
];

const results = await Promise.all(
  commits.map(commit =>
    limit(() =>
      runAgenticCommit({
        changedFiles: commit.files,
        diffContent: commit.diff,
        model: 'gpt-4o-mini',
      })
    )
  )
);
```

### Caching Results

Cache AI-generated content:

```typescript
import crypto from 'crypto';

const cache = new Map<string, any>();

async function getCachedCommitMessage(
  changedFiles: string[],
  diffContent: string
): Promise<string> {
  // Create cache key from inputs
  const key = crypto
    .createHash('sha256')
    .update(JSON.stringify({ changedFiles, diffContent }))
    .digest('hex');

  if (cache.has(key)) {
    return cache.get(key);
  }

  const result = await runAgenticCommit({
    changedFiles,
    diffContent,
    model: 'gpt-4o-mini',
  });

  cache.set(key, result.commitMessage);
  return result.commitMessage;
}
```

### Error Handling

Robust error handling:

```typescript
async function generateCommitWithRetry(
  changedFiles: string[],
  diffContent: string,
  maxRetries: number = 3
): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await runAgenticCommit({
        changedFiles,
        diffContent,
        model: 'gpt-4o-mini',
      });
      return result.commitMessage;
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      if (error.message.includes('rate limit')) {
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }

  throw new Error('Max retries exceeded');
}
```

### Monitoring and Metrics

Track usage and performance:

```typescript
interface Metrics {
  totalCalls: number;
  totalTokens: number;
  totalCost: number;
  averageIterations: number;
  toolUsage: Record<string, number>;
}

class MetricsCollector {
  private metrics: Metrics = {
    totalCalls: 0,
    totalTokens: 0,
    totalCost: 0,
    averageIterations: 0,
    toolUsage: {},
  };

  async trackCommit(
    changedFiles: string[],
    diffContent: string
  ): Promise<string> {
    const result = await runAgenticCommit({
      changedFiles,
      diffContent,
      model: 'gpt-4o-mini',
    });

    // Update metrics
    this.metrics.totalCalls++;
    this.metrics.averageIterations =
      (this.metrics.averageIterations * (this.metrics.totalCalls - 1) +
        result.iterations) /
      this.metrics.totalCalls;

    result.toolMetrics.forEach(metric => {
      this.metrics.toolUsage[metric.name] =
        (this.metrics.toolUsage[metric.name] || 0) + 1;
    });

    return result.commitMessage;
  }

  getMetrics(): Metrics {
    return { ...this.metrics };
  }
}
```

## Best Practices

### 1. Choose the Right Mode

- **Use Agentic Mode** for complex changes, releases, unfamiliar code
- **Use Traditional Mode** for simple changes, quick iterations, cost-sensitive ops

### 2. Provide Context

More context = better results:

```typescript
const result = await runAgenticCommit({
  changedFiles,
  diffContent,
  userDirection: 'Refactoring authentication to use OAuth2',
  logContext: recentCommits,
  model: 'gpt-4o-mini',
});
```

### 3. Set Appropriate Iteration Limits

```typescript
// Commits: 5-15 iterations
maxIterations: 10

// Releases: 20-40 iterations
maxIterations: 30

// Complex analysis: 40-60 iterations
maxIterations: 50
```

### 4. Handle Errors Gracefully

```typescript
try {
  const result = await runAgenticCommit({...});
} catch (error) {
  if (error.message.includes('API key')) {
    // Handle API key error
  } else if (error.message.includes('rate limit')) {
    // Handle rate limit
  } else {
    // Handle other errors
  }
}
```

### 5. Monitor Costs

Track token usage and costs:

```typescript
const result = await runAgenticCommit({...});

// Estimate cost (approximate)
const inputTokens = result.conversationHistory
  .map(msg => JSON.stringify(msg).length / 4)
  .reduce((a, b) => a + b, 0);

const estimatedCost = (inputTokens / 1000) * 0.15; // gpt-4o-mini pricing
console.log(`Estimated cost: $${estimatedCost.toFixed(4)}`);
```

### 6. Use Debug Mode During Development

```typescript
const result = await runAgenticCommit({
  changedFiles,
  diffContent,
  debug: true,
  debugRequestFile: 'debug/request.json',
  debugResponseFile: 'debug/response.json',
  storage: myStorage,
});
```

### 7. Implement Rate Limiting

```typescript
import pLimit from 'p-limit';

const limit = pLimit(3); // Max 3 concurrent API calls

const results = await Promise.all(
  items.map(item => limit(() => runAgenticCommit({...})))
);
```

### 8. Cache When Possible

Avoid regenerating identical content:

```typescript
const cacheKey = hash({ changedFiles, diffContent });
if (cache.has(cacheKey)) {
  return cache.get(cacheKey);
}
```

### 9. Validate Inputs

```typescript
if (!diffContent || diffContent.trim() === '') {
  throw new Error('No changes to analyze');
}

if (changedFiles.length === 0) {
  throw new Error('No files changed');
}
```

### 10. Test in Development

Use cheaper models during development:

```typescript
const model = process.env.NODE_ENV === 'production'
  ? 'gpt-4o'
  : 'gpt-4o-mini';

const result = await runAgenticCommit({
  changedFiles,
  diffContent,
  model,
});
```

## Next Steps

- 📖 Read the [API Reference](./README.md#api-reference)
- 💡 Explore [Examples](./examples/)
- 🚀 Check the [Quick Start](./QUICKSTART.md)
- 🔧 Learn about [Custom Tools](./examples/05-custom-tools.ts)

## Support

- 🐛 [Report Issues](https://github.com/calenvarek/ai-service/issues)
- 💬 [Discussions](https://github.com/calenvarek/ai-service/discussions)
- 📧 Email: calenvarek@gmail.com


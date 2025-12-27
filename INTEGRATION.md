# Integration Guide

Guide for integrating `@eldrforge/ai-service` into your existing tools and workflows.

## Table of Contents

- [Migrating from kodrdriv](#migrating-from-kodrdriv)
- [Integrating into CLI Tools](#integrating-into-cli-tools)
- [Integrating into Web Services](#integrating-into-web-services)
- [Integrating into CI/CD](#integrating-into-cicd)
- [Integrating into IDEs](#integrating-into-ides)
- [Integrating into Git Hooks](#integrating-into-git-hooks)
- [Integrating into Existing Projects](#integrating-into-existing-projects)

## Migrating from kodrdriv

If you're currently using kodrdriv and want to use the AI service independently:

### What Changed

The AI service was extracted from kodrdriv into a standalone library. The core functionality remains the same, but the API has been streamlined.

### Before (kodrdriv)

```bash
# Using kodrdriv CLI
kodrdriv commit --agentic
kodrdriv release --agentic
```

### After (ai-service)

```typescript
// Using the library directly
import { runAgenticCommit, runAgenticRelease } from '@eldrforge/ai-service';

// Commit generation
const commitResult = await runAgenticCommit({
  changedFiles,
  diffContent,
  model: 'gpt-4o-mini',
});

// Release generation
const releaseResult = await runAgenticRelease({
  fromRef: 'v1.0.0',
  toRef: 'HEAD',
  logContent,
  diffContent,
  model: 'gpt-4o',
});
```

### Configuration Mapping

| kodrdriv Config | ai-service Parameter |
|-----------------|---------------------|
| `--model` | `model` |
| `--max-iterations` | `maxIterations` |
| `--user-direction` | `userDirection` |
| `--release-focus` | `releaseFocus` |
| `--debug` | `debug` |
| `--reasoning` | `openaiReasoning` |

### Storage Adapter

kodrdriv's file system operations are now abstracted through the `StorageAdapter` interface:

```typescript
import { type StorageAdapter } from '@eldrforge/ai-service';
import * as fs from 'fs/promises';
import * as path from 'path';

// Replicate kodrdriv's storage behavior
const kodrdrivStyleStorage: StorageAdapter = {
  async writeOutput(fileName: string, content: string): Promise<void> {
    const outputDir = path.join(process.cwd(), 'output', 'kodrdriv');
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, fileName), content, 'utf8');
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
```

## Integrating into CLI Tools

### Basic CLI Integration

```typescript
#!/usr/bin/env node
import { runAgenticCommit } from '@eldrforge/ai-service';
import { Command } from 'commander';
import { execSync } from 'child_process';

const program = new Command();

program
  .name('my-commit-tool')
  .description('AI-powered commit message generator')
  .version('1.0.0');

program
  .command('commit')
  .description('Generate a commit message')
  .option('-m, --model <model>', 'OpenAI model to use', 'gpt-4o-mini')
  .option('--max-iterations <n>', 'Maximum iterations', '10')
  .option('-d, --direction <text>', 'User direction for the AI')
  .action(async (options) => {
    try {
      // Get staged changes
      const diffContent = execSync('git diff --staged', { encoding: 'utf8' });
      const statusOutput = execSync('git status --porcelain', { encoding: 'utf8' });
      const changedFiles = statusOutput
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.substring(3));

      if (changedFiles.length === 0) {
        console.error('No staged changes found');
        process.exit(1);
      }

      console.log('Generating commit message...');

      const result = await runAgenticCommit({
        changedFiles,
        diffContent,
        userDirection: options.direction,
        model: options.model,
        maxIterations: parseInt(options.maxIterations),
      });

      console.log('\nSuggested commit message:');
      console.log(result.commitMessage);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program.parse();
```

### With Configuration File

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';

interface Config {
  model?: string;
  maxIterations?: number;
  storage?: {
    outputDir?: string;
  };
}

async function loadConfig(): Promise<Config> {
  const configPath = path.join(process.cwd(), '.aiservice.json');

  try {
    const content = await fs.readFile(configPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return {}; // Default config
  }
}

// Usage
const config = await loadConfig();

const result = await runAgenticCommit({
  changedFiles,
  diffContent,
  model: config.model || 'gpt-4o-mini',
  maxIterations: config.maxIterations || 10,
});
```

## Integrating into Web Services

### Express.js API

```typescript
import express from 'express';
import { runAgenticCommit, runAgenticRelease } from '@eldrforge/ai-service';

const app = express();
app.use(express.json());

// Commit message endpoint
app.post('/api/commit-message', async (req, res) => {
  try {
    const { changedFiles, diffContent, userDirection } = req.body;

    if (!changedFiles || !diffContent) {
      return res.status(400).json({
        error: 'Missing required fields: changedFiles, diffContent',
      });
    }

    const result = await runAgenticCommit({
      changedFiles,
      diffContent,
      userDirection,
      model: 'gpt-4o-mini',
    });

    res.json({
      commitMessage: result.commitMessage,
      iterations: result.iterations,
      toolCallsExecuted: result.toolCallsExecuted,
      suggestedSplits: result.suggestedSplits,
    });

  } catch (error) {
    console.error('Error generating commit message:', error);
    res.status(500).json({
      error: 'Failed to generate commit message',
      details: error.message,
    });
  }
});

// Release notes endpoint
app.post('/api/release-notes', async (req, res) => {
  try {
    const { fromRef, toRef, logContent, diffContent, releaseFocus } = req.body;

    if (!fromRef || !toRef || !logContent || !diffContent) {
      return res.status(400).json({
        error: 'Missing required fields',
      });
    }

    const result = await runAgenticRelease({
      fromRef,
      toRef,
      logContent,
      diffContent,
      releaseFocus,
      model: 'gpt-4o',
    });

    res.json({
      title: result.releaseNotes.title,
      body: result.releaseNotes.body,
      iterations: result.iterations,
      toolCallsExecuted: result.toolCallsExecuted,
    });

  } catch (error) {
    console.error('Error generating release notes:', error);
    res.status(500).json({
      error: 'Failed to generate release notes',
      details: error.message,
    });
  }
});

app.listen(3000, () => {
  console.log('AI service API running on port 3000');
});
```

### With Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per window
  message: 'Too many requests, please try again later',
});

app.use('/api/', limiter);
```

### With Authentication

```typescript
function requireAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

app.use('/api/', requireAuth);
```

## Integrating into CI/CD

### GitHub Actions

```yaml
name: Generate Release Notes

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0  # Fetch all history for git log

      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install @eldrforge/ai-service openai @riotprompt/riotprompt

      - name: Generate release notes
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          node -e "
          import { runAgenticRelease } from '@eldrforge/ai-service';
          import { execSync } from 'child_process';
          import * as fs from 'fs/promises';

          const tag = process.env.GITHUB_REF.replace('refs/tags/', '');
          const previousTag = execSync('git describe --tags --abbrev=0 HEAD^', { encoding: 'utf8' }).trim();

          const logContent = execSync(\`git log \${previousTag}..\${tag} --pretty=format:'%h %s (%an)'\`, { encoding: 'utf8' });
          const diffContent = execSync(\`git diff \${previousTag}..\${tag} --stat\`, { encoding: 'utf8' });

          const result = await runAgenticRelease({
            fromRef: previousTag,
            toRef: tag,
            logContent,
            diffContent,
            model: 'gpt-4o',
          });

          await fs.writeFile('RELEASE_NOTES.md', result.releaseNotes.body);
          await fs.writeFile('RELEASE_TITLE.txt', result.releaseNotes.title);
          "

      - name: Create GitHub Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ github.ref }}
          release_name: ${{ github.ref }}
          body_path: RELEASE_NOTES.md
```

### GitLab CI

```yaml
generate-release-notes:
  stage: release
  only:
    - tags
  script:
    - npm install @eldrforge/ai-service openai @riotprompt/riotprompt
    - node generate-release.js
  artifacts:
    paths:
      - RELEASE_NOTES.md
```

### Jenkins Pipeline

```groovy
pipeline {
    agent any

    environment {
        OPENAI_API_KEY = credentials('openai-api-key')
    }

    stages {
        stage('Generate Release Notes') {
            steps {
                sh 'npm install @eldrforge/ai-service openai @riotprompt/riotprompt'
                sh 'node generate-release.js'
            }
        }

        stage('Create Release') {
            steps {
                sh 'gh release create $TAG_NAME --notes-file RELEASE_NOTES.md'
            }
        }
    }
}
```

## Integrating into IDEs

### VS Code Extension

```typescript
import * as vscode from 'vscode';
import { runAgenticCommit } from '@eldrforge/ai-service';
import { execSync } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    'extension.generateCommitMessage',
    async () => {
      try {
        // Get git root
        const gitRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (!gitRoot) {
          vscode.window.showErrorMessage('No workspace folder open');
          return;
        }

        // Get staged changes
        const diffContent = execSync('git diff --staged', {
          cwd: gitRoot,
          encoding: 'utf8',
        });

        if (!diffContent.trim()) {
          vscode.window.showErrorMessage('No staged changes found');
          return;
        }

        const statusOutput = execSync('git status --porcelain', {
          cwd: gitRoot,
          encoding: 'utf8',
        });
        const changedFiles = statusOutput
          .split('\n')
          .filter(line => line.trim())
          .map(line => line.substring(3));

        // Show progress
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Generating commit message...',
            cancellable: false,
          },
          async () => {
            const result = await runAgenticCommit({
              changedFiles,
              diffContent,
              model: 'gpt-4o-mini',
            });

            // Show result in input box
            const message = await vscode.window.showInputBox({
              prompt: 'Generated commit message (edit if needed)',
              value: result.commitMessage,
              valueSelection: [0, result.commitMessage.length],
            });

            if (message) {
              // Create commit
              execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
                cwd: gitRoot,
              });
              vscode.window.showInformationMessage('Commit created!');
            }
          }
        );

      } catch (error) {
        vscode.window.showErrorMessage(
          `Error: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  context.subscriptions.push(disposable);
}
```

### JetBrains Plugin

```kotlin
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vcs.changes.ChangeListManager

class GenerateCommitMessageAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return

        ProgressManager.getInstance().run(object : Task.Backgroundable(
            project,
            "Generating Commit Message",
            false
        ) {
            override fun run(indicator: ProgressIndicator) {
                // Call Node.js script that uses ai-service
                val runtime = Runtime.getRuntime()
                val process = runtime.exec(arrayOf(
                    "node",
                    "generate-commit.js"
                ))

                val output = process.inputStream.bufferedReader().readText()

                // Show result in commit dialog
                ApplicationManager.getApplication().invokeLater {
                    // Update commit message field
                }
            }
        })
    }
}
```

## Integrating into Git Hooks

### Pre-commit Hook

Generate commit message suggestions:

```bash
#!/bin/bash
# .git/hooks/prepare-commit-msg

COMMIT_MSG_FILE=$1
COMMIT_SOURCE=$2

# Only run for manual commits (not merge, squash, etc.)
if [ -z "$COMMIT_SOURCE" ]; then
  # Generate commit message
  node -e "
  import { runAgenticCommit } from '@eldrforge/ai-service';
  import { execSync } from 'child_process';
  import * as fs from 'fs/promises';

  const diffContent = execSync('git diff --staged', { encoding: 'utf8' });
  const statusOutput = execSync('git status --porcelain', { encoding: 'utf8' });
  const changedFiles = statusOutput
    .split('\n')
    .filter(line => line.trim())
    .map(line => line.substring(3));

  const result = await runAgenticCommit({
    changedFiles,
    diffContent,
    model: 'gpt-4o-mini',
  });

  // Prepend to commit message file
  const existing = await fs.readFile('$COMMIT_MSG_FILE', 'utf8');
  await fs.writeFile(
    '$COMMIT_MSG_FILE',
    result.commitMessage + '\n\n# AI-generated suggestion above\n' + existing
  );
  "
fi
```

### Post-commit Hook

Log commit metrics:

```bash
#!/bin/bash
# .git/hooks/post-commit

# Log that AI was used
echo "$(date): AI-generated commit" >> .git/ai-commits.log
```

## Integrating into Existing Projects

### Adding to package.json Scripts

```json
{
  "scripts": {
    "commit": "node scripts/generate-commit.js",
    "release": "node scripts/generate-release.js",
    "commit:interactive": "node scripts/interactive-commit.js"
  }
}
```

### Creating Helper Scripts

```typescript
// scripts/generate-commit.js
import { runAgenticCommit } from '@eldrforge/ai-service';
import { execSync } from 'child_process';

async function main() {
  const diffContent = execSync('git diff --staged', { encoding: 'utf8' });
  // ... rest of implementation
}

main();
```

### Integration with Husky

```bash
# Install husky
npm install --save-dev husky

# Initialize
npx husky install

# Add commit-msg hook
npx husky add .husky/prepare-commit-msg "node scripts/generate-commit.js"
```

### Integration with Commitizen

```typescript
// .cz-config.js
import { runAgenticCommit } from '@eldrforge/ai-service';

module.exports = {
  prompter: async (cz, commit) => {
    // Get AI suggestion
    const result = await runAgenticCommit({
      changedFiles,
      diffContent,
      model: 'gpt-4o-mini',
    });

    // Show to user
    cz.prompt([
      {
        type: 'input',
        name: 'message',
        message: 'Commit message:',
        default: result.commitMessage,
      },
    ]).then(answers => {
      commit(answers.message);
    });
  },
};
```

## Best Practices for Integration

### 1. Handle API Keys Securely

```typescript
// Don't hardcode API keys
// ❌ Bad
const apiKey = 'sk-...';

// ✅ Good
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error('OPENAI_API_KEY environment variable not set');
  process.exit(1);
}
```

### 2. Provide Fallbacks

```typescript
try {
  const result = await runAgenticCommit({...});
  return result.commitMessage;
} catch (error) {
  console.warn('AI generation failed, falling back to manual input');
  return await promptUserForMessage();
}
```

### 3. Add Timeouts

```typescript
import pTimeout from 'p-timeout';

const result = await pTimeout(
  runAgenticCommit({...}),
  60000, // 60 second timeout
  'AI generation timed out'
);
```

### 4. Cache Results

```typescript
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 3600 }); // 1 hour

const cacheKey = hash({ changedFiles, diffContent });
const cached = cache.get(cacheKey);

if (cached) {
  return cached;
}

const result = await runAgenticCommit({...});
cache.set(cacheKey, result.commitMessage);
```

### 5. Log Usage

```typescript
import winston from 'winston';

const logger = winston.createLogger({...});

const result = await runAgenticCommit({
  changedFiles,
  diffContent,
  logger,
});

logger.info('AI commit generated', {
  iterations: result.iterations,
  toolCalls: result.toolCallsExecuted,
  filesChanged: changedFiles.length,
});
```

### 6. Validate Inputs

```typescript
function validateInputs(changedFiles: string[], diffContent: string) {
  if (!changedFiles || changedFiles.length === 0) {
    throw new Error('No files changed');
  }

  if (!diffContent || diffContent.trim() === '') {
    throw new Error('No diff content provided');
  }

  // Check for reasonable size
  if (diffContent.length > 1000000) { // 1MB
    throw new Error('Diff too large');
  }
}
```

## Support

- 🐛 [Report Issues](https://github.com/calenvarek/ai-service/issues)
- 💬 [Discussions](https://github.com/calenvarek/ai-service/discussions)
- 📖 [Documentation](./README.md)
- 📧 Email: calenvarek@gmail.com


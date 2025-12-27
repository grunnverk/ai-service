# Quick Start Guide

Get up and running with `@eldrforge/ai-service` in 5 minutes.

## 1. Install

```bash
npm install @eldrforge/ai-service openai @riotprompt/riotprompt @eldrforge/git-tools
```

## 2. Set API Key

```bash
export OPENAI_API_KEY=sk-your-api-key-here
```

## 3. Generate Your First Commit Message

Create a file `commit.ts`:

```typescript
import { runAgenticCommit } from '@eldrforge/ai-service';
import { execSync } from 'child_process';

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

console.log(result.commitMessage);
```

Run it:

```bash
# Stage some changes
git add .

# Generate commit message
npx tsx commit.ts
```

## 4. Generate Release Notes

Create a file `release.ts`:

```typescript
import { runAgenticRelease } from '@eldrforge/ai-service';
import { execSync } from 'child_process';

const fromRef = 'v1.0.0';
const toRef = 'HEAD';

const logContent = execSync(
  `git log ${fromRef}..${toRef} --pretty=format:"%h %s (%an)"`,
  { encoding: 'utf8' }
);

const diffContent = execSync(
  `git diff ${fromRef}..${toRef} --stat`,
  { encoding: 'utf8' }
);

const result = await runAgenticRelease({
  fromRef,
  toRef,
  logContent,
  diffContent,
  model: 'gpt-4o',
});

console.log('Title:', result.releaseNotes.title);
console.log('\nBody:\n', result.releaseNotes.body);
```

Run it:

```bash
npx tsx release.ts
```

## 5. Traditional Mode (Faster)

For simpler use cases without tool-calling:

```typescript
import { createCommitPrompt, createCompletionWithRetry } from '@eldrforge/ai-service';
import { execSync } from 'child_process';

const diffContent = execSync('git diff --staged', { encoding: 'utf8' });

const { prompt } = await createCommitPrompt(
  { overridePaths: [], overrides: true },
  { diffContent },
  { context: 'Feature development' }
);

const response = await createCompletionWithRetry(prompt.messages, {
  model: 'gpt-4o-mini',
});

console.log(response.choices[0].message.content);
```

## Next Steps

- 📖 Read the [full README](./README.md) for complete API documentation
- 💡 Explore [examples](./examples/) for more use cases
- 🔧 Learn about [custom tools](./examples/05-custom-tools.ts)
- 🎯 Check out [interactive workflows](./examples/03-interactive-commit.ts)

## Common Options

### Choose a Model

```typescript
model: 'gpt-4o-mini'  // Fast and economical
model: 'gpt-4o'       // Balanced
model: 'o1-preview'   // Maximum capability
```

### Control Iterations

```typescript
maxIterations: 10   // For commits (default)
maxIterations: 30   // For releases (default)
```

### Add Context

```typescript
userDirection: 'Focus on API changes'
releaseFocus: 'Performance improvements'
```

### Enable Debug Mode

```typescript
debug: true,
debugRequestFile: 'debug-request.json',
debugResponseFile: 'debug-response.json',
```

## Troubleshooting

**API Key Error?**
```bash
export OPENAI_API_KEY=sk-...
```

**No Changes Found?**
```bash
git add <files>
```

**Need Help?**
- [Report Issues](https://github.com/calenvarek/ai-service/issues)
- [Ask Questions](https://github.com/calenvarek/ai-service/discussions)

## Cost Estimates

| Operation | Model | Tokens | Cost |
|-----------|-------|--------|------|
| Commit | gpt-4o-mini | 5K-20K | $0.01-$0.05 |
| Commit | gpt-4o | 5K-20K | $0.05-$0.20 |
| Release | gpt-4o | 20K-100K | $0.20-$1.00 |

Happy coding! 🚀


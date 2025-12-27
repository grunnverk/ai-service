# Examples

This directory contains practical examples demonstrating how to use `@eldrforge/ai-service` as a standalone library.

## Prerequisites

Before running these examples, ensure you have:

1. **Node.js** (v18 or later)
2. **OpenAI API Key** set as environment variable:
   ```bash
   export OPENAI_API_KEY=sk-...
   ```
3. **tsx** for running TypeScript (or compile with `tsc` first):
   ```bash
   npm install -g tsx
   ```

## Examples Overview

### 1. Simple Commit Message Generation
**File:** `01-simple-commit.ts`

The most basic example - generates a commit message from staged git changes.

```bash
# Stage some changes
git add .

# Run the example
npx tsx examples/01-simple-commit.ts
```

**Features:**
- Reads staged git changes
- Generates commit message using agentic AI
- Shows tool usage statistics
- Suggests commit splits if appropriate

**Use Case:** Quick commit message generation without interaction

---

### 2. Release Notes Generation
**File:** `02-release-notes.ts`

Generates comprehensive release notes by analyzing changes between two git references.

```bash
# Generate release notes from v1.0.0 to v1.1.0
npx tsx examples/02-release-notes.ts v1.0.0 v1.1.0

# Or from a tag to HEAD
npx tsx examples/02-release-notes.ts v1.0.0 HEAD
```

**Features:**
- Analyzes commit history and diffs
- Uses 13 specialized tools for deep analysis
- Generates detailed markdown release notes
- Saves output to files
- Shows tool usage metrics

**Use Case:** Automated release note generation for GitHub releases, changelogs, etc.

---

### 3. Interactive Commit Workflow
**File:** `03-interactive-commit.ts`

An interactive workflow that lets users review, edit, and approve commit messages.

```bash
# Stage changes first
git add .

# Run interactive workflow
npx tsx examples/03-interactive-commit.ts
```

**Features:**
- Generates initial commit message
- Interactive review loop:
  - **[c]** Confirm and create commit
  - **[e]** Edit in your editor
  - **[s]** Skip and cancel
- Automatically creates the git commit
- Full TTY support

**Use Case:** Daily development workflow with human oversight

**Requirements:** Must run in a terminal (TTY), not in piped or non-interactive environments.

---

### 4. Custom Storage Adapter
**File:** `04-custom-storage.ts`

Demonstrates how to implement custom storage adapters for saving AI-generated content.

```bash
npx tsx examples/04-custom-storage.ts
```

**Features:**
- Custom storage adapter implementation
- Structured output directory
- Saves multiple artifacts:
  - Commit message
  - Metadata (JSON)
  - Tool metrics (JSON)
- Example cloud storage adapter structure
- Timestamped output organization

**Use Case:**
- Integrating with cloud storage (S3, Google Cloud Storage)
- Saving AI artifacts for auditing
- Custom file organization

---

### 5. Custom Tool Integration
**File:** `05-custom-tools.ts`

Shows how to create and register custom tools that extend the AI's capabilities.

```bash
npx tsx examples/05-custom-tools.ts
```

**Features:**
- Three custom tools:
  - `check_test_coverage` - Analyze test coverage
  - `check_linter_errors` - Find ESLint errors
  - `analyze_package_dependencies` - Check dependencies
- Tool registry management
- Custom AI workflows
- Code quality analysis example

**Use Case:**
- Domain-specific code analysis
- Custom CI/CD integrations
- Project-specific quality checks

---

## Running the Examples

### Option 1: Using tsx (Recommended)

```bash
# Run directly with tsx
npx tsx examples/01-simple-commit.ts
```

### Option 2: Compile then run

```bash
# Compile TypeScript
npx tsc examples/*.ts --outDir examples/dist

# Run compiled JavaScript
node examples/dist/01-simple-commit.js
```

### Option 3: Install tsx globally

```bash
# Install tsx globally
npm install -g tsx

# Run examples
tsx examples/01-simple-commit.ts
```

## Configuration

All examples can be configured by:

1. **Environment Variables:**
   ```bash
   export OPENAI_API_KEY=sk-...
   export EDITOR=code --wait
   ```

2. **Modifying the code:**
   - Change `model` parameter (e.g., `gpt-4o-mini`, `gpt-4o`)
   - Adjust `maxIterations` for more/less thorough analysis
   - Add custom logic specific to your needs

## Integration Patterns

### As a CLI Tool

Add to your `package.json`:

```json
{
  "scripts": {
    "commit": "tsx examples/01-simple-commit.ts",
    "release": "tsx examples/02-release-notes.ts"
  }
}
```

Then use:
```bash
npm run commit
npm run release v1.0.0 v1.1.0
```

### In Your Own Scripts

```typescript
import { runAgenticCommit } from '@eldrforge/ai-service';

// Your custom logic here
const result = await runAgenticCommit({
  changedFiles,
  diffContent,
  model: 'gpt-4o-mini',
});

// Do something with result.commitMessage
```

### In a Web Service

```typescript
import express from 'express';
import { runAgenticCommit } from '@eldrforge/ai-service';

const app = express();

app.post('/api/commit-message', async (req, res) => {
  const { changedFiles, diffContent } = req.body;

  const result = await runAgenticCommit({
    changedFiles,
    diffContent,
    model: 'gpt-4o-mini',
  });

  res.json({ message: result.commitMessage });
});
```

## Cost Considerations

Approximate token usage and costs (as of 2024, with GPT-4o):

| Example | Tokens | Est. Cost | Time |
|---------|--------|-----------|------|
| Simple Commit | 5,000-20,000 | $0.05-$0.20 | 10-30s |
| Release Notes | 20,000-100,000 | $0.20-$1.00 | 30-180s |
| Interactive Commit | 5,000-30,000 | $0.05-$0.30 | 10-60s |
| Custom Storage | 5,000-20,000 | $0.05-$0.20 | 10-30s |
| Custom Tools | 10,000-40,000 | $0.10-$0.40 | 20-60s |

Use `gpt-4o-mini` for 60% cost reduction with slightly lower quality.

## Troubleshooting

### "OpenAI API key not found"

Set your API key:
```bash
export OPENAI_API_KEY=sk-...
```

### "No staged changes found"

Stage changes first:
```bash
git add .
# or
git add <specific-files>
```

### "Interactive mode requires a terminal"

Examples 03 requires a real terminal. Don't pipe input or run in CI. Use example 01 instead for non-interactive use.

### "Invalid git reference"

Ensure the git references exist:
```bash
git tag  # List available tags
git log --oneline  # See commits
```

### npm/npx issues

Install dependencies:
```bash
npm install @eldrforge/ai-service openai @riotprompt/riotprompt
```

## Next Steps

After exploring these examples:

1. **Integrate into your workflow** - Add to package.json scripts
2. **Customize for your needs** - Modify models, parameters, prompts
3. **Create custom tools** - Extend with domain-specific capabilities
4. **Build automation** - Use in CI/CD pipelines
5. **Explore the API** - See [main README](../README.md) for full API documentation

## Additional Resources

- [Main README](../README.md) - Full API documentation
- [OpenAI API Docs](https://platform.openai.com/docs) - OpenAI reference
- [kodrdriv](https://github.com/calenvarek/kodrdriv) - Full automation toolkit

## Questions or Issues?

- 🐛 [Report bugs](https://github.com/calenvarek/ai-service/issues)
- 💬 [Discussions](https://github.com/calenvarek/ai-service/discussions)
- 📖 [Documentation](../README.md)


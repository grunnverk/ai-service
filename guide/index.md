# @grunnverk/ai-service - Agentic Guide

## Purpose

AI-powered content generation for automation. Provides OpenAI integration with structured prompts, agentic executors, and comprehensive observability.

## Documentation

- **[Usage Guide](./usage.md)** - Comprehensive usage guide for all features
- **[Integration Guide](./integration.md)** - Integrating ai-service into your tools and workflows

## Key Features

- **Agentic Executors** - Structured workflows for commit, publish, and release
- **Prompt Engineering** - Templated prompts with personas and instructions
- **Tool Integration** - Extensible tool registry for AI agents
- **Observability** - Conversation logging, metrics, and reflection
- **Interactive Mode** - Human-in-the-loop workflows

## Usage

```typescript
import { createAI, AgenticCommitExecutor } from '@grunnverk/ai-service';

// Initialize AI service
const ai = createAI({ apiKey: process.env.OPENAI_API_KEY });

// Use agentic executor
const executor = new AgenticCommitExecutor(ai, config);
await executor.execute();
```

## Dependencies

- @grunnverk/git-tools - Git operations
- openai - OpenAI API client
- @riotprompt/riotprompt - Prompt templating

## Package Structure

```
src/
├── agentic/            # Agentic executors
│   ├── commit.ts       # Commit workflow
│   ├── publish.ts      # Publish workflow
│   ├── release.ts      # Release workflow
│   └── executor.ts     # Base executor
├── prompts/            # Prompt templates
│   ├── commit.ts       # Commit prompts
│   ├── release.ts      # Release prompts
│   ├── review.ts       # Review prompts
│   ├── instructions/   # System instructions
│   ├── personas/       # AI personas
│   └── templates.ts    # Template utilities
├── tools/              # AI tool definitions
│   ├── commit-tools.ts
│   ├── publish-tools.ts
│   ├── release-tools.ts
│   └── registry.ts     # Tool registry
├── observability/      # Observability utilities
│   ├── conversation-logger.ts
│   ├── metrics.ts
│   └── reflection.ts
├── ai.ts               # Core AI client
├── interactive.ts      # Interactive mode
└── index.ts
```

## Key Exports

- `createAI()` - Create AI client
- `AgenticCommitExecutor` - Commit workflow
- `AgenticPublishExecutor` - Publish workflow
- `AgenticReleaseExecutor` - Release workflow
- `createPrompt()` - Prompt templating
- `ToolRegistry` - Tool management


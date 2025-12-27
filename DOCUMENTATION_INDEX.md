# Documentation Index

Complete guide to `@eldrforge/ai-service` documentation.

## 📚 Documentation Overview

This library includes comprehensive documentation for using it as a standalone project outside of kodrdriv.

## Quick Navigation

### Getting Started

1. **[README.md](./README.md)** - Main documentation
   - Overview and features
   - Installation instructions
   - Complete API reference
   - All exports and types
   - Best practices

2. **[QUICKSTART.md](./QUICKSTART.md)** - 5-minute quick start
   - Minimal setup
   - First commit message
   - First release notes
   - Common options

3. **[USAGE.md](./USAGE.md)** - Comprehensive usage guide
   - Detailed concepts
   - Agentic vs Traditional mode
   - All use cases with examples
   - Custom adapters
   - Tool system
   - Advanced patterns

### Examples

4. **[examples/README.md](./examples/README.md)** - Examples overview
   - Prerequisites
   - Running examples
   - Configuration
   - Troubleshooting

5. **[examples/01-simple-commit.ts](./examples/01-simple-commit.ts)**
   - Basic commit message generation
   - Minimal code example
   - Non-interactive usage

6. **[examples/02-release-notes.ts](./examples/02-release-notes.ts)**
   - Release notes generation
   - Tool usage analysis
   - File output

7. **[examples/03-interactive-commit.ts](./examples/03-interactive-commit.ts)**
   - Interactive workflow
   - User choices
   - Editor integration

8. **[examples/04-custom-storage.ts](./examples/04-custom-storage.ts)**
   - Storage adapter implementation
   - Custom file organization
   - Cloud storage patterns

9. **[examples/05-custom-tools.ts](./examples/05-custom-tools.ts)**
   - Creating custom tools
   - Tool registry
   - Domain-specific analysis

### Integration

10. **[INTEGRATION.md](./INTEGRATION.md)** - Integration guide
    - Migrating from kodrdriv
    - CLI tool integration
    - Web service integration
    - CI/CD integration
    - IDE integration
    - Git hooks

## Documentation by Use Case

### "I want to generate commit messages"

1. Start: [QUICKSTART.md](./QUICKSTART.md) - Section 3
2. Deep dive: [USAGE.md](./USAGE.md) - "Commit Message Generation"
3. Examples: [examples/01-simple-commit.ts](./examples/01-simple-commit.ts)
4. Interactive: [examples/03-interactive-commit.ts](./examples/03-interactive-commit.ts)

### "I want to generate release notes"

1. Start: [QUICKSTART.md](./QUICKSTART.md) - Section 4
2. Deep dive: [USAGE.md](./USAGE.md) - "Release Notes Generation"
3. Examples: [examples/02-release-notes.ts](./examples/02-release-notes.ts)
4. Integration: [INTEGRATION.md](./INTEGRATION.md) - "CI/CD"

### "I want to integrate into my tool"

1. Start: [INTEGRATION.md](./INTEGRATION.md)
2. CLI tools: [INTEGRATION.md](./INTEGRATION.md) - "CLI Tools"
3. Web services: [INTEGRATION.md](./INTEGRATION.md) - "Web Services"
4. Examples: [examples/04-custom-storage.ts](./examples/04-custom-storage.ts)

### "I want to create custom tools"

1. Concepts: [USAGE.md](./USAGE.md) - "Tool System"
2. Examples: [examples/05-custom-tools.ts](./examples/05-custom-tools.ts)
3. API: [README.md](./README.md) - "Tool System"

### "I'm migrating from kodrdriv"

1. Start: [INTEGRATION.md](./INTEGRATION.md) - "Migrating from kodrdriv"
2. API changes: [README.md](./README.md) - "API Reference"
3. Examples: [examples/](./examples/)

## Documentation by Topic

### Core Concepts

| Topic | Document | Section |
|-------|----------|---------|
| Agentic vs Traditional | [USAGE.md](./USAGE.md) | "Agentic vs Traditional Mode" |
| Models | [USAGE.md](./USAGE.md) | "Models" |
| Reasoning Levels | [USAGE.md](./USAGE.md) | "Reasoning Levels" |
| Tool System | [README.md](./README.md) | "Tool System" |
| Adapters | [USAGE.md](./USAGE.md) | "Custom Adapters" |

### API Reference

| Topic | Document | Section |
|-------|----------|---------|
| runAgenticCommit | [README.md](./README.md) | "runAgenticCommit" |
| runAgenticRelease | [README.md](./README.md) | "runAgenticRelease" |
| createCommitPrompt | [README.md](./README.md) | "createCommitPrompt" |
| createReleasePrompt | [README.md](./README.md) | "createReleasePrompt" |
| Interactive Functions | [README.md](./README.md) | "Interactive Functions" |
| Types | [README.md](./README.md) | "Types" |

### Integration Patterns

| Pattern | Document | Section |
|---------|----------|---------|
| CLI Tools | [INTEGRATION.md](./INTEGRATION.md) | "CLI Tools" |
| Web Services | [INTEGRATION.md](./INTEGRATION.md) | "Web Services" |
| CI/CD | [INTEGRATION.md](./INTEGRATION.md) | "CI/CD" |
| IDEs | [INTEGRATION.md](./INTEGRATION.md) | "IDEs" |
| Git Hooks | [INTEGRATION.md](./INTEGRATION.md) | "Git Hooks" |

### Best Practices

| Topic | Document | Section |
|-------|----------|---------|
| Mode Selection | [USAGE.md](./USAGE.md) | "Best Practices" |
| Error Handling | [USAGE.md](./USAGE.md) | "Error Handling" |
| Cost Optimization | [README.md](./README.md) | "Cost Optimization" |
| Security | [INTEGRATION.md](./INTEGRATION.md) | "Handle API Keys Securely" |
| Rate Limiting | [USAGE.md](./USAGE.md) | "Rate Limiting" |

## File Structure

```
ai-service/
├── README.md              # Main documentation
├── QUICKSTART.md          # 5-minute quick start
├── USAGE.md               # Comprehensive usage guide
├── INTEGRATION.md         # Integration patterns
├── DOCUMENTATION_INDEX.md # This file
├── examples/
│   ├── README.md          # Examples overview
│   ├── 01-simple-commit.ts
│   ├── 02-release-notes.ts
│   ├── 03-interactive-commit.ts
│   ├── 04-custom-storage.ts
│   └── 05-custom-tools.ts
├── src/                   # Source code
└── tests/                 # Test files
```

## Learning Path

### Beginner

1. Read [QUICKSTART.md](./QUICKSTART.md)
2. Run [examples/01-simple-commit.ts](./examples/01-simple-commit.ts)
3. Explore [README.md](./README.md) - "Quick Start"

### Intermediate

1. Read [USAGE.md](./USAGE.md) - "Agentic vs Traditional"
2. Run [examples/02-release-notes.ts](./examples/02-release-notes.ts)
3. Read [USAGE.md](./USAGE.md) - "Custom Adapters"
4. Run [examples/04-custom-storage.ts](./examples/04-custom-storage.ts)

### Advanced

1. Read [USAGE.md](./USAGE.md) - "Tool System"
2. Run [examples/05-custom-tools.ts](./examples/05-custom-tools.ts)
3. Read [INTEGRATION.md](./INTEGRATION.md)
4. Build your own integration

## Common Questions

### "How do I get started?"

→ [QUICKSTART.md](./QUICKSTART.md)

### "What's the difference between agentic and traditional mode?"

→ [USAGE.md](./USAGE.md) - "Agentic vs Traditional Mode"

### "How do I integrate this into my CLI tool?"

→ [INTEGRATION.md](./INTEGRATION.md) - "CLI Tools"

### "Can I create custom tools?"

→ [examples/05-custom-tools.ts](./examples/05-custom-tools.ts)

### "How much does it cost?"

→ [README.md](./README.md) - "Performance Considerations"

### "How do I handle errors?"

→ [USAGE.md](./USAGE.md) - "Error Handling"

### "Can I use this in CI/CD?"

→ [INTEGRATION.md](./INTEGRATION.md) - "CI/CD"

### "How do I migrate from kodrdriv?"

→ [INTEGRATION.md](./INTEGRATION.md) - "Migrating from kodrdriv"

## API Quick Reference

### Agentic Functions

```typescript
// Commit generation
runAgenticCommit({ changedFiles, diffContent, ... })

// Release generation
runAgenticRelease({ fromRef, toRef, logContent, diffContent, ... })

// Low-level agentic execution
runAgentic({ messages, tools, model, ... })
```

### Traditional Functions

```typescript
// Create prompts
createCommitPrompt(pathConfig, promptConfig, commandConfig)
createReleasePrompt(pathConfig, promptConfig, commandConfig)
createReviewPrompt(pathConfig, promptConfig, commandConfig)

// OpenAI integration
createCompletion(messages, options)
createCompletionWithRetry(messages, options, maxRetries)
transcribeAudio(audioPath, options)
```

### Interactive Functions

```typescript
// User interaction
getUserChoice(prompt, choices, options)
getUserTextInput(prompt, options)
editContentInEditor(content, templateLines, extension, editor, logger)
getLLMFeedbackInEditor(contentType, currentContent, editor, logger)
requireTTY(errorMessage, logger)
```

### Tool System

```typescript
// Tool registry
createToolRegistry(context)
createCommitTools()
createReleaseTools()

// Custom tools
registry.register(customTool)
registry.registerAll(tools)
```

## Support & Resources

- 📖 [Full Documentation](./README.md)
- 🚀 [Quick Start](./QUICKSTART.md)
- 💡 [Examples](./examples/)
- 🐛 [Issue Tracker](https://github.com/calenvarek/ai-service/issues)
- 💬 [Discussions](https://github.com/calenvarek/ai-service/discussions)
- 📧 Email: calenvarek@gmail.com

## Contributing

Want to improve the documentation?

1. Fork the repository
2. Make your changes
3. Submit a pull request

Documentation contributions are highly valued!

## License

Apache-2.0

---

**Last Updated:** December 2024
**Version:** 0.1.14-dev.0


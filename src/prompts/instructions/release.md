## ⚠️ CRITICAL RULES - READ FIRST

1. **LOG MESSAGES ARE YOUR SOURCE OF TRUTH** - Every change you describe must come from actual commit messages in the `[Log Context]` section or issues in `[Resolved Issues from Milestone]`
2. **NO HALLUCINATIONS** - Do not invent features, fixes, or changes that aren't explicitly mentioned in the log messages or milestone issues
3. **CITE ACTUAL COMMITS** - When describing changes, refer to what's in the actual commit messages, not what you think should be there
4. **USE RELEASE FOCUS FOR FRAMING** - The `[Release Focus]` guides how you frame and emphasize changes, but doesn't add new changes not in the logs
5. **DEMONSTRATE DEEP UNDERSTANDING** - Show that you've carefully analyzed the changes, understood their implications, and thought about how they relate to each other. Release notes should never feel like a formulaic list.

---

## Your Task

Write release notes that demonstrate genuine understanding and careful analysis. Read all commit messages in `[Log Context]` and milestone issues in `[Resolved Issues from Milestone]`, then **think deeply** about:

- What patterns emerge across the changes?
- How do different changes relate to and reinforce each other?
- What problems were being solved, and why?
- What are the second-order implications of these changes?
- What context would help readers truly understand the significance?

Every change you mention must be traceable to an actual commit message or resolved issue, but your analysis should go beyond mere listing to show comprehension and insight.

### Output Format

Your response MUST be a valid JSON object with the following structure:
{
  "title": "A single-line, concise title for the release.",
  "body": "The detailed release notes in Markdown format."
}

**Instructions for the `title` field:**
- It must be a single line and should be concise and readable (aim for under 80 characters).
- It should capture the most significant, substantive changes in the release.
- Focus on what is noticeable to developers using the software.
- Use natural, conversational language that a human would write, not marketing-speak.
- AVOID mentioning trivial changes like "improving formatting," "updating dependencies," or "refactoring code."

**Instructions for the `body` field:**
- This should be the full release notes in Markdown format.
- Follow the detailed instructions below for structuring and writing the release notes.
- **Take time to think**: Before writing, analyze the commits to understand patterns, themes, and implications. Your notes should reflect genuine understanding, not just summarization.
- **Be substantial**: Release notes should demonstrate that real thought went into understanding and explaining the changes. Avoid feeling like a form letter or template.

### Output Restrictions

- Do not mention and people or contributors in the release notes.  For example, do not say, "Thanks to John Doe for this feature."  Release notes are to be impersonal and not focused on indiviudals.

- Do not use marketing language about how "significant" a release is, or how the release is going to "streamline process" for "Improved usability." Write factual, technical descriptions of what has changed. If there is a log message that says that, then include a note like this, but be careful not to use release notes as a marketing tool.

- Do not use emoticons or emojis in headers or content. These make the output appear AI-generated rather than human-written.

- Release notes should feel **thoughtfully crafted**, not mechanically generated. Even simple releases deserve careful analysis to explain what changed and why it matters. Complex releases require deep dives into patterns, themes, and implications.

## Purpose

Create release notes that:

* Help developers, contributors, or users **deeply understand what changed and why**
* Reflect the **actual purpose** and **impact** of the release through careful analysis
* Show **genuine comprehension** of how changes relate to each other and the broader system
* Demonstrate that **real thought and time** went into understanding the changes
* Are **not promotional**, **not exaggerated**, and **not overly positive**
* Sound like they were written by a human developer who **actually studied the changes**, not an AI quickly summarizing a list
* Provide **context and implications** that help readers appreciate the significance beyond surface-level descriptions
* Connect related changes together to reveal patterns and themes that might not be obvious from individual commits


## Analysis Process: Think Before You Write

Before drafting release notes, **take time to analyze the changes deeply**:

1. **Read through all commits and issues carefully** - Don't just skim. Understand what each change actually does.

2. **Identify patterns and themes** - Do multiple commits work toward the same goal? Are there related changes that reinforce each other? What larger story do they tell together?

3. **Understand the "why"** - What problems were being solved? What pain points were addressed? What technical debt was tackled? Look for clues in commit messages and issue discussions.

4. **Consider implications** - How do these changes affect the system? What downstream effects might they have? What doors do they open for future work?

5. **Find connections** - How do seemingly unrelated changes actually connect? Do bug fixes reveal underlying architectural decisions? Do new features build on earlier refactoring?

6. **Think about the audience** - What context would help readers understand why these changes matter? What background knowledge might they be missing?

7. **Assess significance** - Which changes are truly important vs. routine maintenance? Which deserve more explanation vs. brief mentions?

**Your release notes should reflect this analysis**, not just list what you found. Show that you understand the changes and their context.

---

## Instructions

1. **Use the "Release Focus" section as your PRIMARY GUIDE** to the **focus and framing** of this release. This is the MOST IMPORTANT input for determining how to write the release notes. The Release Focus may include:

   * The theme or reason behind the release (e.g., "we're cleaning up configuration files", "this is about improving test stability")
   * Key goals or constraints
   * Target audiences or known issues being addressed
   * Strategic direction or priorities for this release

   **CRITICAL**: The Release Focus should shape the **opening paragraph**, determine which changes are emphasized most prominently, and guide the overall narrative of the release notes. If Release Focus is provided, it takes precedence over all other considerations in structuring your response.

1a. **If there is a "Resolved Issues from Milestone" section, prioritize this content highly**. These represent well-documented issues that were resolved in this release:

   * Include the resolved issues prominently in your release notes
   * Reference the issue numbers (e.g., "Fixed authentication bug (#123)")
   * **Pay close attention to the issue descriptions, comments, and discussions** to understand the motivation and context behind changes
   * Use the issue conversations to provide detailed context about why changes were made and what problems they solve
   * These issues often represent the most significant user-facing changes in the release
   * Organize related issues together in logical sections

2. **Structure the release notes as follows:**

   * **Opening paragraph** that gives a high-level summary of the release, grounded in the User Context
   * Followed by **grouped sections** of changes using headers like:

     * `New Features`
     * `Improvements`
     * `Bug Fixes`
     * `Refactoring`
     * `Documentation Updates`
     * `Breaking Changes`
     * `Deprecations`
     * `Performance Enhancements`
     * `Security Updates`
     * `Developer Experience`
     * `Testing Improvements`
     * `Configuration Changes`

   Include only the sections that are relevant. **For large releases**, don't hesitate to use multiple sections and subsections to organize the many changes clearly.

3. **Write substantive, analytical bullet points** under each section that demonstrate understanding — **not just lists of changes, but explanations that show thought**.

   **CRITICAL**: Every bullet point must be traceable to actual commit messages in `[Log Context]` or issues in `[Resolved Issues from Milestone]`. If a change isn't in the log, don't mention it.

   **What makes a bullet point substantial:**
   - **Provides context**: Explains not just what changed, but why it matters
   - **Shows connections**: Links related changes together to reveal larger patterns
   - **Explains implications**: Describes what this means for users, developers, or the system
   - **Demonstrates understanding**: Goes beyond surface description to show you grasp the purpose
   - **Includes specifics**: References actual files, components, or behaviors (when mentioned in commits)
   - **Avoids generic language**: Uses precise, technical descriptions rather than vague summaries

   **Structure your bullet points to include:**
   - What specifically changed (cite actual commit messages)
   - Why the change was made (analyze commit messages and issue discussions for clues)
   - How it relates to other changes in this release (show you see the connections)
   - Impact on users or developers (think through the implications)
   - Technical context that helps readers understand significance (when relevant)

   **DO NOT**:
   * Write generic one-liners that could apply to any change
   * Invent features not mentioned in commits
   * Describe changes that "should" be there but aren't in the log
   * Use vague or exaggerated marketing terms like "awesome new feature", "significant boost", "revolutionary update", "streamlined workflow", "enhanced user experience"
   * Group unrelated commits under theme names that aren't in the actual commits
   * Write bullet points that feel templated or formulaic

4. **Keep your tone technical, neutral, and deeply informative.** Show that you understand the technical substance:

   * Reference affected files or systems to show you understand the scope
   * Explain internal components and their relationships (when relevant to understanding the change)
   * Connect changes to specific pull requests or issues with context about why they mattered
   * Provide technical details that demonstrate genuine comprehension
   * Use precise terminology that shows you understand the domain

5. **Demonstrate analytical thinking**:
   - When you see patterns across multiple commits, call them out explicitly
   - If changes build on each other, explain the progression
   - When a series of commits reveals a larger refactoring or architectural shift, describe the arc
   - If bug fixes indicate underlying design decisions, discuss those connections
   - Create narrative threads that help readers understand the "story" of the release
   - Use subsections and groupings that reflect genuine conceptual relationships, not arbitrary categorization

---

## Anti-Examples: What NOT to Do

### ❌ BAD: Shallow, Formulaic "Form Letter"

**Problem**: Generic bullet points that could apply to any release, showing no real understanding:

```json
{
  "title": "Bug fixes and improvements",
  "body": "**Bug Fixes**\\n\\n* Fixed issue with configuration validation\\n* Resolved error in publish flow\\n* Corrected logging output\\n\\n**Improvements**\\n\\n* Enhanced error handling\\n* Updated dependencies\\n* Improved code quality"
}
```

**Why it's terrible**: This reads like a template someone filled in quickly. No context, no connections between changes, no demonstration of understanding. Every line is generic and could describe almost any codebase. Readers learn nothing about what actually happened or why it matters.

**What's missing:**
- WHY was config validation broken? What edge case was hit?
- HOW did the publish flow error manifest? What was the root cause?
- WHAT does "enhanced error handling" actually mean? What errors are now handled differently?
- How do these changes relate to each other? Is there a pattern?

---

### ❌ BAD: Hallucinated Changes

**Problem**: The release notes describe features that aren't in any commit message:

```json
{
  "title": "Major Performance Overhaul and API Redesign",
  "body": "**Performance Improvements**\\n\\n* Reduced API response times by 60% through query optimization\\n* Implemented connection pooling for database efficiency\\n* Added Redis caching layer for frequently accessed data\\n\\n**API Redesign**\\n\\n* Completely redesigned REST API with versioning support\\n* Migrated all endpoints to new authentication system"
}
```

**Why it's terrible**: None of these changes appear in the commit log. The LLM invented them based on what it thinks "should" be in a performance release. This is a critical failure even if the notes sound good.

---

### ❌ BAD: Vague Marketing Fluff

**Problem**: Generic marketing language instead of specific commit-based changes:

```json
{
  "title": "Enhanced User Experience and Streamlined Workflows",
  "body": "This exciting release brings revolutionary improvements to the user experience! We've streamlined workflows across the board and enhanced overall system performance. Users will notice significant improvements in every aspect of the application."
}
```

**Why it's terrible**: No specific changes, no commit references, pure marketing fluff. Completely useless to developers.

---

## Output Format Examples

### ✅ GOOD: Thoughtful Analysis with Depth

**Scenario**: Log contains commits about removing post-publish sync, adding verbose logging, and fixing a config bug

```json
{
  "title": "Simplify publish flow and improve git tag debugging",
  "body": "This release represents a shift toward more explicit, debuggable workflows. Rather than automating post-publish steps that could fail silently, we're giving users clear visibility into what happens after a publish and making git operations more transparent.\\n\\n**Workflow Simplification**\\n\\n* Removed automatic branch sync and version bump from publish flow (commits abc123, def456). The automation was creating confusion when it failed mid-process, leaving repositories in unclear states. Users now explicitly run `kodrdriv development` to continue work after publish, making the transition point obvious and giving them control over when it happens.\\n* Simplified publish completion to display next steps rather than attempting auto-sync. This aligns with the principle that destructive operations (like branch switching) should be explicit, not hidden in automation.\\n\\n**Debugging Infrastructure**\\n\\n* Added extensive logging to git tag detection in `getDefaultFromRef()` (commit ghi789). Investigation revealed that tag searches were failing silently in certain repository configurations, making it impossible to diagnose why version detection was failing. The new logging outputs emoji indicators and structured output for each stage of tag search, making it immediately clear where the process breaks down.\\n\\n**Bug Fixes**\\n\\n* Fixed config validation crash when optional fields were missing (commit jkl012). The validator was checking properties on undefined objects rather than checking for object existence first - a classic mistake that only manifested with certain config file structures."
}
```

**Why it's good**: Shows genuine understanding. Explains WHY changes were made, HOW they connect, and WHAT problems they solve. References actual commits. Demonstrates that real thought went into understanding the changes, not just listing them.

---

### ✅ GOOD: Large Release with Deep Analysis

**Scenario**: 30 commits touching configuration system, tests, docs, and CLI

```json
{
  "title": "Configuration System Overhaul and Testing Migration",
  "body": "This release addresses accumulated technical debt in how the project handles configuration and testing. The changes are interconnected: modernizing the config system revealed gaps in test coverage, which led to the Vitest migration, which in turn uncovered platform-specific bugs that needed fixing. The net result is a more maintainable system with better developer experience.\\n\\n**Configuration System Overhaul**\\n\\nThe configuration system has grown organically over time, resulting in duplicate logic and unclear precedence rules. This release unifies the approach:\\n\\n* **Unified build configuration** (commits abc123, def456, ghi789): Merged vite.config.ts and webpack.config.js into a single environment-aware module. The duplication was causing divergence - settings added to one config weren't reflected in the other, leading to build-environment-specific bugs. The new unified config ensures consistent behavior and eliminates ~200 lines of duplicate code.\\n\\n* **Environment variable precedence** (commits jkl012, mno345): Added .env.defaults support with explicit precedence handling. Previously, the system would silently use fallback values when env files were missing, making it impossible to distinguish between \\\"user didn't set this\\\" and \\\"file failed to load.\\\" The new system follows a clear chain: .env.local → .env → .env.defaults, with logging at each step.\\n\\n* **Validation with context** (commit pqr678): Implemented config validation that provides detailed error messages with file paths and line numbers. The old validation would just say \\\"invalid config\\\" - useless for debugging. The new validator explains exactly what's wrong (\\\"expected number, got string at config.build.timeout\\\") and where it came from.\\n\\n* **Simplified TypeScript config** (commit stu901): Reduced tsconfig.json nesting from 4 levels to 2. The deep nesting was an artifact of an earlier multi-package structure that no longer exists. Flattening it makes the config readable and removes indirection.\\n\\n**Testing Infrastructure Migration**\\n\\nThe Jest → Vitest migration was initially just about ES module support, but it ended up exposing several underlying issues:\\n\\n* **ES module compatibility** (commits vwx234, yza567): Jest's ES module support never worked reliably with our dynamic imports. Tests would pass locally but fail in CI, or vice versa. Vitest handles ES modules natively, eliminating this entire class of failures. The migration touched 87 test files.\\n\\n* **Configuration system tests** (commits bcd890, efg123): Added integration tests that actually load config files from disk and verify precedence rules. These didn't exist before because Jest's module mocking made it too painful. With Vitest, these tests are straightforward and caught 3 bugs in the new config system before release.\\n\\n* **Coverage reporting** (commit hij456): Implemented branch and function coverage metrics. We were only tracking line coverage before, which missed cases where functions were called but specific branches weren't exercised. The new metrics revealed gaps in error handling paths.\\n\\n**Bug Fixes Uncovered During Migration**\\n\\n* **Config loader crash** (commit klm789): Fixed crash when optional config fields were undefined. The validator was checking `config.build.timeout > 0` without first checking if `config.build` existed. Found during integration test development.\\n\\n* **Windows path escaping** (commit nop012): Resolved build failures on Windows due to unescaped backslashes in generated paths. This was hidden before because our CI only ran Linux tests. The new test setup runs on multiple platforms and caught it immediately.\\n\\n* **Parallel test race condition** (commit qrs345): Fixed race condition where parallel tests writing to the same temp directory would interfere with each other. Vitest's parallel execution is more aggressive than Jest's, exposing the issue. Solution was to give each test its own isolated temp directory based on test name hash.\\n\\n**Breaking Changes**\\n\\nThese changes required breaking compatibility with older configurations:\\n\\n* **Removed .env.local.js support** (commit tuv678): The executable JavaScript config format was a security risk and rarely used (< 5% of projects based on GitHub search). The new system supports only static .env files. Migration path: convert .env.local.js logic into build scripts that generate .env.local.\\n\\n* **Output directory change** (commit wxy901): Changed default output from dist/ to build/ to align with modern convention (Vite, Remix, Next.js all use build/). Projects can override via config, but the new default is more intuitive for newcomers.\\n\\n* **Node.js 18 requirement** (commit zab234): The new config system uses Node 18 APIs (fetch, structuredClone). We could have polyfilled these, but Node 16 reached EOL three months ago, so requiring 18 is reasonable.\\n\\n**Documentation Updates**\\n\\n* **Setup instructions rewrite** (commits cde567, fgh890): Completely rewrote README setup section to reflect new config system. The old instructions referenced deprecated files and had commands in the wrong order. New version includes troubleshooting section based on common issues we've seen in Discord.\\n\\n* **Migration guide** (commit ijk123): Added detailed migration guide for users upgrading from previous versions. Includes side-by-side config examples, automatic migration scripts, and rollback instructions if things go wrong."
}
```

**Why it's excellent**: This demonstrates deep understanding. It doesn't just list changes - it explains the reasoning, shows how changes connect, provides technical context, and helps readers understand the arc of the release. Every detail is grounded in actual commits (see commit references), but the narrative reveals patterns and implications that individual commits don't show. This is what thoughtful release notes look like.

---

## Final Checklist: Does Your Release Note Show Real Thought?

Before submitting, verify that your release notes demonstrate genuine analysis:

- [ ] **Opening paragraph shows understanding** - Does it reveal comprehension of what this release is really about, not just restate the title?
- [ ] **Bullet points provide context** - Does each one explain WHY and HOW, not just WHAT?
- [ ] **Connections are explicit** - Do you show how changes relate to each other?
- [ ] **Patterns are identified** - If multiple commits work toward the same goal, do you call this out?
- [ ] **Implications are discussed** - Do you explain what changes mean for users/developers?
- [ ] **Technical specifics are included** - Do you reference files, components, or behaviors when relevant?
- [ ] **It doesn't feel like a form letter** - Would a reader think a human spent time understanding these changes?
- [ ] **Every statement traces to actual commits** - Can you point to specific commit messages or issues for each claim?

If you can't check all these boxes, revise before submitting. Release notes that look formulaic or shallow don't serve the audience.

# Generate Codebase Context

Analyse the entire codebase and produce a `CLAUDE.md` file at the project root that gives any new session instant, complete context.

## Steps

1. **Explore** the codebase using parallel agents covering:
   - Purpose and high-level goals
   - Tech stack: languages, frameworks, build tools, test setup
   - Directory structure and key entry points
   - Architecture: how components connect and depend on each other
   - All runnable commands (dev, build, test, lint, deploy)
   - Environment variables and configuration
   - Known gotchas, constraints, or non-obvious decisions

2. **Write `CLAUDE.md`** to the project root using this structure:

```markdown
# [Project Name]

[2-3 sentence description of what this project does and who it's for]

## Tech Stack
[Languages, frameworks, key libraries]

## Architecture
[How the major pieces fit together — include a simple ASCII diagram if helpful]

## Key Directories
[Table or list: path → what lives there]

## Commands
- Dev: `[command]`
- Build: `[command]`
- Test: `[command]`
- Lint: `[command]`

## Environment Variables
[List every .env variable with a one-line description of what it does]

## Important Files
[Files a developer must understand to work on this project]

## Gotchas
[Non-obvious constraints, known bugs, workarounds in place]

## Current Status
[What's built, what's in progress, what's next]
```

3. Show the draft. STOP → "Looks good? Any corrections?"
4. Write the confirmed content to `CLAUDE.md`.

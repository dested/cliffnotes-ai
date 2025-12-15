# Cliffnotes

Generate hierarchical AI-friendly codebase summaries using Claude. Stop wasting context window on irrelevant files.

## The Problem

AI coding assistants need context to help you effectively, but:
- Reading your entire codebase burns through context windows
- Manually specifying files is tedious and error-prone
- You end up either providing too little context (bad suggestions) or too much (expensive and slow)

## The Solution

Cliffnotes generates a **hierarchical summary system** for your codebase:

```
your-project/
├── CLIFFNOTES.md                    # Root overview - start here
├── src/
│   ├── CLIFFNOTES.md                # src/ context
│   ├── routers/
│   │   └── CLIFFNOTES.md            # routers/ context
│   └── components/
│       └── CLIFFNOTES.md            # components/ context
└── .claude/agents/
    └── context-finder.md            # AI agent for navigation
```

Each `CLIFFNOTES.md` contains:
- Summaries of files in that folder
- Pointers to subfolders with their own context
- Search terms and patterns to find specific functionality

The `context-finder` agent navigates this hierarchy to find exactly the files needed for any task.

## Installation

```bash
# Using bun
bunx cliffnotes

# Or install globally
bun install -g cliffnotes
```

## Usage

```bash
# Analyze current directory
cliffnotes

# Analyze a specific project
cliffnotes ./my-project

# Use more parallel API calls (faster, but higher rate limit usage)
cliffnotes -c 10
```

### Environment Setup

Set your Anthropic API key via any of these methods:

```bash
# Environment variable
export ANTHROPIC_API_KEY=your-key

# Or create a .env file in your project
echo "ANTHROPIC_API_KEY=your-key" > .env

# Or global config
echo "ANTHROPIC_API_KEY=your-key" > ~/.cliffnotes/.env
```

## How It Works

### 1. File Analysis

Cliffnotes scans your codebase and uses Claude to analyze each file, generating:
- Purpose and functionality summary
- Key exports, functions, and types
- API endpoints (for routers)
- Props and state (for components)
- Full schemas (for database files)
- Grep-friendly search terms

### 2. Hierarchical Organization

Instead of one massive file, summaries are organized by folder:
- Each folder gets its own `CLIFFNOTES.md`
- Parent folders point to children
- Navigate from general to specific as needed

### 3. Context-Finder Agent

The generated `.claude/agents/context-finder.md` teaches AI assistants to:
1. Start at the root `CLIFFNOTES.md`
2. Navigate deeper based on the task
3. Output exactly which source files to read

## Example Output

### Root CLIFFNOTES.md

```markdown
# Codebase Cliffnotes

> Hierarchical context files for AI navigation.

## Project Structure

- **src/** - 47 files - Read `src/CLIFFNOTES.md`
- **packages/** - 23 files - Read `packages/CLIFFNOTES.md`

## Root Files

### Configuration
- `tsconfig.json` (config)
- `package.json` (config)
```

### Subfolder CLIFFNOTES.md

```markdown
# src/routers

> Context for this folder. Read parent CLIFFNOTES.md for broader context.

## Subfolders

- **member/** - Read `member/CLIFFNOTES.md` for member context

## Files in This Folder

### API Routes & Endpoints

## src/routers/auth.router.ts
**Purpose:** Handles user authentication endpoints
**Category:** router

**Endpoints:**
| Method | Path | Input | Output | Description |
|--------|------|-------|--------|-------------|
| POST | /login | `{ email, password }` | `{ token, user }` | Authenticate user |
| POST | /logout | - | `{ success }` | End session |

**Search terms:** `login`, `logout`, `authenticate`, `session`
```

## Caching

Cliffnotes caches analysis results based on file content hashes:

```
.cliffnotes-cache.json  # Add to .gitignore
```

Re-running only analyzes changed files, making incremental updates fast and cheap.

## Cost

Cliffnotes uses Claude Opus 4.5 for analysis. Typical costs:
- Small project (50 files): ~$0.10-0.30
- Medium project (200 files): ~$0.50-1.50
- Large project (500+ files): ~$2-5

Subsequent runs with caching are nearly free (only changed files are re-analyzed).

## Best Practices

### What to Commit

```gitignore
# .gitignore
.cliffnotes-cache.json
```

Commit all `CLIFFNOTES.md` files and `.claude/agents/context-finder.md` - they're useful documentation even for humans.

### When to Regenerate

- After significant refactoring
- When adding new features/modules
- Before starting a major AI-assisted coding session

### Using with Claude Code

The context-finder agent works automatically with Claude Code's agent system. When you ask for help, invoke the context-finder first:

```
Use the context-finder agent to identify relevant files for: [your task]
```

## Configuration

Default file patterns:

```typescript
include: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"]
exclude: [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
  "**/*.test.*",
  "**/*.spec.*",
  "**/*.d.ts",
  "**/generated/**"
]
```

## Requirements

- [Bun](https://bun.sh) runtime
- Anthropic API key

## License

MIT

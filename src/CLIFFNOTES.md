# src

> Context for this folder. Read parent CLIFFNOTES.md for broader context.

## Files in This Folder

### Quick Index

- `analyzer.ts` (service)
- `cache.ts` (service)
- `discovery.ts` (service)
- `index.ts` (service)
- `output.ts` (service)
- `prompt.ts` (schema)
- `types.ts` (other)

### Database Schemas

## src/prompt.ts
**Purpose:** Detects file categories and builds AI analysis prompts for generating codebase cliffnotes.
**Category:** util (miscategorized as schema by detector)

**Exports:**
- `detectCategory(filePath: string, content: string): FileCategory` - Classifies files by path/content patterns into: schema, router, hook, component, type, config, service, util, test, other
- `buildAnalysisPrompt(relativePath: string, content: string, category: FileCategory): string` - Generates the full prompt sent to AI for file analysis

**Detection patterns:**
| Category | Path patterns | Content patterns |
|----------|---------------|------------------|
| schema | `schema.prisma`, `schema.ts`, `/schema/`, `/models/` | `datasource `, `createtable`, `pgTable(`, `sqlitetable(`, `mysqltable(` |
| router | `/api/`, `/routes/`, `/router`, `.router.` | `createtrpcrouter`, `router.get(`, `app.get(`, `hono` |
| hook | `/hooks/`, `.hook.`, filename starts with `use[A-Z]` | - |
| component | `.tsx`, `.jsx`, `/components/`, `/pages/`, `/app/` | `export default function`, `export function` + `return (` |
| type | `/types/`, `.types.`, `/interfaces/` | `export interface` (without function) |
| config | `config`, `.config.`, `/env` | - |
| service | `/services/`, `/lib/`, `.service.` | `class `, `async function` |
| util | `/utils/`, `/helpers/`, `.util.`, `.helper.` | - |
| test | `.test.`, `.spec.`, `__tests__` | - |

**Internal functions:**
- `getCategoryInstructions(category): string` - Returns category-specific analysis instructions
- `getFormatTemplate(category): string` - Returns markdown template for each category type

**Search terms:** `detectCategory`, `buildAnalysisPrompt`, `FileCategory`, `getCategoryInstructions`, `getFormatTemplate`, `categoryInstructions`

### Services & Business Logic

## src/analyzer.ts
**Purpose:** Analyzes source files using Claude AI to generate summaries, with caching and concurrency control.
**Category:** service

**Methods:**
- `analyzeFile(filePath, relativePath, cache, anthropic, semaphore, onProgress?): Promise<AnalyzeFileResult>` - Analyzes single file, returns cached result if valid, skips large/minified files
- `analyzeFiles(files, cache, concurrency, onProgress?): Promise<{analyses, cached, analyzed}>` - Parallel analysis with controlled concurrency
- `calculateCost(analyses): CostSummary` - Calculates API cost from token usage

**Internal:**
- `Semaphore` class - Controls concurrent AI calls with queue
- `isMinified(content): boolean` - Detects minified files (avg line length > 500)

**Depends on:** Anthropic Claude API (`claude-opus-4-5-20251101`), `@ai-sdk/anthropic`, `ai` SDK

**Business Rules:**
- Files >100KB or minified are skipped
- Uses file hash for cache invalidation
- Pricing: $5/1M input tokens, $25/1M output tokens

**Search terms:** `analyzeFile`, `analyzeFiles`, `calculateCost`, `Semaphore`, `isMinified`, `PRICING`, `maxConcurrent`, `claude-opus-4-5-20251101`

---

## src/cache.ts
**Purpose:** File-based caching system using SHA256 hashes to track file changes and avoid reprocessing unchanged files.
**Category:** service

**Methods:**
- `loadCache(cachePath: string): Promise<CacheData>` - loads cache from disk, returns empty cache if missing/invalid/version mismatch
- `saveCache(cachePath: string, cache: CacheData): Promise<void>` - persists cache to disk as JSON
- `computeFileHash(filePath: string): Promise<string>` - returns truncated (16 char) SHA256 hash of file content
- `getCacheEntry(cache, relativePath): CacheEntry | undefined` - retrieves entry by path
- `setCacheEntry(cache, relativePath, entry): void` - stores entry by path
- `isCacheValid(entry, currentHash): boolean` - checks if cached hash matches current
- `pruneCache(cache, currentFiles): string[]` - removes entries for deleted files, returns removed paths

**Business Rules:**
- Cache version (`CACHE_VERSION = 1`) invalidates entire cache on mismatch
- Hash truncated to 16 chars for storage efficiency

**Depends on:** `CacheData`, `CacheEntry` types

**Search terms:** `CACHE_VERSION`, `computeFileHash`, `pruneCache`, `isCacheValid`, `sha256`, `loadCache`, `saveCache`

---

## src/discovery.ts
**Purpose:** Discovers source files to analyze and builds folder tree structures for documentation generation
**Category:** service

**Methods:**
- `discoverFiles(rootDir: string, config: CliffnotesConfig): Promise<{absolute: string, relative: string}[]>` - finds all source files matching config patterns, respecting .gitignore and exclusions
- `buildFolderTree(analyses: FileAnalysis[]): FolderTree` - constructs hierarchical folder structure from analyzed files with parent-child relationships
- `getFoldersWithContent(tree: FolderTree): FolderInfo[]` - returns folders that have files or subfolders with files (for CLIFFNOTES.md generation)
- `groupFilesByDirectory(files: {relative: string}[]): Map<string, string[]>` - groups file paths by their parent directory

**Depends on:** `glob` (file matching), `ignore` (gitignore parsing), `fs/promises`

**Key business rules:**
- Always respects .gitignore if present
- Excludes output file, cache file, and `**/CLIFFNOTES.md` automatically
- Normalizes paths to forward slashes
- Root folder represented as "."

**Search terms:** `discoverFiles`, `buildFolderTree`, `getFoldersWithContent`, `groupFilesByDirectory`, `.gitignore`, `ig.ignores`, `FolderTree`

---

## src/index.ts
**Purpose:** CLI entry point that orchestrates codebase analysis - discovers files, analyzes with Claude, generates hierarchical CLIFFNOTES.md files and context-finder agent
**Category:** service

**Methods:**
- `loadApiKey(targetDir: string): string | undefined` - loads ANTHROPIC_API_KEY from env, .env files in project/home dirs
- `logProgress(file, cached, current, total): void` - renders terminal progress bar with percentage
- `main(): Promise<void>` - orchestrates full pipeline: parse args → discover files → load cache → analyze → build tree → write outputs
- `printHelp(): void` - displays CLI usage information

**CLI Interface:**
- `bunx cliffnotes [directory] [options]`
- `-c, --concurrency <n>` - parallel AI calls (default: 5)
- `-h, --help` - show help

**API Key Resolution Order:**
1. `ANTHROPIC_API_KEY` env var
2. `<targetDir>/.env`
3. `~/.cliffnotes/.env`
4. `~/.config/cliffnotes/.env`

**Pipeline:**
1. `discoverFiles()` → find source files
2. `loadCache()` → load hash cache
3. `pruneCache()` → remove stale entries
4. `analyzeFiles()` → Claude analysis with caching
5. `buildFolderTree()` / `getFoldersWithContent()` → hierarchy
6. `writeAllCliffnotes()` → generate CLIFFNOTES.md per folder
7. `writeContextFinderAgent()` → generate `.claude/agents/context-finder.md`
8. `saveCache()` → persist cache

**Depends on:** Anthropic API (via analyzer.js)

**Search terms:** `main()`, `loadApiKey`, `ANTHROPIC_API_KEY`, `--concurrency`, `bunx cliffnotes`, `printHelp`, `logProgress`, `.cliffnotes-cache.json`

---

## src/output.ts
**Purpose:** Generates hierarchical CLIFFNOTES.md files for each folder and a context-finder AI agent definition.

**Methods:**
- `generateFolderCliffnotes(folder: FolderInfo, isRoot: boolean): string` - Creates markdown content for a single folder's CLIFFNOTES.md
- `generateRootCliffnotes(folder: FolderInfo, allFolders: FolderInfo[], cost: CostSummary, stats): string` - Creates root CLIFFNOTES.md with project overview and generation stats
- `generateContextFinderAgent(): string` - Returns markdown template for `.claude/agents/context-finder.md` agent
- `writeAllCliffnotes(rootDir: string, folders: FolderInfo[], cost: CostSummary, stats): Promise<number>` - Writes CLIFFNOTES.md to every folder, returns count written
- `writeContextFinderAgent(rootDir: string): Promise<void>` - Writes context-finder agent to `.claude/agents/`
- `generateCliffnotes()` / `writeCliffnotes()` - Legacy stubs for backwards compatibility

**Key business rules:**
- Categories ordered by importance: schema → router → service → hook → component → util → type → config → test → other
- Root CLIFFNOTES.md includes generation stats (tokens, cost, file counts)
- Each folder's output groups files by category with quick index
- Context-finder agent instructs AI to navigate hierarchy top-down

**Search terms:** `CLIFFNOTES.md`, `generateFolderCliffnotes`, `generateRootCliffnotes`, `CATEGORY_ORDER`, `context-finder`, `writeAllCliffnotes`, `Hierarchical context files`

### Other Files

## src/types.ts
**Purpose:** Core type definitions for the cliffnotes generation system
**Category:** type

**Exports:**
```typescript
interface FileAnalysis {
  path: string;
  relativePath: string;
  category: FileCategory;
  summary: string;
  hash: string;
  tokens: { input: number; output: number };
}

type FileCategory =
  | "schema" | "router" | "component" | "hook" 
  | "util" | "service" | "config" | "type" | "test" | "other";

interface FolderInfo {
  path: string;           // Relative path from root
  name: string;           // Folder name
  files: FileAnalysis[];  // Files directly in this folder
  subfolders: string[];   // Subfolder names with CLIFFNOTES.md
  depth: number;          // Depth from root (0 = root)
}

interface FolderTree {
  folders: Map<string, FolderInfo>;
  root: string;
}

interface CacheEntry {
  hash: string;
  summary: string;
  category: FileCategory;
  analyzedAt: string;
  tokens: { input: number; output: number };
}

interface CacheData {
  version: number;
  entries: Record<string, CacheEntry>;
}

interface AnalysisResult {
  files: FileAnalysis[];
  totalCost: CostSummary;
  cached: number;
  analyzed: number;
}

interface CostSummary {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number; // USD
}

interface CliffnotesConfig {
  concurrency: number;
  include: string[];
  exclude: string[];
  outputFile: string;
  cacheFile: string;
}

const DEFAULT_CONFIG: CliffnotesConfig = {
  concurrency: 5,
  include: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  exclude: ["**/node_modules/**", "**/dist/**", "**/build/**", 
            "**/.next/**", "**/coverage/**", "**/*.test.*", 
            "**/*.spec.*", "**/*.d.ts", "**/generated/**"],
  outputFile: "CLIFFNOTES.md",
  cacheFile: ".cliffnotes-cache.json",
};
```

**Search terms:** `FileAnalysis`, `FileCategory`, `FolderInfo`, `CacheEntry`, `CliffnotesConfig`, `DEFAULT_CONFIG`, `.cliffnotes-cache.json`

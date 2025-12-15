import { writeFile, mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import type { FileAnalysis, CostSummary, FileCategory, FolderInfo, FolderTree } from "./types.js";

// Order categories by importance for the output
const CATEGORY_ORDER: FileCategory[] = [
  "schema",
  "router",
  "service",
  "hook",
  "component",
  "util",
  "type",
  "config",
  "test",
  "other",
];

const CATEGORY_LABELS: Record<FileCategory, string> = {
  schema: "Database Schemas",
  router: "API Routes & Endpoints",
  service: "Services & Business Logic",
  hook: "Hooks",
  component: "Components",
  util: "Utilities",
  type: "Type Definitions",
  config: "Configuration",
  test: "Tests",
  other: "Other Files",
};

/**
 * Generates a CLIFFNOTES.md for a single folder
 */
export function generateFolderCliffnotes(folder: FolderInfo, isRoot: boolean): string {
  const sections: string[] = [];
  const folderDisplayName = folder.path === "." ? "Project Root" : folder.path;

  // Header
  if (isRoot) {
    sections.push(`# Codebase Cliffnotes

> Hierarchical context files for AI navigation. Start here and dig deeper as needed.

## This Folder: ${folderDisplayName}
`);
  } else {
    sections.push(`# ${folderDisplayName}

> Context for this folder. Read parent CLIFFNOTES.md for broader context.
`);
  }

  // Subfolders section - this is KEY for navigation
  if (folder.subfolders.length > 0) {
    sections.push(`## Subfolders

Dig into these folders for more context:

${folder.subfolders.map(sub => {
  const subPath = folder.path === "." ? sub : `${folder.path}/${sub}`;
  return `- **${sub}/** - Read \`${sub}/CLIFFNOTES.md\` for ${sub} context`;
}).join("\n")}
`);
  }

  // Files in this folder
  if (folder.files.length > 0) {
    // Group by category
    const byCategory = new Map<FileCategory, FileAnalysis[]>();
    for (const file of folder.files) {
      if (!byCategory.has(file.category)) {
        byCategory.set(file.category, []);
      }
      byCategory.get(file.category)!.push(file);
    }

    sections.push(`## Files in This Folder
`);

    // Quick index
    sections.push(`### Quick Index

${folder.files.map(f => {
  const fileName = f.relativePath.split("/").pop()!;
  return `- \`${fileName}\` (${f.category})`;
}).join("\n")}
`);

    // Detailed summaries by category
    for (const category of CATEGORY_ORDER) {
      const files = byCategory.get(category);
      if (!files || files.length === 0) continue;

      sections.push(`### ${CATEGORY_LABELS[category]}

${files.map(f => f.summary).join("\n\n---\n\n")}
`);
    }
  }

  return sections.join("\n");
}

/**
 * Generates the root CLIFFNOTES.md with project overview
 */
export function generateRootCliffnotes(
  folder: FolderInfo,
  allFolders: FolderInfo[],
  cost: CostSummary,
  stats: { cached: number; analyzed: number }
): string {
  const sections: string[] = [];
  const timestamp = new Date().toISOString();

  sections.push(`# Codebase Cliffnotes

> Hierarchical context files for AI navigation. Last updated: ${timestamp}

## How to Use

This codebase uses hierarchical CLIFFNOTES.md files:
1. Start here at the root to understand the project structure
2. Navigate into subfolders by reading their CLIFFNOTES.md files
3. Each folder's CLIFFNOTES.md describes its contents and points to subfolders

## Project Structure

${folder.subfolders.map(sub => {
  const subFolder = allFolders.find(f => f.path === sub);
  const fileCount = subFolder ? countFilesRecursive(sub, allFolders) : 0;
  return `- **${sub}/** - ${fileCount} files - Read \`${sub}/CLIFFNOTES.md\``;
}).join("\n")}

## Generation Stats
- **Files analyzed:** ${stats.analyzed} (${stats.cached} cached)
- **Folders with context:** ${allFolders.length}
- **Total tokens:** ${cost.inputTokens.toLocaleString()} in / ${cost.outputTokens.toLocaleString()} out
- **Estimated cost:** $${cost.estimatedCost.toFixed(4)}
`);

  // Files in root folder
  if (folder.files.length > 0) {
    const byCategory = new Map<FileCategory, FileAnalysis[]>();
    for (const file of folder.files) {
      if (!byCategory.has(file.category)) {
        byCategory.set(file.category, []);
      }
      byCategory.get(file.category)!.push(file);
    }

    sections.push(`## Root Files

### Quick Index

${folder.files.map(f => {
  const fileName = f.relativePath.split("/").pop()!;
  return `- \`${fileName}\` (${f.category})`;
}).join("\n")}
`);

    for (const category of CATEGORY_ORDER) {
      const files = byCategory.get(category);
      if (!files || files.length === 0) continue;

      sections.push(`### ${CATEGORY_LABELS[category]}

${files.map(f => f.summary).join("\n\n---\n\n")}
`);
    }
  }

  return sections.join("\n");
}

/**
 * Count files in a folder and all its descendants
 */
function countFilesRecursive(folderPath: string, allFolders: FolderInfo[]): number {
  let count = 0;
  for (const folder of allFolders) {
    if (folder.path === folderPath || folder.path.startsWith(folderPath + "/")) {
      count += folder.files.length;
    }
  }
  return count;
}

/**
 * Generates the context-finder agent markdown file
 */
export function generateContextFinderAgent(): string {
  return `---
name: context-finder
description: Use this agent to find which files to add to context for a task. It navigates the hierarchical CLIFFNOTES.md files to identify relevant files.
model: inherit
---

You are a context-finding agent that navigates hierarchical CLIFFNOTES.md files to identify which source files are relevant for a given task.

## How CLIFFNOTES Work

This codebase has a CLIFFNOTES.md file in each folder:
- The root CLIFFNOTES.md describes the overall structure and points to subfolders
- Each subfolder's CLIFFNOTES.md describes files in that folder and points to deeper subfolders
- Navigate deeper by reading subsequent CLIFFNOTES.md files until you find all relevant context

## Your Process

1. **Start at root**: Read the root CLIFFNOTES.md to understand project structure
2. **Identify relevant areas**: Based on the task, determine which top-level folders are relevant
3. **Dig deeper**: Read CLIFFNOTES.md in relevant subfolders
4. **Continue until sufficient**: Keep reading deeper CLIFFNOTES.md files until you have enough context
5. **Output file list**: Return the list of source files the main agent should read

## Navigation Rules

- Always start with the root CLIFFNOTES.md
- For each relevant subfolder mentioned, read its CLIFFNOTES.md
- Look at the "Subfolders" section to know when to dig deeper
- Look at the "Files in This Folder" section to identify relevant source files
- Stop when you've found all files related to the task

## Output Format

After navigating the CLIFFNOTES hierarchy, output:

### Relevant Files

List all source files (NOT CLIFFNOTES.md files) that should be read for this task:

\`\`\`
path/to/file1.ts
path/to/file2.ts
path/to/etc.ts
\`\`\`

### Navigation Path

Show which CLIFFNOTES.md files you read to find these:
1. \`CLIFFNOTES.md\` (root)
2. \`folder/CLIFFNOTES.md\`
3. \`folder/subfolder/CLIFFNOTES.md\`

### Reasoning

Brief explanation of why these files are relevant to the task.

## Example Tasks

**Task: "Modify the user authentication flow"**
1. Read root CLIFFNOTES.md -> see "api/" handles backend
2. Read api/CLIFFNOTES.md -> see "routers/" has API routes
3. Read api/routers/CLIFFNOTES.md -> find auth-related routers
4. Output: auth router files, user model, related middleware

**Task: "Add a new button to the dashboard"**
1. Read root CLIFFNOTES.md -> see "client/" or "app/" for frontend
2. Read client/CLIFFNOTES.md -> see "components/" and "pages/"
3. Read relevant component/page CLIFFNOTES.md files
4. Output: dashboard component, button components, related hooks

## Important

- Be thorough: it's better to include extra context than miss something
- Context is cheap: include related files even if not directly modified
- Follow the hierarchy: don't skip levels, the structure exists for a reason
- Include patterns: if modifying a file, include similar files as reference
`;
}

/**
 * Writes all CLIFFNOTES.md files for the folder tree
 */
export async function writeAllCliffnotes(
  rootDir: string,
  folders: FolderInfo[],
  cost: CostSummary,
  stats: { cached: number; analyzed: number }
): Promise<number> {
  let written = 0;

  for (const folder of folders) {
    const isRoot = folder.path === ".";
    const content = isRoot
      ? generateRootCliffnotes(folder, folders, cost, stats)
      : generateFolderCliffnotes(folder, false);

    const outputPath = isRoot
      ? resolve(rootDir, "CLIFFNOTES.md")
      : resolve(rootDir, folder.path, "CLIFFNOTES.md");

    // Ensure directory exists
    const dir = dirname(outputPath);
    await mkdir(dir, { recursive: true });

    await writeFile(outputPath, content);
    written++;
  }

  return written;
}

/**
 * Writes the context-finder agent file
 */
export async function writeContextFinderAgent(rootDir: string): Promise<void> {
  const agentDir = resolve(rootDir, ".claude", "agents");
  await mkdir(agentDir, { recursive: true });

  const content = generateContextFinderAgent();
  await writeFile(resolve(agentDir, "context-finder.md"), content);
}

// Legacy exports for backwards compatibility
export function generateCliffnotes(
  analyses: FileAnalysis[],
  cost: CostSummary,
  stats: { cached: number; analyzed: number }
): string {
  // This is kept for backwards compatibility but won't be used
  return "Use writeAllCliffnotes for hierarchical output";
}

export async function writeCliffnotes(
  outputPath: string,
  content: string
): Promise<void> {
  await writeFile(outputPath, content);
}

import { writeFile } from "fs/promises";
import type { FileAnalysis, CostSummary, FileCategory } from "./types.js";

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
  schema: "📊 Database Schemas",
  router: "🛤️ API Routes & Endpoints",
  service: "⚙️ Services & Business Logic",
  hook: "🪝 Hooks",
  component: "🧩 Components",
  util: "🔧 Utilities",
  type: "📝 Type Definitions",
  config: "⚙️ Configuration",
  test: "🧪 Tests",
  other: "📄 Other Files",
};

/**
 * Generates the CLIFFNOTES.md content
 */
export function generateCliffnotes(
  analyses: FileAnalysis[],
  cost: CostSummary,
  stats: { cached: number; analyzed: number }
): string {
  const timestamp = new Date().toISOString();

  // Group by category
  const byCategory = new Map<FileCategory, FileAnalysis[]>();
  for (const analysis of analyses) {
    if (!byCategory.has(analysis.category)) {
      byCategory.set(analysis.category, []);
    }
    byCategory.get(analysis.category)!.push(analysis);
  }

  // Sort files within each category by path
  for (const files of byCategory.values()) {
    files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  // Build the output
  const sections: string[] = [];

  // Header
  sections.push(`# 📚 Codebase Cliffnotes

> Auto-generated summary for AI context. Last updated: ${timestamp}

## Quick Stats
- **Files analyzed:** ${stats.analyzed} (${stats.cached} cached)
- **Total tokens:** ${cost.inputTokens.toLocaleString()} in / ${cost.outputTokens.toLocaleString()} out
- **Estimated cost:** $${cost.estimatedCost.toFixed(4)}

---

## 🗂️ File Index

${generateFileIndex(analyses)}

---
`);

  // Add each category section
  for (const category of CATEGORY_ORDER) {
    const files = byCategory.get(category);
    if (!files || files.length === 0) continue;

    sections.push(`# ${CATEGORY_LABELS[category]}

${files.map((f) => f.summary).join("\n\n---\n\n")}

---
`);
  }

  // Footer with search tips
  sections.push(`## 🔍 Search Tips

Common grep patterns for this codebase:

\`\`\`bash
# Find API endpoints
grep -r "router\\." --include="*.ts"
grep -r "app\\.get\\|app\\.post" --include="*.ts"

# Find React components
grep -r "export.*function.*(" --include="*.tsx"

# Find database operations
grep -r "prisma\\." --include="*.ts"
grep -r "db\\." --include="*.ts"

# Find hooks
grep -r "^export.*use[A-Z]" --include="*.ts"

# Find type definitions
grep -r "^export interface\\|^export type" --include="*.ts"
\`\`\`
`);

  return sections.join("\n");
}

/**
 * Generates a compact file index grouped by directory
 */
function generateFileIndex(analyses: FileAnalysis[]): string {
  // Group by top-level directory
  const byDir = new Map<string, FileAnalysis[]>();

  for (const analysis of analyses) {
    const parts = analysis.relativePath.split("/");
    const topDir = parts.length > 1 ? parts[0] : ".";

    if (!byDir.has(topDir)) {
      byDir.set(topDir, []);
    }
    byDir.get(topDir)!.push(analysis);
  }

  const lines: string[] = [];

  // Sort directories
  const sortedDirs = [...byDir.keys()].sort();

  for (const dir of sortedDirs) {
    const files = byDir.get(dir)!;
    lines.push(`### ${dir === "." ? "Root" : dir}/`);
    lines.push("");

    for (const file of files.sort((a, b) =>
      a.relativePath.localeCompare(b.relativePath)
    )) {
      const icon = getCategoryIcon(file.category);
      lines.push(`- ${icon} \`${file.relativePath}\``);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function getCategoryIcon(category: FileCategory): string {
  const icons: Record<FileCategory, string> = {
    schema: "📊",
    router: "🛤️",
    service: "⚙️",
    hook: "🪝",
    component: "🧩",
    util: "🔧",
    type: "📝",
    config: "⚙️",
    test: "🧪",
    other: "📄",
  };
  return icons[category];
}

/**
 * Writes the cliffnotes to a file
 */
export async function writeCliffnotes(
  outputPath: string,
  content: string
): Promise<void> {
  await writeFile(outputPath, content);
}

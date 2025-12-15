import type { FileCategory } from "./types.js";

/**
 * Detects the category of a file based on its path and content patterns.
 * This helps the AI tailor its analysis.
 */
export function detectCategory(filePath: string, content: string): FileCategory {
  const lowerPath = filePath.toLowerCase();
  const lowerContent = content.toLowerCase();

  // Schema detection (Prisma, Drizzle, etc.)
  if (
    lowerPath.includes("schema.prisma") ||
    lowerPath.includes("schema.ts") ||
    lowerPath.includes("/schema/") ||
    lowerPath.includes("/models/") ||
    lowerContent.includes("datasource ") ||
    lowerContent.includes("createtable") ||
    lowerContent.includes("pgTable(") ||
    lowerContent.includes("sqlitetable(") ||
    lowerContent.includes("mysqltable(")
  ) {
    return "schema";
  }

  // Router detection (tRPC, Express, Next.js API, Hono, etc.)
  if (
    lowerPath.includes("/api/") ||
    lowerPath.includes("/routes/") ||
    lowerPath.includes("/router") ||
    lowerPath.includes(".router.") ||
    lowerContent.includes("createtrpcrouter") ||
    lowerContent.includes("router.get(") ||
    lowerContent.includes("router.post(") ||
    lowerContent.includes("app.get(") ||
    lowerContent.includes("app.post(") ||
    lowerContent.includes("export async function get(") ||
    lowerContent.includes("export async function post(") ||
    lowerContent.includes("hono")
  ) {
    return "router";
  }

  // React hook detection
  if (
    lowerPath.includes("/hooks/") ||
    lowerPath.includes(".hook.") ||
    /^use[A-Z]/.test(filePath.split("/").pop() || "")
  ) {
    return "hook";
  }

  // Component detection
  if (
    lowerPath.endsWith(".tsx") ||
    lowerPath.endsWith(".jsx") ||
    lowerPath.includes("/components/") ||
    lowerPath.includes("/pages/") ||
    lowerPath.includes("/app/") ||
    lowerContent.includes("export default function") ||
    lowerContent.includes("export function") && lowerContent.includes("return (")
  ) {
    return "component";
  }

  // Type definitions
  if (
    lowerPath.includes("/types/") ||
    lowerPath.includes(".types.") ||
    lowerPath.includes("/interfaces/") ||
    (lowerContent.includes("export interface") && !lowerContent.includes("function"))
  ) {
    return "type";
  }

  // Config files
  if (
    lowerPath.includes("config") ||
    lowerPath.includes(".config.") ||
    lowerPath.includes("/env")
  ) {
    return "config";
  }

  // Service/business logic
  if (
    lowerPath.includes("/services/") ||
    lowerPath.includes("/lib/") ||
    lowerPath.includes(".service.") ||
    lowerContent.includes("class ") ||
    lowerContent.includes("async function")
  ) {
    return "service";
  }

  // Utilities
  if (
    lowerPath.includes("/utils/") ||
    lowerPath.includes("/helpers/") ||
    lowerPath.includes(".util.") ||
    lowerPath.includes(".helper.")
  ) {
    return "util";
  }

  // Tests
  if (
    lowerPath.includes(".test.") ||
    lowerPath.includes(".spec.") ||
    lowerPath.includes("__tests__")
  ) {
    return "test";
  }

  return "other";
}

/**
 * The core analysis prompt. This is the heart of cliffnotes.
 *
 * Design principles:
 * - Terse but complete: Every word must earn its place
 * - Consistent format: Easy to parse and search
 * - AI-optimized: Contains grep patterns and clear entry points
 * - Category-aware: Different file types get appropriate treatment
 */
export function buildAnalysisPrompt(
  relativePath: string,
  content: string,
  category: FileCategory
): string {
  const categoryInstructions = getCategoryInstructions(category);

  return `You are generating cliffnotes for a codebase. Your output will be used by AI assistants to understand where to find things and how the code works.

FILE: ${relativePath}
CATEGORY: ${category}

<file_content>
${content}
</file_content>

${categoryInstructions}

FORMAT YOUR RESPONSE EXACTLY LIKE THIS (omit sections that don't apply):

## ${relativePath}
**Purpose:** [One sentence: what this file does]
**Category:** ${category}

${getFormatTemplate(category)}

**Search terms:** \`term1\`, \`term2\`, \`term3\` [grep-friendly terms to find this file's functionality]

RULES:
- Be extremely terse. No fluff.
- For schemas: Include the FULL schema verbatim - every field, every relation, every index
- For routers: Every route must be documented with method, path, input→output
- For components: Focus on props interface and what data it fetches/mutates
- For types: Include the full type definitions verbatim if they're important domain types
- Grep terms should be specific: function names, unique strings, error messages
- Skip obvious imports unless they reveal architecture (e.g., importing from a specific service)
- If a file is trivial (re-exports, simple constants), say so in one line`;
}

function getCategoryInstructions(category: FileCategory): string {
  const instructions: Record<FileCategory, string> = {
    schema: `This is a DATABASE SCHEMA file. Output the COMPLETE schema verbatim including:
- All models/tables with ALL fields and types
- All relations and foreign keys
- All indexes and constraints
- Enums and custom types
This is critical reference material - do not summarize, include everything.`,

    router: `This is a ROUTER/API file. Document EVERY endpoint:
- HTTP method and path (or procedure name for tRPC)
- Input type/validation (Zod schema, body params, query params)
- Output type
- One-line description of what it does
- Any middleware or auth requirements`,

    component: `This is a COMPONENT file. Document:
- Props interface (full type if complex)
- Key state and what triggers re-renders
- Data fetching (queries, mutations, API calls)
- Important event handlers
- Child components it renders (just names)`,

    hook: `This is a HOOK file. Document:
- Parameters and their types
- Return value type and shape
- Side effects (API calls, subscriptions, localStorage)
- Dependencies that trigger re-runs`,

    util: `This is a UTILITY file. For each exported function:
- Function signature (name, params, return type)
- One-line description
- Edge cases or important behavior`,

    service: `This is a SERVICE/BUSINESS LOGIC file. Document:
- Class or module purpose
- Public methods with signatures
- External dependencies (APIs, databases)
- Key business rules implemented`,

    config: `This is a CONFIG file. Document:
- What it configures
- Environment variables used
- Default values and their implications
- How to override settings`,

    type: `This is a TYPE DEFINITION file. Include VERBATIM:
- All exported interfaces and types
- Important JSDoc comments
- Generic constraints
This is reference material - keep full definitions.`,

    test: `This is a TEST file. Briefly note:
- What module/component it tests
- Key test scenarios covered
- Any test utilities defined here`,

    other: `Analyze this file and document:
- Its purpose in the codebase
- Key exports and their signatures
- How other files would use this`,
  };

  return instructions[category];
}

function getFormatTemplate(category: FileCategory): string {
  const templates: Record<FileCategory, string> = {
    schema: `**Schema:**
\`\`\`
[FULL SCHEMA HERE - DO NOT SUMMARIZE]
\`\`\``,

    router: `**Endpoints:**
| Method | Path | Input | Output | Description |
|--------|------|-------|--------|-------------|
| ... | ... | ... | ... | ... |`,

    component: `**Props:** \`{ prop1: Type, prop2?: Type }\`
**State:** [key state variables]
**Data:** [queries/mutations used]
**Renders:** [key child components]`,

    hook: `**Signature:** \`useHookName(param: Type): ReturnType\`
**Returns:** [shape of return value]
**Effects:** [side effects]`,

    util: `**Exports:**
- \`functionName(params): Return\` - description
- \`anotherFunction(params): Return\` - description`,

    service: `**Methods:**
- \`methodName(params): Return\` - description
**Depends on:** [external services/APIs]`,

    config: `**Configures:** [what system]
**Env vars:** \`VAR_NAME\`, \`OTHER_VAR\`
**Defaults:** [important defaults]`,

    type: `**Types:**
\`\`\`typescript
[FULL TYPE DEFINITIONS]
\`\`\``,

    test: `**Tests:** [module name]
**Scenarios:** [key test cases]`,

    other: `**Exports:**
- [list key exports with brief descriptions]`,
  };

  return templates[category];
}

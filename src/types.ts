export interface FileAnalysis {
  path: string;
  relativePath: string;
  category: FileCategory;
  summary: string;
  hash: string;
  tokens: {
    input: number;
    output: number;
  };
}

export type FileCategory =
  | "schema"      // Prisma, Drizzle, database schemas
  | "router"      // tRPC, Express, Next.js API routes
  | "component"   // React/Vue/Svelte components
  | "hook"        // React hooks
  | "util"        // Utility functions
  | "service"     // Business logic, API clients
  | "config"      // Configuration files
  | "type"        // Type definitions
  | "test"        // Test files
  | "other";

export interface CacheEntry {
  hash: string;
  summary: string;
  category: FileCategory;
  analyzedAt: string;
  tokens: {
    input: number;
    output: number;
  };
}

export interface CacheData {
  version: number;
  entries: Record<string, CacheEntry>;
}

export interface AnalysisResult {
  files: FileAnalysis[];
  totalCost: CostSummary;
  cached: number;
  analyzed: number;
}

export interface CostSummary {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number; // in USD
}

export interface CliffnotesConfig {
  concurrency: number;
  include: string[];
  exclude: string[];
  outputFile: string;
  cacheFile: string;
}

export const DEFAULT_CONFIG: CliffnotesConfig = {
  concurrency: 5,
  include: [
    "**/*.ts",
    "**/*.tsx",
    "**/*.js",
    "**/*.jsx",
  ],
  exclude: [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/coverage/**",
    "**/*.test.*",
    "**/*.spec.*",
    "**/*.d.ts",
    "**/generated/**",
  ],
  outputFile: "CLIFFNOTES.md",
  cacheFile: ".cliffnotes-cache.json",
};

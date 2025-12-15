import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { readFile } from "fs/promises";
import { buildAnalysisPrompt, detectCategory } from "./prompt.js";
import {
  computeFileHash,
  getCacheEntry,
  isCacheValid,
  setCacheEntry,
} from "./cache.js";
import type {
  CacheData,
  CacheEntry,
  FileAnalysis,
  FileCategory,
  CostSummary,
} from "./types.js";

// Claude Opus 4.5 pricing (as of 2025)
const PRICING = {
  inputPer1M: 5.0,   // $5 per 1M input tokens
  outputPer1M: 25.0,  // $25 per 1M output tokens
};

interface AnalyzeFileResult {
  analysis: FileAnalysis;
  fromCache: boolean;
}

/**
 * Semaphore for controlling concurrent AI calls
 */
class Semaphore {
  private queue: (() => void)[] = [];
  private running = 0;

  constructor(private maxConcurrent: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      this.running++;
      next();
    }
  }
}

/**
 * Analyzes a single file, using cache if available
 */
export async function analyzeFile(
  filePath: string,
  relativePath: string,
  cache: CacheData,
  anthropic: ReturnType<typeof createAnthropic>,
  semaphore: Semaphore,
  onProgress?: (file: string, cached: boolean) => void
): Promise<AnalyzeFileResult> {
  const hash = await computeFileHash(filePath);
  const cachedEntry = getCacheEntry(cache, relativePath);

  // Return cached result if valid
  if (isCacheValid(cachedEntry, hash)) {
    onProgress?.(relativePath, true);
    return {
      analysis: {
        path: filePath,
        relativePath,
        category: cachedEntry!.category,
        summary: cachedEntry!.summary,
        hash,
        tokens: cachedEntry!.tokens,
      },
      fromCache: true,
    };
  }

  // Acquire semaphore before making AI call
  await semaphore.acquire();

  try {
    const content = await readFile(filePath, "utf-8");
    const category = detectCategory(relativePath, content);

    // Skip very large files or minified files
    if (content.length > 100000 || isMinified(content)) {
      const skippedSummary = `## ${relativePath}\n**Purpose:** [Skipped - file too large or minified]\n**Category:** ${category}`;
      const entry: CacheEntry = {
        hash,
        summary: skippedSummary,
        category,
        analyzedAt: new Date().toISOString(),
        tokens: { input: 0, output: 0 },
      };
      setCacheEntry(cache, relativePath, entry);
      onProgress?.(relativePath, false);

      return {
        analysis: {
          path: filePath,
          relativePath,
          category,
          summary: skippedSummary,
          hash,
          tokens: { input: 0, output: 0 },
        },
        fromCache: false,
      };
    }

    const prompt = buildAnalysisPrompt(relativePath, content, category);

    const result = await generateText({
      model: anthropic("claude-opus-4-5-20251101"),
      prompt,
      maxTokens: 4096,
    });

    const tokens = {
      input: result.usage?.promptTokens ?? 0,
      output: result.usage?.completionTokens ?? 0,
    };

    const summary = result.text;

    // Update cache
    const entry: CacheEntry = {
      hash,
      summary,
      category,
      analyzedAt: new Date().toISOString(),
      tokens,
    };
    setCacheEntry(cache, relativePath, entry);
    onProgress?.(relativePath, false);

    return {
      analysis: {
        path: filePath,
        relativePath,
        category,
        summary,
        hash,
        tokens,
      },
      fromCache: false,
    };
  } finally {
    semaphore.release();
  }
}

/**
 * Analyzes multiple files in parallel with controlled concurrency
 */
export async function analyzeFiles(
  files: { absolute: string; relative: string }[],
  cache: CacheData,
  concurrency: number,
  onProgress?: (file: string, cached: boolean, current: number, total: number) => void
): Promise<{ analyses: FileAnalysis[]; cached: number; analyzed: number }> {
  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const semaphore = new Semaphore(concurrency);
  let completed = 0;
  let cachedCount = 0;
  let analyzedCount = 0;

  const results = await Promise.all(
    files.map(async ({ absolute, relative }) => {
      const result = await analyzeFile(
        absolute,
        relative,
        cache,
        anthropic,
        semaphore,
        (file, cached) => {
          completed++;
          if (cached) cachedCount++;
          else analyzedCount++;
          onProgress?.(file, cached, completed, files.length);
        }
      );
      return result.analysis;
    })
  );

  return {
    analyses: results,
    cached: cachedCount,
    analyzed: analyzedCount,
  };
}

/**
 * Calculate cost from token usage
 */
export function calculateCost(analyses: FileAnalysis[]): CostSummary {
  const totals = analyses.reduce(
    (acc, a) => ({
      input: acc.input + a.tokens.input,
      output: acc.output + a.tokens.output,
    }),
    { input: 0, output: 0 }
  );

  const inputCost = (totals.input / 1_000_000) * PRICING.inputPer1M;
  const outputCost = (totals.output / 1_000_000) * PRICING.outputPer1M;

  return {
    inputTokens: totals.input,
    outputTokens: totals.output,
    estimatedCost: inputCost + outputCost,
  };
}

/**
 * Check if content appears to be minified
 */
function isMinified(content: string): boolean {
  const lines = content.split("\n");
  if (lines.length < 5) return false;

  // Check average line length - minified files have very long lines
  const avgLineLength = content.length / lines.length;
  return avgLineLength > 500;
}

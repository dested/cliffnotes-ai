#!/usr/bin/env node

import { resolve, join } from "path";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { loadCache, saveCache } from "./cache.js";
import { discoverFiles } from "./discovery.js";
import { analyzeFiles, calculateCost } from "./analyzer.js";
import { generateCliffnotes, writeCliffnotes } from "./output.js";
import { DEFAULT_CONFIG, type CliffnotesConfig } from "./types.js";

/**
 * Load API key from various locations (in order of priority):
 * 1. ANTHROPIC_API_KEY env var (already set)
 * 2. .env in target directory
 * 3. ~/.cliffnotes/.env
 * 4. ~/.config/cliffnotes/.env
 */
function loadApiKey(targetDir: string): string | undefined {
  // Already set in environment
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  const locations = [
    join(targetDir, ".env"),
    join(homedir(), ".cliffnotes", ".env"),
    join(homedir(), ".config", "cliffnotes", ".env"),
  ];

  for (const loc of locations) {
    if (existsSync(loc)) {
      try {
        const content = readFileSync(loc, "utf-8");
        const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
        if (match) {
          return match[1].trim().replace(/^["']|["']$/g, "");
        }
      } catch {
        // Continue to next location
      }
    }
  }

  return undefined;
}

// ANSI colors for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

function log(message: string) {
  console.log(message);
}

function logProgress(
  file: string,
  cached: boolean,
  current: number,
  total: number
) {
  const percent = Math.round((current / total) * 100);
  const bar = "█".repeat(Math.floor(percent / 5)) + "░".repeat(20 - Math.floor(percent / 5));
  const status = cached
    ? `${colors.dim}[cached]${colors.reset}`
    : `${colors.green}[analyzed]${colors.reset}`;

  // Clear line and write progress
  process.stdout.write(`\r${colors.cyan}[${bar}]${colors.reset} ${percent}% ${status} ${file.slice(0, 50).padEnd(50)}`);
}

async function main() {
  const startTime = Date.now();

  // Parse args
  const args = process.argv.slice(2);

  // Check for help first (before API key check)
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const rootDir = resolve(args.find(a => !a.startsWith("-")) || ".");

  // Load API key from env or config files
  const apiKey = loadApiKey(rootDir);
  if (!apiKey) {
    log(`${colors.red}Error: ANTHROPIC_API_KEY not found${colors.reset}`);
    log(`
Set it via:
  1. Environment variable: export ANTHROPIC_API_KEY=your-key
  2. .env file in your project directory
  3. ~/.cliffnotes/.env
  4. ~/.config/cliffnotes/.env`);
    process.exit(1);
  }

  // Set it in env for the analyzer to use
  process.env.ANTHROPIC_API_KEY = apiKey;

  // Parse CLI flags
  const config: CliffnotesConfig = { ...DEFAULT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--concurrency" || args[i] === "-c") {
      config.concurrency = parseInt(args[++i], 10);
    } else if (args[i] === "--output" || args[i] === "-o") {
      config.outputFile = args[++i];
    }
  }

  log(`
${colors.bright}📚 Cliffnotes Generator${colors.reset}
${colors.dim}Generating AI-friendly codebase summary...${colors.reset}
`);

  log(`${colors.cyan}📁 Scanning:${colors.reset} ${rootDir}`);
  log(`${colors.cyan}⚡ Concurrency:${colors.reset} ${config.concurrency}`);

  // Discover files
  const files = await discoverFiles(rootDir, config);
  log(`${colors.cyan}📄 Files found:${colors.reset} ${files.length}`);

  if (files.length === 0) {
    log(`${colors.yellow}No source files found. Check your include/exclude patterns.${colors.reset}`);
    process.exit(0);
  }

  // Load cache
  const cachePath = resolve(rootDir, config.cacheFile);
  const cache = await loadCache(cachePath);
  const cachedCount = Object.keys(cache.entries).length;
  log(`${colors.cyan}💾 Cached entries:${colors.reset} ${cachedCount}`);

  log(`\n${colors.bright}Analyzing files...${colors.reset}\n`);

  // Analyze files
  const { analyses, cached, analyzed } = await analyzeFiles(
    files,
    cache,
    config.concurrency,
    logProgress
  );

  // Clear progress line
  process.stdout.write("\r" + " ".repeat(100) + "\r");

  // Calculate cost
  const cost = calculateCost(analyses);

  // Generate output
  log(`\n${colors.bright}Generating CLIFFNOTES.md...${colors.reset}`);
  const content = generateCliffnotes(analyses, cost, { cached, analyzed });

  // Write output
  const outputPath = resolve(rootDir, config.outputFile);
  await writeCliffnotes(outputPath, content);

  // Save cache
  await saveCache(cachePath, cache);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Print summary
  log(`
${colors.green}✓ Done!${colors.reset} Generated ${colors.bright}${config.outputFile}${colors.reset}

${colors.bright}Summary:${colors.reset}
  ${colors.cyan}Files analyzed:${colors.reset} ${analyzed} (${cached} from cache)
  ${colors.cyan}Input tokens:${colors.reset}  ${cost.inputTokens.toLocaleString()}
  ${colors.cyan}Output tokens:${colors.reset} ${cost.outputTokens.toLocaleString()}
  ${colors.cyan}Estimated cost:${colors.reset} ${colors.yellow}$${cost.estimatedCost.toFixed(4)}${colors.reset}
  ${colors.cyan}Time elapsed:${colors.reset}  ${elapsed}s

${colors.dim}Cache saved to ${config.cacheFile}${colors.reset}
`);
}

function printHelp() {
  log(`
${colors.bright}📚 Cliffnotes Generator${colors.reset}

Generate AI-friendly codebase summaries using Claude Opus 4.5.

${colors.bright}Usage:${colors.reset}
  bunx cliffnotes [directory] [options]

${colors.bright}Options:${colors.reset}
  -c, --concurrency <n>  Number of parallel AI calls (default: 5)
  -o, --output <file>    Output file name (default: CLIFFNOTES.md)
  -h, --help             Show this help message

${colors.bright}Environment:${colors.reset}
  ANTHROPIC_API_KEY      Required. Your Anthropic API key.

${colors.bright}Examples:${colors.reset}
  bunx cliffnotes                    # Analyze current directory
  bunx cliffnotes ./my-project       # Analyze specific directory
  bunx cliffnotes -c 10              # Use 10 parallel calls
  bunx cliffnotes -o DOCS.md         # Custom output file

${colors.bright}Files:${colors.reset}
  CLIFFNOTES.md          Generated summary (commit this!)
  .cliffnotes-cache.json Hash cache for incremental updates (gitignore this)
`);
}

main().catch((err) => {
  console.error(`${colors.red}Error:${colors.reset}`, err.message);
  process.exit(1);
});

import { glob } from "glob";
import ignore from "ignore";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { resolve, relative } from "path";
import type { CliffnotesConfig } from "./types.js";

/**
 * Discovers all source files to analyze based on config
 */
export async function discoverFiles(
  rootDir: string,
  config: CliffnotesConfig
): Promise<{ absolute: string; relative: string }[]> {
  // Load .gitignore if it exists
  const ig = ignore();
  const gitignorePath = resolve(rootDir, ".gitignore");

  if (existsSync(gitignorePath)) {
    const gitignoreContent = await readFile(gitignorePath, "utf-8");
    ig.add(gitignoreContent);
  }

  // Add our default excludes
  ig.add(config.exclude);

  // Also exclude the output and cache files
  ig.add(config.outputFile);
  ig.add(config.cacheFile);

  // Find all matching files
  const allFiles: string[] = [];

  for (const pattern of config.include) {
    const matches = await glob(pattern, {
      cwd: rootDir,
      nodir: true,
      absolute: false,
      dot: false,
    });
    allFiles.push(...matches);
  }

  // Deduplicate
  const uniqueFiles = [...new Set(allFiles)];

  // Filter through gitignore
  const filtered = uniqueFiles.filter((file) => !ig.ignores(file));

  // Return with both absolute and relative paths
  return filtered
    .sort()
    .map((file) => ({
      absolute: resolve(rootDir, file),
      relative: file,
    }));
}

/**
 * Groups files by directory for organized output
 */
export function groupFilesByDirectory(
  files: { relative: string }[]
): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const { relative: file } of files) {
    const parts = file.split("/");
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";

    if (!groups.has(dir)) {
      groups.set(dir, []);
    }
    groups.get(dir)!.push(file);
  }

  return groups;
}

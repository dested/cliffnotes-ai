import { createHash } from "crypto";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import type { CacheData, CacheEntry } from "./types.js";

const CACHE_VERSION = 1;

export async function loadCache(cachePath: string): Promise<CacheData> {
  if (!existsSync(cachePath)) {
    return { version: CACHE_VERSION, entries: {} };
  }

  try {
    const raw = await readFile(cachePath, "utf-8");
    const data = JSON.parse(raw) as CacheData;

    // Invalidate cache if version changed
    if (data.version !== CACHE_VERSION) {
      return { version: CACHE_VERSION, entries: {} };
    }

    return data;
  } catch {
    return { version: CACHE_VERSION, entries: {} };
  }
}

export async function saveCache(cachePath: string, cache: CacheData): Promise<void> {
  await writeFile(cachePath, JSON.stringify(cache, null, 2));
}

export async function computeFileHash(filePath: string): Promise<string> {
  const content = await readFile(filePath, "utf-8");
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export function getCacheEntry(cache: CacheData, relativePath: string): CacheEntry | undefined {
  return cache.entries[relativePath];
}

export function setCacheEntry(
  cache: CacheData,
  relativePath: string,
  entry: CacheEntry
): void {
  cache.entries[relativePath] = entry;
}

export function isCacheValid(entry: CacheEntry | undefined, currentHash: string): boolean {
  return entry !== undefined && entry.hash === currentHash;
}

/**
 * Remove cache entries for files that no longer exist.
 * Returns the list of removed file paths.
 */
export function pruneCache(cache: CacheData, currentFiles: string[]): string[] {
  const currentFileSet = new Set(currentFiles);
  const removedPaths: string[] = [];

  for (const cachedPath of Object.keys(cache.entries)) {
    if (!currentFileSet.has(cachedPath)) {
      delete cache.entries[cachedPath];
      removedPaths.push(cachedPath);
    }
  }

  return removedPaths;
}

import { glob } from "glob";
import ignore from "ignore";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import type { CliffnotesConfig, FolderInfo, FolderTree, FileAnalysis } from "./types.js";

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
  ig.add("**/CLIFFNOTES.md");

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

  // Return with both absolute and relative paths, normalizing to forward slashes
  return filtered
    .sort()
    .map((file) => ({
      absolute: resolve(rootDir, file),
      relative: file.replace(/\\/g, "/"),
    }));
}

/**
 * Builds a folder tree from analyzed files
 */
export function buildFolderTree(analyses: FileAnalysis[]): FolderTree {
  const folders = new Map<string, FolderInfo>();

  // First pass: create all folder entries and assign files
  for (const analysis of analyses) {
    const parts = analysis.relativePath.split("/");
    const fileName = parts.pop()!;
    const folderPath = parts.length > 0 ? parts.join("/") : ".";

    if (!folders.has(folderPath)) {
      folders.set(folderPath, {
        path: folderPath,
        name: parts.length > 0 ? parts[parts.length - 1] : "root",
        files: [],
        subfolders: [],
        depth: parts.length,
      });
    }

    folders.get(folderPath)!.files.push(analysis);
  }

  // Second pass: establish parent-child relationships
  // We need to ensure all parent folders exist and track subfolders
  const allPaths = [...folders.keys()];

  for (const path of allPaths) {
    if (path === ".") continue;

    const parts = path.split("/");
    // Ensure all ancestor folders exist
    for (let i = 0; i < parts.length; i++) {
      const ancestorPath = i === 0 ? "." : parts.slice(0, i).join("/");
      const childPath = parts.slice(0, i + 1).join("/");

      if (!folders.has(ancestorPath)) {
        folders.set(ancestorPath, {
          path: ancestorPath,
          name: i === 0 ? "root" : parts[i - 1],
          files: [],
          subfolders: [],
          depth: i,
        });
      }

      const ancestor = folders.get(ancestorPath)!;
      const childName = parts[i];
      if (!ancestor.subfolders.includes(childName)) {
        ancestor.subfolders.push(childName);
      }
    }
  }

  // Sort subfolders alphabetically
  for (const folder of folders.values()) {
    folder.subfolders.sort();
  }

  return { folders, root: "." };
}

/**
 * Gets all folders that should have a CLIFFNOTES.md file
 * (folders that have files or subfolders with files)
 */
export function getFoldersWithContent(tree: FolderTree): FolderInfo[] {
  const result: FolderInfo[] = [];

  const hasContent = (path: string): boolean => {
    const folder = tree.folders.get(path);
    if (!folder) return false;
    if (folder.files.length > 0) return true;
    return folder.subfolders.some(sub => {
      const subPath = path === "." ? sub : `${path}/${sub}`;
      return hasContent(subPath);
    });
  };

  for (const [path, folder] of tree.folders) {
    if (hasContent(path)) {
      // Filter subfolders to only those with content
      const subfoldersWithContent = folder.subfolders.filter(sub => {
        const subPath = path === "." ? sub : `${path}/${sub}`;
        return hasContent(subPath);
      });
      result.push({ ...folder, subfolders: subfoldersWithContent });
    }
  }

  return result.sort((a, b) => a.path.localeCompare(b.path));
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

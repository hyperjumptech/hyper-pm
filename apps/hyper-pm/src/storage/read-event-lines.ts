import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

/**
 * Recursively lists `.jsonl` files under a directory.
 *
 * @param dir - Absolute directory to scan.
 * @param root - Original root for relative path output.
 */
const listJsonlFiles = async (dir: string, root: string): Promise<string[]> => {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await listJsonlFiles(abs, root)));
    } else if (e.isFile() && e.name.endsWith(".jsonl")) {
      out.push(relative(root, abs).split("\\").join("/"));
    }
  }
  return out;
};

/**
 * Loads all JSONL lines from shard files under the events directory (recursive).
 *
 * @param dataRoot - Data branch checkout root.
 */
export const readAllEventLines = async (
  dataRoot: string,
): Promise<string[]> => {
  const eventsRoot = join(dataRoot, "events");
  let files: string[] = [];
  try {
    files = await listJsonlFiles(eventsRoot, dataRoot);
  } catch {
    return [];
  }
  files.sort((a, b) => a.localeCompare(b));
  const lines: string[] = [];
  for (const rel of files) {
    const content = await readFile(join(dataRoot, rel), "utf8");
    for (const line of content.split("\n")) {
      if (line.trim()) lines.push(line);
    }
  }
  return lines;
};

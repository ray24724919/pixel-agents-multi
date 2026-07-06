import * as fs from 'fs';

/**
 * Shared low-level file IO for the append-only JSONL history stores (usage + timeline).
 *
 * Compaction keeps only the newest records once a store grows past a size threshold and
 * rewrites it atomically (tmp + rename, mirroring layoutPersistence). Loads over the
 * threshold read only the file tail instead of the whole store.
 */

/**
 * Post-compaction file size per store path. A store whose records are so large that
 * compaction cannot shrink it below the threshold would otherwise re-run the full
 * read + rewrite on every append; instead we only re-compact after the file has grown
 * by another threshold's worth of bytes since the last compaction pass.
 */
const lastCompactionSizes = new Map<string, number>();

export function shouldCompactJsonlStore(storePath: string, thresholdBytes: number): boolean {
  let size: number;
  try {
    size = fs.statSync(storePath).size;
  } catch {
    return false;
  }
  if (size <= thresholdBytes) return false;
  const lastSize = lastCompactionSizes.get(storePath);
  return lastSize === undefined || size > lastSize + thresholdBytes;
}

/** Record the store's current size so the next compaction pass waits for real growth. */
export function markJsonlStoreCompacted(storePath: string): void {
  try {
    lastCompactionSizes.set(storePath, fs.statSync(storePath).size);
  } catch {
    /* If the store vanished mid-write, the next append simply re-evaluates. */
  }
}

/** Atomically replace the store's contents with the given JSONL lines (tmp + rename). */
export function rewriteJsonlStore(storePath: string, lines: string[]): void {
  const tmpPath = `${storePath}.tmp`;
  fs.writeFileSync(tmpPath, lines.length > 0 ? `${lines.join('\n')}\n` : '', 'utf8');
  fs.renameSync(tmpPath, storePath);
}

/**
 * Read a JSONL store's lines for a load. Files at or below `thresholdBytes` are read
 * whole, exactly as before. Larger files only read the last `tailBytes`, dropping the
 * first (possibly partial) line so every returned line is complete.
 */
export function readJsonlStoreLines(
  storePath: string,
  thresholdBytes: number,
  tailBytes: number,
): string[] {
  const size = fs.statSync(storePath).size;
  if (size <= thresholdBytes || size <= tailBytes) {
    return fs.readFileSync(storePath, 'utf8').split(/\r?\n/);
  }

  const fd = fs.openSync(storePath, 'r');
  let text: string;
  try {
    const buffer = Buffer.alloc(tailBytes);
    const bytesRead = fs.readSync(fd, buffer, 0, tailBytes, size - tailBytes);
    text = buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }

  const firstNewline = text.indexOf('\n');
  if (firstNewline === -1) return [];
  return text.slice(firstNewline + 1).split(/\r?\n/);
}

export function resetJsonlStoreCompactionStateForTests(): void {
  lastCompactionSizes.clear();
}

import fs from "fs/promises";
import path from "path";
import { getCacheDir } from "./gallery-config";

/**
 * Persistent store of "starred" (picked) photos. Lives entirely in the
 * cache dir so the /photos volume stays read-only — the app never has
 * to touch the originals. Callers get / set by relative path (same key
 * used everywhere else in the app: relative to GALLERY_ROOT).
 *
 * Durability contract:
 *   Every setPick / clearAllPicks awaits an atomic write-through to disk
 *   (write to `.tmp` + fsync + rename), so a docker stop / kill / crash
 *   right after the POST returns is safe. The cost is one small fs write
 *   per toggle (~1 ms on SSD) — trivial for a JSON with a few thousand
 *   short paths.
 */

const CURRENT_VERSION = 1;

interface PicksState {
  version: typeof CURRENT_VERSION;
  starred: Record<string, number>; // path → Date.now() when starred
}

function picksFilePath(): string {
  return path.join(getCacheDir(), "picks.json");
}

let cache: PicksState | null = null;
// Serialize concurrent writes so overlapping toggles don't race on rename().
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<PicksState> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(picksFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<PicksState>;
    if (parsed?.version === CURRENT_VERSION && parsed.starred) {
      cache = { version: CURRENT_VERSION, starred: { ...parsed.starred } };
      return cache;
    }
  } catch {
    // missing / corrupt / stale — start fresh
  }
  cache = { version: CURRENT_VERSION, starred: {} };
  return cache;
}

async function persistNow(state: PicksState): Promise<void> {
  const target = picksFilePath();
  const tmp = `${target}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  const payload = JSON.stringify(state);
  // Write + fsync so the OS actually commits before we return.
  const handle = await fs.open(tmp, "w");
  try {
    await handle.writeFile(payload);
    await handle.sync();
  } finally {
    await handle.close();
  }
  // rename is atomic on POSIX filesystems — either the old file is intact
  // or the new one is fully in place, never a torn write.
  await fs.rename(tmp, target);
}

function enqueueWrite(state: PicksState): Promise<void> {
  const next = writeChain.then(() => persistNow(state));
  // Swallow errors in the chain so a single failure doesn't poison all
  // future writes. Callers still see the error through their own await.
  writeChain = next.catch(() => {});
  return next;
}

export interface PicksSnapshot {
  paths: string[];
  starredAt: Record<string, number>;
}

export async function getPicks(): Promise<PicksSnapshot> {
  const state = await load();
  return {
    paths: Object.keys(state.starred),
    starredAt: { ...state.starred },
  };
}

export async function setPick(
  imagePath: string,
  starred: boolean
): Promise<void> {
  const state = await load();
  if (starred) {
    state.starred[imagePath] = Date.now();
  } else {
    delete state.starred[imagePath];
  }
  await enqueueWrite(state);
}

export async function setPicksBulk(
  imagePaths: string[],
  starred: boolean
): Promise<void> {
  const state = await load();
  const now = Date.now();
  for (const p of imagePaths) {
    if (starred) {
      state.starred[p] = now;
    } else {
      delete state.starred[p];
    }
  }
  await enqueueWrite(state);
}

export async function clearAllPicks(): Promise<void> {
  const state: PicksState = { version: CURRENT_VERSION, starred: {} };
  cache = state;
  await enqueueWrite(state);
}

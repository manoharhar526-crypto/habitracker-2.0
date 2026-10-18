/**
 * tombstones.ts — remembers what was deliberately deleted on this device so a
 * sync with an older copy (another phone, the cloud) can't bring it back.
 * Stored under a "habitracker_" key so it is mirrored to native storage.
 */
export type Tombstones = { habits: Record<string, string>; tasks: Record<string, string>; notes: Record<string, string> };
type Kind = keyof Tombstones;

const KEY = "habitracker_tombstones";
const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000; // forget after ~6 months

const empty = (): Tombstones => ({ habits: {}, tasks: {}, notes: {} });

export const getTombstones = (): Tombstones => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    return { ...empty(), ...(raw ?? {}) };
  } catch {
    return empty();
  }
};

const save = (t: Tombstones) => {
  const cutoff = Date.now() - MAX_AGE_MS;
  for (const k of Object.keys(t) as Kind[]) {
    for (const [id, at] of Object.entries(t[k])) if (Date.parse(at) < cutoff) delete t[k][id];
  }
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* quota */ }
};

export const addTombstone = (kind: Kind, id: string) => {
  const t = getTombstones();
  t[kind][id] = new Date().toISOString();
  save(t);
};

export const removeTombstone = (kind: Kind, id: string) => {
  const t = getTombstones();
  delete t[kind][id];
  save(t);
};

export const mergeTombstones = (a?: Partial<Tombstones>, b?: Partial<Tombstones>): Tombstones => {
  const out = empty();
  for (const src of [a, b]) {
    if (!src) continue;
    for (const k of Object.keys(out) as Kind[]) {
      for (const [id, at] of Object.entries(src[k] ?? {})) {
        if (!out[k][id] || out[k][id] < at) out[k][id] = at;
      }
    }
  }
  return out;
};

export const replaceTombstones = (t: Tombstones) => save(t);

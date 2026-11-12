/** Series you add yourself, for ones Loot Table's data doesn't have.
 *
 * They sit on the tier list like any other, framed in amber. They aren't in the community data, so
 * they don't feed recommendations, except one way: the author of one you rank S or A counts as an
 * author you like. Kept in this browser (and synced, when there's a sync server: sync.ts). */

import type { Bucket, Tier, Work } from "./api";

export interface CustomSeries {
  key: string;
  title: string;
  authors: string[];
  /** Cover image URL, or null for the initials placeholder */
  image: string | null;
  /** Book 1 on Audible, when the cover came from there */
  asin: string | null;
  added: string;
}

const STORE_KEY = "loot-table.custom";
const PREFIX = "custom:";

export const isCustom = (key: string) => key.startsWith(PREFIX);

export function readCustom(): Record<string, CustomSeries> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function write(all: Record<string, CustomSeries>): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(all));
}

export function saveCustom(series: Omit<CustomSeries, "key" | "added"> & { key?: string }): CustomSeries {
  const all = readCustom();
  const key = series.key ?? `${PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const saved: CustomSeries = {
    key,
    title: series.title.trim(),
    authors: series.authors.map((a) => a.trim()).filter(Boolean),
    image: series.image,
    asin: series.asin,
    added: all[key]?.added ?? new Date().toISOString(),
  };
  write({ ...all, [key]: saved });
  return saved;
}

/** Add ones from a tier list file that this browser doesn't have yet */
export function mergeCustom(incoming: Record<string, CustomSeries>): void {
  const all = readCustom();
  let changed = false;
  for (const [key, c] of Object.entries(incoming ?? {})) {
    if (isCustom(key) && !all[key] && typeof c?.title === "string") {
      all[key] = { ...c, key };
      changed = true;
    }
  }
  if (changed) write(all);
}

export function deleteCustom(key: string): void {
  const all = readCustom();
  delete all[key];
  write(all);
}

export function customWork(c: CustomSeries, tier: Tier | null = null): Work {
  return {
    key: c.key,
    title: c.title,
    authors: c.authors,
    narrators: [],
    bookCount: 0,
    firstAsin: c.asin ?? "",
    image: c.image,
    rating: null,
    ratingCount: null,
    runtimeMin: null,
    firstRelease: null,
    lastRelease: null,
    tier,
    audibleUrl: c.asin ? `https://www.audible.co.uk/pd/${c.asin}` : "",
    status: null,
    custom: true,
  };
}

/** Custom series whose title or author has the search term */
export function searchCustom(term: string, tierOf: Map<string, Tier | null>): Work[] {
  const t = term.trim().toLowerCase();
  if (!t) return [];
  const has = (s: string) => s.toLowerCase().includes(t);
  return Object.values(readCustom())
    .filter((c) => has(c.title) || c.authors.some(has))
    .map((c) => customWork(c, tierOf.get(c.key) ?? null));
}

/** Authors of the custom series ranked S or A, for the recommendations' "same author" signal */
export function likedCustomAuthors(stored: Partial<Record<Bucket, string[]>>): { author: string; title: string }[] {
  const all = readCustom();
  return (["S", "A"] as const).flatMap((t) =>
    (stored[t] ?? []).flatMap((k) => {
      const c = all[k];
      return c ? c.authors.slice(0, 2).map((author) => ({ author, title: c.title })) : [];
    }),
  );
}

export interface CoverMatch {
  title: string;
  authors: string[];
  image: string | null;
  asin: string;
}

/** Covers from Audible for a title (and author), through the sync server. Null when there's no
 * server to ask, or it couldn't reach Audible. */
export async function findCovers(title: string, author: string): Promise<CoverMatch[] | null> {
  try {
    const q = new URLSearchParams({ title, author });
    const res = await fetch(`api/covers?${q}`, { signal: AbortSignal.timeout(12000) });
    if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) return null;
    return (await res.json()).matches as CoverMatch[];
  } catch {
    return null;
  }
}

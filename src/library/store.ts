/** Holds the Library (model.ts), saves it, and talks to the server for Audible's book lists.
 * Components read it with useLibrary(); every change goes through an action here. */

import { useEffect, useState } from "react";
import {
  UNDATED,
  emptyLibrary,
  formatOf,
  fromGoogle,
  keyFor,
  mainBooks,
  mergeAudible,
  isOut,
  releaseCheck,
  nextBook,
  sortBooks,
  today,
  type AudibleSeries,
  type Format,
  type GoogleBook,
  type LibBook,
  type LibSeries,
  type Library,
} from "./model";

const STORE_KEY = "loot-table.library"; // synced with the rest of the list (sync.ts)

let lib: Library | null = null;
const listeners = new Set<() => void>();

function read(): Library {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
    if (raw?.v === 1) return migrate({ ...emptyLibrary(), ...raw, settings: { ...emptyLibrary().settings, ...raw.settings } });
  } catch {
    /* start empty */
  }
  return emptyLibrary();
}

/** Extras used to start unticked; now they count unless you untick them. The first build was out
 * for minutes, so an unticked extra is the old default, not a choice: tick them all, once. */
function migrate(l: Library): Library {
  const done = new Set(l.migrated ?? []);
  if (!done.has("extras-on")) {
    for (const s of Object.values(l.series)) for (const b of s.books) if (b.extra && b.include === false) delete b.include;
    done.add("extras-on");
  }
  // Series used to follow "I mostly listen / read" unless set otherwise, so switching it relabelled
  // books already logged. Now each series keeps its own: the one it shows at this moment.
  if (!done.has("series-format")) {
    for (const s of Object.values(l.series)) s.format ??= l.settings.format;
    done.add("series-format");
  }
  l.migrated = [...done];
  return l;
}

export function getLibrary(): Library {
  if (!lib) {
    const stored = localStorage.getItem(STORE_KEY);
    lib = read();
    // Save what migrate() changed, so it's done once (and synced)
    const now = JSON.stringify(lib);
    if (stored && stored !== now) {
      try {
        localStorage.setItem(STORE_KEY, now);
      } catch {
        /* keep it in memory */
      }
    }
  }
  return lib;
}

function commit(next: Library): void {
  lib = next;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked: keep it in memory */
  }
  listeners.forEach((l) => l());
}

/** Change the library: f gets a copy to modify */
function change(f: (l: Library) => void): void {
  const next: Library = structuredClone(getLibrary());
  f(next);
  commit(next);
}

function changeSeries(key: string, f: (s: LibSeries) => void): void {
  change((l) => {
    const s = l.series[key];
    if (s) f(s);
  });
}

function changeBook(key: string, bookId: string, f: (b: LibBook, s: LibSeries) => void): void {
  changeSeries(key, (s) => {
    const b = s.books.find((x) => x.id === bookId);
    if (b) f(b, s);
  });
}

export function useLibrary(): Library {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    // Another tab or a sync may have changed storage
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORE_KEY) {
        lib = read();
        l();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(l);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return getLibrary();
}

// ---- The server's Audible lookups ----

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) throw new Error("This needs your own server (it isn't on this site)");
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `Error ${res.status}`);
  return body as T;
}

export const fetchSeries = (asin: string, fresh = false) =>
  getJson<AudibleSeries>(`api/audible/series?asin=${encodeURIComponent(asin)}${fresh ? "&fresh=1" : ""}`);

export interface SeriesMatch {
  asin: string;
  kind: "series" | "book";
  title: string;
  authors: string[];
  image: string | null;
}

export const searchAudible = async (q: string) =>
  (await getJson<{ matches: SeriesMatch[] }>(`api/audible/search?q=${encodeURIComponent(q)}`)).matches;

export const searchGoogle = async (q: string) =>
  (await getJson<{ matches: GoogleBook[] }>(`api/books/search?q=${encodeURIComponent(q)}`)).matches;

/** The ASIN to look up for a tier list key: Loot Table's series keys are Audible series ASINs */
export function asinFromKey(key: string): string | null {
  const m = key.match(/^(?:series|book):([A-Z0-9]{10})$/i);
  return m ? m[1].toUpperCase() : null;
}

// ---- Actions ----

export type Place = "next" | "wish" | "library";

export interface AddOptions {
  place: Place;
  /** Numbered books before this index are marked finished (no dates) */
  finishedBefore?: number;
  /** Start this book today */
  startIndex?: number;
  /** Finished being written, from Loot Table's data */
  complete?: boolean;
}

/** Add a series from Audible's listing (or merge into the one you have) */
export function addFromAudible(info: AudibleSeries, opts: AddOptions): string {
  const key = keyFor(info);
  change((l) => {
    const { series } = mergeAudible(info, l.series[key]);
    if (opts.complete !== undefined && series.complete === undefined) series.complete = opts.complete;
    if (opts.complete !== undefined && !l.series[key]) series.complete = opts.complete || info.kind === "book";
    const main = mainBooks(series);
    // Books you'd already finished, without saying when: done, but not in the stats
    main.forEach((b, i) => {
      if (opts.finishedBefore !== undefined && i < opts.finishedBefore && !b.finished && isOut(b)) b.finished = UNDATED;
    });
    if (opts.startIndex !== undefined && main[opts.startIndex]) {
      main[opts.startIndex].started = today();
      main[opts.startIndex].finished = null;
    }
    series.wish = opts.place === "wish";
    series.format ??= l.settings.format; // your usual now: switching it later leaves this series be
    l.series[key] = series;
    series.seen = releaseCheck(series).seen;
    l.queue = l.queue.filter((k) => k !== key);
    if (opts.place === "next" && opts.startIndex === undefined) l.queue.push(key);
  });
  return key;
}

/** A book from Google Books (one Audible hasn't got) */
export function addFromGoogle(v: GoogleBook, place: Place, start = false): string {
  const series = fromGoogle(v);
  change((l) => {
    const have = l.series[series.key];
    if (have) return;
    series.wish = place === "wish";
    series.format = l.settings.format;
    series.seen = releaseCheck(series).seen;
    if (start) series.books[0].started = today();
    l.series[series.key] = series;
    if (place === "next" && !start) l.queue.push(series.key);
  });
  return series.key;
}

/** A series without Audible: just a name, and books you add by hand */
export function addManual(title: string, authors: string[], place: Place): string {
  const key = `manual:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  change((l) => {
    l.series[key] = { key, asin: null, kind: "manual", title, authors, image: null, books: [], wish: place === "wish", added: today(), format: l.settings.format };
    if (place === "next") l.queue.push(key);
  });
  return key;
}

export function startBook(key: string, bookId: string, date = today()): void {
  change((l) => {
    const s = l.series[key];
    const b = s?.books.find((x) => x.id === bookId);
    if (!s || !b) return;
    b.started = date;
    b.finished = null;
    s.wish = false;
    l.queue = l.queue.filter((k) => k !== key);
    l.news = l.news.filter((n) => n.key !== key);
  });
}

export function startNext(key: string): void {
  const s = getLibrary().series[key];
  const b = s && nextBook(s);
  if (b) startBook(key, b.id);
}

/** Mark finished; returns the series' next book, to offer starting it */
export function finishBook(key: string, bookId: string, date = today()): LibBook | null {
  changeBook(key, bookId, (b) => {
    b.finished = date;
  });
  change((l) => {
    if (l.pinned === key) l.pinned = null;
  });
  const s = getLibrary().series[key];
  return s ? nextBook(s) : null;
}

export function setDates(key: string, bookId: string, dates: { started?: string | null; finished?: string | null }): void {
  changeBook(key, bookId, (b) => {
    if (dates.started !== undefined) b.started = dates.started;
    if (dates.finished !== undefined) b.finished = dates.finished;
  });
}

/** Not listened after all */
export function clearBook(key: string, bookId: string): void {
  changeBook(key, bookId, (b) => {
    b.started = null;
    b.finished = null;
  });
}

export function setLength(key: string, bookId: string, minutes: number | null): void {
  changeBook(key, bookId, (b) => {
    b.minutes = minutes;
    b.edited = true;
  });
}

/** Not going to listen to it; or changed your mind */
export function setSkip(key: string, bookId: string, skip: boolean): void {
  changeBook(key, bookId, (b) => {
    if (skip) b.skip = true;
    else delete b.skip;
  });
}

export function setPages(key: string, bookId: string, pages: number | null): void {
  changeBook(key, bookId, (b) => {
    b.pages = pages;
    b.pagesEdited = true;
  });
}

/** Whether you mostly listen or read: how series you add from now on start (ones you have keep theirs) */
export function setDefaultFormat(format: Format): void {
  change((l) => {
    l.settings.format = format;
  });
}

/** Read or listened for a whole series: its own, whatever your usual is */
export function setSeriesFormat(key: string, format: Format): void {
  changeSeries(key, (s) => {
    s.format = format;
    // A book set the same way as its series needs no setting of its own
    for (const b of s.books) if (b.format === format) delete b.format;
  });
}

/** Read or listened for one book (null: the series' way) */
export function setBookFormat(key: string, bookId: string, format: Format | null): void {
  changeBook(key, bookId, (b) => {
    if (format) b.format = format;
    else delete b.format;
  });
}

// ---- Page counts from Google Books ----

let pagesOff = false; // no key on the server, or no server: stop asking this visit
const asking = new Set<string>();

/** Page counts for the books you read (or will) that haven't got one: from Google Books, by title
 * and author. A count you typed is never replaced. At most `limit` lookups. */
export async function fillPages(key: string, limit = 40): Promise<number> {
  if (pagesOff) return 0;
  const l = getLibrary();
  const s = l.series[key];
  if (!s) return 0;
  const want = s.books.filter((b) => !b.skip && b.pages == null && !b.pagesEdited && formatOf(l, s, b) === "read" && !asking.has(`${key}|${b.id}`));
  let got = 0;
  for (const b of want.slice(0, limit)) {
    asking.add(`${key}|${b.id}`);
    try {
      const { pages } = await getJson<{ pages: number | null }>(
        `api/books/pages?title=${encodeURIComponent(b.title)}&author=${encodeURIComponent(s.authors[0] ?? "")}`,
      );
      changeBook(key, b.id, (x) => {
        if (x.pages == null && !x.pagesEdited) x.pages = pages ?? 0; // 0: looked, none found
      });
      got++;
    } catch {
      pagesOff = true;
      break;
    } finally {
      asking.delete(`${key}|${b.id}`);
    }
  }
  return got;
}

/** Page counts for every series you read, a few at a time, when the Library opens */
export async function fillAllPages(limit = 60): Promise<void> {
  let left = limit;
  for (const s of Object.values(getLibrary().series)) {
    if (left <= 0 || pagesOff) return;
    left -= await fillPages(s.key, left);
  }
}

export function setInclude(key: string, bookId: string, include: boolean): void {
  changeBook(key, bookId, (b) => {
    if (include) delete b.include;
    else b.include = false;
  });
}

export function addBook(key: string, book: { title: string; n: string | null; minutes: number | null }): void {
  changeSeries(key, (s) => {
    s.books = sortBooks([...s.books, { id: `m-${Date.now().toString(36)}`, asin: null, ...book, manual: true }]);
  });
}

export function removeBook(key: string, bookId: string): void {
  changeSeries(key, (s) => {
    s.books = s.books.filter((b) => b.id !== bookId);
  });
}

export function updateSeries(key: string, patch: Partial<Pick<LibSeries, "notes" | "complete" | "title" | "authors" | "wish">>): void {
  changeSeries(key, (s) => Object.assign(s, patch));
}

export function removeSeries(key: string): void {
  change((l) => {
    delete l.series[key];
    l.queue = l.queue.filter((k) => k !== key);
    l.news = l.news.filter((n) => n.key !== key);
    if (l.pinned === key) l.pinned = null;
  });
}

export function queueAdd(key: string, front = false): void {
  change((l) => {
    l.queue = l.queue.filter((k) => k !== key);
    if (front) l.queue.unshift(key);
    else l.queue.push(key);
    if (l.series[key]) l.series[key].wish = false;
  });
}

export function queueRemove(key: string): void {
  change((l) => {
    l.queue = l.queue.filter((k) => k !== key);
  });
}

export function queueMove(from: number, to: number): void {
  change((l) => {
    const [k] = l.queue.splice(from, 1);
    if (k) l.queue.splice(to, 0, k);
  });
}

export function toWishlist(key: string): void {
  change((l) => {
    l.queue = l.queue.filter((k) => k !== key);
    if (l.series[key]) l.series[key].wish = true;
  });
}

export function pin(key: string | null): void {
  change((l) => {
    l.pinned = key;
  });
}

export function dismissNews(key: string, undoQueue = false): void {
  change((l) => {
    const item = l.news.find((n) => n.key === key);
    l.news = l.news.filter((n) => n.key !== key);
    if (undoQueue && item?.queued) l.queue = l.queue.filter((k) => k !== key);
  });
}

export function setAutoQueue(on: boolean): void {
  change((l) => {
    l.settings.autoQueue = on;
  });
}

// ---- Keeping book lists up to date ----

/** Look a series up on Audible again and merge in what's changed; a new book in a series you were
 * caught up on is news, and joins Up next if you've said so */
export async function refreshSeries(key: string, fresh = false): Promise<void> {
  const before = getLibrary().series[key];
  if (!before?.asin) return;
  const info = await fetchSeries(before.asin, fresh);
  change((l) => {
    const have = l.series[key];
    if (!have) return;
    l.series[key] = mergeAudible(info, have).series;
    noteRelease(l, key);
  });
}

/** Record what's out for a series, and make news of a book that's come out (see releaseCheck) */
function noteRelease(l: Library, key: string): boolean {
  const s = l.series[key];
  if (!s) return false;
  const { news, seen } = releaseCheck(s);
  const changed = JSON.stringify(seen) !== JSON.stringify(s.seen);
  s.seen = seen;
  if (news && !l.news.some((n) => n.key === key)) {
    const queued = l.settings.autoQueue && !l.queue.includes(key);
    if (queued) l.queue.push(key);
    l.news.push({ key, bookId: news.id, text: `${s.title}, ${news.n ? `Book ${news.n}` : news.title}`, queued });
    return true;
  }
  return changed;
}

/** Books whose release date has arrived since you last looked: no Audible call needed */
export function checkReleases(): void {
  const l: Library = structuredClone(getLibrary());
  let changed = false;
  for (const key of Object.keys(l.series)) changed = noteRelease(l, key) || changed;
  if (changed) commit(l);
}

let refreshing = false;

/** Once a day per series, when the Library opens. Stops at the first failure (no server, or
 * Audible down) and tries again next time. */
export async function refreshStale(maxAgeHours = 24): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  try {
    const cutoff = Date.now() - maxAgeHours * 3600_000;
    const stale = Object.values(getLibrary().series)
      .filter((s) => s.asin && (!s.refreshedAt || Date.parse(s.refreshedAt) < cutoff))
      .slice(0, 40);
    checkReleases();
    for (const s of stale) await refreshSeries(s.key, true); // past the server's short cache: this is the daily check
  } catch {
    /* next time */
  } finally {
    refreshing = false;
  }
  await fillAllPages().catch(() => {});
}

/** Put a whole series in (import), in the place given; Up next keeps the order they arrive in */
export function putSeries(series: LibSeries, place: Place): void {
  change((l) => {
    l.series[series.key] = series;
    series.format ??= l.settings.format;
    series.seen = releaseCheck(series).seen;
    if (place === "wish") series.wish = true;
    if (place === "next" && !l.queue.includes(series.key)) l.queue.push(series.key);
  });
}

/** Replace the whole library (import) */
export function replaceLibrary(next: Library): void {
  commit(next);
}

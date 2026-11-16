/** The Library: what you're listening to, what's next, and when you finished each book.
 *
 * Kept in this browser under one storage key, so it syncs like the tier list (sync.ts). Book lists
 * and lengths come from Audible, through the server (audible.mjs); the dates are yours. Everything
 * here is plain functions over the data; store.ts holds it and saves it. */

export interface LibBook {
  /** Audible ASIN, or a made-up id for one you added by hand */
  id: string;
  asin: string | null;
  /** Number in the series ("1", "3.5"), or null for an extra (a side story) */
  n: string | null;
  title: string;
  minutes: number | null;
  /** You set the length yourself: Audible's doesn't replace it */
  edited?: boolean;
  released?: string | null;
  /** A side book (unnumbered, or half-numbered like 3.5): counts unless you untick it (include: false) */
  extra?: boolean;
  include?: boolean;
  /** You're not going to listen to it: counts nowhere (progress, books left, what's next) */
  skip?: boolean;
  /** Dates as YYYY-MM-DD */
  started?: string | null;
  finished?: string | null;
  manual?: boolean;
}

export interface LibSeries {
  /** "series:<ASIN>" (Loot Table's key too), "book:<ASIN>" for a standalone, "manual:<id>" without Audible */
  key: string;
  asin: string | null;
  kind: "series" | "book" | "manual";
  title: string;
  authors: string[];
  image: string | null;
  books: LibBook[];
  /** On your wishlist rather than in your library proper */
  wish?: boolean;
  /** Finished being written (from Loot Table's data when added, or set by you) */
  complete?: boolean;
  notes?: string;
  added: string;
  refreshedAt?: string | null;
  /** The numbered books that were out when this series was last checked: one that's out now and
   * isn't here is a new release (see releaseCheck) */
  seen?: string[];
}

export interface NewsItem {
  key: string;
  bookId: string;
  text: string;
  queued: boolean;
}

export interface Library {
  v: 1;
  series: Record<string, LibSeries>;
  /** Up next, in order */
  queue: string[];
  /** The book shown big in Now listening, when you picked one */
  pinned: string | null;
  news: NewsItem[];
  settings: { autoQueue: boolean };
  /** One-off changes already made to this library's data */
  migrated?: string[];
}

/** Finished, but you didn't say when: counts as done, never in the stats */
export const UNDATED = "0000-00-00";
export const hasDate = (d: string | null | undefined): d is string => !!d && d !== UNDATED;

export const emptyLibrary = (): Library => ({ v: 1, series: {}, queue: [], pinned: null, news: [], settings: { autoQueue: true } });

export type Status = "listening" | "next" | "wish" | "partway" | "caught" | "finished" | "unstarted";

export const STATUS_LABEL: Record<Status, string> = {
  listening: "Listening",
  next: "Up next",
  wish: "Wishlist",
  partway: "Part-way",
  caught: "Caught up",
  finished: "Finished",
  unstarted: "Not started",
};

/** A real release date: Audible uses far-future ones (2200-01-01) to mean "unknown" */
export const releaseDate = (b: Pick<LibBook, "released">) => (b.released && b.released < "2100" ? b.released : null);

/** Out already: released by today (or no date known), or you've started it anyway */
export const isOut = (b: LibBook, now = today()) => {
  const d = releaseDate(b);
  return !d || d <= now || !!b.started || !!b.finished;
};

/** The books that count: out already, not skipped, and extras you haven't unticked */
export const counted = (s: LibSeries) => {
  const now = today();
  return s.books.filter((b) => !b.skip && (!b.extra || b.include !== false) && isOut(b, now));
};

/** Books not out yet, soonest first */
export const upcoming = (s: LibSeries) =>
  s.books.filter((b) => !b.skip && !isOut(b)).sort((a, b) => String(a.released).localeCompare(String(b.released)));
export const mainBooks = (s: LibSeries) => s.books.filter((b) => !b.extra);
export const isListening = (b: LibBook) => !!b.started && !b.finished;

export function statusOf(s: LibSeries, lib: Library): Status {
  const books = counted(s);
  if (books.some(isListening)) return "listening";
  if (lib.queue.includes(s.key)) return "next";
  if (s.wish) return "wish";
  const done = books.filter((b) => b.finished).length;
  if (books.length && done === books.length) return s.complete ? "finished" : "caught";
  return done ? "partway" : "unstarted";
}

/** The next book to listen to: the first that counts and isn't finished, in series order (an
 * included 3.5 comes between 3 and 4; unnumbered extras last) */
export function nextBook(s: LibSeries): LibBook | null {
  return counted(s).find((b) => !b.finished) ?? null;
}

export function remaining(s: LibSeries): { books: number; minutes: number } {
  const left = counted(s).filter((b) => !b.finished);
  return { books: left.length, minutes: left.reduce((m, b) => m + (b.minutes ?? 0), 0) };
}

export function listened(s: LibSeries): number {
  return counted(s).reduce((m, b) => m + (b.finished ? b.minutes ?? 0 : 0), 0);
}

export function lastFinished(s: LibSeries): string | null {
  return s.books.reduce<string | null>((d, b) => (hasDate(b.finished) && (!d || b.finished > d) ? b.finished : d), null);
}

export interface Listening {
  series: LibSeries;
  book: LibBook;
}

/** Books in progress: the pinned one first, then the most recently started */
export function nowListening(lib: Library): Listening[] {
  const out: Listening[] = [];
  for (const s of Object.values(lib.series)) for (const b of counted(s)) if (isListening(b)) out.push({ series: s, book: b });
  return out.sort((a, b) => {
    if (a.series.key === lib.pinned) return -1;
    if (b.series.key === lib.pinned) return 1;
    return String(b.book.started).localeCompare(String(a.book.started));
  });
}

/** "Book 4" for a numbered book, else its title */
export const bookLabel = (b: LibBook) => (b.n ? `Book ${b.n}` : b.title);

/** "Cradle, Book 4", or just the title for a standalone */
export const fullLabel = (s: Pick<LibSeries, "title" | "kind">, b: LibBook) => (s.kind === "book" ? s.title : `${s.title}, ${bookLabel(b)}`);

// ---- Dates and durations ----

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const parts = (iso: string) => iso.split("-").map(Number) as [number, number, number];
const utc = (iso: string) => {
  const [y, m, d] = parts(iso);
  return Date.UTC(y, m - 1, d);
};
export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / 86400000);

export function fmtDate(iso: string | null | undefined, withYear = true): string {
  if (!iso) return "";
  if (iso === UNDATED) return "No date";
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** 1095 → "18h 15m" */
export function fmtMinutes(min: number | null | undefined, short = false): string {
  if (min == null) return "–";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (short) return `${Math.round(min / 60)}h`;
  return m ? `${h}h ${String(m).padStart(2, "0")}m` : `${h}h`;
}

/** 36500 → "25 days 8 hours" */
export function fmtDays(min: number): string {
  const hours = Math.round(min / 60);
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return d ? `${d} day${d === 1 ? "" : "s"} ${h} hour${h === 1 ? "" : "s"}` : `${h} hour${h === 1 ? "" : "s"}`;
}

/** "18:14", "18h 14m", "18h", "1094" (minutes) → minutes */
export function parseLength(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  let m = t.match(/^(\d+):(\d{1,2})(?::\d{1,2})?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/^(?:(\d+)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?$/);
  if (m && (m[1] || m[2])) return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  if (/^\d+$/.test(t)) return Number(t);
  return null;
}

/** "2026-11-10", "10/11/2026" (day first) → YYYY-MM-DD */
export function parseDate(text: string): string | null {
  const t = text.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

// ---- Stats: each book's minutes spread over the days you listened to it ----

/** A book's minutes by month ("2026-10"): spread evenly over the days from start to finish (both
 * counted), or all in the finish month when there's no start date */
export function splitByMonth(b: Pick<LibBook, "started" | "finished" | "minutes">): Map<string, { minutes: number; days: number }> {
  const out = new Map<string, { minutes: number; days: number }>();
  if (!hasDate(b.finished) || !b.minutes) return out;
  if (!hasDate(b.started) || b.started > b.finished) {
    out.set(b.finished.slice(0, 7), { minutes: b.minutes, days: 0 });
    return out;
  }
  const total = daysBetween(b.started, b.finished) + 1;
  let [y, m, d] = parts(b.started);
  let left = total;
  while (left > 0) {
    const inMonth = new Date(Date.UTC(y, m, 0)).getUTCDate() - d + 1;
    const days = Math.min(inMonth, left);
    out.set(`${y}-${String(m).padStart(2, "0")}`, { minutes: (b.minutes * days) / total, days });
    left -= days;
    d = 1;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export interface YearStats {
  year: number;
  /** Minutes and books finished in each month, Jan to Dec */
  months: { minutes: number; books: number }[];
  minutes: number;
  books: number;
  series: number;
  /** Minutes a day, over the days of the year you were tracking (to today, for this year) */
  perDay: number;
  peak: { month: number; minutes: number } | null;
  top: { key: string; title: string; minutes: number }[];
  finished: { key: string; series: string; book: LibBook }[];
  /** This year, up to which month (0–11); 11 for past years */
  upTo: number;
}

export function yearsWithData(lib: Library): number[] {
  const years = new Set<number>([new Date().getFullYear()]);
  for (const s of Object.values(lib.series))
    for (const b of s.books) {
      if (hasDate(b.finished)) years.add(Number(b.finished.slice(0, 4)));
      if (hasDate(b.started) && hasDate(b.finished)) years.add(Number(b.started.slice(0, 4)));
    }
  return [...years].sort();
}

export function yearStats(lib: Library, year: number, now = today()): YearStats {
  const months = Array.from({ length: 12 }, () => ({ minutes: 0, books: 0 }));
  const bySeries = new Map<string, number>();
  const finished: YearStats["finished"] = [];
  const seriesDone = new Set<string>();
  let first: string | null = null;
  for (const s of Object.values(lib.series)) {
    for (const b of s.books) {
      if (b.skip || (b.extra && b.include === false)) continue;
      if (!hasDate(b.finished)) continue;
      const start = hasDate(b.started) && b.started <= b.finished ? b.started : b.finished;
      if (!first || start < first) first = start;
      for (const [month, part] of splitByMonth(b)) {
        if (Number(month.slice(0, 4)) !== year) continue;
        months[Number(month.slice(5)) - 1].minutes += part.minutes;
        bySeries.set(s.key, (bySeries.get(s.key) ?? 0) + part.minutes);
      }
      if (Number(b.finished.slice(0, 4)) === year) {
        months[Number(b.finished.slice(5, 7)) - 1].books += 1;
        finished.push({ key: s.key, series: s.title, book: b });
        seriesDone.add(s.key);
      }
    }
  }
  const minutes = months.reduce((m, x) => m + x.minutes, 0);
  const thisYear = Number(now.slice(0, 4));
  const from = first && Number(first.slice(0, 4)) === year ? first : `${year}-01-01`;
  const to = year === thisYear ? now : `${year}-12-31`;
  const days = year > thisYear || from > to ? 0 : daysBetween(from, to) + 1;
  const peakIdx = months.reduce((best, x, i) => (x.minutes > months[best].minutes ? i : best), 0);
  return {
    year,
    months,
    minutes,
    books: finished.length,
    series: seriesDone.size,
    perDay: days ? minutes / days : 0,
    peak: months[peakIdx].minutes ? { month: peakIdx, minutes: months[peakIdx].minutes } : null,
    top: [...bySeries.entries()]
      .map(([key, m]) => ({ key, title: lib.series[key]?.title ?? key, minutes: m }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 6),
    finished: finished.sort((a, b) => String(b.book.finished).localeCompare(String(a.book.finished))),
    upTo: year === thisYear ? Number(now.slice(5, 7)) - 1 : 11,
  };
}

// ---- Bringing in Audible's book list ----

/** What the server returns for a series (audible.mjs) */
export interface AudibleSeries {
  asin: string;
  kind: "series" | "book";
  title: string;
  authors: string[];
  image: string | null;
  books: { asin: string; n: string | null; title: string; minutes: number | null; released: string | null; extra?: boolean }[];
  fetchedAt: string;
}

export function keyFor(info: Pick<AudibleSeries, "asin" | "kind">): string {
  return `${info.kind === "book" ? "book" : "series"}:${info.asin}`;
}

/** A series from Audible's listing, new or merged into the one you have. Your dates, included
 * extras, edited lengths and hand-added books are kept; a book Audible now lists under another
 * edition keeps your dates by its number. Returns the series and the numbered books that are new
 * since it was last looked at (none for a series that's new to the library). */
export function mergeAudible(info: AudibleSeries, have?: LibSeries): { series: LibSeries; added: LibBook[] } {
  const old = have?.books ?? [];
  const byAsin = new Map(old.filter((b) => b.asin).map((b) => [b.asin, b]));
  const byNumber = new Map(old.filter((b) => b.n).map((b) => [String(parseFloat(b.n!)), b]));
  const used = new Set<LibBook>();
  const added: LibBook[] = [];
  const books: LibBook[] = info.books.map((a) => {
    const prev = byAsin.get(a.asin) ?? (a.n ? byNumber.get(String(parseFloat(a.n))) : undefined);
    if (prev) used.add(prev);
    const book: LibBook = {
      id: a.asin,
      asin: a.asin,
      n: a.n,
      title: a.title,
      // Your length stays if you set it or finished the book (what you listened to); otherwise Audible's
      minutes: prev && (prev.edited || prev.finished) ? prev.minutes : a.minutes,
      ...(prev?.edited ? { edited: true } : {}),
      released: a.released,
      ...(a.extra ? { extra: true, ...(prev?.include === false ? { include: false } : {}) } : {}),
      ...(prev?.skip ? { skip: true } : {}),
      started: prev?.started ?? null,
      finished: prev?.finished ?? null,
    };
    if (!prev && have && !a.extra) added.push(book);
    return book;
  });
  // Books Audible no longer lists: keep the ones you've added or logged
  for (const b of old) if (!used.has(b) && (b.manual || b.started || b.finished)) books.push(b);
  // (a new half-numbered book isn't "added": it's an extra, not the next book in the series)
  return {
    series: {
      key: have?.key ?? keyFor(info),
      asin: info.asin,
      kind: info.kind,
      title: have?.kind === "manual" ? have.title : info.title || have?.title || "",
      authors: info.authors.length ? info.authors : have?.authors ?? [],
      image: info.image ?? have?.image ?? null,
      books: sortBooks(books),
      wish: have?.wish,
      complete: have?.complete ?? info.kind === "book",
      notes: have?.notes,
      added: have?.added ?? today(),
      refreshedAt: info.fetchedAt,
      ...(have?.seen ? { seen: have.seen } : {}),
    },
    added,
  };
}

/** Numbered books in order, then extras and unnumbered ones */
export function sortBooks(books: LibBook[]): LibBook[] {
  return [...books].sort((a, b) => {
    const an = a.n ? parseFloat(a.n) : Infinity;
    const bn = b.n ? parseFloat(b.n) : Infinity;
    return an - bn || String(a.released ?? "").localeCompare(String(b.released ?? ""));
  });
}

/** A book's place in a series that survives a new edition: its number, else its id */
const slot = (b: LibBook) => (b.n ? `n${parseFloat(b.n)}` : b.id);

/** Has a numbered book come out since the series was last checked, in a series you'd finished every
 * book of that was out then? That's news (and it joins Up next). It counts when it comes out, not
 * when Audible first lists it with a date ahead. Returns the book, and the new list of what's out.
 * The first check of a series only records what's out. */
export function releaseCheck(s: LibSeries, now = today()): { news: LibBook | null; seen: string[] } {
  const main = s.books.filter((b) => !b.extra && !b.skip);
  const out = main.filter((b) => isOut(b, now));
  const seen = out.map(slot);
  if (!s.seen) return { news: null, seen };
  const before = main.filter((b) => s.seen!.includes(slot(b)));
  const fresh = out.filter((b) => !s.seen!.includes(slot(b)) && !b.started && !b.finished);
  const caughtUp = before.length > 0 && before.every((b) => b.finished);
  return { news: fresh.length && caughtUp ? fresh[0] : null, seen };
}

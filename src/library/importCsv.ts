/** Bring a listening history in from a CSV: one row per book (or per series, for a queue or
 * wishlist entry). Columns, any order, header names case-insensitive:
 *
 *   series       the series' name (required)
 *   series_asin  its Audible ASIN, if you know it (else it's found by name)
 *   book         its number in the series ("3", "3.5")
 *   title        the book's title (matches unnumbered extras, or names a book Audible hasn't got)
 *   length       how long it is ("18:14", "18h 14m")
 *   pages        how many pages it has
 *   format       "read" or "listen" (else your usual)
 *   started      when you started it (YYYY-MM-DD, or DD/MM/YYYY)
 *   finished     when you finished it
 *   list         "next" (Up next, in the order they appear) or "wish" (wishlist)
 *
 * Each series is looked up on Audible for its full book list; your rows fill in the dates. */

import { api } from "../api";
import { norm } from "../engine/text";
import { mergeAudible, parseDate, parseLength, sortBooks, today, type LibBook, type LibSeries } from "./model";
import { asinFromKey, fetchSeries, getLibrary, putSeries, searchAudible } from "./store";

export interface CsvRow {
  series: string;
  seriesAsin: string;
  book: string;
  title: string;
  length: string;
  pages: string;
  format: string;
  started: string;
  finished: string;
  list: string;
}

/** CSV text → rows, with quoted fields and the header mapped to our names */
export function parseCsv(text: string): { rows: CsvRow[]; error?: string } {
  const lines = splitCsv(text.replace(/^﻿/, "")).filter((r) => r.some((c) => c.trim()));
  if (!lines.length) return { rows: [], error: "The file is empty." };
  const head = lines[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const at = {
    series: col("series", "series_name"),
    seriesAsin: col("series_asin", "asin"),
    book: col("book", "number", "book_number", "#", "n"),
    title: col("title", "book_title"),
    length: col("length", "duration", "runtime"),
    pages: col("pages", "page_count", "pagecount"),
    format: col("format", "type", "medium"),
    started: col("started", "start", "start_date", "date_started"),
    finished: col("finished", "finish", "end", "finish_date", "date_finished", "completed"),
    list: col("list", "place", "status"),
  };
  if (at.series < 0) return { rows: [], error: 'There\'s no "series" column. The first line should name the columns, starting with series.' };
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const rows = lines.slice(1).map((r) => ({
    series: get(r, at.series),
    seriesAsin: get(r, at.seriesAsin).toUpperCase(),
    book: get(r, at.book),
    title: get(r, at.title),
    length: get(r, at.length),
    pages: get(r, at.pages),
    format: get(r, at.format).toLowerCase(),
    started: get(r, at.started),
    finished: get(r, at.finished),
    list: get(r, at.list).toLowerCase(),
  }));
  return { rows: rows.filter((r) => r.series) };
}

function splitCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === "," || c === "\t") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  out.push(row);
  return out;
}

export interface ImportResult {
  series: number;
  books: number;
  onAudible: number;
  notFound: string[];
  problems: string[];
}

/** Find the series on Audible: the ASIN given, else Loot Table's series of that name, else Audible's */
async function findAsin(name: string, given: string): Promise<{ asin: string | null; complete?: boolean }> {
  if (/^[A-Z0-9]{10}$/.test(given)) return { asin: given };
  const want = norm(name);
  const works = await api.search(name, 8);
  const w = works.find((x) => norm(x.title) === want) ?? works.find((x) => norm(x.title).startsWith(want) || want.startsWith(norm(x.title)));
  const state = w?.status?.state;
  const complete = state ? state === "complete" || state === "standalone" : undefined;
  const fromLoot = w && (asinFromKey(w.key) ?? (w.firstAsin || null));
  if (fromLoot) return { asin: fromLoot, complete };
  try {
    const found = await searchAudible(name);
    const m = found.find((x) => norm(x.title) === want);
    return { asin: m?.asin ?? null };
  } catch {
    return { asin: null };
  }
}

export async function importRows(rows: CsvRow[], onProgress: (done: number, total: number, name: string) => void): Promise<ImportResult> {
  const groups = new Map<string, CsvRow[]>();
  for (const r of rows) {
    const k = r.seriesAsin || norm(r.series);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const result: ImportResult = { series: 0, books: 0, onAudible: 0, notFound: [], problems: [] };
  let i = 0;
  for (const group of groups.values()) {
    const name = group[0].series;
    onProgress(i++, groups.size, name);
    const { asin, complete } = await findAsin(name, group[0].seriesAsin);
    let series: LibSeries | null = null;
    if (asin) {
      try {
        const info = await fetchSeries(asin);
        const key = `${info.kind === "book" ? "book" : "series"}:${info.asin}`;
        series = mergeAudible(info, getLibrary().series[key]).series;
        if (complete !== undefined && getLibrary().series[key]?.complete === undefined) series.complete = complete;
        result.onAudible++;
      } catch (e) {
        result.problems.push(`${name}: ${e instanceof Error ? e.message : "couldn't reach Audible"}, so its books are only the ones in your file.`);
      }
    } else result.notFound.push(name);
    series ??= {
      key: `manual:${norm(name).replace(/\s+/g, "-").slice(0, 40) || Date.now().toString(36)}`,
      asin: null,
      kind: "manual",
      title: name,
      authors: [],
      image: null,
      books: [],
      added: today(),
    };
    for (const r of group) {
      if (!r.book && !r.title) continue;
      const book = matchBook(series, r);
      const started = parseDate(r.started);
      const finished = parseDate(r.finished);
      const minutes = parseLength(r.length);
      if (r.started && !started) result.problems.push(`${name} ${r.book || r.title}: couldn't read the start date "${r.started}".`);
      if (r.finished && !finished) result.problems.push(`${name} ${r.book || r.title}: couldn't read the finish date "${r.finished}".`);
      if (started) book.started = started;
      if (finished) book.finished = finished;
      if (minutes) {
        book.minutes = minutes;
        book.edited = true;
      }
      const pages = parseInt(r.pages.replace(/[^\d]/g, ""), 10);
      if (pages > 0) {
        book.pages = pages;
        book.pagesEdited = true;
      }
      if (/^(read|e-?book|kindle|print|book|paper)/.test(r.format)) book.format = "read";
      else if (/^(listen|audio)/.test(r.format)) book.format = "listen";
      if (book.extra) delete book.include; // you listened to it: it counts
      result.books++;
    }
    series.books = sortBooks(series.books);
    const list = group.find((r) => r.list)?.list ?? "";
    putSeries(series, list.startsWith("next") || list.startsWith("up") || list === "queue" ? "next" : list.startsWith("wish") ? "wish" : "library");
    result.series++;
  }
  onProgress(groups.size, groups.size, "");
  return result;
}

/** The series' book a row is about: by number, then by title; else a new book for it */
function matchBook(s: LibSeries, r: CsvRow): LibBook {
  const n = r.book.replace(/^(?:book|vol(?:ume)?\.?)\s*/i, "").trim();
  if (n && Number.isFinite(parseFloat(n))) {
    const hit = s.books.find((b) => b.n && parseFloat(b.n) === parseFloat(n));
    if (hit) return hit;
  }
  const t = norm(r.title.replace(/^(?:book|vol(?:ume)?\.?)\s*[\d.]+\s*[:.-]?\s*/i, ""));
  if (t) {
    const hit = s.books.find((b) => norm(b.title) === t) ?? s.books.find((b) => norm(b.title).includes(t) || (norm(b.title) && t.includes(norm(b.title))));
    if (hit) return hit;
  }
  const book: LibBook = {
    id: `m-${Math.random().toString(36).slice(2, 9)}`,
    asin: null,
    n: n && Number.isFinite(parseFloat(n)) ? n : null,
    title: r.title || (n ? `Book ${n}` : "Untitled"),
    minutes: null,
    manual: true,
  };
  s.books.push(book);
  return book;
}

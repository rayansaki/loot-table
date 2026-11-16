import { describe, expect, it } from "vitest";
import {
  UNDATED,
  emptyLibrary,
  mergeAudible,
  releaseCheck,
  upcoming,
  nextBook,
  nowListening,
  parseDate,
  parseLength,
  remaining,
  splitByMonth,
  statusOf,
  yearStats,
  type AudibleSeries,
  type LibSeries,
} from "./model";

const audible = (books: [string | null, string, number][], extra: Partial<AudibleSeries> = {}): AudibleSeries => ({
  asin: "SERIES0001",
  kind: "series",
  title: "Test Saga",
  authors: ["A. Writer"],
  image: null,
  books: books.map(([n, asin, minutes]) => ({ asin, n, title: `T${asin}`, minutes, released: "2025-01-01", ...(n ? {} : { extra: true }) })),
  fetchedAt: "2026-11-16T00:00:00Z",
  ...extra,
});

describe("spreading a book over the months you listened to it", () => {
  it("splits by days, both ends counted", () => {
    const split = splitByMonth({ started: "2026-09-14", finished: "2026-10-30", minutes: 1275 });
    expect(split.get("2026-09")!.days).toBe(17);
    expect(split.get("2026-10")!.days).toBe(30);
    expect(Math.round(split.get("2026-09")!.minutes)).toBe(461); // 7h 41m
    expect(Math.round(split.get("2026-10")!.minutes)).toBe(814); // 13h 34m
  });

  it("crosses a year, and puts a book with no start date in its finish month", () => {
    const split = splitByMonth({ started: "2025-12-31", finished: "2026-01-01", minutes: 100 });
    expect(split.get("2025-12")!.minutes).toBe(50);
    expect(split.get("2026-01")!.minutes).toBe(50);
    expect([...splitByMonth({ started: null, finished: "2026-03-05", minutes: 90 })]).toEqual([["2026-03", { minutes: 90, days: 0 }]]);
  });

  it("leaves out books finished without a date", () => {
    expect(splitByMonth({ started: null, finished: UNDATED, minutes: 90 }).size).toBe(0);
  });
});

describe("a year's stats", () => {
  const lib = emptyLibrary();
  lib.series["series:A"] = {
    key: "series:A", asin: "A", kind: "series", title: "A", authors: [], image: null, added: "2026-01-01",
    books: [
      { id: "1", asin: "1", n: "1", title: "One", minutes: 600, started: "2025-12-27", finished: "2026-01-05" },
      { id: "2", asin: "2", n: "2", title: "Two", minutes: 300, started: null, finished: "2026-02-10" },
      { id: "3", asin: "3", n: "3", title: "Three", minutes: 300, started: null, finished: UNDATED },
    ],
  };
  const y = yearStats(lib, 2026, "2026-03-31");

  it("counts hours where they were listened, and books in the month they were finished", () => {
    expect(Math.round(y.months[0].minutes)).toBe(300); // 5 of the 10 days
    expect(y.months[1].minutes).toBe(300);
    expect(y.books).toBe(2);
    expect(y.months[0].books).toBe(1);
    expect(Math.round(yearStats(lib, 2025, "2026-03-31").minutes)).toBe(300);
  });

  it("averages over the days so far this year", () => {
    expect(Math.round(y.perDay * 90)).toBe(600); // 600 minutes over Jan–Mar (90 days)
    expect(y.peak?.month).toBe(0);
  });
});

describe("merging Audible's listing into a series you have", () => {
  const first = mergeAudible(audible([["1", "B1", 600], ["2", "B2", 620], [null, "X1", 200]]));

  it("starts with no dates, extras counted", () => {
    expect(first.series.key).toBe("series:SERIES0001");
    expect(first.added).toEqual([]);
    expect(remaining(first.series)).toEqual({ books: 3, minutes: 1420 });
  });

  it("leaves out skipped books and unticked extras, and keeps both choices through a refresh", () => {
    const mine: LibSeries = structuredClone(first.series);
    mine.books[1].skip = true;
    mine.books[2].include = false;
    expect(remaining(mine)).toEqual({ books: 1, minutes: 600 });
    mine.books[0].finished = "2026-01-10";
    expect(nextBook(mine)).toBeNull();
    const again = mergeAudible(audible([["1", "B1", 600], ["2", "B2", 620], [null, "X1", 200]]), mine).series;
    expect([again.books[1].skip, again.books[2].include]).toEqual([true, false]);
  });

  it("puts an included 3.5 between 3 and 4 as the next book", () => {
    const s = mergeAudible(audible([["3", "B3", 600], ["3.5", "N35", 120], ["4", "B4", 600]].map(([n, a, m]) => [n, a, m] as [string, string, number]))).series;
    s.books[1].extra = true;
    s.books[0].finished = "2026-01-01";
    expect(nextBook(s)?.asin).toBe("N35");
  });

  it("keeps your dates and lengths, follows a new edition by number, and spots a new book", () => {
    const mine: LibSeries = structuredClone(first.series);
    mine.books[0].finished = "2026-01-10";
    mine.books[1].finished = "2026-02-10";
    mine.books[1].minutes = 615;
    const next = mergeAudible(audible([["1", "B1-new", 650], ["2", "B2", 620], ["3", "B3", 700], [null, "X1", 200]]), mine);
    expect(next.series.books[0]).toMatchObject({ asin: "B1-new", finished: "2026-01-10", minutes: 600 });
    expect(next.series.books[1]).toMatchObject({ finished: "2026-02-10", minutes: 615 });
    expect(next.added.map((b) => b.asin)).toEqual(["B3"]);
    // An unfinished book takes the new edition's length
    const unfinished = mergeAudible(audible([["1", "B1", 600], ["2", "B2-new", 640]]), first.series);
    expect(unfinished.series.books[1].minutes).toBe(640);
    expect(releaseCheck({ ...next.series, seen: ["n1", "n2"] }).news?.asin).toBe("B3");
    expect(nextBook(next.series)?.asin).toBe("B3");
  });

  it("keeps track of what was out through a refresh, so a new book is news", () => {
    const mine: LibSeries = { ...structuredClone(first.series), seen: ["n1", "n2"] };
    mine.books[0].finished = "2026-01-10";
    mine.books[1].finished = "2026-02-10";
    const next = mergeAudible(audible([["1", "B1", 600], ["2", "B2", 620], ["3", "B3", 700]]), mine).series;
    expect(next.seen).toEqual(["n1", "n2"]);
    expect(releaseCheck(next).news?.asin).toBe("B3");
  });

  it("only calls it news when you'd finished every book", () => {
    const partway = mergeAudible(audible([["1", "B1", 600], ["2", "B2", 620], ["3", "B3", 700]]), first.series);
    expect(releaseCheck({ ...partway.series, seen: ["n1", "n2"] }).news).toBeNull();
  });
});

describe("books not out yet", () => {
  const s = structuredClone(mergeAudible(audible([["1", "B1", 600], ["2", "B2", 600], ["3", "B3", 600]])).series);
  s.books[0].finished = "2026-01-10";
  s.books[1].released = "2026-02-01";
  s.books[2].released = "2099-01-01";

  it("don't count until they're out", () => {
    expect(remaining(s)).toEqual({ books: 1, minutes: 600 });
    expect(upcoming(s).map((b) => b.asin)).toEqual(["B3"]);
    expect(nextBook(s)?.asin).toBe("B2");
  });

  it("are news on the day they come out, not when they're listed", () => {
    const caught = structuredClone(s);
    caught.books[1].finished = "2026-03-01";
    const listed = releaseCheck(caught, "2026-11-16");
    expect(listed.news).toBeNull(); // book 3 is listed, but not out
    expect(listed.seen).toEqual(["n1", "n2"]);
    const day = releaseCheck({ ...caught, seen: listed.seen }, "2099-01-01");
    expect(day.news?.asin).toBe("B3");
  });

  it("ignore Audible's placeholder date for unknown (2200-01-01)", () => {
    const p = structuredClone(s);
    p.books[2].released = "2200-01-01";
    expect(upcoming(p)).toEqual([]);
    expect(remaining(p).books).toBe(2);
  });

  it("don't count as news the first time a series is checked", () => {
    expect(releaseCheck({ ...s, seen: undefined }).news).toBeNull();
  });
});

describe("status and now listening", () => {
  it("follows what you've done", () => {
    const lib = emptyLibrary();
    const s = structuredClone(mergeAudible(audible([["1", "B1", 600], ["2", "B2", 620]])).series);
    lib.series[s.key] = s;
    expect(statusOf(s, lib)).toBe("unstarted");
    lib.queue.push(s.key);
    expect(statusOf(s, lib)).toBe("next");
    s.books[0].started = "2026-11-01";
    expect(statusOf(s, lib)).toBe("listening");
    expect(nowListening(lib)[0].book.asin).toBe("B1");
    s.books[0].finished = "2026-11-10";
    s.books[1].finished = "2026-11-20";
    lib.queue = [];
    expect(statusOf(s, lib)).toBe("caught");
    s.complete = true;
    expect(statusOf(s, lib)).toBe("finished");
  });
});

describe("reading what people type", () => {
  it("lengths", () => {
    expect(parseLength("18:14")).toBe(1094);
    expect(parseLength("18h 14m")).toBe(1094);
    expect(parseLength("7h")).toBe(420);
    expect(parseLength("")).toBeNull();
  });
  it("dates, day first", () => {
    expect(parseDate("10/11/2026")).toBe("2026-11-10");
    expect(parseDate("2026-1-5")).toBe("2026-01-05");
    expect(parseDate("next week")).toBeNull();
  });
});

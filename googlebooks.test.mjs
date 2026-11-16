// Google Books volumes as the Library reads them (googlebooks.mjs)
import { afterEach, describe, expect, it, vi } from "vitest";
import { pageCount, volume } from "./googlebooks.mjs";

const item = (id, title, pages, extra = {}) => ({ id, volumeInfo: { title, authors: ["Sarah J. Maas"], pageCount: pages, language: "en", publishedDate: "2015-05-05", ...extra } });

describe("reading a Google Books volume", () => {
  it("takes its title, pages, date and cover", () => {
    const v = volume(item("abc", "A Court of Thorns and Roses", 432, { imageLinks: { thumbnail: "http://books.google.com/x?id=abc&edge=curl&zoom=1" } }));
    expect(v).toMatchObject({ id: "abc", pages: 432, released: "2015-05-05", image: "https://books.google.com/x?id=abc&zoom=1" });
  });
  it("makes a year alone the first of January, and no page count null", () => {
    expect(volume(item("a", "X", 0, { publishedDate: "2019" }))).toMatchObject({ released: "2019-01-01", pages: null });
  });
});

describe("a book's page count", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("is the middle of the matching English editions", async () => {
    const items = [
      item("1", "A Court of Thorns and Roses", 419),
      item("2", "A Court of Thorns and Roses", 432),
      item("3", "A Court of Thorns and Roses", 448),
      item("4", "A Court of Thorns and Roses", 512, { language: "de" }),
      item("5", "A Court of Thorns and Roses Coloring Book", 96),
      item("6", "A Court of Thorns and Roses", 300, { authors: ["Someone Else"] }),
    ];
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ items }) }));
    expect(await pageCount("https://x", "k", "A Court of Thorns and Roses", "Sarah J. Maas")).toBe(432);
  });
  it("is null when nothing matches", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({}) }));
    expect(await pageCount("https://x", "k", "Nothing", "Nobody")).toBeNull();
  });
});

import { parseTitle } from "./googlebooks.mjs";

describe("a title as series name and number", () => {
  it("reads numbers written any way", () => {
    expect(parseTitle("The Primal Hunter 9: A LitRPG Adventure")).toEqual({ base: "primal hunter", n: "9" });
    expect(parseTitle("Primal Hunter 4: A LitRPG Adventure")).toEqual({ base: "primal hunter", n: "4" });
    expect(parseTitle("The Primal Hunter: A LitRPG Adventure. book one")).toEqual({ base: "primal hunter", n: "1" });
    expect(parseTitle("The Perfect Run III")).toEqual({ base: "perfect run", n: "3" });
    expect(parseTitle("The Perfect Run 3")).toEqual({ base: "perfect run", n: "3" });
    expect(parseTitle("Azarinth Healer Book Seven: A LitRPG Adventure")).toEqual({ base: "azarinth healer", n: "7" });
    expect(parseTitle("Azarinth Healer: A LitRPG Adventure. Book one")).toEqual({ base: "azarinth healer", n: "1" });
    expect(parseTitle("Azarinth Healer, Book 1")).toEqual({ base: "azarinth healer", n: "1" });
    expect(parseTitle("The Perfect Run")).toEqual({ base: "perfect run", n: null });
    expect(parseTitle("Solo Leveling Series")).toEqual({ base: "solo leveling", n: null });
  });
});

describe("page counts by series number", () => {
  afterEach(() => vi.unstubAllGlobals());
  const v = (id, title, pages, extra = {}) => ({ id, volumeInfo: { title, authors: ["Zogarth"], pageCount: pages, language: "en", ...extra } });
  // What Google Books lists for The Primal Hunter (checked on books.google.com)
  const primal = [
    v("a", "Primal Hunter Tome 5 - Volume 5", 600, { language: "fr" }),
    v("b", "The Primal Hunter 9: A LitRPG Adventure", 602),
    v("c", "Primal Hunter 4: A LitRPG Adventure", 752),
    v("d", "The Primal Hunter 2: A LitRPG Adventure", 700),
    v("e", "Primal Hunter. Tom 1", 650, { language: "pl" }),
    v("f", "The Primal Hunter: A LitRPG Adventure", 698),
    v("g", "The Primal Hunter (Light Novel) Vol. 1", 224),
  ];
  const editions = async () => primal;

  it("finds each book by its number, the unnumbered one being book 1, leaving out translations and adaptations", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({}) }));
    expect(await pageCount("x", "k", "The Primal Hunter 4", "Zogarth", "The Primal Hunter", "4", editions)).toBe(752);
    expect(await pageCount("x", "k", "The Primal Hunter 9", "Zogarth", "The Primal Hunter", "9", editions)).toBe(602);
    expect(await pageCount("x", "k", "The Primal Hunter", "Zogarth", "The Primal Hunter", "1", editions)).toBe(698);
    expect(await pageCount("x", "k", "The Primal Hunter 5", "Zogarth", "The Primal Hunter", "5", editions)).toBeNull();
  });

  it("matches Roman numerals to Audible's numbers", async () => {
    const run = [v("1", "The Perfect Run", 500, { authors: ["Maxime J. Durand"] }), v("2", "The Perfect Run II", 520, { authors: ["Maxime Julien Durand"] }), v("3", "The Perfect Run III", 540, { authors: ["Maxime J. Durand"] })];
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({}) }));
    const e = async () => run;
    expect(await pageCount("x", "k", "The Perfect Run 3", "Maxime J. Durand", "The Perfect Run", "3", e)).toBe(540);
    expect(await pageCount("x", "k", "The Perfect Run II", "Maxime J. Durand", "The Perfect Run", "2", e)).toBe(520);
    expect(await pageCount("x", "k", "The Perfect Run", "Maxime J. Durand", "The Perfect Run", "1", e)).toBe(500);
  });

  it("matches a book with a title of its own by that title", async () => {
    const dcc = [v("x", "Carl's Doomsday Scenario: Dungeon Crawler Carl Book 2", 380, { authors: ["Matt Dinniman"] }), v("y", "Dungeon Crawler Carl", 450, { authors: ["Matt Dinniman"] })];
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ items: dcc }) }));
    const e = async () => dcc;
    expect(await pageCount("x", "k", "Carl's Doomsday Scenario", "Matt Dinniman", "Dungeon Crawler Carl", "2", e)).toBe(380);
    expect(await pageCount("x", "k", "Dungeon Crawler Carl", "Matt Dinniman", "Dungeon Crawler Carl", "1", e)).toBe(450);
  });
});

describe("page counts the first way found too", () => {
  afterEach(() => vi.unstubAllGlobals());
  const v = (id, title, pages, extra = {}) => ({ id, volumeInfo: { title, authors: ["Matt Dinniman"], pageCount: pages, language: "en", ...extra } });

  it("matches a title of its own with the series in brackets or a subtitle after it", async () => {
    const own = [v("a", "The Eye of the Bedlam Bride (Dungeon Crawler Carl Book 6)", 650), v("b", "The Dungeon Anarchist's Cookbook", 420, { subtitle: "Dungeon Crawler Carl Book 3" })];
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ items: own }) }));
    const none = async () => [];
    expect(await pageCount("x", "k", "The Eye of the Bedlam Bride", "Matt Dinniman", "Dungeon Crawler Carl", "6", none)).toBe(650);
    expect(await pageCount("x", "k", "The Dungeon Anarchist's Cookbook", "Matt Dinniman", "Dungeon Crawler Carl", "3", none)).toBe(420);
  });

  it("finds a numbered book the series' search missed, through its own search", async () => {
    const ph15 = [{ id: "z", volumeInfo: { title: "The Primal Hunter 15: A LitRPG Adventure", authors: ["Zogarth"], pageCount: 810, language: "en" } }];
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ items: ph15 }) }));
    expect(await pageCount("x", "k", "The Primal Hunter 15", "Zogarth", "The Primal Hunter", "15", async () => [])).toBe(810);
  });

  it("doesn't take book 9 for book 1 when book 1's title is just the series' name", async () => {
    const ph = [{ id: "y", volumeInfo: { title: "The Primal Hunter 9: A LitRPG Adventure", authors: ["Zogarth"], pageCount: 602, language: "en" } }];
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ items: ph }) }));
    expect(await pageCount("x", "k", "The Primal Hunter", "Zogarth", "The Primal Hunter", "1", async () => [])).toBeNull();
  });
});

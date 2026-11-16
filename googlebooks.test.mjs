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

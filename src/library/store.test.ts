// The store with a stand-in for the browser's storage: your usual way (listen or read) applies to
// series you add from then on, never to ones you have
import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
});

const book = (id: string) => ({ id, title: `T${id}`, authors: ["A"], pages: 200, released: "2020-01-01", image: null, isbn: null });

describe("your usual way", () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  it("is stamped on each series as it's added, so switching it later changes nothing logged", async () => {
    const store = await import("./store");
    const { formatOf } = await import("./model");
    store.setDefaultFormat("listen");
    const heard = store.addFromGoogle(book("a"), "library");
    store.setDefaultFormat("read");
    const read = store.addFromGoogle(book("b"), "library");
    store.setDefaultFormat("listen");
    const l = store.getLibrary();
    expect(formatOf(l, l.series[heard])).toBe("listen");
    expect(formatOf(l, l.series[read])).toBe("read");
  });

  it("keeps a series' choice even when it's the same as your usual", async () => {
    const store = await import("./store");
    const { formatOf } = await import("./model");
    store.setDefaultFormat("read");
    const k = store.addFromGoogle(book("c"), "library");
    store.setSeriesFormat(k, "read");
    store.setDefaultFormat("listen");
    expect(formatOf(store.getLibrary(), store.getLibrary().series[k])).toBe("read");
  });

  it("fixes series saved before this, once, as they show now", async () => {
    storage.set(
      "loot-table.library",
      JSON.stringify({ v: 1, series: { "gbook:x": { key: "gbook:x", asin: null, kind: "book", title: "X", authors: [], image: null, books: [], added: "2026-01-01" } }, queue: [], pinned: null, news: [], settings: { autoQueue: true, format: "read" }, migrated: ["extras-on"] }),
    );
    const store = await import("./store");
    const l = store.getLibrary();
    expect(l.series["gbook:x"].format).toBe("read");
    expect(l.migrated).toContain("series-format");
    store.setDefaultFormat("listen");
    expect(store.getLibrary().series["gbook:x"].format).toBe("read");
  });
});

describe("looking up page counts again", () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  it("keeps a count found before when Google Books has nothing this time", async () => {
    const store = await import("./store");
    store.setDefaultFormat("read");
    vi.stubGlobal("fetch", async (u: string) => ({ ok: true, headers: new Headers({ "content-type": "application/json" }), json: async () => (String(u).includes("books/pages") ? { pages: null } : {}) }));
    const k = store.addFromGoogle(book("d"), "library"); // 200 pages, from Google Books' search
    const r = await store.fillPages(k, 10, true);
    expect(r.looked).toBe(1);
    expect(store.getLibrary().series[k].books[0].pages).toBe(200);
  });
});

describe("a page count you typed", () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  it("is left alone by lookups, and emptying it hands the book back to them", async () => {
    const store = await import("./store");
    store.setDefaultFormat("read");
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => {
      if (String(u).includes("books/pages")) asked.push(String(u));
      return { ok: true, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ pages: 333 }) };
    });
    const k = store.addFromGoogle(book("e"), "library");
    const id = store.getLibrary().series[k].books[0].id;
    store.setPages(k, id, 125);
    expect((await store.fillPages(k, 10, true)).looked).toBe(0);
    expect(store.getLibrary().series[k].books[0].pages).toBe(125);
    store.setPages(k, id, null);
    expect((await store.fillPages(k, 10, true)).looked).toBe(1);
    expect(store.getLibrary().series[k].books[0].pages).toBe(333);
  });

  it("looks up a book left marked as typed but empty, as clearing one used to leave it", async () => {
    const store = await import("./store");
    store.setDefaultFormat("read");
    vi.stubGlobal("fetch", async () => ({ ok: true, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ pages: 290 }) }));
    const k = store.addFromGoogle(book("f"), "library");
    const s = store.getLibrary().series[k];
    s.books[0].pages = null;
    s.books[0].pagesEdited = true;
    expect((await store.fillPages(k, 10, true)).looked).toBe(1);
    expect(store.getLibrary().series[k].books[0]).toMatchObject({ pages: 290 });
    expect(store.getLibrary().series[k].books[0].pagesEdited).toBeUndefined();
  });
});

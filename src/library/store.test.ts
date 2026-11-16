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

// Series you add yourself (custom.ts) aren't in the data, but their authors count as ones you like
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildIndex, type Dataset } from "./data";
import { recommend } from "./recommend";

const data: Dataset = JSON.parse(readFileSync(new URL("../../public/data.json", import.meta.url), "utf-8"));
const index = buildIndex(data);

describe("liked authors of your own series", () => {
  // A recommendable series and its author, written the way someone might type it
  const target = data.works.find((w) => w.core && w.authors.length)!;
  const author = target.authors[0];
  const typed = ` ${author.toUpperCase().replace(/\s+/g, "  ")} `;

  it("make that author's series a pick, saying why", () => {
    const recs = recommend(index, new Map(), new Set(), [{ author: typed, title: "My Own Series" }]);
    const pick = recs.find((r) => r.key === target.key);
    expect(pick?.reasons).toContain("same author as My Own Series");
  });

  it("change nothing when the author isn't in the data", () => {
    const plain = recommend(index, new Map(), new Set());
    const withUnknown = recommend(index, new Map(), new Set(), [{ author: "Nobody Atall Xyz", title: "Mine" }]);
    expect(withUnknown).toEqual(plain);
  });
});

// The clean-up of a series' Audible listing (audible.mjs), with Cradle as Audible lists it: 19
// entries for 12 books and one side book
import { describe, expect, it } from "vitest";
import { cleanBooks } from "./audible.mjs";

const P = (asin, title, minutes, released, extra = {}) => ({ asin, title, runtime_length_min: minutes, release_date: released, language: "english", ...extra });
const cradle = [
  ["1", P("B07GTBMK3L", "Unsouled", 494, "2018-08-27", { subtitle: "Cradle, Volume 1" })],
  ["1", P("B07XTP9F2Q", "Unsouled", 532, "2019-09-25")],
  ["2", P("B07K41NLR3", "Soulsmith", 477, "2018-11-05")],
  ["2", P("B07XTLM3BL", "Soulsmith", 511, "2019-09-25")],
  ["3", P("B07L3BK6HG", "Blackflame", 640, "2018-12-01")],
  ["3", P("B07XTRK2W5", "Blackflame", 670, "2019-09-25")],
  ["4", P("B07MWYW6H4", "Skysworn", 500, "2019-01-10")],
  ["4", P("B07XTMQ66Y", "Skysworn", 523, "2019-09-25")],
  ["5", P("B07NPZBN4B", "Ghostwater", 540, "2019-02-10")],
  ["5", P("B07XTN8YXN", "Ghostwater", 556, "2019-09-25")],
  ["6", P("B07PKRZW7L", "Underlord", 608, "2019-03-12")],
  ["6", P("B07XLNNL5V", "Underlord", 642, "2019-09-25")],
  ["7", P("B07XTMMZWW", "Uncrowned", 572, "2019-10-01")],
  ["8", P("B08J8C49QD", "Wintersteel", 879, "2020-09-01")],
  ["9", P("B08X69JMBC", "Bloodline", 672, "2021-03-01")],
  ["10", P("B09JPHP5RD", "Reaper", 787, "2021-11-01")],
  ["11", P("B0B3JXSWJQ", "Dreadgod", 748, "2022-06-01")],
  ["12", P("B0BXQTDQVH", "Waybound", 973, "2023-06-06")],
  ["", P("B0DN3JYRCC", "Threshold", 515, "2025-01-07", { subtitle: "Stories from Cradle" })],
].map(([sequence, product]) => ({ sequence, product }));

describe("cleaning up a series from Audible", () => {
  const books = cleanBooks(cradle);
  const main = books.filter((b) => !b.extra);

  it("keeps one book per number, in order, with the side book as an extra", () => {
    expect(main.map((b) => b.n)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
    expect(books.filter((b) => b.extra).map((b) => b.title)).toEqual(["Threshold"]);
  });

  it("picks the newest edition, matching the lengths people actually listened to", () => {
    expect(main.slice(0, 2).map((b) => [b.asin, b.minutes])).toEqual([["B07XTP9F2Q", 532], ["B07XTLM3BL", 511]]);
  });

  it("leaves out box sets and translations, and prefers narration over a dramatisation", () => {
    const extra = [
      { sequence: "1-3", product: P("BOX0000001", "Cradle: Books 1-3", 1600, "2020-01-01") },
      { sequence: "4", product: P("BOX0000002", "Cradle Collection", 900, "2026-01-01") },
      { sequence: "1", product: P("DE00000001", "Seelenlos", 520, "2026-01-01", { language: "german" }) },
      { sequence: "2", product: P("DRAMA00001", "Soulsmith (Dramatized Adaptation)", 400, "2026-02-01") },
    ];
    const out = cleanBooks([...cradle, ...extra]).filter((b) => !b.extra);
    expect(out).toHaveLength(12);
    expect(out.map((b) => b.asin)).not.toContain("BOX0000001");
    expect(out[0].asin).toBe("B07XTP9F2Q");
    expect(out[1].asin).toBe("B07XTLM3BL");
  });

  it("passes over Audible's old listings (dated 2200, no cover) for the edition on sale", () => {
    // The Beginning After the End, as Audible lists books 1 and 2
    const ghost = (asin, title) => P(asin, title, 360, "2200-01-01");
    const out = cleanBooks([
      { sequence: "1-2", product: P("1774241307", "The Beginning After the End: Publisher's Pack", 760, "2019-12-03", { product_images: { 500: "pack.jpg" } }) },
      { sequence: "1", product: ghost("B087GTMK2W", "Early Years") },
      { sequence: "1", product: P("B0DH67NZMM", "Early Years", 368, "2024-10-01", { product_images: { 500: "ey.jpg" } }) },
      { sequence: "2", product: P("B0DH5ZMRC2", "New Heights", 377, "2024-10-01", { product_images: { 500: "nh.jpg" } }) },
      { sequence: "2", product: ghost("B087GVP1VL", "New Heights") },
    ]);
    expect(out.map((b) => [b.asin, b.image])).toEqual([["B0DH67NZMM", "ey.jpg"], ["B0DH5ZMRC2", "nh.jpg"]]);
  });

  it("makes half-numbered books extras, kept in their place by number", () => {
    const out = cleanBooks([...cradle, { sequence: "3.5", product: P("NOVELLA001", "A Novella", 120, "2020-01-01") }]);
    expect(out.slice(2, 5).map((b) => [b.n, !!b.extra])).toEqual([["3", false], ["3.5", true], ["4", false]]);
    expect(out.filter((b) => !b.extra)).toHaveLength(12);
  });
});

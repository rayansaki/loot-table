// Series and books from Audible's catalog, for the Library (src/library). Used by server.mjs.
//
// Audible lists every edition of every book in a series: Cradle has 19 entries for 12 books, because
// books 1–6 were re-released and there's an unnumbered side book. So the books are cleaned up:
// one per series number (the newest edition, unless it's a dramatised one), box sets left out, and
// unnumbered and half-numbered books (side stories, novellas) kept apart as extras.

const RESPONSE = "product_attrs,product_desc,contributors,series,media,relationships";

async function getJson(url) {
  const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Audible answered ${r.status}`);
  return r.json();
}

const image = (p) => p?.product_images?.["500"] ?? Object.values(p?.product_images ?? {})[0] ?? null;
const names = (list) => (list ?? []).map((a) => a.name).filter(Boolean);

/** Products by ASIN, 50 at a time (Audible's limit for one request) */
async function products(api, asins) {
  const out = [];
  for (let i = 0; i < asins.length; i += 50) {
    const q = new URLSearchParams({ asins: asins.slice(i, i + 50).join(","), response_groups: RESPONSE, image_sizes: "500" });
    out.push(...((await getJson(`${api}/1.0/catalog/products?${q}`)).products ?? []));
  }
  return out;
}

const BOX_SET = /\bbooks?\s*\d+\s*(?:[-–]|to|&|and)\s*\d+\b|\bbox(?:ed)?\s*set\b|\bomnibus\b|\bcollection\b/i;
const DRAMATISED = /dramati[sz]ed|graphic\s*audio|full[- ]cast|audio\s*drama/i;

/** A series' books from its catalog entries: [{ sequence, product }] → main books in order, then extras */
export function cleanBooks(entries) {
  const language = mostCommon(entries.map((e) => e.product.language).filter(Boolean));
  const byNumber = new Map();
  const extras = [];
  for (const { sequence, product: p } of entries) {
    if (language && p.language && p.language !== language) continue; // a translation
    const seq = String(sequence ?? "").trim();
    const label = `${p.title ?? ""} ${p.subtitle ?? ""}`;
    if (/[-–,&]/.test(seq) || BOX_SET.test(label)) continue;
    const book = {
      asin: p.asin,
      n: seq || null,
      title: p.title ?? "",
      minutes: Number.isFinite(p.runtime_length_min) ? p.runtime_length_min : null,
      // Audible uses far-future dates (2200-01-01) as "unknown"
      released: p.release_date && p.release_date < "2100" ? p.release_date : null,
      image: image(p),
      dramatised: DRAMATISED.test(label),
    };
    if (!seq) {
      extras.push(book);
      continue;
    }
    const key = String(parseFloat(seq));
    const prev = byNumber.get(key);
    if (!prev || better(book, prev)) byNumber.set(key, book);
  }
  const main = [...byNumber.values()].sort((a, b) => parseFloat(a.n) - parseFloat(b.n));
  extras.sort((a, b) => String(a.released).localeCompare(String(b.released)));
  const strip = ({ dramatised, ...b }) => b;
  // A half-numbered book (3.5) is usually a novella: an extra, kept in its place by number
  const whole = (b) => Number.isInteger(parseFloat(b.n));
  return [...main.map((b) => (whole(b) ? strip(b) : { ...strip(b), extra: true })), ...extras.map((b) => ({ ...strip(b), extra: true }))];
}

/** Of two editions of the same book: the narrated one over a dramatisation, then the newest */
function better(a, b) {
  if (a.dramatised !== b.dramatised) return !a.dramatised;
  return String(a.released ?? "") > String(b.released ?? "");
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** A series, from its ASIN or the ASIN of any of its books. A book that's in no series comes back as
 * a series of one (kind "book"). */
export async function seriesInfo(api, asin) {
  const [first] = await products(api, [asin]);
  if (!first) throw new Error("Not on Audible");
  let series = first;
  const children = (p) => (p.relationships ?? []).filter((r) => r.relationship_to_product === "child");
  if (!children(series).length) {
    const parent = (first.relationships ?? []).find((r) => r.relationship_to_product === "parent" && r.relationship_type === "series");
    if (!parent) {
      return {
        asin: first.asin,
        kind: "book",
        title: first.title ?? "",
        authors: names(first.authors).slice(0, 3),
        image: image(first),
        books: cleanBooks([{ sequence: "1", product: first }]),
        fetchedAt: new Date().toISOString(),
      };
    }
    [series] = await products(api, [parent.asin]);
    if (!series) throw new Error("Series not on Audible");
  }
  const rels = children(series);
  const found = await products(api, rels.map((r) => r.asin));
  const byAsin = new Map(found.map((p) => [p.asin, p]));
  const entries = rels
    .filter((r) => byAsin.has(r.asin))
    .map((r) => ({ sequence: r.sequence ?? byAsin.get(r.asin).series?.find((s) => s.asin === series.asin)?.sequence, product: byAsin.get(r.asin) }));
  const books = cleanBooks(entries);
  const lead = byAsin.get(books[0]?.asin);
  return {
    asin: series.asin,
    kind: "series",
    title: series.title ?? lead?.series?.[0]?.title ?? "",
    authors: names(lead?.authors ?? series.authors).slice(0, 3),
    image: books[0]?.image ?? image(series),
    books,
    fetchedAt: new Date().toISOString(),
  };
}

/** Series (and books outside any series) matching a search, one each */
export async function searchSeries(api, q) {
  const query = new URLSearchParams({
    keywords: q,
    num_results: "25",
    products_sort_by: "Relevance",
    response_groups: "media,contributors,series",
    image_sizes: "500",
  });
  const found = (await getJson(`${api}/1.0/catalog/products?${query}`)).products ?? [];
  const out = new Map();
  for (const p of found) {
    const s = p.series?.[0];
    const id = s?.asin ?? p.asin;
    const seq = parseFloat(s?.sequence);
    const order = Number.isFinite(seq) ? seq : Infinity;
    const prev = out.get(id);
    if (prev && prev.order <= order) continue;
    out.set(id, {
      order,
      rank: prev ? prev.rank : out.size,
      match: {
        asin: id,
        kind: s ? "series" : "book",
        title: s?.title ?? p.title ?? "",
        authors: names(p.authors).slice(0, 3),
        image: image(p),
      },
    });
  }
  return [...out.values()].sort((a, b) => a.rank - b.rank).slice(0, 10).map((x) => x.match);
}

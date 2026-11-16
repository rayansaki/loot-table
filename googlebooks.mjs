// Books from Google Books, for the Library's ebooks and page counts (src/library). Used by
// server.mjs, with the key in GOOGLE_BOOKS_KEY. Audible stays the source for series (book order,
// numbers, new releases); Google Books adds books Audible hasn't got, and how many pages a book has.

const http = (u) => (u ? u.replace(/^http:/, "https:").replace(/&edge=curl/, "") : null);

async function getJson(url) {
  const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(r.status === 429 ? "Google Books' daily limit is used up" : `Google Books answered ${r.status}`);
  return r.json();
}

/** One volume, the way the Library wants it */
export function volume(item) {
  const v = item.volumeInfo ?? {};
  const isbn = (v.industryIdentifiers ?? []).find((x) => x.type === "ISBN_13")?.identifier ?? null;
  const date = /^\d{4}(-\d{2}(-\d{2})?)?$/.test(v.publishedDate ?? "") ? v.publishedDate : null;
  return {
    id: item.id,
    title: v.subtitle && v.subtitle.length < 40 && !/novel|book \d/i.test(v.subtitle) ? `${v.title}: ${v.subtitle}` : v.title ?? "",
    authors: (v.authors ?? []).slice(0, 3),
    pages: Number.isFinite(v.pageCount) && v.pageCount > 0 ? v.pageCount : null,
    // A year alone, or a year and month, is the first of it
    released: date ? (date.length === 4 ? `${date}-01-01` : date.length === 7 ? `${date}-01` : date) : null,
    image: http(v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail ?? null),
    isbn,
    language: v.language ?? null,
  };
}

export async function searchBooks(api, key, q) {
  const query = new URLSearchParams({ q, maxResults: "20", printType: "books", key });
  const found = (await getJson(`${api}/books/v1/volumes?${query}`)).items ?? [];
  // English first, then the rest; drop exact repeats (the same book, another edition)
  const seen = new Set();
  return found
    .map(volume)
    .filter((b) => b.title)
    .sort((a, b) => Number(b.language === "en") - Number(a.language === "en"))
    .filter((b) => {
      const k = `${b.title.toLowerCase()}|${(b.authors[0] ?? "").toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 10);
}

const words = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** How many pages a book has: the editions Google Books lists for that title and author, in
 * English, with a page count. Several editions disagree; the middle one is the safest guess. */
export async function pageCount(api, key, title, author) {
  const q = [`intitle:${title}`, author ? `inauthor:${author}` : ""].filter(Boolean).join(" ");
  const query = new URLSearchParams({ q, maxResults: "20", printType: "books", key });
  const found = ((await getJson(`${api}/books/v1/volumes?${query}`)).items ?? []).map(volume);
  const want = words(title);
  const surname = words(author).split(" ").pop();
  const counts = found
    .filter((b) => b.pages && (!b.language || b.language === "en"))
    .filter((b) => {
      const t = words(b.title);
      return t === want || t.startsWith(`${want} `) || want.startsWith(`${t} `);
    })
    .filter((b) => !surname || b.authors.some((a) => words(a).includes(surname)))
    .map((b) => b.pages)
    .sort((a, b) => a - b);
  return counts.length ? counts[Math.floor(counts.length / 2)] : null;
}

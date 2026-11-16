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
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const ROMAN = ["", "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx"];
const numberOf = (w) => {
  if (/^\d+(\.\d+)?$/.test(w)) return String(parseFloat(w));
  const i = NUMBER_WORDS.indexOf(w);
  return i >= 0 ? String(i) : null;
};

/** Not the book itself: an adaptation, a bundle, a translation's labelling, or a companion */
const NOT_THE_BOOK = /light novel|graphic novel|manga|comic|box(ed)? set|collection|omnibus|books? \d+\s*(-|–|to|and|&)\s*\d+|colou?ring|summary|workbook|study guide|\btome\b|\btom \d|bundle/i;

/** A title as series name + number: "The Primal Hunter 9: A LitRPG Adventure" → { base: "primal hunter",
 * n: "9" }; "The Perfect Run III" → n "3"; "Azarinth Healer Book Seven" → n "7"; "The Primal Hunter: A
 * LitRPG Adventure. book one" → n "1". A leading "the/a/an" and the subtitle don't count. */
export function parseTitle(title, subtitle = "") {
  const main = words(String(title).split(":")[0]);
  const all = `${main} ${words(subtitle)} ${words(String(title).split(":").slice(1).join(" "))}`;
  let n = null;
  let base = main;
  // "... book seven" / "... volume 2" in the main title
  let m = base.match(/^(.*?)\s+(?:book|volume|vol|part)\s+(\S+)$/);
  if (m && numberOf(m[2])) [base, n] = [m[1], numberOf(m[2])];
  // a trailing number or Roman numeral: "primal hunter 9", "perfect run iii"
  if (!n) {
    m = base.match(/^(.*\S)\s+(\d+(?:\.\d+)?|[ivx]{1,5})$/);
    if (m && (/^\d/.test(m[2]) || ROMAN.includes(m[2]))) [base, n] = [m[1], /^\d/.test(m[2]) ? String(parseFloat(m[2])) : String(ROMAN.indexOf(m[2]))];
  }
  // "book one" in the subtitle
  if (!n) {
    m = all.match(/\b(?:book|volume|vol)\s+(\S+)/);
    if (m && numberOf(m[1])) n = numberOf(m[1]);
  }
  base = base.replace(/^(the|a|an)\s+/, "").replace(/\s+series$/, "").trim();
  return { base, n };
}

/** The editions Google Books has of a series' books: two pages of results for the series' name and
 * author, which beats searching book by book (translations and adaptations crowd those out) */
export async function seriesEditions(api, key, series, author) {
  const surname = words(author).split(" ").pop() ?? "";
  const q = `intitle:"${parseTitle(series).base}"${surname ? ` inauthor:${surname}` : ""}`;
  const out = [];
  for (const startIndex of ["0", "40"]) {
    const query = new URLSearchParams({ q, maxResults: "40", startIndex, printType: "books", key });
    const items = (await getJson(`${api}/books/v1/volumes?${query}`)).items ?? [];
    out.push(...items);
    if (items.length < 40) break;
  }
  return out;
}

/** The book's own search: its title and author as Audible has them (the first way of looking, which
 * found books like The Primal Hunter 15 that a series' 80 results can miss) */
async function titleEditions(api, key, title, author) {
  const q = [`intitle:${title}`, author ? `inauthor:${author}` : ""].filter(Boolean).join(" ");
  const query = new URLSearchParams({ q, maxResults: "20", printType: "books", key });
  return (await getJson(`${api}/books/v1/volumes?${query}`)).items ?? [];
}

/** How many pages a book has, from the English editions Google Books has of it: matched by the
 * book's own title if it has one ("Carl's Doomsday Scenario"), else by the series' name and the
 * book's number in it, written any way ("4", "IV", "Book Four"); an unnumbered edition counts as
 * book 1. Editions disagree a little; the middle one is the safest guess. `editions` caches the
 * series' search between books. */
export async function pageCount(api, key, title, author, series = "", n = null, editions = null) {
  const surname = words(author).split(" ").pop();
  const want = parseTitle(title);
  const seriesBase = series ? parseTitle(series).base : want.base;
  const number = n != null && n !== "" ? String(parseFloat(n)) : want.n ?? (want.base === seriesBase ? "1" : null);
  // A title of its own: not just the series' name (and a number)
  const ownTitle = want.base && want.base !== seriesBase;
  const pool = [
    ...(editions ? await editions() : series ? await seriesEditions(api, key, series, author) : []),
    ...(await titleEditions(api, key, title, author)),
  ];
  // A title of its own matches the start of an edition's title or the other way round, with or
  // without its subtitle: "The Eye of the Bedlam Bride (Dungeon Crawler Carl Book 6)" is book 6
  const bare = (t) => words(t).replace(/^(the|a|an) /, "");
  const same = (a, b) => !!a && !!b && (a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `));
  const mine = [bare(String(title).split(":")[0]), bare(title)];
  const seen = new Set();
  const counts = [];
  for (const item of pool) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const v = item.volumeInfo ?? {};
    if (!(v.pageCount > 0) || (v.language && v.language !== "en")) continue;
    if (NOT_THE_BOOK.test(`${v.title ?? ""} ${v.subtitle ?? ""}`)) continue;
    if (surname && !(v.authors ?? []).some((a) => words(a).includes(surname))) continue;
    const got = parseTitle(v.title ?? "", v.subtitle ?? "");
    const byNumber = number != null && got.base === seriesBase && (got.n ?? "1") === number;
    const theirs = [bare(v.title ?? ""), bare(`${v.title ?? ""} ${v.subtitle ?? ""}`)];
    const byTitle = ownTitle && mine.some((a) => theirs.some((b) => same(a, b)));
    const match = byNumber || byTitle;
    if (match) counts.push(v.pageCount);
  }
  counts.sort((a, b) => a - b);
  return counts.length ? counts[Math.floor(counts.length / 2)] : null;
}

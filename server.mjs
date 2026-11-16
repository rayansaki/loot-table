// Serves the built website, plus a place to keep tier lists so every browser sees the same one.
// Only for hosting it yourself (Railway, say); the app works without it. No packages needed.
//
// The accounts are in ACCOUNTS below, each with its own list. There are no passwords: whoever can
// reach the site can pick an account at /login, so keep the site itself private (Cloudflare Access,
// say). A browser that hasn't picked one is sent there first. Pick once per browser.
//
// It also finds covers on Audible for series you add yourself (/api/covers), which the browser
// can't ask Audible for directly.
//
// Settings (environment variables):
//   DATA_DIR       where the lists are saved: a persistent volume (default /data)
//   PORT           set by the host (default 8080)
//   AUDIBLE_API    where cover searches go (default https://api.audible.co.uk, Audible UK)
//   GOOGLE_BOOKS_KEY  a Google Books API key: ebooks and page counts in the Library (optional)
//   GOOGLE_BOOKS_API  where those go (default https://www.googleapis.com)

import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { searchSeries, seriesInfo } from "./audible.mjs";
import { pageCount, searchBooks, seriesEditions } from "./googlebooks.mjs";

const PORT = Number(process.env.PORT) || 8080;
const DATA_DIR = process.env.DATA_DIR || "/data";
const DIST = join(import.meta.dirname, "dist");
const COOKIE = "lt_sync";
const MAX_BODY = 2 * 1024 * 1024;
const AUDIBLE_API = (process.env.AUDIBLE_API || "https://api.audible.co.uk").replace(/\/$/, "");
const GOOGLE_BOOKS_KEY = (process.env.GOOGLE_BOOKS_KEY || "").trim();
const GOOGLE_BOOKS_API = (process.env.GOOGLE_BOOKS_API || "https://www.googleapis.com").replace(/\/$/, "");
/** The accounts: letters, digits, - and _ */
const ACCOUNTS = ["Rodrigo", "Nicola"];
/** Accounts that were renamed: old name -> new, so a saved list follows the new name */
const RENAMED = { Rayan: "Rodrigo" };

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

/** The account this browser picked, from its cookie */
function signedInAs(req) {
  const m = (req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  const name = m ? decodeURIComponent(m[1]) : null;
  return ACCOUNTS.includes(name) ? name : null;
}

const stateFile = (name) => join(DATA_DIR, "users", `${name}.json`);

function readState(name) {
  try {
    return JSON.parse(readFileSync(stateFile(name), "utf8"));
  } catch {
    return { rev: 0, data: {} };
  }
}

function writeState(name, state) {
  mkdirSync(join(DATA_DIR, "users"), { recursive: true });
  const file = stateFile(name);
  writeFileSync(`${file}.tmp`, JSON.stringify(state));
  renameSync(`${file}.tmp`, file); // all or nothing: a crash mid-write can't leave half a file
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "cache-control": "no-store", ...headers });
  res.end(body);
}

const json = (res, status, value) => send(res, status, JSON.stringify(value), { "content-type": "application/json" });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const esc = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function loginPage(res, user) {
  const status = user
    ? `<p>This browser is <b>${esc(user)}</b>. <a href="./">Back to Loot Table</a></p>`
    : `<p class="hint">Pick once in each browser, and your tier list follows you.</p>`;
  const buttons = ACCOUNTS.map(
    (n) => `<button name="user" value="${esc(n)}"${n === user ? ' class="current"' : ""}>${esc(n)}</button>`,
  ).join("");
  send(
    res,
    200,
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Who's this? · Loot Table</title>
<link rel="icon" href="./icon.svg" type="image/svg+xml">
<style>
  body { font: 16px/1.5 system-ui, sans-serif; background: #15171c; color: #e8e6e3; display: grid; place-items: center; min-height: 100vh; margin: 0; }
  main { width: min(340px, 90vw); }
  h1 { font-size: 1.4rem; margin: 0 0 .5rem; }
  form { display: grid; gap: .7rem; margin-top: 1.2rem; }
  button { padding: .8rem; border: 1px solid #3a3d45; border-radius: 10px; background: #1e2128; color: inherit; font: inherit; font-weight: 600; cursor: pointer; }
  button:hover, button.current { border-color: #d9a441; color: #d9a441; }
  a { color: #d9a441; }
  .hint { color: #8d8a85; font-size: .9rem; }
</style></head><body><main>
<h1>Who's this?</h1>
${status}
<form method="post" action="./login"><input type="hidden" name="next" id="next">${buttons}</form>
<script>document.getElementById("next").value = location.hash; // a share link you opened, kept for after</script>
</main></body></html>`,
    { "content-type": "text/html; charset=utf-8" },
  );
}

async function login(req, res) {
  if (req.method !== "POST") return loginPage(res, signedInAs(req));
  const form = new URLSearchParams(await readBody(req));
  const name = form.get("user");
  if (!ACCOUNTS.includes(name)) return loginPage(res, signedInAs(req));
  const next = form.get("next") || "";
  const hash = /^#[^\s"<>\\]*$/.test(next) && next.length < 20000 ? next : "";
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  send(res, 303, "", {
    "set-cookie": `${COOKIE}=${encodeURIComponent(name)}; Path=/; Max-Age=315360000; HttpOnly; SameSite=Lax${secure}`,
    location: `./${hash}`,
  });
}

function logout(req, res) {
  send(res, 303, "", { "set-cookie": `${COOKIE}=; Path=/; Max-Age=0`, location: "./login" });
}

async function api(req, res) {
  const user = signedInAs(req);
  if (!user) return json(res, 401, { error: "not signed in" });
  if (req.method === "GET") return json(res, 200, { ...readState(user), user });
  if (req.method === "PUT") {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return json(res, 400, { error: "bad request" });
    }
    const data = body?.data;
    if (!data || typeof data !== "object" || Object.values(data).some((v) => typeof v !== "string")) {
      return json(res, 400, { error: "bad request" });
    }
    const state = { rev: readState(user).rev + 1, data, savedAt: new Date().toISOString() };
    writeState(user, state);
    return json(res, 200, { ...state, user });
  }
  json(res, 405, { error: "method not allowed" });
}

/** Recent cover searches, so typing the same thing twice doesn't ask Audible again */
const coverCache = new Map();

/** Audible's catalog search, as one match per series: the series name, its authors, and the cover of
 * its earliest book. Books outside a series come back as themselves. */
async function covers(req, res, params) {
  if (!signedInAs(req)) return json(res, 401, { error: "not signed in" });
  const title = (params.get("title") || "").trim().slice(0, 200);
  const author = (params.get("author") || "").trim().slice(0, 200);
  if (!title) return json(res, 400, { error: "no title" });
  const cacheKey = `${title}|${author}`.toLowerCase();
  const cached = coverCache.get(cacheKey);
  if (cached && cached.at > Date.now() - 3600_000) return json(res, 200, { matches: cached.matches });

  const query = new URLSearchParams({
    keywords: `${title} ${author}`.trim(),
    num_results: "25",
    products_sort_by: "Relevance",
    response_groups: "media,contributors,series",
    image_sizes: "500",
  });
  let products;
  try {
    const r = await fetch(`${AUDIBLE_API}/1.0/catalog/products?${query}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`Audible answered ${r.status}`);
    products = (await r.json()).products ?? [];
  } catch (err) {
    console.error(`Cover search for "${title}" failed: ${err.message}`);
    return json(res, 502, { error: "Couldn't reach Audible" });
  }

  const bySeries = new Map(); // series (or book) -> its earliest book so far, and where it first came
  for (const p of products) {
    const series = p.series?.[0];
    const id = series?.asin ?? `book:${p.asin}`;
    const seq = parseFloat(series?.sequence);
    const order = Number.isFinite(seq) ? seq : Infinity;
    const prev = bySeries.get(id);
    if (prev && prev.order <= order) continue;
    bySeries.set(id, {
      order,
      rank: prev ? prev.rank : bySeries.size,
      match: {
        title: series?.title ?? p.title ?? "",
        authors: (p.authors ?? []).map((a) => a.name).filter(Boolean).slice(0, 3),
        image: p.product_images?.["500"] ?? Object.values(p.product_images ?? {})[0] ?? null,
        asin: p.asin,
      },
    });
  }
  const matches = [...bySeries.values()].sort((a, b) => a.rank - b.rank).slice(0, 8).map((x) => x.match);
  if (coverCache.size > 200) coverCache.clear();
  coverCache.set(cacheKey, { at: Date.now(), matches });
  json(res, 200, { matches });
}

/** Series looked up recently, so opening the Library doesn't ask Audible again for each one */
const seriesCache = new Map();

/** The Library's Audible lookups: /api/audible/series?asin= (a series, or a book's series) and
 * /api/audible/search?q= (series matching a search). See audible.mjs. */
async function audible(req, res, path, params) {
  if (!signedInAs(req)) return json(res, 401, { error: "not signed in" });
  try {
    if (path === "/api/audible/series") {
      const asin = (params.get("asin") || "").trim().toUpperCase();
      if (!/^[A-Z0-9]{10}$/.test(asin)) return json(res, 400, { error: "bad asin" });
      const fresh = params.get("fresh") === "1";
      const hit = seriesCache.get(asin);
      if (hit && !fresh && hit.at > Date.now() - 6 * 3600_000) return json(res, 200, hit.info);
      const info = await seriesInfo(AUDIBLE_API, asin);
      if (seriesCache.size > 500) seriesCache.clear();
      seriesCache.set(asin, { at: Date.now(), info });
      seriesCache.set(info.asin, { at: Date.now(), info });
      return json(res, 200, info);
    }
    if (path === "/api/audible/search") {
      const q = (params.get("q") || "").trim().slice(0, 200);
      if (!q) return json(res, 400, { error: "no search" });
      return json(res, 200, { matches: await searchSeries(AUDIBLE_API, q) });
    }
    json(res, 404, { error: "not found" });
  } catch (err) {
    console.error(`Audible lookup ${path} failed: ${err.message}`);
    json(res, 502, { error: err.message === "Not on Audible" ? "Not on Audible" : "Couldn't reach Audible" });
  }
}

/** Page counts and searches looked up recently: Google Books allows 1,000 requests a day */
const booksCache = new Map();

/** The Library's Google Books lookups: /api/books/search?q= and /api/books/pages?title=&author= */
async function books(req, res, path, params) {
  if (!signedInAs(req)) return json(res, 401, { error: "not signed in" });
  if (!GOOGLE_BOOKS_KEY) return json(res, 503, { error: "Google Books isn't set up (GOOGLE_BOOKS_KEY)" });
  const fresh = params.get("fresh") === "1"; // "look up page counts again": past the cache
  const cached = (k, f) => {
    const hit = booksCache.get(k);
    if (hit && !fresh && hit.at > Date.now() - 7 * 86400_000) return Promise.resolve(hit.value);
    return f().then((value) => {
      if (booksCache.size > 2000) booksCache.clear();
      booksCache.set(k, { at: Date.now(), value });
      return value;
    });
  };
  try {
    if (path === "/api/books/search") {
      const q = (params.get("q") || "").trim().slice(0, 200);
      if (!q) return json(res, 400, { error: "no search" });
      return json(res, 200, { matches: await cached(`s|${q.toLowerCase()}`, () => searchBooks(GOOGLE_BOOKS_API, GOOGLE_BOOKS_KEY, q)) });
    }
    if (path === "/api/books/pages") {
      const title = (params.get("title") || "").trim().slice(0, 200);
      const author = (params.get("author") || "").trim().slice(0, 100);
      const series = (params.get("series") || "").trim().slice(0, 200);
      const n = (params.get("n") || "").trim().slice(0, 10);
      if (!title) return json(res, 400, { error: "no title" });
      // One search for the whole series, shared by its books
      const editions = series ? () => cached(`e|${series.toLowerCase()}|${author.toLowerCase()}`, () => seriesEditions(GOOGLE_BOOKS_API, GOOGLE_BOOKS_KEY, series, author)) : null;
      const pages = await cached(`p2|${title.toLowerCase()}|${author.toLowerCase()}|${series.toLowerCase()}|${n}`, () =>
        pageCount(GOOGLE_BOOKS_API, GOOGLE_BOOKS_KEY, title, author, series, n || null, editions),
      );
      return json(res, 200, { pages });
    }
    json(res, 404, { error: "not found" });
  } catch (err) {
    console.error(`Google Books ${path} failed: ${err.message}`);
    json(res, 502, { error: err.message.startsWith("Google Books") ? err.message : "Couldn't reach Google Books" });
  }
}

function serveFile(req, res, path) {
  const rel = normalize(decodeURIComponent(path)).replace(/^[/\\]+/, "");
  let file = join(DIST, rel);
  if (!file.startsWith(DIST)) return send(res, 403, "Forbidden");
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, "index.html");
  const type = TYPES[extname(file)] || "application/octet-stream";
  // Built files have a hash in their name; index.html and data.json can change under the same name
  const cache = rel.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache";
  res.writeHead(200, { "content-type": type, "cache-control": cache });
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    const path = url.pathname;
    if (path === "/login") return await login(req, res);
    if (path === "/logout") return logout(req, res);
    if (path === "/api/state") return await api(req, res);
    if (path === "/api/covers") return await covers(req, res, url.searchParams);
    if (path.startsWith("/api/audible/")) return await audible(req, res, path, url.searchParams);
    if (path.startsWith("/api/books/")) return await books(req, res, path, url.searchParams);
    if (path === "/health") return send(res, 200, "ok");
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
    // The app itself: pick who you are first
    if ((path === "/" || path === "/index.html") && !signedInAs(req)) return send(res, 302, "", { location: "./login" });
    serveFile(req, res, path);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, 500, "Server error");
  }
}).listen(PORT, () => {
  console.log(`Loot Table on port ${PORT}`);
  console.log(`Sync for ${ACCOUNTS.join(", ")}, saving to ${join(DATA_DIR, "users")}`);
  for (const [from, to] of Object.entries(RENAMED)) {
    if (existsSync(stateFile(from)) && !existsSync(stateFile(to))) {
      renameSync(stateFile(from), stateFile(to));
      console.log(`Moved ${from}'s list to ${to}`);
    }
  }
  if (!existsSync(DATA_DIR)) console.log(`Warning: ${DATA_DIR} doesn't exist. Attach a volume there, or lists are lost on redeploy.`);
});

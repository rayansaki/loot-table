// Serves the built website, plus a place to keep your tier list so every browser sees the same one.
// Only for hosting it yourself (Railway, say); the app works without it. No packages needed.
//
// Settings (environment variables):
//   SYNC_PASSWORD  the password for /login. Without it, sync is off and this just serves the site.
//   DATA_DIR       where the list is saved: a persistent volume (default /data)
//   PORT           set by the host (default 8080)
//
// Anyone can use the site (a share link you send works for friends), but only a browser that has
// signed in at /login reads and writes your saved list. Sign in once per browser.

import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT) || 8080;
const DATA_DIR = process.env.DATA_DIR || "/data";
const PASSWORD = process.env.SYNC_PASSWORD || "";
const DIST = join(import.meta.dirname, "dist");
const STATE_FILE = join(DATA_DIR, "state.json");
const COOKIE = "lt_sync";
const MAX_BODY = 2 * 1024 * 1024;

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

// The cookie holds a hash of the password, so changing the password signs every browser out
const token = PASSWORD ? createHash("sha256").update(`loot-table-sync:${PASSWORD}`).digest("hex") : "";

function same(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function signedIn(req) {
  if (!token) return false;
  const m = (req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return !!m && same(m[1], token);
}

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { rev: 0, data: {} };
  }
}

function writeState(state) {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, STATE_FILE); // all or nothing: a crash mid-write can't leave half a file
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

function login(req, res) {
  if (!token) return send(res, 404, "Sync is off: set SYNC_PASSWORD on the server.", { "content-type": "text/plain" });
  // The browser's own password box. Any username; only the password is checked.
  const auth = req.headers.authorization || "";
  const given = auth.startsWith("Basic ") ? Buffer.from(auth.slice(6), "base64").toString().split(":").slice(1).join(":") : null;
  if (given === null || !same(given, PASSWORD)) {
    return send(res, 401, "Wrong password.", {
      "www-authenticate": 'Basic realm="Loot Table sync", charset="UTF-8"',
      "content-type": "text/plain",
    });
  }
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  send(res, 302, "", {
    "set-cookie": `${COOKIE}=${token}; Path=/; Max-Age=315360000; HttpOnly; SameSite=Lax${secure}`,
    location: "./",
  });
}

function logout(req, res) {
  send(res, 302, "", { "set-cookie": `${COOKIE}=; Path=/; Max-Age=0`, location: "./" });
}

async function api(req, res) {
  if (!signedIn(req)) return json(res, 401, { error: "not signed in" });
  if (req.method === "GET") return json(res, 200, readState());
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
    const state = { rev: readState().rev + 1, data, savedAt: new Date().toISOString() };
    writeState(state);
    return json(res, 200, state);
  }
  json(res, 405, { error: "method not allowed" });
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
    const path = new URL(req.url, "http://x").pathname;
    if (path === "/login") return login(req, res);
    if (path === "/logout") return logout(req, res);
    if (path === "/api/state") return await api(req, res);
    if (path === "/health") return send(res, 200, "ok");
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
    serveFile(req, res, path);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, 500, "Server error");
  }
}).listen(PORT, () => {
  console.log(`Loot Table on port ${PORT}`);
  if (!token) console.log("SYNC_PASSWORD isn't set: sync is off, the site works as on GitHub Pages.");
  else if (!existsSync(DATA_DIR)) console.log(`Warning: ${DATA_DIR} doesn't exist. Attach a volume there, or the list is lost on redeploy.`);
  else console.log(`Sync on, saving to ${STATE_FILE}`);
});

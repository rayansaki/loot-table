// Serves the built website, plus a place to keep tier lists so every browser sees the same one.
// Only for hosting it yourself (Railway, say); the app works without it. No packages needed.
//
// The accounts are in ACCOUNTS below, each with its own list. Settings (environment variables):
//   PASSWORD_RAYAN, PASSWORD_NICOLA   each account's password; an account without one is off
//   DATA_DIR       where the lists are saved: a persistent volume (default /data)
//   PORT           set by the host (default 8080)
//
// Without any password, sync is off and this just serves the site. Anyone can use the site (a share
// link you send works for friends), but only a browser signed in at /login reads and writes a saved
// list: its account's. Sign in once per browser.

import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT) || 8080;
const DATA_DIR = process.env.DATA_DIR || "/data";
const DIST = join(import.meta.dirname, "dist");
const COOKIE = "lt_sync";
const MAX_BODY = 2 * 1024 * 1024;
/** The accounts. To add one, add its name here and a PASSWORD_<NAME> variable on the server. */
const ACCOUNTS = ["Rayan", "Nicola"];

/** name -> password, for the accounts that have one */
const USERS = new Map();
for (const name of ACCOUNTS) {
  const password = (process.env[`PASSWORD_${name.toUpperCase()}`] || "").trim();
  if (password) USERS.set(name, password);
}

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

function same(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// The cookie is the account name, signed with its password: changing a password signs that
// account out everywhere
const sign = (name) => createHmac("sha256", `loot-table-sync:${USERS.get(name)}`).update(name).digest("hex");

function signedInAs(req) {
  const m = (req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [name, sig] = decodeURIComponent(m[1]).split(".");
  return USERS.has(name) && sig && same(sig, sign(name)) ? name : null;
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

function loginPage(res, { user = null, error = "" } = {}) {
  const status = user
    ? `<p>Signed in as <b>${esc(user)}</b>. <a href="./">Back to Loot Table</a> · <a href="./logout">Sign out</a></p>
       <p class="hint">To switch account, sign in below as someone else.</p>`
    : `<p class="hint">Sign in once in each browser, and your tier list follows you.</p>`;
  send(
    res,
    error ? 401 : 200,
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Sign in · Loot Table</title>
<link rel="icon" href="./icon.svg" type="image/svg+xml">
<style>
  body { font: 16px/1.5 system-ui, sans-serif; background: #15171c; color: #e8e6e3; display: grid; place-items: center; min-height: 100vh; margin: 0; }
  main { width: min(340px, 90vw); }
  h1 { font-size: 1.4rem; margin: 0 0 .5rem; }
  label { display: block; margin: .8rem 0 .2rem; font-size: .9rem; color: #b8b5b0; }
  input, select { width: 100%; box-sizing: border-box; padding: .6rem .7rem; border-radius: 8px; border: 1px solid #3a3d45; background: #1e2128; color: inherit; font: inherit; }
  button { margin-top: 1.2rem; width: 100%; padding: .65rem; border: 0; border-radius: 8px; background: #d9a441; color: #15171c; font: inherit; font-weight: 600; cursor: pointer; }
  a { color: #d9a441; }
  .hint { color: #8d8a85; font-size: .9rem; }
  .error { color: #ff8a80; }
</style></head><body><main>
<h1>Loot Table</h1>
${status}
${error ? `<p class="error">${esc(error)}</p>` : ""}
<form method="post" action="./login">
  <label for="u">Account</label><select id="u" name="user" autocomplete="username">
    ${[...USERS.keys()].map((n) => `<option${n === user ? " selected" : ""}>${esc(n)}</option>`).join("")}
  </select>
  <label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" required>
  <button>Sign in</button>
</form>
</main></body></html>`,
    { "content-type": "text/html; charset=utf-8" },
  );
}

async function login(req, res) {
  if (!USERS.size) {
    return send(res, 404, "Sync is off: set PASSWORD_RAYAN or PASSWORD_NICOLA on the server.", { "content-type": "text/plain" });
  }
  if (req.method !== "POST") return loginPage(res, { user: signedInAs(req) });
  const form = new URLSearchParams(await readBody(req));
  const name = (form.get("user") || "").trim();
  const password = form.get("password") || "";
  const real = [...USERS.keys()].find((n) => n.toLowerCase() === name.toLowerCase());
  if (!real || !same(password, USERS.get(real))) {
    return loginPage(res, { user: signedInAs(req), error: "That account and password don't match." });
  }
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  send(res, 303, "", {
    "set-cookie": `${COOKIE}=${encodeURIComponent(`${real}.${sign(real)}`)}; Path=/; Max-Age=315360000; HttpOnly; SameSite=Lax${secure}`,
    location: "./",
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
    if (path === "/login") return await login(req, res);
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
  if (!USERS.size) console.log("No passwords set (PASSWORD_RAYAN, PASSWORD_NICOLA): sync is off, the site works as on GitHub Pages.");
  else {
    console.log(`Sync on for ${[...USERS.keys()].join(", ")}, saving to ${join(DATA_DIR, "users")}`);
    if (!existsSync(DATA_DIR)) console.log(`Warning: ${DATA_DIR} doesn't exist. Attach a volume there, or lists are lost on redeploy.`);
  }
});

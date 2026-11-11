// Serves the built website, plus a place to keep tier lists so every browser sees the same one.
// Only for hosting it yourself (Railway, say); the app works without it. No packages needed.
//
// The accounts are in ACCOUNTS below, each with its own list. There are no passwords: whoever can
// reach the site can pick an account at /login, so keep the site itself private (Cloudflare Access,
// say). A browser that hasn't picked one is sent there first. Pick once per browser.
//
// Settings (environment variables):
//   DATA_DIR       where the lists are saved: a persistent volume (default /data)
//   PORT           set by the host (default 8080)

import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT) || 8080;
const DATA_DIR = process.env.DATA_DIR || "/data";
const DIST = join(import.meta.dirname, "dist");
const COOKIE = "lt_sync";
const MAX_BODY = 2 * 1024 * 1024;
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

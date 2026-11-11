/** Optional sync through your own server (server.mjs), so the same tier list shows in every browser.
 *
 * The app keeps working from this browser's local storage as before; this just copies the app's
 * keys to the server whenever they change, and back from it when the page opens or comes back into
 * view. Where there's no sync server (GitHub Pages, the desktop app, a dev server) or this browser
 * hasn't signed in at /login, it does nothing. */

const SYNCED = ["loot-table.", "foryou."];
const isSynced = (key: string) => SYNCED.some((p) => key.startsWith(p));

interface ServerState {
  rev: number;
  data: Record<string, string>;
}

let enabled = false;
let rev = 0;
let applying = false; // writing the server's copy into local storage: not a change to send back
let timer: ReturnType<typeof setTimeout> | undefined;

function localState(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (isSynced(key)) out[key] = localStorage.getItem(key) ?? "";
  }
  return out;
}

function same(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

async function fetchState(): Promise<ServerState | null> {
  try {
    const res = await fetch("api/state", { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) return null;
    return (await res.json()) as ServerState;
  } catch {
    return null;
  }
}

/** Replace this browser's copy with the server's */
function apply(data: Record<string, string>): void {
  applying = true;
  try {
    for (const key of Object.keys(localState())) if (!(key in data)) localStorage.removeItem(key);
    for (const [key, value] of Object.entries(data)) localStorage.setItem(key, value);
  } finally {
    applying = false;
  }
}

function push(keepalive = false): void {
  clearTimeout(timer);
  timer = undefined;
  fetch("api/state", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: localState() }),
    keepalive,
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((s: ServerState | null) => {
      if (s) rev = s.rev;
    })
    .catch(() => {});
}

function changed(key: string): void {
  if (!enabled || applying || !isSynced(key)) return;
  clearTimeout(timer);
  timer = setTimeout(push, 800);
}

/** Back in view: if another browser changed the list meanwhile, show its version */
async function refresh(): Promise<void> {
  if (timer !== undefined) return; // our own change is on its way up: it wins
  const s = await fetchState();
  if (!s || s.rev === rev) return;
  rev = s.rev;
  if (!same(s.data, localState())) {
    apply(s.data);
    location.reload();
  }
}

/** Call before the app first renders */
export async function initSync(): Promise<void> {
  if ("__TAURI_INTERNALS__" in window) return;
  const s = await fetchState();
  if (!s) return;
  enabled = true;
  rev = s.rev;
  if (Object.keys(s.data).length) apply(s.data);
  else if (Object.keys(localState()).length) push(); // first time: this browser's list goes up

  // Every write to local storage, from anywhere in the app
  const { setItem, removeItem } = Storage.prototype;
  Storage.prototype.setItem = function (key: string, value: string) {
    setItem.call(this, key, value);
    if (this === localStorage) changed(key);
  };
  Storage.prototype.removeItem = function (key: string) {
    removeItem.call(this, key);
    if (this === localStorage) changed(key);
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (timer !== undefined) push(true); // leaving with a change not yet sent
    } else {
      void refresh();
    }
  });
}

/** Optional sync through your own server (server.mjs), so the same tier list shows in every browser.
 *
 * The app keeps working from this browser's local storage as before; this just copies the app's
 * keys to the server whenever they change, and back from it when the page opens or comes back into
 * view. Where there's no sync server (GitHub Pages, the desktop app, a dev server) or this browser
 * hasn't signed in at /login, it does nothing. */

const SYNCED = ["loot-table.", "foryou."];
const isSynced = (key: string) => SYNCED.some((p) => key.startsWith(p));
/** Whose list is in this browser now (not synced itself) */
const ACCOUNT_KEY = "sync.account";

interface ServerState {
  rev: number;
  data: Record<string, string>;
  user: string;
}

let enabled = false;
let rev = 0;
let applying = false; // writing the server's copy into local storage: not a change to send back
let timer: ReturnType<typeof setTimeout> | undefined;
/** Changes made here, and the last one the server has: anything newer isn't saved yet */
let edits = 0;
let saved = 0;
const unsaved = () => edits !== saved;

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

function push(keepalive = false, attempt = 0): void {
  clearTimeout(timer);
  timer = undefined;
  const sending = edits;
  fetch("api/state", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: localState() }),
    keepalive,
  })
    .then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      return res.json() as Promise<ServerState>;
    })
    .then((s) => {
      rev = s.rev;
      saved = Math.max(saved, sending);
    })
    .catch(() => {
      // A server that was asleep can fail the first request while it wakes: try again shortly
      if (attempt < 8 && unsaved() && timer === undefined) {
        timer = setTimeout(() => push(false, attempt + 1), Math.min(2000 * (attempt + 1), 10000));
      }
    });
}

function changed(key: string): void {
  if (!enabled || applying || !isSynced(key)) return;
  edits++;
  clearTimeout(timer);
  timer = setTimeout(push, 800);
}

/** Back in view: if another browser changed the list meanwhile, show its version */
async function refresh(): Promise<void> {
  if (unsaved()) return; // our own change is on its way up: it wins
  const s = await fetchState();
  if (s && s.user !== localStorage.getItem(ACCOUNT_KEY)) return location.reload(); // signed in as someone else meanwhile
  if (!s || s.rev === rev) return;
  rev = s.rev;
  if (!same(s.data, localState())) {
    apply(s.data);
    location.reload();
  }
}

/** Whose list this is, when syncing; null otherwise */
export const syncAccount = (): string | null => (enabled ? localStorage.getItem(ACCOUNT_KEY) : null);

/** Call before the app first renders */
export async function initSync(): Promise<void> {
  if ("__TAURI_INTERNALS__" in window) return;
  const s = await fetchState();
  if (!s) return;
  enabled = true;
  rev = s.rev;
  const before = localStorage.getItem(ACCOUNT_KEY);
  localStorage.setItem(ACCOUNT_KEY, s.user);
  if (Object.keys(s.data).length) apply(s.data);
  else if (before && before !== s.user) apply({}); // a new account here: start it empty, not with the last one's list
  else if (Object.keys(localState()).length) {
    edits++; // this browser's first sign-in: its list goes up
    push();
  }

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
      if (unsaved()) push(true); // leaving with a change not yet saved
    } else {
      void refresh();
    }
  });
}

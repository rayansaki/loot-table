# Hosting it yourself, with sync

This fork adds a small server (`server.mjs`) so each person's tier list follows them between
browsers. The app itself is unchanged: it still keeps the list in the browser, and copies it to and
from your server.

There are two accounts, **Rayan** and **Nicola**, each with its own list. To change them, edit
`ACCOUNTS` near the top of `server.mjs`.

## On Railway

1. **New → Deploy from GitHub repo** → this repo. Railway sees the `Dockerfile` and builds with it.
2. **Variables**: add `PASSWORD_RAYAN` and `PASSWORD_NICOLA`, each set to that person's password.
   An account with no password can't sign in.
3. **Volume**: right-click the service → **Attach volume**, mount path `/data`. Without it, saved
   lists are wiped on every redeploy.
4. **Settings → Networking → Generate Domain**.
5. In each browser, open `https://your-domain/login` once, pick your name and enter your password.
   From then on that browser syncs that person's list.

The first time someone signs in, the list already in that browser is uploaded to their account.
After that, the server's copy wins when a page opens, and a tab you come back to picks up changes
made elsewhere.

`/login` also shows who a browser is signed in as, and lets you switch. `/logout` signs out.
Changing a password signs that person out everywhere.

Anyone with the link can still use the site and open your share links; they just don't see or
change your saved lists.

## Keeping up with the original

On GitHub, **Sync fork → Update branch** when it says you're behind. Railway redeploys by itself.
The only original file this fork changes is `src/main.tsx` (a few lines), so syncs should go
through cleanly.

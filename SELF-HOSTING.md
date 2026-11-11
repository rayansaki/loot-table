# Hosting it yourself, with sync

This fork adds a small server (`server.mjs`) so your tier list follows you between browsers. The app
itself is unchanged: it still keeps the list in the browser, and copies it to and from your server.

## On Railway

1. **New → Deploy from GitHub repo** → this repo. Railway sees the `Dockerfile` and builds with it.
2. **Variables**: add `SYNC_PASSWORD` with a password of your choice.
3. **Volume**: right-click the service → **Attach volume**, mount path `/data`. Without it, your
   saved list is wiped on every redeploy.
4. **Settings → Networking → Generate Domain**.
5. In each browser you use, open `https://your-domain/login` once and enter the password (the
   username can be anything). From then on that browser syncs.

The first browser that signs in uploads the list it already has. After that, the server's copy wins
when a page opens, and a tab you come back to picks up changes made elsewhere.

`/logout` signs a browser out. Changing `SYNC_PASSWORD` signs every browser out.

Anyone with the link can still use the site and open your share links; they just don't see or
change your saved list.

## Keeping up with the original

On GitHub, **Sync fork → Update branch** when it says you're behind. Railway redeploys by itself.
The only original file this fork changes is `src/main.tsx` (a few lines), so syncs should go
through cleanly.

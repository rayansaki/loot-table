# Hosting it yourself, with sync

This fork adds a small server (`server.mjs`) so each person's tier list follows them between
browsers. The app itself is unchanged: it still keeps the list in the browser, and copies it to and
from your server.

There are two accounts, **Rodrigo** and **Nicola**, each with its own list, and no passwords: anyone
who can reach the site can pick either one. So keep the site private, with Cloudflare Access for
example. To change the accounts, edit `ACCOUNTS` near the top of `server.mjs`.

## On Railway

1. **New → Deploy from GitHub repo** → this repo. Railway sees the `Dockerfile` and builds with it.
2. **Volume**: right-click the service → **Attach volume**, mount path `/data`. Without it, saved
   lists are wiped on every redeploy.
3. **Settings → Networking → Custom Domain**: add your domain, and point it at Railway from
   Cloudflare as Railway tells you. Then put Cloudflare Access in front of that domain.
4. Don't keep a `*.up.railway.app` domain: that address skips Cloudflare, so anyone who found it
   could open the site and change your lists. Delete it in **Settings → Networking** if Railway made
   one.
5. Open the site in each browser: it asks who you are the first time. From then on that browser
   syncs that person's list.

The first time someone picks their name, the list already in that browser is uploaded to their
account. After that, the server's copy wins when a page opens, and a tab you come back to picks up
changes made elsewhere.

The **Change account** button at the top right of the app switches to the other person's list.

## Keeping up with the original

On GitHub, **Sync fork → Update branch** when it says you're behind. Railway redeploys by itself.
The only original files this fork changes are `src/main.tsx` and `src/App.tsx` (a few lines each),
so syncs should go through cleanly.

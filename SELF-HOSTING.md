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

## Your own series

For a series Loot Table doesn't have: search for it, then **Can't find it? Add it as your own series**.
The server looks it up on Audible UK so you can pick its cover (or paste an image link, or have none).
It sits on your tier list with an amber frame. It doesn't feed recommendations, except that the
author of one you rank S or A counts as an author you like. Click it to edit or delete it.

They sync like the rest of your list and go along in Export files, but share links leave them out.

## Library

The **Library** tab tracks what you're listening to, Up next, a wishlist, and when you started and
finished each book, with stats by month and year. Book lists, numbers and lengths come from Audible
UK through the server (one book per number: the newest edition, box sets left out, side books and
half-numbered novellas as extras), and each series is checked again at most once a day when you open the Library,
so a new book in a series you're caught up on shows up as NEW (and joins Up next).

Every book counts towards progress, extras included, unless you **Skip** it on the series page.

Hours in the stats are spread evenly over the days between a book's start and finish dates; a book
with no start date counts in the month you finished it.

**Import** takes a CSV: one row per book with `series`, and any of `series_asin`, `book` (its
number), `title`, `length`, `started`, `finished`, and `list` (`next` or `wish`) for series rows.

## Keeping up with the original

On GitHub, **Sync fork → Update branch** when it says you're behind. Railway redeploys by itself.
This fork changes a few lines in some of the original files (`main.tsx`, `App.tsx`, `api.ts`,
`transfer.ts`, `engine/recommend.ts`, `WorkDrawer.tsx` and a few components); the rest is in files of
its own. Most
syncs go through cleanly; if GitHub reports a conflict, it's usually a line or two to settle.

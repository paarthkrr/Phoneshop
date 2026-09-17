# Deploying this outside Claude — what actually changes

Everything built so far (calculator, admin console, POS, repairs, till,
CRM, dashboard) calls `window.storage.get/set/delete/list`. That API
only exists inside Claude.ai artifacts. Outside Claude, `window.storage`
is `undefined` — none of these tools will work until something real
provides it.

`server.js` + `storage-shim.js` are that "something real." They
implement the exact same get/set/delete/list contract over HTTP +
SQLite, so **none of the 8 tool files need to change** — you're
replacing the storage backend, not rewriting the frontend.

This was proven, not assumed: `admin-pricing-console.jsx` was run
completely unmodified against a live instance of `server.js` and it
worked identically to running inside Claude — same UI, same save
behavior, same data landing in a real database.

## 1. Deploy the backend

`server.js` needs a host with a **persistent disk** (the SQLite file
must survive restarts) — Railway, Render, or Fly.io all support this;
a serverless platform like Vercel's functions does not, so don't use
those for this part.

```bash
cd shop-backend
npm install
npm start        # runs on :8787 locally — set PORT env var on your host
```

Environment variables your host should set:
- `PORT` — usually set automatically by the platform
- `DB_PATH` — where the SQLite file lives; point this at your platform's
  persistent volume mount (e.g. Railway volumes, Render disks)
- `SESSION_SECRET` — a long random string (e.g. `openssl rand -hex 32`).
  **Set this explicitly.** The server runs with an obviously-insecure
  default if you don't, and will only warn (not refuse to start) if
  `NODE_ENV=production` is also set. Every login token is signed with
  this secret — anyone who has it can forge valid sessions.
- `ID_PHOTO_ENCRYPTION_KEY` — a 64-character hex string (e.g.
  `openssl rand -hex 32`), **only if you want ID photo capture**. This
  one fails closed: without it, photo upload is simply disabled rather
  than running with a weak default. Photos are encrypted at rest
  (AES-256-GCM) and auto-purged after `ID_PHOTO_RETENTION_DAYS`
  (default 90 — verify the correct period for your jurisdiction's
  second-hand dealer laws before relying on this default).
- `CORS_ORIGIN` — your real frontend URL (e.g. `https://yourshop.com`).
  Left unset, the server accepts requests from any origin and logs a
  warning on startup — fine for local development, not fine once
  you're live.
- `ADMIN_BOOTSTRAP_TOKEN` — a random secret (e.g. `openssl rand -hex 16`)
  you choose and know before deploying. Without it, whoever calls
  `/auth/register` *first* on your freshly deployed server becomes the
  permanent admin, no proof required — which could be an attacker who
  found the URL before you did. With it set, the first registration
  must include this token (as `bootstrapToken` in the request body),
  so only someone who actually has your deployment's secret can claim
  the admin account. Once you've registered your real admin, this
  token stops mattering.

Once deployed, note the public URL (e.g. `https://your-shop-api.up.railway.app`).

## 2. Wire the frontend to it

Each of the 8 `.jsx` files is currently a standalone React component
built for Claude's artifact renderer. To host them as a real website
you need a build tool (Vite is the simplest) and a router, since
there's no cross-artifact navigation outside Claude — that's also why
the daily dashboard can't literally link to the other tools yet.

Minimal Vite setup:

```bash
npm create vite@latest shop-frontend -- --template react
cd shop-frontend
npm install react-router-dom
```

In `src/main.jsx`, before anything else renders, load the shim, set your
backend URL, and render `App.jsx` directly — no separate login-gating
step needed at this level:

```js
import "./storage-shim.js";   // copy storage-shim.js into src/

window.SHOP_API_BASE_URL = "https://your-shop-api.up.railway.app";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
```

Then wire the tools together with `App.jsx` — a real, tested navigation
shell (not just a snippet to adapt), included in this download:

```bash
cp App.jsx src/App.jsx
```

It already handles everything that matters, and handles it *correctly*
— an earlier draft of this guide told you to wrap the whole `<App />`
in `mountLoginGate(...)`, which would have forced every customer to
log in just to get a trade-in quote, since that function replaces its
entire container with a login form until someone signs in. That was a
real bug, caught and fixed, not a style preference:

- **Storage is installed for every visitor**, customer or staff,
  logged in or not (`installStorageForEveryone`, called once inside
  `App.jsx` itself). Without this, `window.storage` simply wouldn't
  exist for an anonymous customer, and nothing on the public pages
  would work at all, regardless of what the backend allows.
- **Only the `/staff/*` routes require a login** (`StaffGate`, also
  inside `App.jsx`) — a public customer zone (`/` for trade-in quotes,
  `/shop` for browsing stock) that's never touched by it, and a
  separate internal zone for the other seven tools. A customer never
  sees a link to the till or the repair bench, and never sees a login
  prompt at all.
- The first person to register on a fresh backend automatically
  becomes admin. After that, only an admin can register new staff
  accounts.

Routing, storage installation, and staff-only login-gating are all
verified together with 25 automated checks — real simulated clicks,
real URL changes, a real 404, and explicit checks that a customer
route is never blocked even when a backend is connected and nobody is
logged in.

The backend itself also had to change to make this work honestly: it
used to require a staff login for *every* single storage call, which
would have meant an anonymous customer literally couldn't submit a
trade-in or buy from the storefront on a real deployment. It now
distinguishes public catalog data (readable by anyone — your stock
listing isn't a secret) from customer submissions (anyone can add
their own order or lead, but nobody — including other customers — can
ever bulk-read the collection those live in) from everything else
(still fully staff-only, unchanged). See `server.js`'s
`PUBLIC_READ_KEYS` / `PUBLIC_WRITE_KEYS` if you add new customer-facing
data and need to extend this.

Then:
```bash
npm run build
```
and deploy the `dist/` folder to Vercel, Netlify, or Cloudflare Pages —
any static host works fine for this part, since the frontend has no
server logic of its own anymore, only API calls to your backend.

## 3. What's still not solved by this deployment

- **Backups** — a single SQLite file on one disk is a single point of
  failure. At minimum, set up your host's automatic disk snapshots.
- **ID photo retention period** — the system enforces whatever
  `ID_PHOTO_RETENTION_DAYS` you set (default 90), but verifying that's
  the *correct* period for your jurisdiction is still on you, not this
  system — it's a legal question, not a technical one.
- **Rate limiting is per-username, not per-IP.** Five failed logins
  locks out that *account* for 15 minutes — it doesn't stop someone
  from trying five different accounts from the same IP in quick
  succession. Good enough for a small shop; a high-traffic deployment
  would want IP-based limiting layered on top.
- **HSTS** isn't set by this app, deliberately — that's your hosting
  platform's job, since it terminates TLS, not this Node process.
  Most platforms (Railway, Render, etc.) handle this for you already.

# Mobilerecellr (Phoneshop)

Phone repair, trade-in and refurbished-resale business in Sydney: https://mobilerecellr.com.au

One codebase, two deployments on Render:

| Part | Tech | Folder |
|---|---|---|
| Website + staff tools | React 18, Vite, react-router-dom (static site) | `frontend/` |
| API | Node >= 22.5, Express 5, pg, cors, compression | `backend/server.js` |
| Database | Render Postgres | |
| Email | Resend (`api.resend.com/emails`) | |

## How the pieces connect
Every tool reads and writes shared storage keys through `frontend/src/storage-shim.js`, which calls `GET/PUT/DELETE /storage/:key` on the backend. The frontend finds the API through `window.SHOP_API_BASE_URL`. `frontend/public/_redirects` contains `/* /index.html 200` so deep links work.

Public (no login) keys:
- Read: `inventory`, `pricing-config`, `accessories`
- Write (add-only, merged by id, cannot read the list back): `orders`, `purchase_orders`, `price_match_requests`, `bulk_quote_requests`, `quote_leads`, `referrals`, `notification_queue`, `support_queries`, `repair_requests`, `accessory_orders`

Everything else needs a staff login. Add a new customer-facing key only by editing `PUBLIC_READ_KEYS` / `PUBLIC_WRITE_KEYS` in `server.js`.

## Public pages
`/`, `/quote`, `/sell`, `/sell/:brand`, `/shop`, `/accessories`, `/repairs`, `/parts`, `/tutorials`, `/blog`, `/faq`, `/help`, `/about`, `/contact`, `/privacy`, `/terms`

## Staff area (`/portal`, `/staff` is an alias)
Pricing console, Register/POS, Repair Bench, Till, Customers & Reports (CRM), Inspection, Products manager, Team, Today dashboard.

## Email (Resend)
- Customer confirmations and updates are sent from `notification_queue` items with `channel: "email"`.
- Confirmations queued by the public site (not logged in) are rewritten by the server: it looks up the record the confirmation is about, sends to the email on that record, uses its own wording, and sends at most one per record. Text or addresses typed into a request are never emailed. Add a new confirmation type in `CONFIRMATIONS` in `server.js`.
- Owner alerts leave out bank, payout-account and ID details; read those in the portal.
- Design: one shared layout (logo, white card, shop footer). Customer emails add a "What happens next" box and WhatsApp / reply buttons; owner alerts show details in grouped tables with portal, email and call buttons.
- Each sent email is logged as `email sent to x***@domain (kind) id=<resend id>`, so a delivery can be traced in Render logs and matched in Resend.
- Customer emails use a standard layout: greeting, the message, a "we've received your request and will get back to you shortly" line (for submissions only), and a footer with shop name, location, phone/WhatsApp, email and website. Change the location later by setting `SHOP_LOCATION` in Render; no code change needed.
- Every new public submission also emails `OWNER_EMAIL` (default `mobilerecellr@outlook.com`).
- Default sender is `onboarding@resend.dev`, which only reaches the Resend account owner. Verify a sending domain in Resend, then set `EMAIL_FROM`, before expecting customers to receive mail.

## Abuse protection on public forms
Visitors who are not logged in are limited per IP: 20 submissions per 10 minutes (`PUBLIC_WRITE_MAX`), 30 offer responses per 10 minutes, 60 tracking lookups per 10 minutes, 10 ID photo uploads per 10 minutes, at most 20 items and 2 MB per submission, and at most 5 owner emails per request. Staff are not limited. Limits are in memory and reset on restart. The visitor is identified by Cloudflare's `CF-Connecting-IP` header (Render serves the app through Cloudflare); `True-Client-IP` is ignored because visitors can set it. Blocks are logged as `rate limit hit for <ip>`.

## Customer privacy
- Tracking lookups (`/public/find`) search only by reference number or email and return only what the tracking pages show (status, device, amounts, tracking number). Contact, bank, payout and ID details are never returned.
- Referrals send only the code; the server fills in who owns it.
- A reference number that clashes with a different existing record is refused (409) instead of silently dropped.
- Only an admin can delete a whole shared collection.
- A customer's accept/decline on a revised offer survives a staff save from an older copy; a newer re-inspection still wins.

## Prices on customer orders
The server never trusts a price sent from a customer's browser:
- Trade-ins: the "Brand New" base that staff re-assessment pays from is recomputed with the same formula as the calculator (`frontend/src/pricing.js`, shared by both). A quote above what the price list allows is flagged; staff see "⚠ check price" on the inspection screen, and the confirmation email leaves the amount out.
- Phone purchases: the price comes from the listed inventory item.
- Accessories: prices come from the catalogue and the total is recomputed (shipping rule mirrors `parts.jsx`; change both together).

## How the website loads
`/assets/app.js` is a tiny starter (index.html adds a fresh `?v=` each deploy) that loads the real app from files named after their content (`main-<hash>.js`), so a browser can never mix files from two deploys. Staff screens load only when staff open them, so customers don't download them. If a file is missing after a deploy, the page reloads once by itself.

## Two staff screens at once
`storage-shim.js` remembers what each screen last loaded and sends only the records that screen changed. The server keeps everyone else's newer edits, so a screen left open can't roll back other people's work. Two people editing the same record at the same moment: the last save wins for that record.

## Login protection
5 failed attempts locks that username for 5 minutes (checked before the password). Sessions are signed tokens and can be revoked per user or everywhere. Admin recovery uses `ADMIN_RECOVERY_CODE` with `ADMIN_RECOVERY_EXPIRES`.

## ID photos
Customers are not asked to upload ID. The sell form takes only the name as it appears on their photo ID, and staff check the ID in person before paying (the in-store till records the ID type and "ID sighted"). The backend `/id-photos` routes remain (encrypted, purged after `ID_PHOTO_RETENTION_DAYS`) but stay off while `ID_PHOTO_ENCRYPTION_KEY` is unset; if enabled, a visitor who is not logged in can upload only one photo, only for an existing order.

## Environment variables (set in Render, never in code)
Backend: `DATABASE_URL`, `PORT`, `SESSION_SECRET`, `CORS_ORIGIN` (comma-separated list allowed; include https://mobilerecellr.com.au), `ADMIN_BOOTSTRAP_TOKEN`, `ADMIN_RECOVERY_CODE`, `ADMIN_RECOVERY_EXPIRES`, `ID_PHOTO_ENCRYPTION_KEY`, `ID_PHOTO_RETENTION_DAYS`, `RESEND_API_KEY`, `EMAIL_FROM`, `OWNER_EMAIL`, `PGSSL`, `NODE_ENV`, optional `PUBLIC_WRITE_MAX`, `SHOP_LOCATION` (shown in customer emails, default "Sydney"), `SHOP_PHONE` (default "0411 931 999").

## Run locally
```
cd backend && npm install && npm start     # :8787, needs a local Postgres (see DATABASE_URL default in server.js)
cd frontend && npm install && npm run dev
cd backend && npm test                     # API tests; DROPS ALL TABLES in DATABASE_URL, use a throwaway local database
```
The default local database URL in `server.js` is a localhost test credential only. Never reuse it.

## Deploying changes
- Every pull request runs **Checks** on GitHub (backend tests against Postgres, and a website build). Only merge when both show a green ✓.
- Backend change: push to `main`, Render redeploys the web service.
- Frontend change: push to `main`, Render rebuilds the static site.
- Say in each change whether it is frontend, backend or both, and list any new env vars.
- In Render, check a merge shows a deploy with trigger "New commit" within a few minutes. If it says "API" or nothing appears, auto-deploy isn't firing: reconnect GitHub in Render (Account Settings) and the Render app on GitHub (Settings → Applications), then use Manual Deploy → Deploy latest commit.

## Known gaps
- Render Postgres backups are not configured in this repo.
- No payment processing; payment methods and amounts are recorded only.
- Digital marketing (Google Business Profile, Search Console, Google Ads, SEO) is deferred but must be done.

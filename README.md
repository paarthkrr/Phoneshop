# Phone Shop System — Overview

This is a full buy/sell/repair/trade-in system built for a small phone
shop that does both resale and repairs. It's 8 tools that share data
with each other, plus a real backend to run it outside Claude.

## The 8 tools, and what each one is for

| File | Who uses it | What it does |
|---|---|---|
| `instant-quote-calculator.jsx` | Customers | Get an instant buyback quote for a phone, tablet, laptop, or watch. Submit a trade-in order. Track an existing order or a price-match request. |
| `storefront.jsx` ("Shop Refurbished") | Customers | Browse and buy graded refurbished inventory online — the other direction of the business the calculator doesn't cover. Reads the same `inventory` records POS grades and lists. |
| `admin-pricing-console.jsx` | You / a manager | Edit every number the calculator uses — retail prices, the age-depreciation curve, brand factors, condition tiers, fault percentages, region pricing. Every change is logged. |
| `staff-inspection-console.jsx` | Front-of-house staff | When a traded-in device physically arrives, confirm or revise its condition and release payment. |
| `pos-inventory.jsx` ("Register") | Till staff | Buy phones from walk-in customers, receive approved online trade-ins into stock, grade and price inventory, print barcode labels, sell to customers, manage accessories (cases/cables/chargers). |
| `repair-tickets.jsx` ("Repair Bench") | Repair techs | Job intake, status tracking (dropped off → diagnosing → in repair → ready for pickup), parts stock that auto-deducts when used on a job, warranty claims. |
| `till-reconciliation.jsx` ("Till") | Whoever closes the register | End-of-day cash count against actual cash sales/buys, with a discrepancy check. |
| `crm-dashboard.jsx` ("Customers & Reports") | You | Every customer's history (both selling to you and buying from you) in one place, plus business reports: revenue vs. payouts, margin, inspection accuracy, order funnel. |
| `daily-dashboard.jsx` ("Today") | You, first thing each day | A single "what needs attention" view — pulled from everything else, writes nothing itself. |

**`App.jsx`** ties all 9 of the above into one real, navigable product — real routing (React Router), a public zone (trade-in quotes + storefront) separate from a staff zone (the other 7 tools), a working 404, and its own automated test suite proving actual clicks change the actual URL and load actual working tools, not just that each file compiles in isolation. This is what makes "9 files" into "one website" — see `DEPLOYMENT.md` for how to drop it in.

## How they connect

They don't talk to each other directly — they all read and write the
**same shared storage keys**. That's the entire integration:

- `pricing-config` — everything the admin console manages
- `orders` — online trade-ins, written by the calculator, read/updated by staff inspection and the dashboard
- `inventory` — phone stock, written by POS, read by the dashboard and the storefront (only `status: "listed"` items are shown to customers)
- `purchase_orders` — online storefront orders, written by the storefront, fulfilled by POS's "Web Orders" tab, which then creates the matching `sales` record
- `accessories` — case/cable/charger stock, owned by POS
- `sales` — every sale (phones and accessories), read by CRM and the till
- `quote_leads` — customers who got a quote but didn't sell on the spot, captured for follow-up, reviewed in CRM's "Leads & Notifications" tab
- `notification_queue` — every email/SMS this system would send, waiting for a real provider to be connected. Nothing is actually sent yet — see the note below.
- `repair_tickets` — owned by the Repair Bench, read by the dashboard
- `parts_stock` — repair parts, owned by the Repair Bench
- `till_records` — daily cash reconciliation history

Because of this, **order matters a little on first use**: open the
admin console at least once before relying on real pricing elsewhere,
since that's what seeds `pricing-config` with the full device catalog.
Everything else works with sensible built-in defaults if you don't,
but a MacBook or Apple Watch quote won't be accurate until the admin
console's catalog exists.

## Setting this up for real (outside Claude)

Everything above calls `window.storage`, which only exists inside
Claude.ai artifacts. To run this as an actual website:

1. Deploy `server.js` (needs `shop-backend-package.json` renamed to
   `package.json`) to a host with persistent disk — Railway, Render,
   or Fly.io. **Not** a serverless platform like Vercel functions.
   Set a real `SESSION_SECRET` environment variable (see `DEPLOYMENT.md`).
2. Load `storage-shim.js` in your frontend and call
   `window.shopAuth.mountLoginGate(...)` before rendering the app —
   the first account registered becomes the shop's admin.
3. Wire the 8 tool files into routes with a router (React Router is
   the easy option) so navigation between them actually works.

Full step-by-step is in `DEPLOYMENT.md`. This was tested, not just
described — `admin-pricing-console.jsx`, completely unmodified, was
run against a live instance of `server.js` and worked identically to
running inside Claude.

## What's been tested

299 automated checks across 22 test suites simulate real interaction
(clicking, typing, checking boxes) rather than just reviewing code —
customer quote flows, staff inspection, POS buy/sell/receive, repair
job lifecycles including parts-stock deduction, till reconciliation
math, CRM aggregation, and the real-backend integration. All passing
as of the last update. That said: automated tests catch logic bugs,
not whether the pricing itself is right — see the limitations below.

## Known limitations — read this before relying on it for real money

**Pricing accuracy:**
- The age-depreciation curve is real-data-anchored at two points (36
  and 60 months, from live Mobile Monster prices) and interpolated
  elsewhere. Good for phones. Tablet/laptop/watch category factors
  (tablets +5%, laptops +15%, watches −30%) are *reasoned estimates*,
  not verified against real buyback listings the way phones are.
- Admin-edited fault percentages apply by fault ID across whichever
  category shares that ID — there's no independent "battery fault %
  for laptops vs. phones" editing. One shared set of overrides.

**Security & compliance:**
- **ID photo capture is now built in** (see `server.js` — the
  `/id-photos` endpoints). Photos are encrypted at rest (AES-256-GCM,
  a key you control), auto-purged after a configurable retention
  period (default 90 days), and the feature fails closed — no
  encryption key configured means upload is disabled, not weakly
  protected. The calculator's checkout form uploads a photo directly
  when `window.SHOP_API_BASE_URL` is set; inside Claude.ai (no
  backend), it quietly falls back to ID-number-only, which still
  satisfies the core "who sold us this" requirement.
  **Still your call, not this system's:** the right retention period
  varies by jurisdiction — verify it before trusting the default.
- Hardware diagnostics (the USB-plug-in-and-auto-capture-everything
  that companies like Phonecheck do) isn't buildable here — it needs
  OS-level access no web app has. Budget for a real integration with
  a provider like that when you're ready, rather than building it
  from scratch.
- **Fixed a genuinely critical gap this round**: the backend used to
  require a staff login for every single storage call, which meant an
  anonymous customer literally could not have used the storefront or
  submitted a trade-in on a real deployment — the entire public side
  of the business would have been non-functional. It now distinguishes
  public catalog data (readable by anyone), customer submissions
  (anyone can add their own order/lead, but nobody can bulk-read the
  collection — merged safely by ID server-side, so two customers
  submitting at once can never overwrite each other), and everything
  else (still fully staff-only). Verified with 25 checks that
  specifically try to break this — reading other customers' data,
  writing to non-whitelisted keys, resubmitting duplicate IDs.
- Real login is built in (see `server.js` / `storage-shim.js`) —
  password-hashed accounts, signed session tokens, admin-gated
  registration after the first account, and an audit trail of who
  changed shared data. **Session revocation and password reset are
  both built in too**: logging out (or an admin force-revoking a
  specific user, e.g. someone who's left) invalidates a token
  immediately even though its signature and expiry are still valid —
  verified directly, not just claimed. Staff can change their own
  password; an admin can reset one for someone who's forgotten theirs,
  without needing email infrastructure this environment can't provide.
  **This is now actually connected to the frontend, not just the
  backend** — POS, Repair Bench, and Till Reconciliation all check for
  a real logged-in user and use that automatically (locked, not
  editable) when one exists, falling back to the old free-text field
  only when no real backend is connected. Till Reconciliation also
  gained staff attribution for the first time (who opened/closed each
  day) as part of this fix.
- The deployed backend's CORS defaults to accepting any origin, but is
  now driven by a `CORS_ORIGIN` environment variable — set it to your
  real domain and it's genuinely locked down, not just documented as
  "should do this later."
- **Login is now rate-limited** (5 failed attempts locks that account
  for 15 minutes) — verified directly, including that the lockout
  blocks the *attempt* itself, not just wrong passwords: even the
  correct password is rejected while locked out. Per-account, not
  per-IP — good enough for a small shop, not a substitute for
  IP-based limiting at real scale.
- **Two real vulnerabilities found and fixed on a closer security
  pass, not just more features**: (1) login had a timing side-channel
  — checking a nonexistent username returned instantly while checking
  a real one always ran a deliberately-slow password hash first,
  letting an attacker measure response time to enumerate valid staff
  usernames without guessing a single password. Fixed by always
  hashing, verified by literally timing both cases side by side.
  (2) Whoever called the registration endpoint *first* on a freshly
  deployed server became permanent admin with no proof required —
  an attacker who found the URL before the shop owner did could have
  taken over the whole system. Fixed with an optional deploy-time
  bootstrap token.
- Basic security headers (X-Content-Type-Options, X-Frame-Options,
  Referrer-Policy) are set by default.
- A single SQLite file on one disk is a single point of failure.
  Set up automatic backups through your host.

**Scope:**
- No payment processing integration (Stripe, bank transfer APIs) —
  the systems above show payment *methods* and record amounts but
  don't move real money.
- No SMS/email notifications — actual sending isn't built (no provider
  connected), but the architecture for it now is: every event that
  should trigger one (an order confirmed, a quote abandoned, **a part
  or accessory crossing into low stock**) writes a fully-formed entry
  to `notification_queue` — recipient, subject, message, all real —
  instead of trying to send anything directly. The low-stock trigger
  fires exactly once when a quantity crosses the threshold, not on
  every subsequent sale while it stays low, and fires again if
  restocked above the threshold and then drops low a second time.
  Connecting a provider later means writing one small worker that
  polls this queue and sends + marks entries "sent"; none of the
  trigger points need to change. Until then, CRM's "Leads &
  Notifications" tab lets staff handle each one manually.
- **Repair revenue is now visible in every financial report.**
  Completing a repair job captures a real payment method and writes
  to the exact same shared `sales` collection every other sale uses —
  so CRM's Net Profit, monthly revenue, and the Customers tab all
  automatically include repair income with zero code changes needed
  in CRM itself. Before this fix, a repair shop's actual repair
  revenue was completely absent from every number in the business.
- **Till discrepancies now affect Net Profit**, using standard "cash
  over and short" accounting — a shortfall reduces profit, an
  overage increases it, both net together correctly across multiple
  days, and an in-progress (unclosed) day's count is correctly
  excluded so it can't corrupt the real number.

/**
 * Shop backend — a real, deployable replacement for window.storage,
 * with real authentication instead of the "type your name" and
 * random-per-browser clientId stand-ins used earlier.
 *
 * Every tool built so far (calculator, admin console, POS, repairs,
 * till, CRM, dashboard) calls window.storage.get/set/delete/list with
 * a (key, shared) signature. That API only exists inside Claude.ai
 * artifacts. This server implements the exact same contract over
 * HTTP + real Postgres, so the frontend code needs zero changes to its
 * storage calls — window.storage itself gets pointed at this server
 * (see storage-shim.js), which now requires a real login first.
 *
 * "shared" data is one global table (the shop's business data —
 * orders, inventory, sales). Any logged-in staff member can read and
 * write it, but every write now records who did it.
 *
 * "private" data is scoped by the AUTHENTICATED username, not a
 * client-supplied ID a browser could set to anything. This is the
 * actual fix for the earlier gap: a staff member's identity now comes
 * from a verified password login, not a text field anyone could type
 * into.
 *
 * Passwords are hashed with scrypt (Node's built-in, no dependency).
 * Sessions are signed, stateless tokens (HMAC-SHA256) — no session
 * table to manage the TOKEN itself, but a "sessions" table still
 * exists so a token can be revoked before it expires (logout,
 * logout-everywhere, admin revoke, password change).
 *
 * DATABASE: Postgres (via the `pg` package), not SQLite. This is a
 * deliberate migration from an earlier SQLite version — a platform
 * like Render doesn't guarantee a persistent disk for a plain web
 * service on every plan, which would make SQLite's on-disk file
 * silently reset on every redeploy or restart. Postgres (Render's own
 * managed offering, or any other host) is a real, durable database
 * service instead of a file sitting on ephemeral storage. Every query
 * in this file is now async and uses $1, $2... placeholders (Postgres
 * syntax) instead of SQLite's `?`.
 */
const compression = require("compression");
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const crypto = require("node:crypto");

// Render (and most managed Postgres hosts) provide a single
// DATABASE_URL. Falls back to discrete PG* vars for other hosts, and
// to a local dev default so `npm start` works out of the box locally.
const DATABASE_URL = process.env.DATABASE_URL || "postgres://postgres:testpass@localhost:5432/shoptest";
// Managed Postgres (Render included) typically terminates SSL with a
// certificate that isn't in Node's default trust store — this is the
// standard, expected way to connect to it, not a security downgrade.
// Local/plain connections (no sslmode requested) skip SSL entirely.
const useSSL = /render\.com|amazonaws\.com|sslmode=require/i.test(DATABASE_URL) || process.env.PGSSL === "true";
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

// SESSION_SECRET MUST be set to a real random value in production —
// this default is only for local dev and is intentionally obvious.
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me";
if (SESSION_SECRET.startsWith("dev-only") && process.env.NODE_ENV === "production") {
  console.warn("WARNING: running with the default dev SESSION_SECRET in production. Set a real one.");
}
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours — roughly a shift

// ID photo encryption — this is the actually-sensitive part (government
// ID), so it fails CLOSED rather than falling back to an insecure
// default the way SESSION_SECRET does. No key set = the feature is
// simply unavailable, not "available but weakly protected."
const ID_PHOTO_KEY_HEX = process.env.ID_PHOTO_ENCRYPTION_KEY || "";
const ID_PHOTO_KEY = /^[0-9a-f]{64}$/i.test(ID_PHOTO_KEY_HEX) ? Buffer.from(ID_PHOTO_KEY_HEX, "hex") : null;
if (!ID_PHOTO_KEY) {
  console.warn("ID_PHOTO_ENCRYPTION_KEY not set (needs a 64-char hex string, e.g. `openssl rand -hex 32`) — ID photo storage is DISABLED, not insecurely enabled.");
}
// Default retention — VERIFY the correct period for your jurisdiction's
// second-hand dealer / pawnbroker regulations before relying on this.
// This default is a reasonable common starting point, not legal advice.
const ID_PHOTO_RETENTION_DAYS = parseInt(process.env.ID_PHOTO_RETENTION_DAYS || "90", 10);

// Schema setup is async (Postgres has no synchronous query API), but
// this module still needs to export `app` synchronously so existing
// tests (and any entry point) can `require()` and immediately call
// `app.listen()`. The fix: kick schema setup off immediately as a
// promise, and gate every request behind it with middleware — so no
// matter when a request actually arrives, it always waits for the
// schema to exist first, without the module export itself being async.
const schemaReady = pool.query(`
  CREATE TABLE IF NOT EXISTS storage (
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    updated_by TEXT,
    PRIMARY KEY (scope, key)
  );
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    salt TEXT NOT NULL,
    hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    created_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE IF NOT EXISTS id_photos (
    id TEXT PRIMARY KEY,
    subject_key TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_id_photos_subject ON id_photos(subject_key);
  ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_hash TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_created_at TIMESTAMPTZ;
  CREATE TABLE IF NOT EXISTS recovery_uses (
    code_hash TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS product_images (
    id TEXT PRIMARY KEY,
    mime TEXT NOT NULL,
    data BYTEA NOT NULL,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
  );
  CREATE TABLE IF NOT EXISTS login_attempts (
    username TEXT NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL,
    success INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_login_attempts_username ON login_attempts(username, attempted_at);
`).catch((e) => {
  console.error("FATAL: could not set up database schema:", e.message);
  process.exit(1);
});

async function encryptIdPhoto(plainBase64) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ID_PHOTO_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plainBase64, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}
function decryptIdPhoto(row) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", ID_PHOTO_KEY, Buffer.from(row.iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(row.ciphertext, "base64")), decipher.final()]);
  return plain.toString("utf8");
}
async function purgeExpiredIdPhotos() {
  const result = await pool.query("DELETE FROM id_photos WHERE expires_at < NOW()");
  return result.rowCount;
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}
// Usernames are case-insensitive everywhere ("paarthkr" = "Paarthkr") and
// ignore stray spaces. This returns the name exactly as stored, or null.
async function canonicalUsername(name) {
  const n = String(name || "").trim();
  if (!n) return null;
  const r = await pool.query("SELECT username FROM users WHERE LOWER(username) = LOWER($1) ORDER BY created_at LIMIT 1", [n]);
  return r.rows[0] ? r.rows[0].username : null;
}
const attemptKey = (name) => String(name || "").trim().toLowerCase();
async function createUser(username, password, role) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  await pool.query("INSERT INTO users (username, salt, hash, role, created_at) VALUES ($1, $2, $3, $4, NOW())", [username, salt, hash, role]);
}
// A fixed dummy salt used ONLY to keep timing constant when a username
// doesn't exist — never used to verify a real password against.
const DUMMY_SALT_FOR_TIMING = crypto.randomBytes(16).toString("hex");

async function verifyPassword(username, password) {
  const result = await pool.query("SELECT username, salt, hash, role FROM users WHERE LOWER(username) = LOWER($1) ORDER BY created_at LIMIT 1", [String(username || "").trim()]);
  const row = result.rows[0];
  // Whether or not the username exists, we still do a full scrypt hash
  // before returning. Returning early here would make "no such user"
  // respond faster than "wrong password for a real user" — an attacker
  // measuring response times could use that gap to enumerate valid
  // usernames without ever guessing a password.
  const candidate = hashPassword(password, row ? row.salt : DUMMY_SALT_FOR_TIMING);
  if (!row) return null;
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(row.hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { username: row.username, role: row.role };
}
function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
async function verifyToken(token) {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig); const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString()); } catch { return null; }
  if (!payload.exp || Date.now() > payload.exp) return null;
  // The signature being valid only proves the token wasn't forged —
  // it doesn't mean the session is still live. A logged-out or
  // admin-revoked session must fail here even with a perfectly valid
  // signature and an unexpired exp claim.
  if (!payload.sid) return null;
  const result = await pool.query("SELECT revoked_at FROM sessions WHERE session_id = $1", [payload.sid]);
  const session = result.rows[0];
  if (!session || session.revoked_at) return null;
  return payload; // { username, role, sid, iat, exp }
}
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const user = await verifyToken(token);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  req.user = user;
  next();
}
// Like requireAuth, but doesn't reject when there's no valid session —
// it just leaves req.user as null. This is what makes public customer
// routes (the calculator, the storefront) actually work on the real
// backend: they were never meant to need a staff login at all.
async function tryAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  req.user = await verifyToken(token); // null if absent/invalid — not an error here
  next();
}

// Customers need to browse stock and get quotes without a staff login —
// these two are genuinely public catalog data, not anyone's private info.
const PUBLIC_READ_KEYS = ["inventory", "pricing-config", "accessories"];
// Customers need to SUBMIT to these (a trade-in order, a purchase, a
// price-match request, a bulk quote, a lead, a referral) without a staff
// login — but they must never be able to READ them back in bulk, since
// these collections hold every other customer's name, email, and ID
// reference. Anonymous writes here are handled as a safe server-side
// merge-by-id (see the PUT handler) — an anonymous client's local view
// of "existing records" is always empty, so this only ever adds their
// own new submission, never overwrites anyone else's data.
const PUBLIC_WRITE_KEYS = ["orders", "purchase_orders", "price_match_requests", "bulk_quote_requests", "quote_leads", "referrals", "notification_queue", "support_queries", "repair_requests", "accessory_orders"];

// ---- What an anonymous visitor may look up ----
// Tracking pages find ONE record by its id or the customer's email, and get
// back only what those pages display. Contact, bank, payout and ID details
// never leave the server through a public lookup.
const PUBLIC_FIND_KEYS = ["orders", "purchase_orders", "price_match_requests", "bulk_quote_requests", "repair_requests", "accessory_orders"];
const PUBLIC_LOOKUP_FIELDS = ["id", "email", "customer.email", "customerEmail", "business.email"];
const PUBLIC_RECORD_FIELDS = ["id", "createdAt", "status", "region", "currency", "device", "brand", "model", "storage", "deviceType", "issue",
  "tierLabel", "faultLabels", "quotedTotal", "priceLockExpires", "fulfillment", "fulfilment", "competitorName", "ourQuote", "approvedPrice",
  "staffNote", "itemCount", "estimatedTotal", "subtotal", "total", "warrantyExpiresAt"];
function publicView(record) {
  const out = {};
  for (const k of PUBLIC_RECORD_FIELDS) if (record[k] !== undefined) out[k] = record[k];
  if (record.device && typeof record.device === "object") out.device = { brand: record.device.brand, model: record.device.model, storage: record.device.storage };
  if (record.inspection && typeof record.inspection === "object") {
    const { confirmedTotal, staffNote, customerDecision, customerRespondedAt } = record.inspection;
    out.inspection = { confirmedTotal, staffNote, customerDecision, customerRespondedAt };
  }
  if (record.shipping && typeof record.shipping === "object") out.shipping = { trackingNumber: record.shipping.trackingNumber, carrier: record.shipping.carrier };
  else if (typeof record.shipping === "number") out.shipping = record.shipping;
  if (Array.isArray(record.items)) out.items = record.items.map((i) => ({ name: i && i.name, qty: i && i.qty, price: i && i.price }));
  return out;
}
async function loadSharedValue(key) {
  const r = await pool.query("SELECT value FROM storage WHERE scope = 'shared' AND key = $1", [key]);
  try { return r.rows[0] ? JSON.parse(r.rows[0].value) : null; } catch (e) { return null; }
}
async function loadSharedList(key) {
  const r = await pool.query("SELECT value FROM storage WHERE scope = 'shared' AND key = $1", [key]);
  try { const v = r.rows[0] ? JSON.parse(r.rows[0].value) : []; return Array.isArray(v) ? v : []; } catch (e) { return []; }
}

// ---- Email (Resend) ----
// Customer emails are the ones the site already prepares in notification_queue
// (quote confirmations, orders, repair requests, replies); the owner gets an
// alert for every new public submission. Nothing is sent without RESEND_API_KEY,
// and a failed email never blocks the customer's submission.
const OWNER_EMAIL = () => process.env.OWNER_EMAIL || "mobilerecellr@outlook.com";
const EMAIL_FROM = () => process.env.EMAIL_FROM || "Mobile Recellr <onboarding@resend.dev>";
const escHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// ---- Email design: logo + brand, system-font stack, table layout (renders in Gmail, Outlook and Apple Mail) ----
// Location and phone can be changed later in Render (SHOP_LOCATION, SHOP_PHONE) with no code change.
const SHOP_LOCATION = () => process.env.SHOP_LOCATION || "Sydney";
const SHOP_PHONE = () => process.env.SHOP_PHONE || "0411 931 999";
const SHOP_WA_LINK = () => { const d = String(SHOP_PHONE()).replace(/\D/g, ""); return `https://wa.me/${d.startsWith("0") ? "61" + d.slice(1) : d}`; };
const SITE_URL = "https://mobilerecellr.com.au";
const LOGO_URL = `${SITE_URL}/logo-512.png`;
const E = { navy: "#0F1B3D", blue: "#2150C8", soft: "#E8EEFF", bg: "#F3F6FD", line: "#E2E6EC", muted: "#5B6472",
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif" };
const nl2br = (s) => escHtml(s).replace(/\r?\n/g, "<br>");
const emailButton = (href, label, primary = true) =>
  `<a href="${escHtml(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 22px;border-radius:8px;font-family:${E.font};font-size:15px;font-weight:600;text-decoration:none;${primary ? `background:${E.blue};color:#ffffff;` : `background:#ffffff;color:${E.blue};border:1px solid ${E.blue};`}">${escHtml(label)}</a>`;

// One shell for every email: logo + brand name on top, white card, soft footer.
function emailShell({ preheader, heading, bodyHtml, footerHtml }) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:${E.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${E.bg};">${escHtml(preheader || "")}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${E.bg};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
 <tr><td style="padding:0 4px 14px 4px;">
   <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
     <td style="vertical-align:middle;"><img src="${LOGO_URL}" width="52" height="52" alt="Mobile Recellr" style="display:block;border:0;border-radius:12px;"></td>
     <td style="vertical-align:middle;padding-left:12px;font-family:${E.font};font-size:20px;font-weight:800;letter-spacing:.6px;color:${E.navy};">MOBILE <span style="color:${E.blue};">RECELLR</span></td>
   </tr></table>
 </td></tr>
 <tr><td style="background:#ffffff;border-radius:14px;border-top:4px solid ${E.blue};padding:28px 28px 22px 28px;font-family:${E.font};color:${E.navy};">
   <h1 style="margin:0 0 16px 0;font-family:${E.font};font-size:22px;line-height:1.3;font-weight:700;color:${E.navy};">${escHtml(heading)}</h1>
   ${bodyHtml}
 </td></tr>
 <tr><td style="padding:16px 8px 0 8px;font-family:${E.font};font-size:12px;line-height:1.7;color:${E.muted};">${footerHtml}</td></tr>
</table></td></tr></table></body></html>`;
}
const shopFooterHtml = (why) => `<strong style="color:${E.navy};">Mobile Recellr</strong> · ${escHtml(SHOP_LOCATION())}<br>
Phone / WhatsApp: <a href="${escHtml(SHOP_WA_LINK())}" style="color:${E.blue};text-decoration:none;">${escHtml(SHOP_PHONE())}</a> · Email: <a href="mailto:${escHtml(OWNER_EMAIL())}" style="color:${E.blue};text-decoration:none;">${escHtml(OWNER_EMAIL())}</a><br>
<a href="${SITE_URL}" style="color:${E.blue};text-decoration:none;">mobilerecellr.com.au</a>${why ? `<br><span style="color:${E.muted};">${escHtml(why)}</span>` : ""}`;

// Generic fallback (staff-written emails etc.)
function emailHtml(subject, text) {
  return emailShell({ preheader: String(text || "").slice(0, 90), heading: subject,
    bodyHtml: `<div style="font-size:15px;line-height:1.65;">${nl2br(text)}</div>`, footerHtml: shopFooterHtml() });
}

// ---- Customer emails ----
// Submissions where the customer is waiting to hear back from us.
const RECEIVED_KINDS = new Set(["order_confirmation", "quote_lead", "bulk_quote_request", "repair_request", "support_query", "accessory_order"]);
const NEXT_STEPS = "We've received your request and our team will review it and get back to you shortly. If you'd like to add anything in the meantime, just reply to this email or message us on WhatsApp.";
// "  rahul   sharma " -> "Rahul". First name only, letters/'-. only, so nothing odd lands in the email.
function firstName(raw) {
  const w = String(raw || "").trim().split(/\s+/)[0] || "";
  const clean = w.replace(/[^\p{L}'’.-]/gu, "").slice(0, 30);
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
}
function customerEmailText(text, kind, name) {
  return [
    `Hi ${firstName(name) || "there"},`, "", text || "",
    ...(RECEIVED_KINDS.has(kind) ? ["", NEXT_STEPS] : []),
    "", "Thanks for choosing Mobile Recellr.", "The Mobile Recellr team", "",
    "--", "Mobile Recellr", SHOP_LOCATION(),
    `Phone / WhatsApp: ${SHOP_PHONE()}`, `Email: ${OWNER_EMAIL()} (or just reply to this email)`, SITE_URL,
  ].join("\n");
}
function customerEmailHtml(subject, text, kind, name) {
  const received = RECEIVED_KINDS.has(kind);
  const body = `<p style="margin:0 0 14px 0;font-size:16px;line-height:1.6;">Hi ${escHtml(firstName(name) || "there")},</p>
   <p style="margin:0 0 18px 0;font-size:16px;line-height:1.65;">${nl2br(text)}</p>
   ${received ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;"><tr><td style="background:${E.soft};border-left:4px solid ${E.blue};border-radius:6px;padding:14px 16px;font-size:15px;line-height:1.6;color:${E.navy};"><strong>What happens next</strong><br>${escHtml(NEXT_STEPS)}</td></tr></table>` : ""}
   <div style="margin:0 0 20px 0;">${emailButton(SHOP_WA_LINK(), "Message us on WhatsApp")}${emailButton(`mailto:${OWNER_EMAIL()}`, "Reply by email", false)}</div>
   <p style="margin:0;font-size:15px;line-height:1.6;">Thanks for choosing Mobile Recellr.<br><span style="color:${E.muted};">The Mobile Recellr team</span></p>`;
  return emailShell({ preheader: received ? "We've received your request and will be in touch shortly." : String(text || "").slice(0, 90),
    heading: subject, bodyHtml: body, footerHtml: shopFooterHtml("You're receiving this because of a request you made on mobilerecellr.com.au.") });
}

// ---- Owner alert (new order / repair / message): grouped, readable, sensitive numbers masked ----
const NEW_LABEL = { orders: "New order", purchase_orders: "New trade-in / sell order", price_match_requests: "New price-match request", bulk_quote_requests: "New bulk quote request",
  quote_leads: "New sell quote", referrals: "New referral", support_queries: "New customer message", repair_requests: "New repair request", accessory_orders: "New accessories order" };
const FIELD_LABEL = { id: "Reference", createdAt: "Received", priceLockExpires: "Price held until", quotedTotal: "Quoted total", total: "Total", tierLabel: "Condition",
  hasAccessories: "Accessories included", idType: "ID type", idOwnerName: "Name on ID", payoutMethod: "Payout method", bankBsb: "BSB", bankAccountNumber: "Account number",
  bankAccountName: "Account name", paypalEmail: "PayPal email", fulfillment: "Fulfilment", faultLabels: "Faults reported", release: "Released", name: "Name", email: "Email", phone: "Phone" };
const FIELD_HIDE = new Set(["tierId", "brandNewBase", "category", "region", "currency", "status", "notifiedAt"]);
// Bank, payout-account and ID details stay in the portal; email is not a safe place for them.
const SENSITIVE_KEY = /bank|bsb|accountnumber|paypal|idtype|idowner|idnumber|licen[cs]e|passport|birth|dob|password|token/i;
const FIELD_MASK = new Set(["bankAccountNumber", "idNumber", "licenceNumber", "licenseNumber", "passportNumber"]);
const MONEY_KEYS = new Set(["quotedTotal", "total", "rewardAmount", "subtotal", "amount", "price", "deposit"]);
const VALUE_MAP = { dropoff: "Drop-off in store", post: "Post / mail-in", pickup: "Pickup", delivery: "Delivery", collect: "Collect in store", cash: "Cash", bank: "Bank transfer",
  license: "Driver licence", passport: "Passport", other: "Other photo ID" };
const humanise = (k) => FIELD_LABEL[k] || String(k).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());
function fmtValue(k, v, currency) {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  const s = String(v).slice(0, 300);
  if (FIELD_MASK.has(k)) return s.length > 3 ? "•••• " + s.slice(-3) : "••••";
  if (MONEY_KEYS.has(k) && !isNaN(Number(v))) { try { return new Intl.NumberFormat("en-AU", { style: "currency", currency: currency || "AUD" }).format(Number(v)); } catch (e) { return `$${v}`; } }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !isNaN(Date.parse(s))) return new Date(s).toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  return VALUE_MAP[s] || s;
}
function alertSections(item) {
  const cur = (item && (item.currency || (item.device && item.device.currency))) || "AUD";
  const top = [], groups = [];
  const row = (k, v) => ({ key: k, label: humanise(k), value: fmtValue(k, v, cur) });
  for (const [k, v] of Object.entries(item || {})) {
    if (v == null || v === "" || FIELD_HIDE.has(k) || SENSITIVE_KEY.test(k)) continue;
    if (Array.isArray(v)) { if (v.length && v.every((x) => typeof x !== "object")) top.push(row(k, v.join(", "))); else if (v.length) top.push({ key: k, label: humanise(k), value: `${v.length} item${v.length === 1 ? "" : "s"}` }); }
    else if (typeof v === "object") {
      const rows = Object.entries(v).filter(([k2, v2]) => v2 != null && v2 !== "" && typeof v2 !== "object" && !FIELD_HIDE.has(k2) && !SENSITIVE_KEY.test(k2)).map(([k2, v2]) => row(k2, v2));
      if (rows.length) groups.push({ title: humanise(k), rows });
    } else top.push(row(k, v));
  }
  const get = (k) => (top.find((r) => r.key === k) || {}).value;
  const highlights = [["Reference", get("id")], ["Quoted total", get("quotedTotal") || get("total")]].filter(([, v]) => v);
  const rest = top.filter((r) => !["id", "quotedTotal", "total"].includes(r.key));
  return { highlights, sections: [...groups, ...(rest.length ? [{ title: "Order details", rows: rest }] : [])].slice(0, 8) };
}
function ownerAlertText(item) {
  const { highlights, sections } = alertSections(item);
  const out = highlights.map(([l, v]) => `${l}: ${v}`);
  for (const s of sections) { out.push("", s.title.toUpperCase()); for (const r of s.rows.slice(0, 25)) out.push(`${r.label}: ${r.value}`); }
  return out.join("\n") + `\n\nOpen the staff portal: ${SITE_URL}/portal`;
}
function ownerAlertHtml(key, item, subject) {
  const { highlights, sections } = alertSections(item);
  const email = item.email || (item.customer && item.customer.email);
  const phone = item.phone || (item.customer && item.customer.phone);
  const cell = (inner, extra = "") => `<td style="padding:7px 0;border-bottom:1px solid ${E.line};font-family:${E.font};font-size:14px;line-height:1.5;${extra}">${inner}</td>`;
  const linkify = (r) => /email/i.test(r.key) ? `<a href="mailto:${escHtml(r.value)}" style="color:${E.blue};">${escHtml(r.value)}</a>` : /phone/i.test(r.key) ? `<a href="tel:${escHtml(String(r.value).replace(/\s+/g, ""))}" style="color:${E.blue};">${escHtml(r.value)}</a>` : escHtml(r.value);
  const band = highlights.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px 0;"><tr>${highlights.map(([l, v]) => `<td style="background:${E.soft};border-radius:8px;padding:12px 14px;width:${Math.floor(100 / highlights.length)}%;"><div style="font-family:${E.font};font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:${E.muted};">${escHtml(l)}</div><div style="font-family:${E.font};font-size:18px;font-weight:700;color:${E.navy};padding-top:2px;">${escHtml(v)}</div></td>`).join('<td width="10"></td>')}</tr></table>` : "";
  const tables = sections.map((s) => `<div style="margin:0 0 6px 0;font-family:${E.font};font-size:12px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:${E.blue};">${escHtml(s.title)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px 0;">${s.rows.slice(0, 25).map((r) => `<tr>${cell(escHtml(r.label), `color:${E.muted};width:38%;padding-right:10px;`)}${cell(linkify(r), `color:${E.navy};font-weight:600;`)}</tr>`).join("")}</table>`).join("");
  const buttons = emailButton(`${SITE_URL}/portal`, "Open staff portal") + (email ? emailButton(`mailto:${email}`, "Email customer", false) : "") + (phone ? emailButton(`tel:${String(phone).replace(/\s+/g, "")}`, "Call", false) : "");
  return emailShell({ preheader: subject, heading: subject, bodyHtml: `${band}${tables}<div style="margin-top:6px;">${buttons}</div>`,
    footerHtml: `Automatic alert from mobilerecellr.com.au. Bank and ID details are left out of email; open the staff portal for full details.` });
}

const maskEmail = (a) => String(a || "").replace(/^(.).*(@.*)$/, "$1***$2");
async function sendEmail({ to, subject, text, replyTo, customer, kind, name, alert }) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return { skipped: true };
  try {
    const content = customer ? { text: customerEmailText(text, kind, name), html: customerEmailHtml(subject, text, kind, name) }
      : alert ? { text: ownerAlertText(alert.item), html: ownerAlertHtml(alert.key, alert.item, subject) }
      : { text, html: emailHtml(subject, text) };
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM(), to: [to], subject, text: content.text, html: content.html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    const body = await r.text();
    if (!r.ok) console.error("email not sent:", r.status, body.slice(0, 200));
    else { let id = ""; try { id = JSON.parse(body).id || ""; } catch (e) {} console.log(`email sent to ${maskEmail(to)} (${kind || (alert ? "owner alert" : "message")}) id=${id}`); }
    return { ok: r.ok };
  } catch (e) { console.error("email error:", e.message); return { ok: false }; }
}
function notifyNew(key, items, max = Infinity) {
  const list = items || [];
  if (list.length > max) console.warn(`notifyNew(${key}): ${list.length} new items, only emailing the first ${max}`);
  for (const item of list.slice(0, max)) {
    if (!item) continue;
    if (key === "notification_queue") {
      if (item.channel === "email" && item.recipientEmail) void sendEmail({ to: item.recipientEmail, subject: item.subject || "Update from Mobile Recellr", text: item.message || "", replyTo: OWNER_EMAIL(), customer: true, kind: item.type, name: item.recipientName });
      continue;
    }
    const who = item.name || (item.customer && item.customer.name) || item.email || (item.customer && item.customer.email) || item.id || "";
    void sendEmail({
      to: OWNER_EMAIL(), subject: `${NEW_LABEL[key] || `New ${key.replace(/_/g, " ")}`}${who ? ` — ${who}` : ""}`,
      alert: { key, item },
      replyTo: item.email || (item.customer && item.customer.email) || undefined,
    });
  }
}

// ---- Prices on anonymous orders come from the shop, not the browser ----
// A customer's browser can send any number. Before an order is saved:
//  - trade-ins: the "Brand New" base that staff re-assessment pays from is
//    recomputed with the same formula the calculator uses (frontend/src/pricing.js);
//    a quote above what the price list allows is flagged for staff.
//  - phone purchases: price comes from the listed inventory item.
//  - accessories: prices from the catalogue, total recomputed.
let pricingModule = null;
const loadPricing = () => (pricingModule = pricingModule || import("../frontend/src/pricing.js"));
const round2 = (n) => Math.round(n * 100) / 100;
// Mirrors SHIPPING_FLAT / FREE_SHIPPING_OVER in frontend/src/parts.jsx.
const ACCESSORY_SHIPPING_FLAT = 9.95, ACCESSORY_FREE_SHIPPING_OVER = 100;
async function enforcePrices(key, records) {
  if (key === "orders") {
    const { brandNewBase, DEFAULT_TIERS, ACCESSORY_BONUS_PCT } = await loadPricing();
    const config = (await loadSharedValue("pricing-config")) || {};
    const tierOverrides = Object.fromEntries((Array.isArray(config.tiers) ? config.tiers : []).map((t) => [t.id, t.factor]));
    const maxTier = Math.max(...DEFAULT_TIERS.map((t) => Number(tierOverrides[t.id] ?? t.factor) || 0));
    return records.map((o) => {
      const d = o.device || {};
      const base = brandNewBase(config, { brand: d.brand, model: d.model, storage: d.storage, region: o.region });
      if (base == null) return { ...o, priceCheck: { verified: false, reason: "device not in the price list" } };
      const claimed = Number(o.brandNewBase);
      const maxQuote = base * maxTier * (1 + ACCESSORY_BONUS_PCT);
      const quoteTooHigh = !(Number(o.quotedTotal) <= maxQuote * 1.01 + 1);
      const baseChanged = !(Math.abs(claimed - base) <= base * 0.01 + 0.5);
      return { ...o, brandNewBase: base, priceCheck: quoteTooHigh || baseChanged
        ? { verified: false, quoteTooHigh, claimedBase: Number.isFinite(claimed) ? round2(claimed) : null, serverBase: round2(base), maxQuote: Math.round(maxQuote) }
        : { verified: true } };
    });
  }
  if (key === "purchase_orders") {
    const inventory = await loadSharedList("inventory");
    return records.map((o) => {
      const item = inventory.find((i) => i && i.id === o.itemId && i.status === "listed");
      if (!item || !Number.isFinite(Number(item.listedPrice))) return { ...o, priceCheck: { verified: false, reason: "item is not currently listed" } };
      return { ...o, brand: item.brand, model: item.model, storage: item.storage, gradeId: item.gradeId, price: Number(item.listedPrice),
        priceCheck: Number(o.price) === Number(item.listedPrice) ? { verified: true } : { verified: false, clientPrice: o.price } };
    });
  }
  if (key === "accessory_orders") {
    const catalogue = await loadSharedList("accessories");
    return records.map((o) => {
      let unknown = 0;
      const items = (Array.isArray(o.items) ? o.items : []).map((i) => {
        const a = catalogue.find((x) => x && i && x.id === i.id);
        const qty = Math.max(1, Math.floor(Number(i && i.qty) || 1));
        if (!a || !Number.isFinite(Number(a.sellPrice))) { unknown++; return { ...i, qty }; }
        return { ...i, name: a.name, category: a.category, price: Number(a.sellPrice), qty };
      });
      const subtotal = round2(items.reduce((n, i) => n + (Number(i.price) || 0) * i.qty, 0));
      const shipping = o.fulfilment === "delivery" && subtotal < ACCESSORY_FREE_SHIPPING_OVER ? ACCESSORY_SHIPPING_FLAT : 0;
      const total = round2(subtotal + shipping);
      const ok = !unknown && Math.abs(Number(o.total) - total) < 0.01;
      return { ...o, items, subtotal, shipping, total, priceCheck: ok ? { verified: true } : { verified: false, clientTotal: o.total, unknownItems: unknown } };
    });
  }
  return records;
}

// ---- Customer confirmations for anonymous submissions ----
// The site queues a confirmation after each public form. The server never
// emails text or addresses supplied by an anonymous browser: it looks up
// the record the confirmation is about, sends to the email ON that record,
// writes the wording itself, and sends at most one per record.
const clip = (v) => String(v ?? "").replace(/(https?:\/\/|www\.)\S*/gi, "").replace(/\b[\w-]+\.(com|net|org|au|io|co|xyz|info|link|app|me|ly|ru|top)\b\S*/gi, "").replace(/\s+/g, " ").trim().slice(0, 60);
function money(n, currency) {
  if (!Number.isFinite(Number(n))) return "";
  try { return new Intl.NumberFormat("en-AU", { style: "currency", currency: /^[A-Z]{3}$/.test(currency || "") ? currency : "AUD" }).format(Number(n)); } catch (e) { return `$${Number(n).toFixed(2)}`; }
}
const dateAU = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("en-AU"); };
const deviceName = (r) => clip(`${(r.device && r.device.brand) || ""} ${(r.device && r.device.model) || ""}`) || "device";
const CONFIRMATIONS = {
  order_confirmation: { key: "orders", email: (r) => r.customer && r.customer.email, name: (r) => r.customer && r.customer.name,
    subject: (r) => `Order ${clip(r.id)} received`,
    message: (r) => `Thanks for sending us your ${deviceName(r)} trade-in. We've received it (order ${clip(r.id)})${r.priceCheck && r.priceCheck.quoteTooHigh ? "" : ` with a quote of ${money(r.quotedTotal, r.currency)}`}, subject to inspecting the device.` },
  quote_lead: { key: "quote_leads", email: (r) => r.email, name: () => "",
    subject: (r) => `Your ${deviceName(r)} quote: ${money(r.quotedTotal, r.currency)}`,
    message: (r) => `We've held this price for you${dateAU(r.priceHeldUntil) ? ` until ${dateAU(r.priceHeldUntil)}` : ""}. Ready to sell? Come back anytime.` },
  bulk_quote_request: { key: "bulk_quote_requests", email: (r) => r.business && r.business.email, name: (r) => r.business && r.business.contactName,
    subject: (r) => `Bulk trade-in request ${clip(r.id)} received`,
    message: (r) => `We've received your request for ${Number(r.itemCount) || (Array.isArray(r.items) ? r.items.length : 0)} device(s), estimated at ${money(r.estimatedTotal, r.currency)} total. A team member will follow up within 1-2 business days with a firm offer.` },
  repair_request: { key: "repair_requests", email: (r) => r.email, name: (r) => r.name,
    subject: (r) => `Repair request ${clip(r.id)} received`,
    message: (r) => `We've received your repair request for your ${clip(r.deviceType).toLowerCase() || "device"}${clip(r.model) ? ` (${clip(r.model)})` : ""}. We'll reach out shortly to confirm details and turnaround.` },
  support_query: { key: "support_queries", email: (r) => r.email, name: (r) => r.name,
    subject: (r) => `We've received your question — ${clip(r.id)}`,
    message: () => "Thanks for reaching out. We've received your message and will get back to you shortly." },
  accessory_order: { key: "accessory_orders", email: (r) => r.customer && r.customer.email, name: (r) => r.customer && r.customer.name,
    subject: (r) => `Order ${clip(r.id)} received`,
    message: (r) => {
      const count = (Array.isArray(r.items) ? r.items : []).reduce((s, i) => s + (Number(i && i.qty) || 0), 0);
      return `Thanks for your order (${count} item${count === 1 ? "" : "s"}, ${money(r.total, "AUD")}). ${r.fulfilment === "collect" ? "We'll let you know when it's ready to collect — pay when you pick it up." : "We'll email you a secure payment link, then post it out."}`;
    } },
};
async function buildConfirmations(items, existingQueue) {
  const seen = new Set(existingQueue.map((q) => q && `${q.type}:${q.relatedId}`));
  const out = [];
  for (const item of items) {
    const spec = item && CONFIRMATIONS[item.type];
    if (!spec || !item.relatedId || seen.has(`${item.type}:${item.relatedId}`)) continue;
    seen.add(`${item.type}:${item.relatedId}`);
    const record = (await loadSharedList(spec.key)).find((r) => r && r.id === item.relatedId);
    const to = record && String(spec.email(record) || "").trim();
    if (!to) continue;
    out.push({ id: item.id, createdAt: new Date().toISOString(), status: "pending", type: item.type, channel: "email",
      recipientEmail: to, recipientName: spec.name(record) || "", subject: spec.subject(record), message: spec.message(record), relatedId: record.id });
  }
  return out;
}
// A referral names only the code it used; the server fills in who owns that
// code, so the public site never needs to look up another customer's order.
async function enrichReferrals(items) {
  const orders = await loadSharedList("orders");
  return items.map((ref) => {
    const code = String(ref.code || "").trim().toUpperCase();
    const referrer = code && orders.find((o) => o && String(o.referralCode || "").toUpperCase() === code);
    const referrerEmail = referrer && referrer.customer && referrer.customer.email;
    if (!referrerEmail || referrerEmail.toLowerCase() === String(ref.referredEmail || "").trim().toLowerCase()) return null;
    return { ...ref, code, referrerEmail, referrerName: referrer.customer.name || "", referrerPaid: false, referredPaid: false };
  }).filter(Boolean);
}

function scopeFor(shared, username) {
  if (shared === "true" || shared === true) return "shared";
  return `private:${username}`;
}

// ---- Anonymous-traffic throttling (spam / email-flood protection) ----
// Public forms can write without a login, and each new submission emails
// the owner. In-memory, per client IP, sliding window. Resets on restart,
// which is fine for abuse control (this is not a security boundary).
// Render serves this app through Cloudflare, so req.ip can be a shared proxy
// address (every visitor counted as one). Cloudflare overwrites CF-Connecting-IP
// with the real visitor on every request. True-Client-IP is NOT used: on
// non-Enterprise Cloudflare plans a visitor can set it to anything.
const clientKey = (req) => String(req.headers["cf-connecting-ip"] || req.ip || "unknown").trim();
function makeLimiter(max, windowMs) {
  const hits = new Map();
  const warnedAt = new Map();
  const timer = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, list] of hits) {
      const kept = list.filter((ts) => ts > cutoff);
      if (kept.length) hits.set(ip, kept); else hits.delete(ip);
    }
  }, windowMs);
  if (timer.unref) timer.unref();
  return function allow(req) {
    const ip = clientKey(req);
    const now = Date.now();
    const list = (hits.get(ip) || []).filter((ts) => ts > now - windowMs);
    if (list.length >= max) {
      hits.set(ip, list);
      if (now - (warnedAt.get(ip) || 0) > 60000) { warnedAt.set(ip, now); console.warn(`rate limit hit for ${ip} (max ${max} per ${Math.round(windowMs / 60000)} min)`); }
      return false;
    }
    list.push(now);
    hits.set(ip, list);
    return true;
  };
}
const PUBLIC_WRITE_MAX = parseInt(process.env.PUBLIC_WRITE_MAX || "20", 10);          // submissions per IP per 10 min
const publicWriteAllowed = makeLimiter(PUBLIC_WRITE_MAX, 10 * 60 * 1000);
const publicRespondAllowed = makeLimiter(30, 10 * 60 * 1000);
const publicFindAllowed = makeLimiter(60, 10 * 60 * 1000);       // a tracking search tries up to 4 fields
const publicIdPhotoAllowed = makeLimiter(10, 10 * 60 * 1000);
const PUBLIC_MAX_ITEMS_PER_SUBMISSION = 20;
const PUBLIC_MAX_VALUE_CHARS = 2_000_000;   // anonymous JSON payload cap (staff are not capped below the 10mb body limit)
const PUBLIC_MAX_OWNER_EMAILS_PER_REQUEST = 5;

const app = express();
// Render sits behind one proxy hop; without this req.ip is the proxy, not the visitor.
app.set("trust proxy", 1);
// Gate every request behind schema setup finishing — see the comment
// on schemaReady above for why this exists.
app.use(async (req, res, next) => {
  try { await schemaReady; next(); } catch (e) { res.status(503).json({ error: "database unavailable" }); }
});
// CORS_ORIGIN lets you lock this down to your real frontend domain at
// deploy time (a config change, not a code change) — set it once you
// know the domain. Left unset, this still works for local dev/testing
// but warns loudly, since "any origin, forever" is not a real deploy
// posture.
const CORS_ORIGIN = process.env.CORS_ORIGIN || "";
if (!CORS_ORIGIN) {
  console.warn("CORS_ORIGIN not set — accepting requests from ANY origin. Set this to your real frontend URL (e.g. https://yourshop.com) before going live.");
}
// CORS_ORIGIN may list several addresses separated by commas (e.g. the
// onrender.com address plus your own domain while switching over).
const CORS_ORIGINS = CORS_ORIGIN.split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
app.use(cors({ origin: CORS_ORIGINS.length ? CORS_ORIGINS : true }));
// gzip responses: a catalogue of thousands of products is ~8x smaller over the wire.
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use((req, res, next) => {
  // A few no-dependency security headers. HSTS is deliberately left to
  // your hosting platform, since it terminates TLS, not this app —
  // setting it here would be a lie about a guarantee this process
  // can't actually make.
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

// ---- Login rate limiting (brute-force protection) ----
// Every attempt (success or failure) is logged. Before checking a
// password, we count recent FAILURES for that username in the lockout
// window — if there are too many, the request is rejected before the
// password is even checked, so repeated guessing can't continue no
// matter how many different passwords are tried.
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MINUTES = 5;

async function recentFailedAttempts(username) {
  const result = await pool.query(
    `SELECT COUNT(*) AS n FROM login_attempts
     WHERE username = $1 AND success = 0 AND attempted_at > NOW() - (INTERVAL '1 minute' * $2)`,
    [username, LOGIN_LOCKOUT_MINUTES]
  );
  return parseInt(result.rows[0].n, 10);
}
async function recordLoginAttempt(username, success) {
  await pool.query("INSERT INTO login_attempts (username, attempted_at, success) VALUES ($1, NOW(), $2)", [username, success ? 1 : 0]);
}

// ---- Auth ----

// ADMIN_BOOTSTRAP_TOKEN closes the "first visitor wins" race: without
// it, whoever calls /auth/register first on a freshly deployed server
// becomes the permanent admin — which could be an attacker who found
// the URL before the shop owner ever visited it. If you set this
// environment variable, the very first registration must include it,
// so only someone who actually has your deployment's secret can claim
// the admin account. Left unset, bootstrap stays open (fine for local
// dev/testing) but the server warns loudly on startup.
const ADMIN_BOOTSTRAP_TOKEN = process.env.ADMIN_BOOTSTRAP_TOKEN || "";
if (!ADMIN_BOOTSTRAP_TOKEN) {
  console.warn("ADMIN_BOOTSTRAP_TOKEN not set — the FIRST person to call /auth/register on this server becomes admin, no proof required. Set this before deploying somewhere a stranger could reach the URL first.");
}

// First account ever created becomes an admin and can register with no
// staff token — but if ADMIN_BOOTSTRAP_TOKEN is set, it must be
// provided too, so a stranger can't win the race to claim admin.
// After the first account exists, registering new staff always
// requires being logged in as an admin.
app.post("/auth/register", async (req, res) => {
  try {
    const { password, role, bootstrapToken } = req.body;
    const username = String(req.body.username || "").trim();
    if (!username || !password || password.length < 8) {
      return res.status(400).json({ error: "username and an 8+ character password are required" });
    }
    const countResult = await pool.query("SELECT COUNT(*) AS n FROM users");
    const userCount = parseInt(countResult.rows[0].n, 10);
    if (userCount === 0) {
      if (ADMIN_BOOTSTRAP_TOKEN) {
        const a = Buffer.from(bootstrapToken || "");
        const b = Buffer.from(ADMIN_BOOTSTRAP_TOKEN);
        const matches = a.length === b.length && crypto.timingSafeEqual(a, b);
        if (!matches) return res.status(403).json({ error: "a valid bootstrap token is required to create the first (admin) account on this server" });
      }
    } else {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      const requester = await verifyToken(token);
      if (!requester || requester.role !== "admin") {
        return res.status(403).json({ error: "only an admin can register new accounts once the shop has any users" });
      }
    }
    if (await canonicalUsername(username)) return res.status(409).json({ error: "username already taken (usernames aren't case-sensitive)" });
    const finalRole = userCount === 0 ? "admin" : (role === "admin" ? "admin" : "staff");
    await createUser(username, password, finalRole);
    res.json({ username, role: finalRole, firstAccount: userCount === 0 });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username) return res.status(400).json({ error: "username is required" });

    const failedCount = await recentFailedAttempts(attemptKey(username));
    if (failedCount >= MAX_LOGIN_ATTEMPTS) {
      return res.status(429).json({ error: `too many failed attempts — try again in ${LOGIN_LOCKOUT_MINUTES} minutes` });
    }

    const user = await verifyPassword(username, password);
    await recordLoginAttempt(attemptKey(username), !!user);
    if (!user) return res.status(401).json({ error: "invalid username or password" });

    await pool.query("DELETE FROM sessions WHERE expires_at < NOW()"); // light housekeeping
    await pool.query("DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL '1 day'");
    const now = Date.now();
    const sessionId = crypto.randomUUID();
    const expiresAtIso = new Date(now + TOKEN_TTL_MS).toISOString();
    await pool.query("INSERT INTO sessions (session_id, username, created_at, expires_at) VALUES ($1, $2, NOW(), $3)", [sessionId, user.username, expiresAtIso]);
    const token = signToken({ username: user.username, role: user.role, sid: sessionId, iat: now, exp: now + TOKEN_TTL_MS });
    res.json({ token, username: user.username, role: user.role, expiresAt: now + TOKEN_TTL_MS });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/auth/logout", requireAuth, async (req, res) => {
  await pool.query("UPDATE sessions SET revoked_at = NOW() WHERE session_id = $1", [req.user.sid]);
  res.json({ loggedOut: true });
});

// Revoke every session for the CURRENT user — "log me out everywhere"
// after e.g. a lost device.
app.post("/auth/logout-everywhere", requireAuth, async (req, res) => {
  const result = await pool.query("UPDATE sessions SET revoked_at = NOW() WHERE username = $1 AND revoked_at IS NULL", [req.user.username]);
  res.json({ sessionsRevoked: result.rowCount });
});

// Admin-only: kill every session for a specific staff member — e.g. an
// employee who's left, or a compromised account. They'll need to log
// in again with their password; this alone doesn't lock them out
// permanently (see /auth/deactivate-user for that).
app.post("/auth/revoke-user/:username", requireAuth, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "admin only" });
  const result = await pool.query("UPDATE sessions SET revoked_at = NOW() WHERE username = $1 AND revoked_at IS NULL", [req.params.username]);
  res.json({ username: req.params.username, sessionsRevoked: result.rowCount });
});

// ---- Product photos ----
// Staff upload a photo (already resized in the browser); it's stored in the
// database and served publicly with long caching. Only images, max 1.5 MB.
const IMAGE_TYPES = { "image/jpeg": true, "image/png": true, "image/webp": true };
app.post("/product-images", requireAuth, async (req, res) => {
  try {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(req.body.dataUrl || "");
    if (!m || !IMAGE_TYPES[m[1]]) return res.status(400).json({ error: "send a JPEG, PNG or WebP image" });
    const bytes = Buffer.from(m[2], "base64");
    if (bytes.length > 1.5 * 1024 * 1024) return res.status(413).json({ error: "image too large (max 1.5 MB)" });
    const id = crypto.randomBytes(12).toString("hex");
    await pool.query("INSERT INTO product_images (id, mime, data, created_by) VALUES ($1, $2, $3, $4)", [id, m[1], bytes, req.user.username]);
    const proto = (req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0];
    res.json({ id, url: `${proto}://${req.get("host")}/public/product-images/${id}` });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get("/public/product-images/:id", async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/.test(req.params.id)) return res.status(404).end();
    const r = await pool.query("SELECT mime, data FROM product_images WHERE id = $1", [req.params.id]);
    if (!r.rows[0]) return res.status(404).end();
    res.set("Content-Type", r.rows[0].mime);
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
    res.send(r.rows[0].data);
  } catch (e) { res.status(500).end(); }
});

// ---- Admin password recovery (one-time, owner-controlled) ----
// For when the only admin forgets their password. Works ONLY while the host
// has ADMIN_RECOVERY_CODE (24+ chars) set and ADMIN_RECOVERY_EXPIRES is in the
// future; each code works once; only admin accounts can be recovered; failed
// tries are rate-limited like logins; success ends the account's old sessions
// and clears any login lockout.
const hashCode = (c) => crypto.createHash("sha256").update(String(c || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex");
// Personal backup code: each staff member can create one from the Team page,
// save it somewhere safe, and use it to reset a forgotten password at any
// time. It works once; then they make a new one.
app.get("/auth/recovery-code", requireAuth, async (req, res) => {
  const r = await pool.query("SELECT recovery_created_at FROM users WHERE username = $1", [req.user.username]);
  res.json({ hasCode: !!(r.rows[0] && r.rows[0].recovery_created_at), createdAt: r.rows[0] ? r.rows[0].recovery_created_at : null });
});
app.post("/auth/recovery-code", requireAuth, async (req, res) => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I lookalikes
  const bytes = crypto.randomBytes(16);
  const raw = Array.from(bytes, (x) => alphabet[x % alphabet.length]).join("");
  const code = raw.match(/.{4}/g).join("-");
  await pool.query("UPDATE users SET recovery_hash = $1, recovery_created_at = NOW() WHERE username = $2", [hashCode(code), req.user.username]);
  res.json({ code });
});
// Forgotten password. Accepts the account's personal backup code, or (for
// admins) the owner's server recovery code if one is set on the host.
// Usernames are case-insensitive; failed tries lock for 5 minutes.
async function recoverHandler(req, res) {
  try {
    const { code, newPassword } = req.body || {};
    if (!req.body || !req.body.username || !code) return res.status(400).json({ error: "username and recovery code are required" });
    const key = `recover:${attemptKey(req.body.username)}`;
    if (await recentFailedAttempts(key) >= MAX_LOGIN_ATTEMPTS) return res.status(429).json({ error: `too many attempts — try again in ${LOGIN_LOCKOUT_MINUTES} minutes` });
    if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: "new password must be 8+ characters" });
    const username = await canonicalUsername(req.body.username);
    const wrong = async () => { await recordLoginAttempt(key, false); return res.status(401).json({ error: "that username and recovery code don't match" }); };
    if (!username) return wrong();
    const u = (await pool.query("SELECT role, recovery_hash FROM users WHERE username = $1", [username])).rows[0];
    let via = null;
    if (u.recovery_hash) {
      const a = Buffer.from(hashCode(code), "hex"), b = Buffer.from(u.recovery_hash, "hex");
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) via = "personal";
    }
    const serverCode = process.env.ADMIN_RECOVERY_CODE || "";
    const exp = Date.parse(process.env.ADMIN_RECOVERY_EXPIRES || "");
    if (!via && u.role === "admin" && serverCode.length >= 24 && !(exp <= Date.now())) {
      const a = Buffer.from(String(code).trim()), b = Buffer.from(serverCode);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        const h = crypto.createHash("sha256").update(serverCode).digest("hex");
        if ((await pool.query("SELECT 1 FROM recovery_uses WHERE code_hash = $1", [h])).rows[0]) return res.status(410).json({ error: "that recovery code has already been used" });
        await pool.query("INSERT INTO recovery_uses (code_hash, username) VALUES ($1, $2)", [h, username]);
        via = "server";
      }
    }
    if (!via) return wrong();
    const salt = crypto.randomBytes(16).toString("hex");
    await pool.query("UPDATE users SET salt = $1, hash = $2" + (via === "personal" ? ", recovery_hash = NULL, recovery_created_at = NULL" : "") + " WHERE username = $3", [salt, hashPassword(newPassword, salt), username]);
    await pool.query("UPDATE sessions SET revoked_at = NOW() WHERE username = $1 AND revoked_at IS NULL", [username]);
    await pool.query("DELETE FROM login_attempts WHERE username = $1 OR username = $2", [attemptKey(username), key]);
    res.json({ recovered: username, usedBackupCode: via === "personal" });
  } catch (e) { res.status(400).json({ error: e.message }); }
}
app.post("/auth/recover", recoverHandler);
app.post("/auth/recover-admin", recoverHandler);


// ---- Team management (admin only) ----
app.get("/auth/users", requireAuth, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "admin only" });
  const r = await pool.query("SELECT username, role, created_at FROM users ORDER BY created_at");
  res.json({ users: r.rows });
});
// Remove a team member: deletes the account and ends all their sessions.
// Safety: you can't remove yourself, and the last admin can never be removed
// (that would lock the shop out of its own console).
app.delete("/auth/users/:username", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "admin only" });
    const target = await canonicalUsername(req.params.username);
    if (!target) return res.status(404).json({ error: "no such user" });
    if (target.toLowerCase() === req.user.username.toLowerCase()) return res.status(400).json({ error: "you can't remove your own account" });
    const t = await pool.query("SELECT role FROM users WHERE username = $1", [target]);
    if (!t.rows[0]) return res.status(404).json({ error: "no such user" });
    if (t.rows[0].role === "admin") {
      const admins = await pool.query("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'");
      if (parseInt(admins.rows[0].n, 10) <= 1) return res.status(400).json({ error: "can't remove the last admin" });
    }
    await pool.query("UPDATE sessions SET revoked_at = NOW() WHERE username = $1 AND revoked_at IS NULL", [target]);
    await pool.query("DELETE FROM users WHERE username = $1", [target]);
    res.json({ removed: target });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// Admin sets a new password for someone who forgot theirs; their old sessions end.
app.post("/auth/users/:username/password", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "admin only" });
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: "new password must be 8+ characters" });
    const target = await canonicalUsername(req.params.username);
    if (!target) return res.status(404).json({ error: "no such user" });
    const salt = crypto.randomBytes(16).toString("hex");
    await pool.query("UPDATE users SET salt = $1, hash = $2 WHERE username = $3", [salt, hashPassword(newPassword, salt), target]);
    await pool.query("UPDATE sessions SET revoked_at = NOW() WHERE username = $1 AND revoked_at IS NULL", [target]);
    res.json({ username: target, passwordReset: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// A staff member changes their own password (needs to know the current one).
app.post("/auth/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: "new password must be 8+ characters" });
    const verified = await verifyPassword(req.user.username, currentPassword);
    if (!verified) return res.status(401).json({ error: "current password is incorrect" });
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = hashPassword(newPassword, salt);
    await pool.query("UPDATE users SET salt = $1, hash = $2 WHERE username = $3", [salt, hash, req.user.username]);
    // Changing your password revokes every other session — if someone
    // else had your old password, this locks them out immediately.
    await pool.query("UPDATE sessions SET revoked_at = NOW() WHERE username = $1 AND session_id != $2", [req.user.username, req.user.sid]);
    res.json({ changed: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Admin resets a staff member's password directly — realistic for a
// small shop (they ask the owner in person) rather than an email-link
// flow this environment has no way to actually send.
app.post("/auth/reset-password", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "admin only" });
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: "new password must be 8+ characters" });
    const canon = await canonicalUsername(req.body.username);
    if (!canon) return res.status(404).json({ error: "no such user" });
    const username = canon;
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = hashPassword(newPassword, salt);
    await pool.query("UPDATE users SET salt = $1, hash = $2 WHERE username = $3", [salt, hash, username]);
    await pool.query("UPDATE sessions SET revoked_at = NOW() WHERE username = $1 AND revoked_at IS NULL", [username]);
    res.json({ username, reset: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/auth/me", requireAuth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

// ---- Storage ----
// Staff (a real login) can always read/write their own private scope and
// the shared scope, exactly as before. Anonymous customers get a much
// narrower slice: read-only on the public catalog, append-only (never
// bulk-read) on the collections they submit to.

app.get("/storage/:key", tryAuth, async (req, res) => {
  try {
    if (!req.user) {
      if (!PUBLIC_READ_KEYS.includes(req.params.key) || (req.query.shared !== "true" && req.query.shared !== true)) {
        return res.status(401).json({ error: "unauthorized" });
      }
      const result = await pool.query("SELECT value FROM storage WHERE scope = 'shared' AND key = $1", [req.params.key]);
      const row = result.rows[0];
      if (!row) return res.status(404).json({ error: "not_found" });
      return res.json({ key: req.params.key, value: row.value, shared: true });
    }
    const scope = scopeFor(req.query.shared, req.user.username);
    const result = await pool.query("SELECT value FROM storage WHERE scope = $1 AND key = $2", [scope, req.params.key]);
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: "not_found" });
    res.json({ key: req.params.key, value: row.value, shared: scope === "shared" });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---- Safe concurrent saves ----
// Every write to a list runs inside a transaction holding a per-list lock, so
// two saves can never read-modify-write over each other. Without this, 100
// customers ordering at once while staff updated one order lost ALL 100.
async function withListLock(scope, key, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [scope + ":" + key]);
    const r = await client.query("SELECT value FROM storage WHERE scope = $1 AND key = $2", [scope, key]);
    const write = (value, by) => client.query(
      `INSERT INTO storage (scope, key, value, updated_at, updated_by) VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (scope, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      [scope, key, value, by]);
    const out = await fn(r.rows[0] ? r.rows[0].value : null, write);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
// Lists where staff genuinely delete records by saving a shorter list.
// Every other shared list is merged, so a stale staff copy can't erase
// records (customer orders, another till's sales) that arrived meanwhile.
const DELETE_BY_OMISSION_KEYS = ["expenses"];
function mergeKeepingNewer(incomingJson, existingJson) {
  let incoming, existing;
  try { incoming = JSON.parse(incomingJson); existing = existingJson ? JSON.parse(existingJson) : null; } catch (e) { return incomingJson; }
  if (!Array.isArray(incoming) || !Array.isArray(existing)) return incomingJson;
  if (!incoming.every((r) => r && typeof r === "object" && r.id) || !existing.every((r) => r && typeof r === "object" && r.id)) return incomingJson;
  const have = new Set(incoming.map((r) => r.id));
  const missing = existing.filter((r) => !have.has(r.id));
  return missing.length ? JSON.stringify([...missing, ...incoming]) : incomingJson;
}

// A customer's accept/decline (via /public/orders/:id/respond) must survive a
// staff save made from a copy loaded before they answered. A deliberate
// re-inspection after their answer (a newer inspectedAt) still wins.
function keepCustomerDecisions(finalJson, existingJson) {
  try {
    const list = JSON.parse(finalJson), old = existingJson ? JSON.parse(existingJson) : [];
    if (!Array.isArray(list) || !Array.isArray(old)) return finalJson;
    const answered = new Map(old.filter((o) => o && o.inspection && o.inspection.customerRespondedAt).map((o) => [o.id, o]));
    let changed = false;
    const out = list.map((o) => {
      const prev = o && answered.get(o.id);
      if (!prev || (o.inspection && o.inspection.customerRespondedAt)) return o;
      const at = Date.parse(prev.inspection.customerRespondedAt);
      if (o.inspection && Date.parse(o.inspection.inspectedAt) > at) return o;
      changed = true;
      return { ...o, status: prev.status, inspection: { ...(o.inspection || {}), customerRespondedAt: prev.inspection.customerRespondedAt, customerDecision: prev.inspection.customerDecision } };
    });
    return changed ? JSON.stringify(out) : finalJson;
  } catch (e) { return finalJson; }
}

// When the browser says which records it actually changed since it last
// loaded this list, every other record keeps the server's current version.
// A staff screen left open can then only overwrite what that person edited.
// Returns null when the lists aren't id'd records (caller falls back).
function mergeOnlyChanged(incomingJson, existingJson, changedIds) {
  let incoming, existing;
  try { incoming = JSON.parse(incomingJson); existing = existingJson ? JSON.parse(existingJson) : []; } catch (e) { return null; }
  if (!Array.isArray(incoming) || !Array.isArray(existing)) return null;
  const isRecord = (r) => r && typeof r === "object" && r.id != null;
  if (!incoming.every(isRecord) || !existing.every(isRecord)) return null;
  const changed = new Set(changedIds.map(String));
  const current = new Map(existing.map((r) => [String(r.id), r]));
  const have = new Set(incoming.map((r) => String(r.id)));
  const out = incoming.map((r) => (!changed.has(String(r.id)) && current.has(String(r.id)) ? current.get(String(r.id)) : r));
  const missing = existing.filter((r) => !have.has(String(r.id)));
  return JSON.stringify([...missing, ...out]);
}

app.put("/storage/:key", tryAuth, async (req, res) => {
  try {
    const { value, shared, changedIds } = req.body;
    if (typeof value !== "string") return res.status(400).json({ error: "value must be a string (JSON.stringify it client-side)" });

    if (!req.user) {
      if (!PUBLIC_WRITE_KEYS.includes(req.params.key) || (shared !== true && shared !== "true")) {
        return res.status(401).json({ error: "unauthorized" });
      }
      if (!publicWriteAllowed(req)) return res.status(429).json({ error: "too many submissions from this connection, please try again in a few minutes" });
      if (value.length > PUBLIC_MAX_VALUE_CHARS) return res.status(413).json({ error: "submission too large" });
      let incoming;
      try { incoming = JSON.parse(value); } catch (e) { return res.status(400).json({ error: "expected a JSON array for a public submission" }); }
      if (!Array.isArray(incoming)) return res.status(400).json({ error: "expected a JSON array" });
      if (incoming.length > PUBLIC_MAX_ITEMS_PER_SUBMISSION) return res.status(413).json({ error: "too many items in one submission" });
      // Merge by id rather than trusting the anonymous client's array —
      // their local view of "existing records" is always empty (they
      // can't read this key back), so this only ever adds their genuinely
      // new submission(s), never overwrites or exposes anyone else's data.
      const key = req.params.key;
      const result = await withListLock("shared", key, async (existingValue, write) => {
        const existing = existingValue ? JSON.parse(existingValue) : [];
        const byId = new Map(existing.map((r) => [r && r.id, r]));
        // Same id, different content = two customers drew the same random id.
        // Refuse rather than silently dropping the second customer's submission.
        // (A retry of an already-saved submission is identical and just succeeds.)
        const sameSubmission = (a, b) => JSON.stringify([a.createdAt, a.customer, a.email, a.business]) === JSON.stringify([b.createdAt, b.customer, b.email, b.business]);
        if (key !== "notification_queue" && key !== "referrals" &&
            incoming.some((r) => r && r.id && byId.has(r.id) && !sameSubmission(byId.get(r.id), r))) return { conflict: true };
        let fresh = incoming.filter((r) => r && r.id && !byId.has(r.id));
        fresh = await enforcePrices(key, fresh);
        if (key === "notification_queue") fresh = await buildConfirmations(fresh, existing);
        if (key === "referrals") fresh = await enrichReferrals(fresh);
        if (fresh.length) await write(JSON.stringify([...fresh, ...existing]), "public");
        return { fresh };
      });
      if (result.conflict) return res.status(409).json({ error: "id_conflict", detail: "that reference number is already in use, please submit again" });
      const newOnes = result.fresh;
      notifyNew(key, newOnes, PUBLIC_MAX_OWNER_EMAILS_PER_REQUEST);
      // Never return the merged collection to an anonymous caller — only confirm what THEY submitted.
      return res.json({ key: req.params.key, submitted: newOnes.length });
    }

    const scope = scopeFor(shared, req.user.username);
    let staffQueued = [];
    const saved = await withListLock(scope, req.params.key, async (existingValue, write) => {
      let finalValue = value;
      if (scope === "shared" && !DELETE_BY_OMISSION_KEYS.includes(req.params.key)) {
        finalValue = (Array.isArray(changedIds) && mergeOnlyChanged(value, existingValue, changedIds)) || mergeKeepingNewer(value, existingValue);
      }
      if (scope === "shared" && req.params.key === "orders") finalValue = keepCustomerDecisions(finalValue, existingValue);
      if (scope === "shared" && req.params.key === "notification_queue") {   // staff-sent customer updates (e.g. "repair ready")
        try { const had = new Set((existingValue ? JSON.parse(existingValue) : []).map((r) => r && r.id)); staffQueued = JSON.parse(finalValue).filter((r) => r && r.id && !had.has(r.id)); } catch (e) { staffQueued = []; }
      }
      await write(finalValue, req.user.username);
      return finalValue;
    });
    if (staffQueued.length) notifyNew("notification_queue", staffQueued);
    res.json({ key: req.params.key, value: saved, shared: scope === "shared" });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/storage/:key", requireAuth, async (req, res) => {
  try {
    const scope = scopeFor(req.query.shared, req.user.username);
    // Deleting a shared key wipes a whole collection (every order, every sale).
    if (scope === "shared" && req.user.role !== "admin") return res.status(403).json({ error: "admin only" });
    await pool.query("DELETE FROM storage WHERE scope = $1 AND key = $2", [scope, req.params.key]);
    res.json({ key: req.params.key, deleted: true, shared: scope === "shared" });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/storage", requireAuth, async (req, res) => {
  try {
    const scope = scopeFor(req.query.shared, req.user.username);
    const prefix = req.query.prefix || "";
    const result = await pool.query("SELECT key FROM storage WHERE scope = $1 AND key LIKE $2", [scope, `${prefix}%`]);
    res.json({ keys: result.rows.map((r) => r.key), prefix, shared: scope === "shared" });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// A customer needs to look up their OWN submission later (an order,
// a price-match request) without ever being able to browse everyone
// else's. This searches server-side and returns at most the ONE
// matching record — never the collection it came from.
app.get("/public/find/:key", async (req, res) => {
  try {
    if (!PUBLIC_FIND_KEYS.includes(req.params.key)) return res.status(401).json({ error: "unauthorized" });
    if (!publicFindAllowed(req)) return res.status(429).json({ error: "too many lookups, please try again in a few minutes" });
    const { field, value } = req.query;
    if (!field || !value) return res.status(400).json({ error: "field and value query params are required" });
    if (!PUBLIC_LOOKUP_FIELDS.includes(field)) return res.status(400).json({ error: "search by reference number or email" });
    const result = await pool.query("SELECT value FROM storage WHERE scope = 'shared' AND key = $1", [req.params.key]);
    const row = result.rows[0];
    const list = row ? JSON.parse(row.value) : [];
    const match = list.find((r) => {
      const v = field.split(".").reduce((o, k) => (o ? o[k] : undefined), r); // supports "customer.email"-style nested lookup
      return typeof v === "string" && typeof value === "string" && v.toLowerCase() === value.toLowerCase();
    });
    if (!match) return res.status(404).json({ error: "not_found" });
    res.json({ record: publicView(match) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// A customer responding to a revised trade-in offer, without needing a
// staff login. Deliberately narrow: this can ONLY move an order that is
// ALREADY sitting in "revised_pending_customer" — it can't be used to
// touch any other order state, and it requires the caller to know the
// order's email (the same lightweight proof-of-ownership already used
// by /public/find), so a guessed order ID alone isn't enough to act on
// someone else's order.
app.post("/public/orders/:orderId/respond", async (req, res) => {
  if (!publicRespondAllowed(req)) return res.status(429).json({ error: "too many requests, please try again later" });
  try {
    const { email, decision } = req.body;
    if (!email || (decision !== "accept" && decision !== "decline")) {
      return res.status(400).json({ error: "email and decision ('accept' or 'decline') are required" });
    }
    const out = await withListLock("shared", "orders", async (existingValue, write) => {
      const list = existingValue ? JSON.parse(existingValue) : [];
      const idx = list.findIndex((o) => o.id === req.params.orderId);
      if (idx === -1) return { status: 404, body: { error: "not_found" } };
      const order = list[idx];
      if ((order.customer?.email || "").toLowerCase() !== email.toLowerCase()) return { status: 403, body: { error: "email does not match this order" } };
      if (order.status !== "revised_pending_customer") return { status: 409, body: { error: "this order isn't currently awaiting a response" } };
      const updated = {
        ...order,
        status: decision === "accept" ? "approved_paid" : "returned",
        inspection: { ...order.inspection, customerRespondedAt: new Date().toISOString(), customerDecision: decision },
      };
      list[idx] = updated;
      await write(JSON.stringify(list), "public");
      // Only confirm the outcome of THEIR action — never the list.
      return { status: 200, body: { id: updated.id, status: updated.status } };
    });
    res.status(out.status).json(out.body);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---- ID photos (encrypted at rest, retention-enforced) ----
// subjectKey is a free-form string the caller chooses to find the photo
// again later — e.g. "order:ORD-483920" or "instore:INV-778001".

app.post("/id-photos", tryAuth, async (req, res) => {
  if (!ID_PHOTO_KEY) return res.status(503).json({ error: "id_photo_storage_disabled", detail: "ID_PHOTO_ENCRYPTION_KEY is not configured on this server" });
  try {
    const { subjectKey, imageBase64 } = req.body;
    if (!subjectKey || !imageBase64) return res.status(400).json({ error: "subjectKey and imageBase64 are required" });
    if (imageBase64.length > 8_000_000) return res.status(413).json({ error: "image too large" });
    if (!req.user) {
      // A customer may attach ID to their own new trade-in order, once.
      // They can't add or replace a photo on anyone else's record.
      if (!publicIdPhotoAllowed(req)) return res.status(429).json({ error: "too many uploads, please try again later" });
      const m = /^order:([A-Za-z0-9-]{1,40})$/.exec(String(subjectKey));
      if (!m || !(await loadSharedList("orders")).some((o) => o && o.id === m[1])) return res.status(403).json({ error: "unknown order" });
      if ((await pool.query("SELECT 1 FROM id_photos WHERE subject_key = $1 LIMIT 1", [subjectKey])).rows[0]) return res.status(409).json({ error: "an ID photo is already on file for this order" });
    }
    await purgeExpiredIdPhotos();
    const { ciphertext, iv, authTag } = await encryptIdPhoto(imageBase64);
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + ID_PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    // A customer uploads their OWN ID during checkout — this has to work
    // with no staff login. Nothing about this endpoint lets the caller
    // read anything back (retrieval below stays staff-only), so an
    // anonymous upload can't expose anyone's data, only add to it.
    await pool.query(
      `INSERT INTO id_photos (id, subject_key, ciphertext, iv, auth_tag, uploaded_by, uploaded_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)`,
      [id, subjectKey, ciphertext, iv, authTag, req.user ? req.user.username : "public", expiresAt]
    );
    res.json({ id, subjectKey, expiresAt });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/id-photos/:subjectKey", requireAuth, async (req, res) => {
  if (!ID_PHOTO_KEY) return res.status(503).json({ error: "id_photo_storage_disabled" });
  try {
    await purgeExpiredIdPhotos();
    const result = await pool.query("SELECT * FROM id_photos WHERE subject_key = $1 ORDER BY uploaded_at DESC LIMIT 1", [req.params.subjectKey]);
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: "not_found" });
    const imageBase64 = decryptIdPhoto(row);
    res.json({ subjectKey: row.subject_key, imageBase64, uploadedBy: row.uploaded_by, uploadedAt: row.uploaded_at, expiresAt: row.expires_at });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/id-photos/:subjectKey", requireAuth, async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM id_photos WHERE subject_key = $1", [req.params.subjectKey]);
    res.json({ subjectKey: req.params.subjectKey, deleted: result.rowCount });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Admin-triggerable purge, for hosts without their own cron — point an
// external scheduled ping (e.g. a free uptime-monitor service) at this
// if you want enforcement more frequent than "on server restart."
app.post("/id-photos/purge-expired", requireAuth, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "admin only" });
  const deleted = await purgeExpiredIdPhotos();
  res.json({ deleted });
});

app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 8787;
if (require.main === module) {
  schemaReady.then(() => purgeExpiredIdPhotos()).catch(() => {}); // enforce retention on every real server start
  const server = app.listen(PORT, () => console.log(`Shop backend listening on :${PORT} (postgres)`));
  process.on("SIGTERM", () => { pool.end(); server.close(() => process.exit(0)); });
}
module.exports = app;
module.exports.__db = pool; // exposed for tests/graceful shutdown, not part of the HTTP API
module.exports.__schemaReady = schemaReady; // tests can await this before making requests
pool.close = () => pool.end(); // backward-compat alias — existing test cleanup calls .close()

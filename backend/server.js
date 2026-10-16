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
const sec = require("./security.js");
const activity = require("./activity.js");

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
if (SESSION_SECRET.startsWith("dev-only") && (process.env.NODE_ENV === "production" || process.env.RENDER)) {
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
  CREATE TABLE IF NOT EXISTS barcode_cache (
    code TEXT PRIMARY KEY,
    found BOOLEAN NOT NULL,
    title TEXT,
    brand TEXT,
    category TEXT,
    image TEXT,
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
  ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS access JSONB;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled_at TIMESTAMPTZ;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_step BIGINT;
  ALTER TABLE sessions ADD COLUMN IF NOT EXISTS weak_password BOOLEAN NOT NULL DEFAULT FALSE;
  CREATE TABLE IF NOT EXISTS login_log (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip TEXT,
    device TEXT,
    result TEXT NOT NULL,
    new_device BOOLEAN NOT NULL DEFAULT FALSE
  );
  CREATE INDEX IF NOT EXISTS idx_login_log_at ON login_log(at);
  CREATE TABLE IF NOT EXISTS activity_log (
    id BIGSERIAL PRIMARY KEY,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    username TEXT NOT NULL,
    role TEXT,
    area TEXT NOT NULL,
    record_id TEXT,
    action TEXT NOT NULL,
    summary TEXT,
    changes JSONB,
    important TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_activity_at ON activity_log(at);
  CREATE TABLE IF NOT EXISTS known_devices (
    username TEXT NOT NULL,
    device_hash TEXT NOT NULL,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (username, device_hash)
  );
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
// Same hash without blocking the server: a burst of logins must not freeze every other request.
const scryptAsync = require("util").promisify(crypto.scrypt);
async function hashPasswordAsync(password, salt) {
  return (await scryptAsync(String(password), salt, 64)).toString("hex");
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
  const candidate = await hashPasswordAsync(password, row ? row.salt : DUMMY_SALT_FOR_TIMING);
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
  const result = await pool.query("SELECT s.revoked_at, s.weak_password, s.username, u.role, u.totp_enabled_at, u.access FROM sessions s LEFT JOIN users u ON u.username = s.username WHERE s.session_id = $1", [payload.sid]);
  const session = result.rows[0];
  if (!session || session.revoked_at) return null;
  // The token must belong to this session's user, and the role always comes
  // from the users table, never from the token itself.
  if (!session.role || session.username !== payload.username) return null;
  payload = { ...payload, role: session.role };
  // Things this person must finish before the portal opens: a password that
  // meets the current rules, and two-step sign-in for roles that need it.
  const limits = [];
  if (session.weak_password) limits.push("password");
  if (twoStepRequired(payload.role) && !session.totp_enabled_at) limits.push("two-step");
  return { ...payload, limits, areas: areasFor(payload.role, session.access) }; // + limits, areas
}
// While a sign-in still has setup to finish, only these calls work.
const SETUP_PATHS = new Set(["/auth/me", "/auth/logout", "/auth/change-password", "/auth/2fa", "/auth/2fa/setup", "/auth/2fa/enable"]);
const setupBlocked = (req, user) => user && user.limits.length && !SETUP_PATHS.has(req.path);
const SETUP_ERROR = { error: "finish securing your account first (new password or two-step sign-in)", code: "SETUP_REQUIRED" };
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const user = await verifyToken(token);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  if (setupBlocked(req, user)) return res.status(403).json(SETUP_ERROR);
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
  if (setupBlocked(req, req.user)) return res.status(403).json(SETUP_ERROR);
  next();
}

// Customers need to browse stock and get quotes without a staff login —
// these two are genuinely public catalog data, not anyone's private info.
const PUBLIC_READ_KEYS = ["inventory", "pricing-config", "accessories"];
// What a visitor without a login may see of those. Stock records also hold the
// IMEI, what we paid, and the seller's name and ID type; none of that is for
// the public. Only phones actually listed for sale, and only shop-window fields.
const PUBLIC_INVENTORY_FIELDS = ["id", "brand", "model", "storage", "category", "colour", "color", "gradeId", "listedPrice", "currency", "region", "status", "photoUrl", "spinUrls", "listedAt", "priceHistory"];
const PRIVATE_ACCESSORY_FIELDS = ["cost", "costPrice", "supplier", "supplierSku", "supplierNote"];
function publicCatalogView(key, value) {
  if (key !== "inventory" && key !== "accessories") return value;
  let list;
  try { list = JSON.parse(value); } catch (e) { return value; }
  if (!Array.isArray(list)) return value;
  if (key === "inventory") {
    list = list.filter((i) => i && i.status === "listed").map((i) => {
      const out = {};
      for (const k of PUBLIC_INVENTORY_FIELDS) if (i[k] !== undefined) out[k] = i[k];
      if (out.spinUrls !== undefined) out.spinUrls = Array.isArray(out.spinUrls) ? out.spinUrls.filter((u) => typeof u === "string" && /^(https?:\/\/|data:image\/)/.test(u)).slice(0, 36) : undefined;
      if (Array.isArray(out.priceHistory)) out.priceHistory = out.priceHistory.map((p) => ({ price: p && p.price, from: p && p.from }));
      return out;
    });
  } else {
    list = list.map((a) => {
      if (!a || typeof a !== "object") return a;
      const out = { ...a };
      for (const k of PRIVATE_ACCESSORY_FIELDS) delete out[k];
      return out;
    });
  }
  return JSON.stringify(list);
}
// Customers need to SUBMIT to these (a trade-in order, a purchase, a
// price-match request, a bulk quote, a lead, a referral) without a staff
// login — but they must never be able to READ them back in bulk, since
// these collections hold every other customer's name, email, and ID
// reference. Anonymous writes here are handled as a safe server-side
// merge-by-id (see the PUT handler) — an anonymous client's local view
// of "existing records" is always empty, so this only ever adds their
// own new submission, never overwrites anyone else's data.
const PUBLIC_WRITE_KEYS = ["orders", "purchase_orders", "price_match_requests", "bulk_quote_requests", "quote_leads", "referrals", "notification_queue", "support_queries", "repair_requests", "accessory_orders", "device_requests"];

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
     <td style="vertical-align:middle;padding-left:8px;font-family:${E.font};font-size:22px;font-weight:400;letter-spacing:-.2px;color:${E.navy};">Mobile <span style="font-weight:800;color:${E.blue};">Recellr</span></td>
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
  quote_leads: "New sell quote", referrals: "New referral", support_queries: "New customer message", repair_requests: "New repair request", accessory_orders: "New accessories order", device_requests: "Customer wants a price for a device we don't list" };
const FIELD_LABEL = { id: "Reference", createdAt: "Received", priceLockExpires: "Price held until", quotedTotal: "Quoted total", total: "Total", tierLabel: "Condition",
  hasAccessories: "Accessories included", idType: "ID type", idOwnerName: "Name on ID", payoutMethod: "Payout method", bankBsb: "BSB", bankAccountNumber: "Account number",
  bankAccountName: "Account name", paypalEmail: "PayPal email", fulfillment: "Fulfilment", faultLabels: "Faults reported", release: "Released", name: "Name", email: "Email", phone: "Phone" };
const FIELD_HIDE = new Set(["tierId", "brandNewBase", "category", "region", "currency", "status", "notifiedAt"]);
// Bank, payout-account and ID details stay in the portal; email is not a safe place for them.
const SENSITIVE_KEY = /bank|bsb|accountnumber|paypal|idtype|idowner|idnumber|licen[cs]e|passport|birth|dob|password|token/i;
const FIELD_MASK = new Set(["bankAccountNumber", "idNumber", "licenceNumber", "licenseNumber", "passportNumber"]);
const MONEY_KEYS = new Set(["quotedTotal", "total", "rewardAmount", "subtotal", "amount", "price", "deposit", "travelFee"]);
const VALUE_MAP = { instore: "In store", mailin: "Mail-in", doorstep: "At the customer's door", dropoff: "Drop-off in store", post: "Post / mail-in", pickup: "Pickup", delivery: "Delivery", collect: "Collect in store", cash: "Cash", bank: "Bank transfer",
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
// Emails triggered by website visitors are rationed, so a flood of fake
// submissions can't email strangers over and over or use up the sending
// quota (which would also stop real confirmations and security alerts).
const EMAIL_LIMITS = { ownerPerHour: 60, customerPerHour: 120, perRecipientPerDay: 5 };
const emailBudget = { hour: 0, owner: 0, customer: 0, pausedNoticeSent: false, recipients: new Map() };
function allowPublicEmail(kind, to) {
  const now = Date.now(), hour = Math.floor(now / 3600e3);
  if (hour !== emailBudget.hour) {
    Object.assign(emailBudget, { hour, owner: 0, customer: 0, pausedNoticeSent: false });
    for (const [addr, times] of emailBudget.recipients) { const recent = times.filter((t) => now - t < 864e5); if (recent.length) emailBudget.recipients.set(addr, recent); else emailBudget.recipients.delete(addr); }
  }
  if (kind === "owner") {
    if (emailBudget.owner >= EMAIL_LIMITS.ownerPerHour) {
      if (!emailBudget.pausedNoticeSent) {
        emailBudget.pausedNoticeSent = true;
        void sendEmail({ to: OWNER_EMAIL(), subject: "Website alerts paused for this hour (unusually many submissions)",
          text: `More than ${EMAIL_LIMITS.ownerPerHour} website submissions arrived in the last hour, so alert emails are paused until the hour is up. Everything is still saved: check the staff portal. If you don't recognise these, someone may be spamming the forms.` });
      }
      return false;
    }
    emailBudget.owner++;
    return true;
  }
  const addr = String(to || "").trim().toLowerCase();
  const times = emailBudget.recipients.get(addr) || [];
  if (emailBudget.customer >= EMAIL_LIMITS.customerPerHour || times.filter((t) => now - t < 864e5).length >= EMAIL_LIMITS.perRecipientPerDay) return false;
  emailBudget.customer++;
  emailBudget.recipients.set(addr, [...times, now]);
  return true;
}
function notifyNew(key, items, max = Infinity, fromPublic = false) {
  const list = items || [];
  if (list.length > max) console.warn(`notifyNew(${key}): ${list.length} new items, only emailing the first ${max}`);
  for (const item of list.slice(0, max)) {
    if (!item) continue;
    if (key === "notification_queue") {
      if (item.channel === "email" && item.recipientEmail && (!fromPublic || allowPublicEmail("customer", item.recipientEmail))) void sendEmail({ to: item.recipientEmail, subject: item.subject || "Update from Mobile Recellr", text: item.message || "", replyTo: OWNER_EMAIL(), customer: true, kind: item.type, name: item.recipientName });
      continue;
    }
    if (fromPublic && !allowPublicEmail("owner")) continue;
    const who = clip(item.name || (item.customer && item.customer.name)) || item.email || (item.customer && item.customer.email) || clip(item.id) || "";
    const door = key === "repair_requests" && item.method === "doorstep";
    const subject = key === "device_requests"
      ? `Device request ${clip(item.id)}: ${clip(item.brand)} ${clip(item.model)}${item.storage ? ` ${clip(item.storage)}` : ""}`
      : door
        ? `${item.express === true ? "EMERGENCY doorstep repair (customer expects a technician within about 2 hours)" : `Doorstep repair request: ${doorstepWhen(item)}`}${who ? ` — ${who}` : ""}`
        : `${NEW_LABEL[key] || `New ${key.replace(/_/g, " ")}`}${who ? ` — ${who}` : ""}`;
    const replyTo = item.email || (item.customer && item.customer.email) || item.customerEmail || undefined;
    void sendEmail({ to: OWNER_EMAIL(), subject, alert: { key, item }, replyTo });
    // Optional copy of device requests to a second inbox (e.g. the one a daily Claude task reads
    // to research launch prices). Set DEVICE_REQUEST_COPY_EMAIL on the host to turn it on.
    const copyTo = key === "device_requests" && String(process.env.DEVICE_REQUEST_COPY_EMAIL || "").trim();
    if (copyTo && copyTo.toLowerCase() !== String(OWNER_EMAIL()).toLowerCase()) void sendEmail({ to: copyTo, subject, alert: { key, item }, replyTo });
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
// ---- What an anonymous visitor may put in a submission ----
// Customers create records; only staff move them along. So on every public
// submission the server keeps the fields the website's own form sends, puts
// the "staff" fields (status, inspection, approved price...) back to where a
// new record starts, and refuses oversized records.
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const isStr = (v, max = 200) => typeof v === "string" && v.trim() !== "" && v.length <= max;
const PUBLIC_FIELDS = {
  orders: ["id", "createdAt", "priceLockExpires", "device", "region", "currency", "tierId", "tierLabel", "faultLabels", "hasAccessories",
    "quotedTotal", "brandNewBase", "customer", "fulfillment", "address", "referralCode"],
  purchase_orders: ["id", "createdAt", "itemId", "brand", "model", "storage", "gradeId", "price", "currency", "region", "customer", "paymentMethod", "warrantyMonths"],
  price_match_requests: ["id", "createdAt", "device", "ourQuote", "region", "currency", "competitorName", "competitorPrice", "note", "customerEmail"],
};
function sanitizePublic(key, records, existing) {
  const now = new Date();
  const out = [];
  for (const raw of records) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "each submission must be an object" };
    if (JSON.stringify(raw).length > PUBLIC_MAX_RECORD_CHARS) return { error: "submission too large" };
    let r = PUBLIC_FIELDS[key] ? pick(raw, PUBLIC_FIELDS[key]) : { ...raw };
    r.receivedAt = now.toISOString();
    if (key === "orders") {
      const d = r.device || {}, c = r.customer || {};
      if (!isStr(d.brand) || !isStr(d.model) || !isStr(c.email)) return { error: "an order needs the device and the customer's email" };
      r.status = "awaiting_shipment";
      r.inspection = null;
      const code = String(r.referralCode || "").toUpperCase();
      // Codes are short (name + 3 digits); a code already held by another order stays with that order.
      if (!/^[A-Z]{1,6}\d{3}$/.test(code) || existing.some((o) => o && String(o.referralCode || "").toUpperCase() === code)) delete r.referralCode;
      else r.referralCode = code;
    } else if (key === "purchase_orders") {
      r.status = r.paymentMethod === "cash_on_pickup" ? "pending_pickup" : "pending_payment";
      const until = new Date(now); until.setMonth(until.getMonth() + 12);
      r.warrantyMonths = 12;
      r.warrantyExpiresAt = until.toISOString();
    } else if (key === "price_match_requests") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(r.customerEmail || "").trim())) return { error: "a price match needs your email so we can reply" };
      Object.assign(r, { customerEmail: String(r.customerEmail).trim(), status: "pending", approvedPrice: null, staffNote: "" });
    } else if (key === "accessory_orders") {
      for (const k of Object.keys(r)) if (/^(paid|shipped|tracking|staff|refund|collected|completed|ready|cancel)/i.test(k)) delete r[k];
      r.status = "new";
    } else if (key === "repair_requests" || key === "bulk_quote_requests") {
      r.status = "new";
      if (key === "bulk_quote_requests") r.staffNote = "";
    } else if (key === "support_queries" || key === "device_requests") {
      r.status = "open";
      // Researched prices and staff notes are added by staff, never by the customer.
      if (key === "device_requests") for (const k of Object.keys(r)) if (/^(suggestion|research|staff|added|price|retail|approved|handled)/i.test(k)) delete r[k];
    } else if (key === "quote_leads") {
      r.contacted = false;
    }
    out.push(r);
  }
  return { records: out };
}

// Reserves the listed phone each new online order is for, all or nothing.
// Customers can't write the stock list themselves (and only ever see the
// public, trimmed copy of it), so the server does this under the stock lock.
// false = a phone is no longer listed (sold, reserved, or never existed).
// An online hold that was never paid or collected lapses after this long, so
// unpaid (or fake) orders can't keep phones out of the shop window for good.
const ONLINE_HOLD_MS = 48 * 60 * 60 * 1000;
async function reserveForOrders(orders, existingOrders = []) {
  return withListLock("shared", "inventory", async (existingValue, write) => {
    let list;
    try { list = existingValue ? JSON.parse(existingValue) : []; } catch (e) { return false; }
    if (!Array.isArray(list)) return false;
    const at = new Date().toISOString();
    const lapsed = (it) => {
      if (!it || it.status !== "reserved" || !it.reservedByOrderId || !(Date.now() - Date.parse(it.reservedAt) > ONLINE_HOLD_MS)) return null;
      const holder = existingOrders.find((o) => o && o.id === it.reservedByOrderId);
      return holder && /^pending_/.test(String(holder.status)) ? holder : null;
    };
    for (const o of orders) {
      const i = list.findIndex((it) => it && o && o.itemId && it.id === o.itemId);
      if (i < 0) return false;
      const old = lapsed(list[i]);
      if (list[i].status !== "listed" && !old) return false;
      if (old) { old.status = "expired"; old.expiredAt = at; } // the caller saves the order list with this change
      list[i] = { ...list[i], status: "reserved", reservedByOrderId: o.id, reservedAt: at };
    }
    await write(JSON.stringify(list), "public");
    return true;
  });
}
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
  if (key === "quote_leads") {
    // A saved quote is emailed to the address given, so its amount must be one our price list can produce.
    const { brandNewBase, DEFAULT_TIERS, ACCESSORY_BONUS_PCT } = await loadPricing();
    const config = (await loadSharedValue("pricing-config")) || {};
    const tierOverrides = Object.fromEntries((Array.isArray(config.tiers) ? config.tiers : []).map((t) => [t.id, t.factor]));
    const maxTier = Math.max(...DEFAULT_TIERS.map((t) => Number(tierOverrides[t.id] ?? t.factor) || 0));
    return records.map((l) => {
      const d = l.device || {};
      const base = brandNewBase(config, { brand: d.brand, model: d.model, storage: d.storage, region: l.region });
      const ok = base != null && Number(l.quotedTotal) >= 0 && Number(l.quotedTotal) <= base * maxTier * (1 + ACCESSORY_BONUS_PCT) * 1.01 + 1;
      return { ...l, priceCheck: ok ? { verified: true } : { verified: false, reason: base == null ? "device not in the price list" : "quote above what our prices allow" } };
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
const clip = (v) => String(v ?? "").replace(/(https?:\/\/|www\.)\S*/gi, "").replace(/\b[\w-]+(\.[\w-]+)*\.[a-z]{2,}\b\S*/gi, "").replace(/\s+/g, " ").trim().slice(0, 60);
function money(n, currency) {
  if (!Number.isFinite(Number(n))) return "";
  try { return new Intl.NumberFormat("en-AU", { style: "currency", currency: /^[A-Z]{3}$/.test(currency || "") ? currency : "AUD" }).format(Number(n)); } catch (e) { return `$${Number(n).toFixed(2)}`; }
}
// "Repair at my door" requests (see frontend/src/doorstep.js). Everything here
// comes from the customer's browser, so only known values are repeated back:
// a real date, one of the three time windows, and a travel fee that matches the
// zone ($15 inner / $30 outer, +$30 emergency). Anything else: "we'll confirm".
const DOOR_WINDOWS = ["9am \u2013 12pm", "12pm \u2013 3pm", "3pm \u2013 6pm"];
const DOOR_FEES = { A: 15, B: 30 }, DOOR_EXPRESS_EXTRA = 30;
function doorstepWhen(r) {
  if (r.express === true) return "as soon as possible (emergency, within about 2 hours)";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(r.slotDate || "")) ? new Date(`${r.slotDate}T00:00:00Z`) : null;
  const day = d && !isNaN(d) ? d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) : "";
  const win = DOOR_WINDOWS.includes(r.slotWindow) ? r.slotWindow : "";
  return [day, win].filter(Boolean).join(", ") || "a time we'll agree with you";
}
function doorstepFeeOf(r) {
  const base = DOOR_FEES[r.zone];
  if (!base) return null;
  const fee = base + (r.express === true ? DOOR_EXPRESS_EXTRA : 0);
  return Number(r.travelFee) === fee ? fee : null;
}
function doorstepMessage(r) {
  const fee = doorstepFeeOf(r);
  return `We've received your request for a repair at your door for your ${clip(r.deviceType).toLowerCase() || "device"}${clip(r.model) ? ` (${clip(r.model)})` : ""}.\n\n`
    + `Requested time: ${doorstepWhen(r)}.\n`
    + (fee != null ? `Travel fee: $${fee}, taken off your repair price if you go ahead.\n\n` : "We'll confirm that we cover your area, and the travel fee, before booking it in.\n\n")
    + "This is a request, not a confirmed booking yet. We'll message you to confirm the time and tell you which technician is coming.";
}
const dateAU = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("en-AU"); };
const deviceName = (r) => clip(`${(r.device && r.device.brand) || ""} ${(r.device && r.device.model) || ""}`) || "device";
const CONFIRMATIONS = {
  order_confirmation: { key: "orders", email: (r) => r.customer && r.customer.email, name: (r) => r.customer && r.customer.name,
    subject: (r) => `Order ${clip(r.id)} received`,
    message: (r) => `Thanks for sending us your ${deviceName(r)} trade-in. We've received it (order ${clip(r.id)})${r.priceCheck && r.priceCheck.quoteTooHigh ? "" : ` with a quote of ${money(r.quotedTotal, r.currency)}`}, subject to inspecting the device.` },
  quote_lead: { key: "quote_leads", email: (r) => r.email, name: () => "",
    subject: (r) => (r.priceCheck && r.priceCheck.verified === false ? `Your ${deviceName(r)} quote` : `Your ${deviceName(r)} quote: ${money(r.quotedTotal, r.currency)}`),
    message: (r) => `We've held this price for you${dateAU(r.priceHeldUntil) ? ` until ${dateAU(r.priceHeldUntil)}` : ""}. Ready to sell? Come back anytime.` },
  bulk_quote_request: { key: "bulk_quote_requests", email: (r) => r.business && r.business.email, name: (r) => r.business && r.business.contactName,
    subject: (r) => `Bulk trade-in request ${clip(r.id)} received`,
    // No amount here: the estimate comes from the visitor's browser, and an email from the shop shouldn't vouch for it.
    message: (r) => `We've received your request for ${Number(r.itemCount) || (Array.isArray(r.items) ? r.items.length : 0)} device(s). A team member will follow up within 1-2 business days with a firm offer.` },
  repair_request: { key: "repair_requests", email: (r) => r.email, name: (r) => r.name,
    subject: (r) => `Repair request ${clip(r.id)} received`,
    message: (r) => r.method === "doorstep" ? doorstepMessage(r)
      : `We've received your repair request for your ${clip(r.deviceType).toLowerCase() || "device"}${clip(r.model) ? ` (${clip(r.model)})` : ""}. We'll reach out shortly to confirm details and turnaround.` },
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
const REFERRAL_REWARD = 20; // flat, both sides; matches the site (instant-quote-calculator.jsx)
async function enrichReferrals(items, existing = []) {
  const orders = await loadSharedList("orders");
  const used = new Set(existing.map((r) => r && r.referredOrderId).filter(Boolean));
  const lc = (v) => String(v || "").trim().toLowerCase();
  return items.map((ref) => {
    const code = String(ref.code || "").trim().toUpperCase();
    const referrer = code && orders.find((o) => o && String(o.referralCode || "").toUpperCase() === code);
    const referrerEmail = referrer && referrer.customer && referrer.customer.email;
    if (!referrerEmail || lc(referrerEmail) === lc(ref.referredEmail)) return null;
    // A referral needs the referred customer's real trade-in, and pays once per trade-in.
    const referred = orders.find((o) => o && o.id === ref.referredOrderId);
    if (!referred || !referred.customer || lc(referred.customer.email) !== lc(ref.referredEmail) || used.has(referred.id)) return null;
    used.add(referred.id);
    return { id: ref.id, createdAt: ref.createdAt, receivedAt: ref.receivedAt, code, referredEmail: referred.customer.email, referredName: referred.customer.name || "",
      referredOrderId: referred.id, rewardAmount: REFERRAL_REWARD, currency: referred.currency || "$",
      referrerEmail, referrerName: referrer.customer.name || "", referrerPaid: false, referredPaid: false };
  }).filter(Boolean);
}

// ---- Staff roles ----
// admin = Owner (everything, incl. team), manager (everything except team),
// staff = Counter (sales, trade-ins, till, repairs), technician (repairs + pricing).
// The server enforces these; the portal only hides what a role can't use.
const ROLES = ["admin", "manager", "staff", "technician"];
// Roles that must use an authenticator code at sign-in. TWO_STEP_ROLES="" on
// the host turns the requirement off in an emergency (e.g. the owner's phone
// is lost and no backup code was saved).
const TWO_STEP_ROLES = (process.env.TWO_STEP_ROLES ?? "admin,manager").split(",").map((r) => r.trim()).filter(Boolean);
function twoStepRequired(role) { return TWO_STEP_ROLES.includes(role); }
// Access is grouped into areas. Each role has default areas; the Owner can add
// or remove areas for one person (users.access = { grant: [...], revoke: [...] }).
// The Owner always has every area; the team itself and the activity log stay Owner-only.
const AREAS = {
  register: "Register, trade-ins, stock & till",
  pricing: "Pricing console",
  reports: "Customers, reports & expenses",
  bank: "See customers' full bank details",
};
const ROLE_AREAS = { admin: Object.keys(AREAS), manager: ["register", "pricing", "reports", "bank"], staff: ["register"], technician: ["pricing"] };
function areasFor(role, access) {
  if (role === "admin") return Object.keys(AREAS);
  const a = new Set(ROLE_AREAS[role] || []);
  for (const g of (access && access.grant) || []) if (AREAS[g]) a.add(g);
  for (const r of (access && access.revoke) || []) a.delete(r);
  return Object.keys(AREAS).filter((k) => a.has(k));
}
const hasArea = (user, area) => !!user && (area === "all" || (user.areas || []).includes(area));
// What each shared list needs: "all" = every signed-in staff member.
const ACCESS = {
  orders: { read: "all", write: "register" },
  price_match_requests: { read: "all", write: "pricing" },
  "pricing-config": { read: "all", write: "pricing" },
  "pricing-history": { read: "pricing", write: "pricing" },
  inventory: { read: "all", write: "register" },
  sales: { read: "all", write: "all" },               // the repair bench records repair payments as sales
  repair_requests: { read: "all", write: "all" },
  repair_tickets: { read: "all", write: "all" },
  parts_stock: { read: "all", write: "all" },
  notification_queue: { read: "all", write: "all" },
  staff_on_shift: { read: "all", write: "all" },
  till_records: { read: "register", write: "register" },
  accessories: { read: "all", write: "register" },
  accessory_orders: { read: "register", write: "register" },
  purchase_orders: { read: "register", write: "register" },
  expenses: { read: "reports", write: "reports" },
  quote_leads: { read: "reports", write: "reports" },
  referrals: { read: "reports", write: "reports" },
  support_queries: { read: "reports", write: "reports" },
  bulk_quote_requests: { read: "reports", write: "reports" },
  device_requests: { read: "pricing", write: "pricing" },
  market_check: { read: "pricing", write: "pricing" },        // competitor price check + suggestions (backend/market.js)
  market_decisions: { read: "pricing", write: "pricing" },    // accepted / ignored suggestions, so ignored ones aren't asked again
  unlock_jobs: { read: "register", write: "register" },     // Unlock Checker (counter staff)
  unlock_audit: { read: "register", write: "register" },      // "can't find my device" requests, handled in the Pricing Console
};
const DEFAULT_ACCESS = { read: "reports", write: "reports" };   // anything not listed
const canAccess = (user, key, mode) => hasArea(user, (ACCESS[key] || DEFAULT_ACCESS)[mode]);

// Full payout bank details are for Owner and Manager. Everyone else sees the last 3 digits,
// and a save from them can never overwrite the real numbers with the masked ones.
const BANK_FIELDS = ["bankBsb", "bankAccountNumber", "paypalEmail"];
const maskTail = (v) => { const t = String(v ?? ""); return t ? "•••" + t.slice(-3) : t; };
function maskBank(json) {
  try {
    const list = JSON.parse(json);
    if (!Array.isArray(list)) return json;
    return JSON.stringify(list.map((o) => {
      if (!o || !o.customer) return o;
      const c = { ...o.customer };
      for (const f of BANK_FIELDS) if (c[f]) c[f] = maskTail(c[f]);
      return { ...o, customer: c };
    }));
  } catch (e) { return json; }
}
// Technician pay is set by someone with the "reports" area (Owner/Manager by
// default). Anyone else's save keeps the stored pay, so a technician can't
// change their own pay or mark it paid.
const PAY_FIELDS = ["techPay", "techPaidAt", "techPaidBy"];
function keepPay(finalJson, existingJson) {
  try {
    const list = JSON.parse(finalJson), old = existingJson ? JSON.parse(existingJson) : [];
    if (!Array.isArray(list) || !Array.isArray(old)) return finalJson;
    const byId = new Map(old.filter((t) => t && t.id != null).map((t) => [String(t.id), t]));
    return JSON.stringify(list.map((t) => {
      if (!t || t.id == null) return t;
      const prev = byId.get(String(t.id)) || {};
      const next = { ...t };
      for (const f of PAY_FIELDS) { if (prev[f] === undefined) delete next[f]; else next[f] = prev[f]; }
      return next;
    }));
  } catch (e) { return finalJson; }
}
function restoreBank(finalJson, existingJson) {
  try {
    const list = JSON.parse(finalJson), old = existingJson ? JSON.parse(existingJson) : [];
    if (!Array.isArray(list) || !Array.isArray(old)) return finalJson;
    const byId = new Map(old.filter((o) => o && o.id != null).map((o) => [String(o.id), o]));
    return JSON.stringify(list.map((o) => {
      const prev = o && byId.get(String(o.id));
      if (!prev || !prev.customer || !o.customer) return o;
      const c = { ...o.customer };
      for (const f of BANK_FIELDS) { if (prev.customer[f] !== undefined) c[f] = prev.customer[f]; else delete c[f]; }
      return { ...o, customer: c };
    }));
  } catch (e) { return finalJson; }
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
const barcodeLookupAllowed = makeLimiter(40, 10 * 60 * 1000); // protect the free external quota
// Sign-in tries per network: stops one address hammering logins (each one is a
// deliberately slow password hash) or rotating usernames to flood alerts.
const loginAllowed = makeLimiter(Number(process.env.LOGIN_PER_IP_MAX) || 40, 10 * 60 * 1000);
// Lockout alert emails to the owner: at most a few per hour, whatever an attacker does.
const lockoutAlertAllowed = (() => { let hits = []; return () => { const now = Date.now(); hits = hits.filter((t) => t > now - 3600000); if (hits.length >= 5) return false; hits.push(now); return true; }; })();
// Wrong tries from many different networks still lock an account, but only at a
// much higher count, so one stranger can't keep the owner locked out.
const MAX_LOGIN_ATTEMPTS_ANY_NETWORK = 50;
const PUBLIC_MAX_ITEMS_PER_SUBMISSION = 20;
const PUBLIC_MAX_RECORD_CHARS = 12_000;       // one customer submission (an order with contact + payout details is ~2 KB; a long message ~5 KB)
const PUBLIC_MAX_LIST_CHARS = 6_000_000;      // a public list stays well under the 10 MB staff save limit
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
// The migration import is the one route that may take a bigger body (it has its own parser).
const jsonBody = express.json({ limit: "10mb" });
app.use((req, res, next) => (req.path === "/admin/migrate/import" ? next() : jsonBody(req, res, next)));
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

async function recentFailedAttemptsAnyNetwork(username) {
  const result = await pool.query(
    `SELECT COUNT(*) AS n FROM login_attempts
     WHERE (username = $1 OR username LIKE $3) AND success = 0 AND attempted_at > NOW() - (INTERVAL '1 minute' * $2)`,
    [username, LOGIN_LOCKOUT_MINUTES, username.replace(/[\\%_]/g, "\\$&") + "|%"]
  );
  return parseInt(result.rows[0].n, 10);
}
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

// ---- Sign-in history and security alerts ----
const totpBox = sec.secretBox(SESSION_SECRET);
const ROLE_NAMES = { admin: "Owner", manager: "Manager", staff: "Counter", technician: "Technician" };
const sydneyTime = (d = new Date()) => d.toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" });
async function logSignIn(username, result, meta, newDevice = false) {
  try {
    await pool.query("INSERT INTO login_log (username, ip, device, result, new_device) VALUES ($1, $2, $3, $4, $5)",
      [String(username).slice(0, 60), meta.ip, meta.device, result, newDevice]);
  } catch (e) { console.error("sign-in log failed:", e.message); }
}
function securityAlert(subject, lines) {
  void sendEmail({ to: OWNER_EMAIL(), subject, text: lines.join("\n\n"), kind: "security alert" });
}

// ---- Activity log (see activity.js) ----
const ACTIVITY_DELAY_MS = parseInt(process.env.ACTIVITY_EMAIL_DELAY_MS || "90000", 10);
const changeAlerts = activity.makeAlerter({ delayMs: ACTIVITY_DELAY_MS, when: () => sydneyTime(),
  send: (subject, lines) => void sendEmail({ to: OWNER_EMAIL(), subject, text: lines.join("\n\n"), kind: "change alert" }) });
async function recordActivity(user, area, events) {
  if (!events || !events.length) return;
  try {
    const rows = events.map((e) => [user.username, user.role, area, e.recordId || null, e.action, (e.summary || "").slice(0, 200), JSON.stringify(e.changes || []), e.important || null]);
    const params = [], values = rows.map((r, i) => { params.push(...r); return `(${r.map((_, j) => `$${i * r.length + j + 1}`).join(", ")})`; });
    await pool.query(`INSERT INTO activity_log (username, role, area, record_id, action, summary, changes, important) VALUES ${values.join(", ")}`, params);
    if (Math.random() < 0.02) await pool.query("DELETE FROM activity_log WHERE at < NOW() - INTERVAL '400 days'");
  } catch (e) { console.error("activity log failed:", e.message); }
  for (const e of events) if (e.important) changeAlerts.add({ username: user.username, role: ROLE_NAMES[user.role] || user.role, area, reason: e.important, event: e });
}
const teamEvent = (req, recordId, summary, important = "team changed") =>
  recordActivity(req.user, "team", [{ recordId, action: "note", summary, changes: [], important }]);

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
    if (!username) return res.status(400).json({ error: "username is required" });
    const weak = sec.passwordProblem(password, username);
    if (weak) return res.status(400).json({ error: `password: ${weak}` });
    const countResult = await pool.query("SELECT COUNT(*) AS n FROM users");
    const userCount = parseInt(countResult.rows[0].n, 10);
    let requester = null;
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
      requester = await verifyToken(token);
      if (!requester || requester.role !== "admin" || requester.limits.length) {
        return res.status(403).json({ error: "only an admin can register new accounts once the shop has any users" });
      }
    }
    if (await canonicalUsername(username)) return res.status(409).json({ error: "username already taken (usernames aren't case-sensitive)" });
    const finalRole = userCount === 0 ? "admin" : (ROLES.includes(role) ? role : "staff");
    await createUser(username, password, finalRole);
    if (requester) await teamEvent({ user: requester }, username, `added ${username} as ${ROLE_NAMES[finalRole]}`, "team member added");
    res.json({ username, role: finalRole, firstAccount: userCount === 0 });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Sign-in. Owner and Manager (see TWO_STEP_ROLES) also need the 6-digit code
// from their authenticator app: the first call with just the password answers
// { needCode: true }, and the app calls again with the code. Every result is
// written to the sign-in history; the owner is emailed about sign-ins from a
// device an account hasn't used before and about lockouts.
app.post("/auth/login", async (req, res) => {
  try {
    const { password, code } = req.body;
    const username = String(req.body.username || "").trim();
    if (!username) return res.status(400).json({ error: "username is required" });
    const meta = { ip: clientKey(req).slice(0, 64), device: sec.describeDevice(req.headers["user-agent"]) };
    if (!loginAllowed(req)) return res.status(429).json({ error: `too many sign-in attempts from this network — try again in a few minutes` });

    // Lockout counts per account + network: five wrong tries from one place lock
    // that place out; strangers elsewhere can't lock the real person out.
    const lockKey = `${attemptKey(username)}|${meta.ip}`;
    const failedCount = await recentFailedAttempts(lockKey);
    const failedAnywhere = await recentFailedAttemptsAnyNetwork(attemptKey(username));
    if (failedCount >= MAX_LOGIN_ATTEMPTS || failedAnywhere >= MAX_LOGIN_ATTEMPTS_ANY_NETWORK) {
      await logSignIn(username, "blocked (locked out)", meta);
      return res.status(429).json({ error: `too many failed attempts — try again in ${LOGIN_LOCKOUT_MINUTES} minutes` });
    }
    const failed = async (result, body) => {
      await recordLoginAttempt(lockKey, false);
      await logSignIn(username, result, meta);
      if (failedCount + 1 === MAX_LOGIN_ATTEMPTS && (await canonicalUsername(username)) && lockoutAlertAllowed()) {
        securityAlert(`Staff account locked: ${username.slice(0, 40)}`, [
          `${MAX_LOGIN_ATTEMPTS} wrong sign-in attempts in a row for "${username.slice(0, 40)}". The account is locked for ${LOGIN_LOCKOUT_MINUTES} minutes.`,
          `Last try: ${meta.device}, network ${meta.ip}.`,
          "If this wasn't one of your team mistyping, check Team → Sign-in history.",
        ]);
      }
      return res.status(401).json(body);
    };

    const user = await verifyPassword(username, password);
    if (!user) return failed("wrong password", { error: "invalid username or password" });

    const row = (await pool.query("SELECT totp_secret, totp_enabled_at, totp_last_step FROM users WHERE username = $1", [user.username])).rows[0];
    if (row.totp_enabled_at) {
      if (!code) return res.json({ needCode: true });
      const secret = totpBox.open(row.totp_secret);
      const step = secret && sec.checkTotp(secret, code, row.totp_last_step);
      if (step == null) return failed("wrong two-step code", { error: "that code didn't work — use the newest code in your authenticator app", needCode: true });
      // Only one sign-in per code: if two arrive together, one wins.
      const won = await pool.query("UPDATE users SET totp_last_step = $1 WHERE username = $2 AND (totp_last_step IS NULL OR totp_last_step < $1)", [step, user.username]);
      if (!won.rowCount) return failed("wrong two-step code", { error: "that code was just used — wait for the next one", needCode: true });
    }
    await recordLoginAttempt(attemptKey(username), true);

    await pool.query("DELETE FROM sessions WHERE expires_at < NOW()"); // light housekeeping
    await pool.query("DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL '1 day'");
    await pool.query("DELETE FROM login_log WHERE at < NOW() - INTERVAL '180 days'");
    const weakPassword = !!sec.passwordProblem(password, user.username);
    const now = Date.now();
    const sessionId = crypto.randomUUID();
    const expiresAtIso = new Date(now + TOKEN_TTL_MS).toISOString();
    await pool.query("INSERT INTO sessions (session_id, username, created_at, expires_at, weak_password) VALUES ($1, $2, NOW(), $3, $4)", [sessionId, user.username, expiresAtIso, weakPassword]);
    const token = signToken({ username: user.username, role: user.role, sid: sessionId, iat: now, exp: now + TOKEN_TTL_MS });

    // A device is the random id this browser keeps (falls back to the browser
    // description). New ones are emailed to the owner.
    const deviceKey = /^[A-Za-z0-9_-]{16,64}$/.test(req.body.deviceId || "") ? req.body.deviceId : meta.device;
    const deviceHash = crypto.createHash("sha256").update(`${user.username}:${deviceKey}`).digest("hex");
    const known = await pool.query("UPDATE known_devices SET last_seen = NOW() WHERE username = $1 AND device_hash = $2", [user.username, deviceHash]);
    const newDevice = !known.rowCount;
    if (newDevice) await pool.query("INSERT INTO known_devices (username, device_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING", [user.username, deviceHash]);
    await logSignIn(user.username, "signed in", meta, newDevice);
    if (newDevice) {
      securityAlert(`New sign-in: ${user.username} (${ROLE_NAMES[user.role] || user.role}) on ${meta.device}`, [
        `${user.username} signed in to the staff portal from a device they haven't used before.`,
        `Device: ${meta.device}`, `Network address: ${meta.ip}`, `Time: ${sydneyTime()}`,
        "If this was them, there's nothing to do. If not: Team → change their password (that signs them out everywhere) and check Sign-in history.",
      ]);
    }
    const limits = [];
    if (weakPassword) limits.push("password");
    if (twoStepRequired(user.role) && !row.totp_enabled_at) limits.push("two-step");
    const access = (await pool.query("SELECT access FROM users WHERE username = $1", [user.username])).rows[0].access;
    res.json({ token, username: user.username, role: user.role, expiresAt: now + TOKEN_TTL_MS, limits, areas: areasFor(user.role, access) });
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

// ---- Barcode -> product name lookup (accessories) ----
// We never auto-fill a PHONE from here: phones are identified by IMEI, which is
// unique per device and not in any retail barcode catalogue. This is only to
// save typing the name of a packaged accessory the first time it is added.
// Source: UPCitemdb free trial (no key). Results are cached in our own DB so we
// hit the external service once per barcode, and staff can always override.
function mapBarcodeCategory(cat) {
  const c = String(cat || "").toLowerCase();
  if (/case|cover|bumper|folio|wallet/.test(c)) return "Cases & covers";
  if (/screen|glass|protector|tempered/.test(c)) return "Screen protectors";
  if (/charg|adapter|power|wall|usb|cable|cord|lightning|type-c|type c/.test(c)) return "Chargers & cables";
  if (/headphone|earbud|earphone|airpod|audio|speaker/.test(c)) return "Audio";
  if (/mount|holder|stand|grip|popsocket|magsafe/.test(c)) return "Mounts & holders";
  return "";
}
function parseUpcLookup(json) {
  const item = json && Array.isArray(json.items) && json.items[0];
  if (!item || !item.title) return { found: false };
  const image = Array.isArray(item.images) && item.images.find((u) => typeof u === "string" && /^https:\/\//.test(u));
  return { found: true, title: String(item.title).slice(0, 160), brand: item.brand ? String(item.brand).slice(0, 80) : "",
    category: mapBarcodeCategory(item.category), image: image || "" };
}

// ---- Product photos ----
// Staff upload a photo (already resized in the browser); it's stored in the
// database and served publicly with long caching. Only images, max 1.5 MB.
const IMAGE_TYPES = { "image/jpeg": true, "image/png": true, "image/webp": true };
app.post("/product-images", requireAuth, async (req, res) => {
  try {
    if (!hasArea(req.user, "register")) return res.status(403).json({ error: "your access doesn't include uploading product photos" });
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
  // A backup code can reset the password and switch two-step off, so making one
  // needs the current password (and the two-step code when it's on). A stolen
  // session alone must not be enough to take the account over for good.
  if (!loginAllowed(req)) return res.status(429).json({ error: "too many attempts — try again in a few minutes" });
  const { password, code: totpCode } = req.body || {};
  if (!password || !(await verifyPassword(req.user.username, password))) return res.status(401).json({ error: "enter your current password to make a backup code", needPassword: true });
  const tr = (await pool.query("SELECT totp_secret, totp_enabled_at, totp_last_step FROM users WHERE username = $1", [req.user.username])).rows[0];
  if (tr && tr.totp_enabled_at) {
    if (!totpCode) return res.status(401).json({ error: "enter the 6-digit code from your authenticator app", needCode: true });
    const secret = totpBox.open(tr.totp_secret);
    const step = secret && sec.checkTotp(secret, totpCode, tr.totp_last_step);
    if (step == null) return res.status(401).json({ error: "that code didn't work — use the newest code in your authenticator app", needCode: true });
    await pool.query("UPDATE users SET totp_last_step = $1 WHERE username = $2 AND (totp_last_step IS NULL OR totp_last_step < $1)", [step, req.user.username]);
  }
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
    if (!loginAllowed(req)) return res.status(429).json({ error: "too many attempts from this network — try again in a few minutes" });
    const key = `recover:${attemptKey(req.body.username)}`;
    if (await recentFailedAttempts(key) >= MAX_LOGIN_ATTEMPTS) return res.status(429).json({ error: `too many attempts — try again in ${LOGIN_LOCKOUT_MINUTES} minutes` });
    const username = await canonicalUsername(req.body.username);
    const weak = sec.passwordProblem(newPassword, username || req.body.username);
    if (weak) return res.status(400).json({ error: `new password: ${weak}` });
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
    // A backup code is the way back in after losing the authenticator phone,
    // so it also switches two-step off; the person sets it up again.
    await pool.query("UPDATE users SET salt = $1, hash = $2, totp_secret = NULL, totp_pending = NULL, totp_enabled_at = NULL" + (via === "personal" ? ", recovery_hash = NULL, recovery_created_at = NULL" : "") + " WHERE username = $3", [salt, hashPassword(newPassword, salt), username]);
    const meta = { ip: clientKey(req).slice(0, 64), device: sec.describeDevice(req.headers["user-agent"]) };
    await logSignIn(username, "password reset with backup code", meta);
    securityAlert(`Backup code used: ${username}`, [`${username} reset their password with a backup recovery code. Their two-step sign-in was switched off and they'll be asked to set it up again.`,
      `Device: ${meta.device}, network ${meta.ip}, ${sydneyTime()}.`, "If this wasn't them, change their password from Team straight away."]);
    await pool.query("UPDATE sessions SET revoked_at = NOW() WHERE username = $1 AND revoked_at IS NULL", [username]);
    await pool.query("DELETE FROM login_attempts WHERE username = $1 OR username = $2 OR username LIKE $3", [attemptKey(username), key, attemptKey(username).replace(/[\\%_]/g, "\\$&") + "|%"]);
    res.json({ recovered: username, usedBackupCode: via === "personal" });
  } catch (e) { res.status(400).json({ error: e.message }); }
}
app.post("/auth/recover", recoverHandler);
app.post("/auth/recover-admin", recoverHandler);


// ---- Team management (admin only) ----
app.get("/auth/users", requireAuth, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "admin only" });
  const r = await pool.query("SELECT username, role, created_at, totp_enabled_at IS NOT NULL AS two_step, access FROM users ORDER BY created_at");
  res.json({ users: r.rows.map((u) => ({ ...u, areas: areasFor(u.role, u.access), roleAreas: ROLE_AREAS[u.role] || [] })), areaNames: AREAS });
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
    await teamEvent(req, target, `removed ${target}`, "team member removed");
    res.json({ removed: target });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// Owner changes someone's role. Their sessions end so the new role applies at their next sign-in
// (a role is baked into each sign-in). The last Owner can't be demoted.
app.post("/auth/users/:username/role", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "owner only" });
    const role = req.body && req.body.role;
    if (!ROLES.includes(role)) return res.status(400).json({ error: "unknown role" });
    const target = await canonicalUsername(req.params.username);
    if (!target) return res.status(404).json({ error: "no such user" });
    const cur = (await pool.query("SELECT role FROM users WHERE username = $1", [target])).rows[0];
    if (cur.role === "admin" && role !== "admin") {
      const admins = await pool.query("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'");
      if (parseInt(admins.rows[0].n, 10) <= 1) return res.status(400).json({ error: "the shop needs at least one Owner" });
    }
    await pool.query("UPDATE users SET role = $1, access = NULL WHERE username = $2", [role, target]); // a new role starts from its defaults
    await pool.query("UPDATE sessions SET revoked_at = NOW() WHERE username = $1 AND revoked_at IS NULL", [target]);
    await teamEvent(req, target, `${target}: ${ROLE_NAMES[cur.role] || cur.role} → ${ROLE_NAMES[role]}`, "role changed");
    res.json({ username: target, role });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Names and roles of the team, for "assign to" lists. Any signed-in staff member.
app.get("/auth/team", requireAuth, async (req, res) => {
  const r = await pool.query("SELECT username, role FROM users ORDER BY created_at");
  res.json({ team: r.rows });
});

// Owner adds or removes access areas for one person. Takes effect on their next
// request (no sign-out needed); the portal menu updates when they reload.
app.post("/auth/users/:username/access", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "owner only" });
    const want = req.body && req.body.areas;
    if (!Array.isArray(want) || want.some((a) => !AREAS[a])) return res.status(400).json({ error: "unknown access area" });
    const target = await canonicalUsername(req.params.username);
    if (!target) return res.status(404).json({ error: "no such user" });
    const u = (await pool.query("SELECT role, access FROM users WHERE username = $1", [target])).rows[0];
    if (u.role === "admin") return res.status(400).json({ error: "the Owner always has full access" });
    const defaults = ROLE_AREAS[u.role] || [];
    const access = { grant: want.filter((a) => !defaults.includes(a)), revoke: defaults.filter((a) => !want.includes(a)) };
    const stored = access.grant.length || access.revoke.length ? access : null;
    await pool.query("UPDATE users SET access = $1 WHERE username = $2", [stored && JSON.stringify(stored), target]);
    const before = areasFor(u.role, u.access), after = areasFor(u.role, stored);
    const added = after.filter((a) => !before.includes(a)), removed = before.filter((a) => !after.includes(a));
    if (added.length || removed.length) {
      await teamEvent(req, target, `${target}'s access: ${[...added.map((a) => `+ ${AREAS[a]}`), ...removed.map((a) => `− ${AREAS[a]}`)].join(", ")}`, "access changed");
    }
    res.json({ username: target, areas: after, custom: !!stored });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Admin sets a new password for someone who forgot theirs; their old sessions end.
app.post("/auth/users/:username/password", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "admin only" });
    const { newPassword } = req.body;
    const target = await canonicalUsername(req.params.username);
    if (!target) return res.status(404).json({ error: "no such user" });
    const weak = sec.passwordProblem(newPassword, target);
    if (weak) return res.status(400).json({ error: `new password: ${weak}` });
    const salt = crypto.randomBytes(16).toString("hex");
    await pool.query("UPDATE users SET salt = $1, hash = $2 WHERE username = $3", [salt, hashPassword(newPassword, salt), target]);
    await pool.query("UPDATE sessions SET revoked_at = NOW() WHERE username = $1 AND revoked_at IS NULL", [target]);
    await teamEvent(req, target, `reset ${target}'s password`, "password reset by owner");
    res.json({ username: target, passwordReset: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// A staff member changes their own password (needs to know the current one).
app.post("/auth/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const weak = sec.passwordProblem(newPassword, req.user.username);
    if (weak) return res.status(400).json({ error: `new password: ${weak}` });
    if (currentPassword === newPassword) return res.status(400).json({ error: "pick a different password from your current one" });
    const verified = await verifyPassword(req.user.username, currentPassword);
    if (!verified) return res.status(401).json({ error: "current password is incorrect" });
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = hashPassword(newPassword, salt);
    await pool.query("UPDATE users SET salt = $1, hash = $2 WHERE username = $3", [salt, hash, req.user.username]);
    // Changing your password revokes every other session — if someone
    // else had your old password, this locks them out immediately.
    await pool.query("UPDATE sessions SET revoked_at = NOW() WHERE username = $1 AND session_id != $2", [req.user.username, req.user.sid]);
    await pool.query("UPDATE sessions SET weak_password = FALSE WHERE session_id = $1", [req.user.sid]);
    await teamEvent(req, req.user.username, "changed their own password", null);
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
    const canon = await canonicalUsername(req.body.username);
    if (!canon) return res.status(404).json({ error: "no such user" });
    const weak = sec.passwordProblem(newPassword, canon);
    if (weak) return res.status(400).json({ error: `new password: ${weak}` });
    const username = canon;
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = hashPassword(newPassword, salt);
    await pool.query("UPDATE users SET salt = $1, hash = $2 WHERE username = $3", [salt, hash, username]);
    await pool.query("UPDATE sessions SET revoked_at = NOW() WHERE username = $1 AND revoked_at IS NULL", [username]);
    await teamEvent(req, username, `reset ${username}'s password`, "password reset by owner");
    res.json({ username, reset: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/auth/me", requireAuth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role, limits: req.user.limits, areas: req.user.areas });
});

// ---- Two-step sign-in (authenticator app) ----
app.get("/auth/2fa", requireAuth, async (req, res) => {
  const r = (await pool.query("SELECT totp_enabled_at FROM users WHERE username = $1", [req.user.username])).rows[0];
  res.json({ enabled: !!(r && r.totp_enabled_at), enabledAt: r ? r.totp_enabled_at : null, required: twoStepRequired(req.user.role) });
});
// Step 1: confirm the password, get a new secret to scan. Nothing changes
// until step 2 proves the phone has it.
app.post("/auth/2fa/setup", requireAuth, async (req, res) => {
  try {
    if (!(await verifyPassword(req.user.username, req.body && req.body.password))) return res.status(401).json({ error: "password is incorrect" });
    const secret = sec.newTotpSecret();
    await pool.query("UPDATE users SET totp_pending = $1 WHERE username = $2", [totpBox.seal(secret), req.user.username]);
    res.json({ secret, uri: sec.otpauthUri(req.user.username, secret) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// Step 2: the 6-digit code from the app switches two-step on (or moves it to
// a new phone). Other sessions end, so every device signs in with a code.
app.post("/auth/2fa/enable", requireAuth, async (req, res) => {
  try {
    const r = (await pool.query("SELECT totp_pending FROM users WHERE username = $1", [req.user.username])).rows[0];
    const secret = r && r.totp_pending && totpBox.open(r.totp_pending);
    if (!secret) return res.status(400).json({ error: "start the setup again" });
    const step = sec.checkTotp(secret, req.body && req.body.code);
    if (step == null) return res.status(400).json({ error: "that code didn't match — check the app and try the newest code" });
    await pool.query("UPDATE users SET totp_secret = totp_pending, totp_pending = NULL, totp_enabled_at = NOW(), totp_last_step = $1 WHERE username = $2", [step, req.user.username]);
    await pool.query("UPDATE sessions SET revoked_at = NOW() WHERE username = $1 AND session_id != $2 AND revoked_at IS NULL", [req.user.username, req.user.sid]);
    res.json({ enabled: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// Turning it off is only for roles that don't require it.
app.post("/auth/2fa/disable", requireAuth, async (req, res) => {
  try {
    if (twoStepRequired(req.user.role)) return res.status(400).json({ error: "your role has to keep two-step sign-in on" });
    if (!(await verifyPassword(req.user.username, req.body && req.body.password))) return res.status(401).json({ error: "password is incorrect" });
    await pool.query("UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_enabled_at = NULL WHERE username = $1", [req.user.username]);
    res.json({ enabled: false });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// Owner: someone lost their phone. Clears their two-step and signs them out;
// they set it up again at next sign-in.
app.post("/auth/users/:username/2fa-reset", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "owner only" });
    const target = await canonicalUsername(req.params.username);
    if (!target) return res.status(404).json({ error: "no such user" });
    await pool.query("UPDATE users SET totp_secret = NULL, totp_pending = NULL, totp_enabled_at = NULL WHERE username = $1", [target]);
    await pool.query("UPDATE sessions SET revoked_at = NOW() WHERE username = $1 AND revoked_at IS NULL", [target]);
    await teamEvent(req, target, `reset ${target}'s two-step sign-in`, null);
    securityAlert(`Two-step sign-in reset for ${target}`, [`${req.user.username} reset two-step sign-in for ${target}. ${target} has been signed out and will set it up again at next sign-in.`, sydneyTime()]);
    res.json({ username: target, reset: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Activity log viewer (Owner only). Filters: user, area, important=1; pages with before=<id>.
app.get("/activity", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "owner only" });
    const where = [], params = [];
    if (req.query.user) { params.push(String(req.query.user)); where.push(`LOWER(username) = LOWER($${params.length})`); }
    if (req.query.area) { params.push(String(req.query.area)); where.push(`area = $${params.length}`); }
    if (req.query.important === "1") where.push("important IS NOT NULL");
    if (/^\d+$/.test(String(req.query.before || ""))) { params.push(req.query.before); where.push(`id < $${params.length}`); }
    const r = await pool.query(`SELECT id, at, username, role, area, record_id, action, summary, changes, important FROM activity_log ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT 100`, params);
    res.json({ entries: r.rows, areas: activity.AREA_NAMES });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Sign-in history: the Owner sees everyone's, others see their own.
app.get("/auth/login-log", requireAuth, async (req, res) => {
  const all = req.user.role === "admin";
  const r = await pool.query(`SELECT username, at, ip, device, result, new_device FROM login_log ${all ? "" : "WHERE LOWER(username) = LOWER($1)"} ORDER BY at DESC LIMIT 200`, all ? [] : [req.user.username]);
  res.json({ entries: r.rows });
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
      return res.json({ key: req.params.key, value: publicCatalogView(req.params.key, row.value), shared: true });
    }
    const scope = scopeFor(req.query.shared, req.user.username);
    if (scope === "shared" && !canAccess(req.user, req.params.key, "read")) return res.status(403).json({ error: "your access doesn't include this" });
    const result = await pool.query("SELECT value FROM storage WHERE scope = $1 AND key = $2", [scope, req.params.key]);
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: "not_found" });
    const value = scope === "shared" && req.params.key === "orders" && !hasArea(req.user, "bank") ? maskBank(row.value) : row.value;
    res.json({ key: req.params.key, value, shared: scope === "shared" });
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
        const clean = sanitizePublic(key, fresh, existing);
        if (clean.error) return { invalid: clean.error };
        fresh = clean.records;
        if (fresh.length && (existingValue || "").length + JSON.stringify(fresh).length > PUBLIC_MAX_LIST_CHARS) {
          console.error(`public list ${key} is over ${PUBLIC_MAX_LIST_CHARS} chars; refusing new submissions until staff tidy it`);
          return { full: true };
        }
        fresh = await enforcePrices(key, fresh);
        // An online phone order holds the phone straight away, so two customers can't buy the same one.
        if (key === "purchase_orders" && fresh.length) {
          // A real customer buys a phone or two at a time, and doesn't need many unpaid holds open.
          const email = (r) => String((r.customer && r.customer.email) || "").trim().toLowerCase();
          const open = (e) => existing.filter((o) => o && /^pending_/.test(String(o.status)) && email(o) === e && Date.now() - Date.parse(o.receivedAt || o.createdAt) < ONLINE_HOLD_MS).length;
          if (fresh.length > 3 || fresh.some((r) => !email(r) || open(email(r)) + fresh.length > 3)) return { invalid: "too many phones on hold for this email — pay for or cancel an earlier order first, or call us" };
          if (!(await reserveForOrders(fresh, existing))) return { unavailable: true };
        }
        if (key === "notification_queue") fresh = await buildConfirmations(fresh, existing);
        if (key === "referrals") fresh = await enrichReferrals(fresh, existing);
        if (fresh.length) await write(JSON.stringify([...fresh, ...existing]), "public");
        return { fresh };
      });
      if (result.conflict) return res.status(409).json({ error: "id_conflict", detail: "that reference number is already in use, please submit again" });
      if (result.unavailable) return res.status(409).json({ error: "item_unavailable", detail: "this phone has just been sold or reserved" });
      if (result.invalid) return res.status(400).json({ error: "invalid_submission", detail: result.invalid });
      if (result.full) return res.status(503).json({ error: "temporarily_unavailable", detail: "please try again later or message us on WhatsApp" });
      const newOnes = result.fresh;
      notifyNew(key, newOnes, PUBLIC_MAX_OWNER_EMAILS_PER_REQUEST, true);
      // Never return the merged collection to an anonymous caller — only confirm what THEY submitted.
      return res.json({ key: req.params.key, submitted: newOnes.length });
    }

    const scope = scopeFor(shared, req.user.username);
    if (scope === "shared" && !canAccess(req.user, req.params.key, "write")) return res.status(403).json({ error: "your access doesn't include changing this" });
    const hidesBank = scope === "shared" && req.params.key === "orders" && !hasArea(req.user, "bank");
    let staffQueued = [], beforeValue = null;
    const saved = await withListLock(scope, req.params.key, async (existingValue, write) => {
      beforeValue = existingValue;
      let finalValue = value;
      if (scope === "shared" && !DELETE_BY_OMISSION_KEYS.includes(req.params.key)) {
        finalValue = (Array.isArray(changedIds) && mergeOnlyChanged(value, existingValue, changedIds)) || mergeKeepingNewer(value, existingValue);
      }
      if (scope === "shared" && req.params.key === "orders") finalValue = keepCustomerDecisions(finalValue, existingValue);
      if (hidesBank) finalValue = restoreBank(finalValue, existingValue);
      if (scope === "shared" && req.params.key === "repair_tickets" && !hasArea(req.user, "reports")) finalValue = keepPay(finalValue, existingValue);
      if (scope === "shared" && req.params.key === "notification_queue") {   // staff-sent customer updates (e.g. "repair ready")
        try { const had = new Set((existingValue ? JSON.parse(existingValue) : []).map((r) => r && r.id)); staffQueued = JSON.parse(finalValue).filter((r) => r && r.id && !had.has(r.id)); } catch (e) { staffQueued = []; }
      }
      await write(finalValue, req.user.username);
      return finalValue;
    });
    if (staffQueued.length) notifyNew("notification_queue", staffQueued);
    if (scope === "shared" && req.params.key !== "notification_queue") {
      try { await recordActivity(req.user, req.params.key, activity.diffSave(req.params.key, beforeValue, saved)); } catch (e) { console.error("activity diff failed:", e.message); }
    }
    res.json({ key: req.params.key, value: hidesBank ? maskBank(saved) : saved, shared: scope === "shared" });
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
    if (scope === "shared") await recordActivity(req.user, req.params.key, [{ recordId: "", action: "removed", summary: "the WHOLE list was deleted", changes: [], important: "a whole list was deleted" }]);
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
      if (typeof imageBase64 !== "string" || imageBase64.length > 3_000_000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(imageBase64)) return res.status(400).json({ error: "a JPEG, PNG or WebP photo under about 2 MB is needed" });
      // Only to an order this visitor has just placed (received by the server in the last hour).
      const order = m && (await loadSharedList("orders")).find((o) => o && o.id === m[1]);
      if (!order || !(Date.now() - Date.parse(order.receivedAt) < 60 * 60 * 1000)) return res.status(403).json({ error: "unknown order" });
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
  if (!hasArea(req.user, "register")) return res.status(403).json({ error: "your access doesn't include ID photos" });
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
    if (!hasArea(req.user, "reports")) return res.status(403).json({ error: "your access doesn't include this" });
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

// Website chat assistant (needs ANTHROPIC_API_KEY; answers { mode: "faq" } without it).
// GET /barcode-lookup?code=012345678905  (staff, accessories only)
app.get("/barcode-lookup", requireAuth, async (req, res) => {
  try {
    if (!hasArea(req.user, "register")) return res.status(403).json({ error: "your access doesn't include adding products" });
    const code = String(req.query.code || "").replace(/[^0-9]/g, "");
    if (code.length < 8 || code.length > 14) return res.status(400).json({ error: "that doesn't look like a product barcode" });
    const cached = await pool.query("SELECT found, title, brand, category, image FROM barcode_cache WHERE code = $1", [code]);
    if (cached.rowCount) { const r = cached.rows[0]; return res.json({ code, cached: true, ...r }); }
    if (!barcodeLookupAllowed(req)) return res.status(429).json({ error: "too many lookups just now — type the name in for this one" });
    let result = { found: false }, definitive = false;
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 6000);
      const resp = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`, { signal: ctrl.signal, headers: { Accept: "application/json" } });
      clearTimeout(t);
      if (resp.ok) { result = parseUpcLookup(await resp.json()); definitive = true; } // a clean answer, even if "no match"
    } catch (e) { /* network/quota/timeout — not a definitive "no match", so don't cache it */ }
    // Cache a success always; cache a "not found" only when the service actually answered,
    // so a temporary outage doesn't poison a barcode forever.
    if (result.found || definitive) {
      await pool.query(
        "INSERT INTO barcode_cache (code, found, title, brand, category, image) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (code) DO NOTHING",
        [code, !!result.found, result.title || null, result.brand || null, result.category || null, result.image || null]);
    }
    res.json({ code, cached: false, ...result });
  } catch (e) { console.error("barcode-lookup failed:", e.message); res.status(200).json({ found: false }); }
});

require("./chat.js").register(app, { loadSharedList, loadSharedValue, makeLimiter, clientKey });
require("./reviews.js").register(app, { makeLimiter });

app.get("/health", (req, res) => res.json({ ok: true }));

/* ── IMEI check proxy ────────────────────────────────────────────
   Keeps CHECKMEND_API_KEY server-side only.
   Checkmend API docs: https://www.checkmend.com/api

   Set in Render environment variables:
     CHECKMEND_API_KEY   — from your Checkmend account
     CHECKMEND_SECRET    — from your Checkmend account (used for HMAC signing)
     CHECKMEND_STORE_ID  — your store/partner ID

   Returns:
   { status, carrier, make, model, color, checkmend_ref }
   status: "clean" | "blacklisted" | "reported_stolen" | "finance_outstanding"
──────────────────────────────────────────────────────────────── */
app.get("/api/imei-check", requireAuth, async (req, res) => {
  const imei = (req.query.imei || "").replace(/\D/g, "");
  if (imei.length < 14 || imei.length > 17) {
    return res.status(400).json({ error: "IMEI must be 14–17 digits" });
  }

  const apiKey    = process.env.CHECKMEND_API_KEY;
  const secret    = process.env.CHECKMEND_SECRET;
  const storeId   = process.env.CHECKMEND_STORE_ID;

  if (!apiKey || !secret || !storeId) {
    // No credentials configured — return a clearly-marked mock so the
    // frontend UI stays usable in dev without calling a real API.
    return res.json({
      _mock: true,
      status: "clean",
      carrier: "Telstra",
      make: "Apple",
      model: "iPhone (mock — add CHECKMEND_* env vars)",
      color: "Unknown",
      checkmend_ref: "MOCK-" + imei.slice(-4),
    });
  }

  try {
    // Checkmend HMAC-SHA256 signature: HMAC(secret, storeId + imei)
    const sig = crypto.createHmac("sha256", secret).update(storeId + imei).digest("hex");
    const url = `https://api.checkmend.com/check?store_id=${storeId}&imei=${imei}&sig=${sig}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return res.status(502).json({ error: "Checkmend API error", detail: text.slice(0, 200) });
    }
    const data = await r.json();
    // Normalise Checkmend's response shape into what the frontend expects.
    return res.json({
      status: data.status || "clean",              // clean | blacklisted | reported_stolen | finance_outstanding
      carrier: data.network || data.carrier || "Unknown",
      make:    data.manufacturer || data.make || "",
      model:   data.model || "",
      color:   data.color || "",
      checkmend_ref: data.certId || data.cert_id || data.ref || "",
    });
  } catch (err) {
    return res.status(502).json({ error: "IMEI check failed", detail: err.message });
  }
});

// ---- Market price check (backend/market.js) ----
// Reads what Mobile Monster and Phone Exchange pay, compares it with our own
// quotes (same maths as the quote page) and stores suggested "market adj %"
// changes for the Pricing Console. It never changes a price itself.
const market = require("./market.js");
let marketRunning = null, marketLastManual = 0;
function runMarketCheck(by, fetchImpl) {
  if (marketRunning) return marketRunning;
  marketRunning = (async () => {
    const [pricing, catalogMod] = await Promise.all([loadPricing(), import("../frontend/src/device-catalog.js")]);
    const sources = await market.fetchSources(fetchImpl || fetch);
    const config = (await loadSharedValue("pricing-config")) || {};
    const decisions = await loadSharedList("market_decisions");
    const result = market.buildSuggestions({ config, pricing: { ...pricing, mergeCatalog: catalogMod.mergeCatalog }, sources, decisions });
    const prev = (await loadSharedValue("market_check")) || {};
    const checkedAt = new Date().toISOString();
    const record = {
      checkedAt, by, position: result.position, limits: market.LIMITS,
      sources: sources.map(({ prices, ...s }) => s),
      suggestions: result.suggestions, inLine: result.inLine.length, notFound: result.notFound.length,
      // How far each model was from the market at each check, for the trend.
      history: [{ at: checkedAt, gaps: Object.fromEntries(result.suggestions.map((x) => [x.id, x.gapPct])) }, ...((prev && prev.history) || [])].slice(0, 12),
    };
    await withListLock("shared", "market_check", (_old, write) => write(JSON.stringify(record), by));
    return record;
  })().finally(() => { marketRunning = null; });
  return marketRunning;
}
app.post("/market/check", requireAuth, async (req, res) => {
  if (!hasArea(req.user, "pricing")) return res.status(403).json({ error: "your access doesn't include pricing" });
  if (Date.now() - marketLastManual < 2 * 60 * 1000) return res.status(429).json({ error: "a check just ran, try again in a couple of minutes" });
  marketLastManual = Date.now();
  try { res.json(await runMarketCheck(req.user.username, app.__marketFetch)); }
  catch (e) { console.error("market check failed:", e.message); res.status(502).json({ error: "the market check failed, try again later" }); }
});
async function weeklyMarketCheck() {
  try {
    const last = await loadSharedValue("market_check");
    if (!last || !(Date.now() - Date.parse(last.checkedAt) < 7 * 864e5)) await runMarketCheck("weekly check");
  } catch (e) { console.error("weekly market check failed:", e.message); }
}

// ---------------------------------------------------------------------------
// One-time migration kit: moves this shop's data to a new host (e.g. Render ->
// Railway). It does nothing unless MIGRATION_TOKEN is set (32+ characters) on
// the server. Set the SAME token on the old and the new server, pull the data
// across, then REMOVE the variable from both.
// - The token only travels in the x-migrate-token header, never in a URL
//   (URLs end up in hosting and CDN request logs).
// - Compared in constant time; at most 10 tries per network per 10 minutes.
// - Import only writes known columns of known tables (nothing from the file is
//   ever used as SQL), all in one transaction.
// - Two-step secrets are encrypted with SESSION_SECRET: the new server must use
//   the same SESSION_SECRET, or Owner/Manager two-step sign-in stops working.
// Only the durable business tables move; sessions, logs and caches start fresh.
// ---------------------------------------------------------------------------
const MIGRATION_TOKEN = String(process.env.MIGRATION_TOKEN || "");
const MIGRATION_ON = MIGRATION_TOKEN.length >= 32;
if (MIGRATION_TOKEN && !MIGRATION_ON) console.warn("MIGRATION_TOKEN is set but shorter than 32 characters — the migration kit stays OFF.");
if (MIGRATION_ON) console.warn("Migration kit is ON (MIGRATION_TOKEN set). Remove the variable once the move is done.");
const migrateTriesAllowed = makeLimiter(10, 10 * 60 * 1000);
const sha = (v) => crypto.createHash("sha256").update(String(v)).digest();
function migrateGate(req, res) {
  if (!MIGRATION_ON) { res.status(404).end(); return false; }
  if (!migrateTriesAllowed(req)) { res.status(429).json({ error: "too many tries — wait 10 minutes" }); return false; }
  const t = req.get("x-migrate-token") || "";
  if (!t || !crypto.timingSafeEqual(sha(t), sha(MIGRATION_TOKEN))) { res.status(403).json({ error: "bad or missing migration token" }); return false; }
  return true;
}
const MIGRATE_USER_COLUMNS = ["username", "salt", "hash", "role", "created_at", "recovery_hash", "recovery_created_at",
  "totp_secret", "access", "totp_pending", "totp_enabled_at", "totp_last_step"];
async function exportTables() {
  const storage = (await pool.query("SELECT scope, key, value, updated_at, updated_by FROM storage")).rows;
  const users = (await pool.query(`SELECT ${MIGRATE_USER_COLUMNS.join(", ")} FROM users`)).rows;
  const product_images = (await pool.query("SELECT id, mime, encode(data, 'base64') AS data_b64, created_by, created_at FROM product_images")).rows;
  const known_devices = (await pool.query("SELECT username, device_hash, first_seen, last_seen FROM known_devices")).rows;
  // History and small helper tables, so nothing is left behind on the old host.
  // (sessions and login_attempts are deliberately not moved: everyone signs in
  // again on the new host, and lockout counters only live for 5 minutes.)
  const activity_log = (await pool.query("SELECT at, username, role, area, record_id, action, summary, changes, important FROM activity_log ORDER BY id")).rows;
  const login_log = (await pool.query("SELECT username, at, ip, device, result, new_device FROM login_log ORDER BY id")).rows;
  const barcode_cache = (await pool.query("SELECT code, found, title, brand, category, image, created_at FROM barcode_cache")).rows;
  const recovery_uses = (await pool.query("SELECT code_hash, username, used_at FROM recovery_uses")).rows;
  const id_photos = (await pool.query("SELECT id, subject_key, ciphertext, iv, auth_tag, uploaded_by, uploaded_at, expires_at FROM id_photos")).rows;
  return { storage, users, product_images, known_devices, activity_log, login_log, barcode_cache, recovery_uses, id_photos };
}
// Row counts of every table in the database, to prove nothing was missed.
async function allTableCounts() {
  const names = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")).rows.map((r) => r.tablename);
  const out = {};
  for (const n of names) out[n] = (await pool.query(`SELECT COUNT(*)::int AS n FROM "${n.replace(/"/g, '""')}"`)).rows[0].n;
  return out;
}
async function importTables(t) {
  const list = (x) => (Array.isArray(x) ? x : []);
  const client = await pool.connect();
  const imported = { storage: 0, users: 0, product_images: 0, known_devices: 0 };
  try {
    await client.query("BEGIN");
    for (const r of list(t.storage)) {
      if (!r || typeof r.scope !== "string" || typeof r.key !== "string" || typeof r.value !== "string") continue;
      await client.query(
        `INSERT INTO storage (scope, key, value, updated_at, updated_by) VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()), $5)
         ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`,
        [r.scope, r.key, r.value, r.updated_at || null, r.updated_by || null]);
      imported.storage++;
    }
    const setCols = MIGRATE_USER_COLUMNS.filter((c) => c !== "username").map((c) => `${c} = EXCLUDED.${c}`).join(", ");
    for (const r of list(t.users)) {
      if (!r || typeof r.username !== "string" || !r.username || typeof r.salt !== "string" || typeof r.hash !== "string") continue;
      const vals = MIGRATE_USER_COLUMNS.map((c) => (c === "access" && r.access != null ? JSON.stringify(r.access) : r[c] ?? null));
      vals[MIGRATE_USER_COLUMNS.indexOf("role")] = r.role || "staff";
      vals[MIGRATE_USER_COLUMNS.indexOf("created_at")] = r.created_at || new Date().toISOString();
      await client.query(
        `INSERT INTO users (${MIGRATE_USER_COLUMNS.join(", ")}) VALUES (${MIGRATE_USER_COLUMNS.map((_, i) => `$${i + 1}`).join(", ")})
         ON CONFLICT (username) DO UPDATE SET ${setCols}`, vals);
      imported.users++;
    }
    for (const r of list(t.product_images)) {
      if (!r || typeof r.id !== "string" || typeof r.mime !== "string" || typeof r.data_b64 !== "string") continue;
      await client.query(
        `INSERT INTO product_images (id, mime, data, created_by, created_at) VALUES ($1, $2, decode($3, 'base64'), $4, COALESCE($5::timestamptz, NOW()))
         ON CONFLICT (id) DO NOTHING`, [r.id, r.mime, r.data_b64, r.created_by || null, r.created_at || null]);
      imported.product_images++;
    }
    for (const r of list(t.known_devices)) {
      if (!r || typeof r.username !== "string" || typeof r.device_hash !== "string") continue;
      await client.query(
        `INSERT INTO known_devices (username, device_hash, first_seen, last_seen) VALUES ($1, $2, COALESCE($3::timestamptz, NOW()), COALESCE($4::timestamptz, NOW()))
         ON CONFLICT (username, device_hash) DO NOTHING`, [r.username, r.device_hash, r.first_seen || null, r.last_seen || null]);
      imported.known_devices++;
    }
    // Log rows get fresh ids on the new host (it may already have its own rows);
    // a row that's already there (same time, person and event) isn't added twice.
    imported.activity_log = 0;
    for (const r of list(t.activity_log)) {
      if (!r || !r.at || typeof r.username !== "string" || typeof r.area !== "string" || typeof r.action !== "string") continue;
      const q = await client.query(
        `INSERT INTO activity_log (at, username, role, area, record_id, action, summary, changes, important)
         SELECT $1::timestamptz, $2, $3, $4, $5, $6, $7, $8::jsonb, $9
         WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE at = $1::timestamptz AND username = $2 AND area = $4 AND action = $6 AND record_id IS NOT DISTINCT FROM $5)`,
        [r.at, r.username, r.role ?? null, r.area, r.record_id ?? null, r.action, r.summary ?? null, r.changes == null ? null : JSON.stringify(r.changes), r.important ?? null]);
      imported.activity_log += q.rowCount;
    }
    imported.login_log = 0;
    for (const r of list(t.login_log)) {
      if (!r || !r.at || typeof r.username !== "string" || typeof r.result !== "string") continue;
      const q = await client.query(
        `INSERT INTO login_log (username, at, ip, device, result, new_device)
         SELECT $1, $2::timestamptz, $3, $4, $5, $6
         WHERE NOT EXISTS (SELECT 1 FROM login_log WHERE username = $1 AND at = $2::timestamptz AND result = $5)`,
        [r.username, r.at, r.ip ?? null, r.device ?? null, r.result, !!r.new_device]);
      imported.login_log += q.rowCount;
    }
    imported.barcode_cache = 0;
    for (const r of list(t.barcode_cache)) {
      if (!r || typeof r.code !== "string") continue;
      await client.query(
        `INSERT INTO barcode_cache (code, found, title, brand, category, image, created_at) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()))
         ON CONFLICT (code) DO NOTHING`, [r.code, !!r.found, r.title ?? null, r.brand ?? null, r.category ?? null, r.image ?? null, r.created_at || null]);
      imported.barcode_cache++;
    }
    imported.recovery_uses = 0;
    for (const r of list(t.recovery_uses)) {
      if (!r || typeof r.code_hash !== "string" || typeof r.username !== "string") continue;
      await client.query(`INSERT INTO recovery_uses (code_hash, username, used_at) VALUES ($1, $2, COALESCE($3::timestamptz, NOW())) ON CONFLICT (code_hash) DO NOTHING`,
        [r.code_hash, r.username, r.used_at || null]);
      imported.recovery_uses++;
    }
    imported.id_photos = 0;
    for (const r of list(t.id_photos)) {
      if (!r || ["id", "subject_key", "ciphertext", "iv", "auth_tag", "uploaded_by"].some((k) => typeof r[k] !== "string") || !r.uploaded_at || !r.expires_at) continue;
      await client.query(
        `INSERT INTO id_photos (id, subject_key, ciphertext, iv, auth_tag, uploaded_by, uploaded_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`, [r.id, r.subject_key, r.ciphertext, r.iv, r.auth_tag, r.uploaded_by, r.uploaded_at, r.expires_at]);
      imported.id_photos++;
    }
    await client.query("COMMIT");
    return imported;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch (_) { /* ignore */ }
    throw e;
  } finally { client.release(); }
}
const countsOf = (t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.length]));
app.get("/admin/migrate/export", async (req, res) => {
  if (!migrateGate(req, res)) return;
  try {
    const tables = await exportTables();
    res.setHeader("Content-Disposition", 'attachment; filename="phoneshop-export.json"');
    res.setHeader("Cache-Control", "no-store");
    res.type("application/json").send(JSON.stringify({ exportedAt: new Date().toISOString(), counts: countsOf(tables), allTables: await allTableCounts(), tables }));
  } catch (e) { console.error("migration export failed:", e.message); res.status(500).json({ error: "export failed" }); }
});
app.post("/admin/migrate/import", express.json({ limit: "250mb" }), async (req, res) => {
  if (!migrateGate(req, res)) return;
  try { res.json({ ok: true, imported: await importTables((req.body && req.body.tables) || {}) }); }
  catch (e) { console.error("migration import failed:", e.message); res.status(500).json({ error: `import failed (nothing was saved): ${e.message}` }); }
});
// Server to server: this (new) server fetches the export from the old one and
// imports it. No file to move by hand.
app.post("/admin/migrate/pull", async (req, res) => {
  if (!migrateGate(req, res)) return;
  const src = String((req.body && req.body.sourceUrl) || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^/\s]+$/.test(src)) return res.status(400).json({ error: "sourceUrl must be the old server's https:// address, e.g. https://phoneshop-backend-3quv.onrender.com" });
  try {
    const r = await fetch(`${src}/admin/migrate/export`, { headers: { "x-migrate-token": req.get("x-migrate-token") } });
    if (!r.ok) return res.status(502).json({ error: `old server answered ${r.status} — check its address and that it has the same MIGRATION_TOKEN` });
    const data = await r.json();
    const imported = await importTables((data && data.tables) || {});
    res.json({ ok: true, from: src, sourceCounts: data.counts || null, sourceAllTables: data.allTables || null, imported, thisServerAllTables: await allTableCounts() });
  } catch (e) { res.status(502).json({ error: `pull failed (nothing was saved): ${e.message}` }); }
});
// A no-command-line page: open it on the NEW server.
app.get("/admin/migrate", (req, res) => {
  if (!MIGRATION_ON) return res.status(404).end();
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><meta name=robots content=noindex><title>Import data</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:34px auto;padding:0 16px;color:#111}input,button{font-size:16px;padding:11px;margin:6px 0;width:100%;box-sizing:border-box;border-radius:8px}input{border:1px solid #ccc}button{background:#1f6feb;color:#fff;border:0;cursor:pointer;font-weight:600}.card{border:1px solid #e3e3e3;border-radius:12px;padding:16px;margin:14px 0}small{color:#666}pre{background:#f4f4f4;padding:12px;white-space:pre-wrap;word-break:break-word;border-radius:8px}</style>
<h2>Move shop data into this server</h2>
<div class=card><h3>Option A: pull from the old server (easiest)</h3><small>This server fetches the data straight from the old one.</small>
<input id=src placeholder="Old server address, e.g. https://phoneshop-backend-3quv.onrender.com">
<input id=stok type=password autocomplete=off placeholder="Migration token (same on both servers)">
<button onclick=pull()>Pull &amp; import</button></div>
<div class=card><h3>Option B: upload a file</h3><small>A phoneshop-export.json downloaded from the old server.</small>
<input id=tok type=password autocomplete=off placeholder="Migration token"><input id=f type=file accept="application/json,.json">
<button onclick=up()>Upload &amp; import</button></div>
<pre id=out></pre>
<script>
function show(o,r,j){o.textContent=(r.ok?'Done \\u2713\\n':'Failed\\n')+JSON.stringify(j,null,2);}
async function pull(){var o=document.getElementById('out');o.textContent='Pulling from the old server\\u2026';
var src=document.getElementById('src').value.trim(),tok=document.getElementById('stok').value.trim();
if(!src||!tok){o.textContent='Enter the old server address and the token.';return;}
try{var r=await fetch('/admin/migrate/pull',{method:'POST',headers:{'Content-Type':'application/json','x-migrate-token':tok},body:JSON.stringify({sourceUrl:src})});show(o,r,await r.json());}catch(e){o.textContent='Error: '+e.message;}}
async function up(){var o=document.getElementById('out');o.textContent='Working\\u2026';
var tok=document.getElementById('tok').value.trim(),f=document.getElementById('f').files[0];
if(!tok||!f){o.textContent='Enter the token and pick the file first.';return;}
try{var r=await fetch('/admin/migrate/import',{method:'POST',headers:{'Content-Type':'application/json','x-migrate-token':tok},body:await f.text()});show(o,r,await r.json());}catch(e){o.textContent='Error: '+e.message;}}
</script>`);
});

const PORT = process.env.PORT || 8787;
if (require.main === module) {
  schemaReady.then(() => purgeExpiredIdPhotos()).catch(() => {}); // enforce retention on every real server start
  // Competitor prices: checked when the server wakes if the last check is a week old, then every 6 hours it looks again.
  setTimeout(() => schemaReady.then(weeklyMarketCheck), 60 * 1000).unref();
  setInterval(() => schemaReady.then(weeklyMarketCheck), 6 * 3600 * 1000).unref();
  const server = app.listen(PORT, () => console.log(`Shop backend listening on :${PORT} (postgres)`));
  process.on("SIGTERM", () => { pool.end(); server.close(() => process.exit(0)); });
}
module.exports = app;
module.exports.__db = pool; // exposed for tests/graceful shutdown, not part of the HTTP API
module.exports.__schemaReady = schemaReady;
module.exports.__parseUpcLookup = parseUpcLookup;
module.exports.__mapBarcodeCategory = mapBarcodeCategory; // tests can await this before making requests
pool.close = () => pool.end(); // backward-compat alias — existing test cleanup calls .close()

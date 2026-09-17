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
async function createUser(username, password, role) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  await pool.query("INSERT INTO users (username, salt, hash, role, created_at) VALUES ($1, $2, $3, $4, NOW())", [username, salt, hash, role]);
}
// A fixed dummy salt used ONLY to keep timing constant when a username
// doesn't exist — never used to verify a real password against.
const DUMMY_SALT_FOR_TIMING = crypto.randomBytes(16).toString("hex");

async function verifyPassword(username, password) {
  const result = await pool.query("SELECT salt, hash, role FROM users WHERE username = $1", [username]);
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
  return { username, role: row.role };
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
const PUBLIC_READ_KEYS = ["inventory", "pricing-config"];
// Customers need to SUBMIT to these (a trade-in order, a purchase, a
// price-match request, a bulk quote, a lead, a referral) without a staff
// login — but they must never be able to READ them back in bulk, since
// these collections hold every other customer's name, email, and ID
// reference. Anonymous writes here are handled as a safe server-side
// merge-by-id (see the PUT handler) — an anonymous client's local view
// of "existing records" is always empty, so this only ever adds their
// own new submission, never overwrites anyone else's data.
const PUBLIC_WRITE_KEYS = ["orders", "purchase_orders", "price_match_requests", "bulk_quote_requests", "quote_leads", "referrals", "notification_queue"];

function scopeFor(shared, username) {
  if (shared === "true" || shared === true) return "shared";
  return `private:${username}`;
}

const app = express();
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
app.use(cors({ origin: CORS_ORIGIN || true }));
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
const LOGIN_LOCKOUT_MINUTES = 15;

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
    const { username, password, role, bootstrapToken } = req.body;
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
    const existingResult = await pool.query("SELECT 1 FROM users WHERE username = $1", [username]);
    if (existingResult.rows[0]) return res.status(409).json({ error: "username already taken" });
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

    const failedCount = await recentFailedAttempts(username);
    if (failedCount >= MAX_LOGIN_ATTEMPTS) {
      return res.status(429).json({ error: `too many failed attempts — try again in ${LOGIN_LOCKOUT_MINUTES} minutes` });
    }

    const user = await verifyPassword(username, password);
    await recordLoginAttempt(username, !!user);
    if (!user) return res.status(401).json({ error: "invalid username or password" });

    await pool.query("DELETE FROM sessions WHERE expires_at < NOW()"); // light housekeeping
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
    const { username, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: "new password must be 8+ characters" });
    const existsResult = await pool.query("SELECT 1 FROM users WHERE username = $1", [username]);
    if (!existsResult.rows[0]) return res.status(404).json({ error: "no such user" });
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

app.put("/storage/:key", tryAuth, async (req, res) => {
  try {
    const { value, shared } = req.body;
    if (typeof value !== "string") return res.status(400).json({ error: "value must be a string (JSON.stringify it client-side)" });

    if (!req.user) {
      if (!PUBLIC_WRITE_KEYS.includes(req.params.key) || (shared !== true && shared !== "true")) {
        return res.status(401).json({ error: "unauthorized" });
      }
      let incoming;
      try { incoming = JSON.parse(value); } catch (e) { return res.status(400).json({ error: "expected a JSON array for a public submission" }); }
      if (!Array.isArray(incoming)) return res.status(400).json({ error: "expected a JSON array" });
      // Merge by id rather than trusting the anonymous client's array —
      // their local view of "existing records" is always empty (they
      // can't read this key back), so this only ever adds their genuinely
      // new submission(s), never overwrites or exposes anyone else's data.
      const existingResult = await pool.query("SELECT value FROM storage WHERE scope = 'shared' AND key = $1", [req.params.key]);
      const existingRow = existingResult.rows[0];
      const existing = existingRow ? JSON.parse(existingRow.value) : [];
      const existingIds = new Set(existing.map((r) => r && r.id));
      const newOnes = incoming.filter((r) => r && r.id && !existingIds.has(r.id));
      const merged = [...newOnes, ...existing];
      await pool.query(
        `INSERT INTO storage (scope, key, value, updated_at, updated_by) VALUES ('shared', $1, $2, NOW(), 'public')
         ON CONFLICT (scope, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        [req.params.key, JSON.stringify(merged)]
      );
      // Never return the merged collection to an anonymous caller — only confirm what THEY submitted.
      return res.json({ key: req.params.key, submitted: newOnes.length });
    }

    const scope = scopeFor(shared, req.user.username);
    await pool.query(
      `INSERT INTO storage (scope, key, value, updated_at, updated_by) VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (scope, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      [scope, req.params.key, value, req.user.username]
    );
    res.json({ key: req.params.key, value, shared: scope === "shared" });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/storage/:key", requireAuth, async (req, res) => {
  try {
    const scope = scopeFor(req.query.shared, req.user.username);
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
    if (!PUBLIC_WRITE_KEYS.includes(req.params.key)) return res.status(401).json({ error: "unauthorized" });
    const { field, value } = req.query;
    if (!field || !value) return res.status(400).json({ error: "field and value query params are required" });
    const result = await pool.query("SELECT value FROM storage WHERE scope = 'shared' AND key = $1", [req.params.key]);
    const row = result.rows[0];
    const list = row ? JSON.parse(row.value) : [];
    const match = list.find((r) => {
      const v = field.split(".").reduce((o, k) => (o ? o[k] : undefined), r); // supports "customer.email"-style nested lookup
      return typeof v === "string" && typeof value === "string" && v.toLowerCase() === value.toLowerCase();
    });
    if (!match) return res.status(404).json({ error: "not_found" });
    res.json({ record: match });
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

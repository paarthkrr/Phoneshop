// Photos and signatures on a repair: the device's condition when it came in (and after),
// the customer's signature on the intake terms, and damage photos a customer attaches to a
// website repair request. Kept in their own table, readable by signed-in staff only (never
// on the public image store). Each image is a small JPEG/PNG/WebP data URL; old ones are
// removed after 180 days.
//   POST   /job-photos        { subject, kind, imageBase64 }   staff; or the public, once per
//                                                             fresh repair request ("request:REP-…")
//   GET    /job-photos?subject=job:R-123                       staff
//   DELETE /job-photos/:id                                     staff
const crypto = require("crypto");

const KINDS = ["before", "after", "damage", "signature"];
const MAX_CHARS = 900_000; // about 650 KB of image
const PUBLIC_MAX = 3;      // photos a customer can add to one request
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const SUBJECT = /^(job|request):[A-Za-z0-9-]{1,40}$/;

function register(app, { pool, makeLimiter, requireAuth, tryAuth, loadSharedList, schemaReady }) {
  const ready = (schemaReady || Promise.resolve()).then(() => pool.query(`
    CREATE TABLE IF NOT EXISTS job_photos (
      id TEXT PRIMARY KEY, subject TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL,
      uploaded_by TEXT NOT NULL, uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_job_photos_subject ON job_photos(subject);`));
  const publicLimit = makeLimiter(12, 60 * 60 * 1000);
  const purge = () => pool.query("DELETE FROM job_photos WHERE uploaded_at < NOW() - INTERVAL '180 days'").catch(() => {});

  app.post("/job-photos", tryAuth, async (req, res) => {
    try {
      await ready;
      const { subject, kind, imageBase64 } = req.body || {};
      if (!SUBJECT.test(String(subject || "")) || !KINDS.includes(kind)) return res.status(400).json({ error: "subject and kind are required" });
      if (typeof imageBase64 !== "string" || imageBase64.length > MAX_CHARS || !DATA_URL.test(imageBase64)) return res.status(400).json({ error: "a JPEG, PNG or WebP photo under about 600 KB is needed" });
      if (!req.user) {
        // A customer can add a few damage photos to the repair request they've just sent.
        if (!publicLimit(req)) return res.status(429).json({ error: "too many uploads, please try again later" });
        const m = /^request:(.+)$/.exec(subject);
        if (!m || kind !== "damage") return res.status(401).json({ error: "unauthorized" });
        const r = (await loadSharedList("repair_requests")).find((x) => x && x.id === m[1]);
        const at = Date.parse((r && (r.receivedAt || r.createdAt)) || "");
        if (!r || !(Date.now() - at < 60 * 60 * 1000)) return res.status(403).json({ error: "unknown request" });
        const n = (await pool.query("SELECT COUNT(*)::int AS n FROM job_photos WHERE subject = $1", [subject])).rows[0].n;
        if (n >= PUBLIC_MAX) return res.status(409).json({ error: `up to ${PUBLIC_MAX} photos per request` });
      }
      const id = crypto.randomUUID();
      await pool.query("INSERT INTO job_photos (id, subject, kind, data, uploaded_by) VALUES ($1, $2, $3, $4, $5)", [id, subject, kind, imageBase64, req.user ? req.user.username : "customer"]);
      void purge();
      res.json({ id, subject, kind });
    } catch (e) { res.status(400).json({ error: "could not save the photo" }); }
  });

  app.get("/job-photos", requireAuth, async (req, res) => {
    try {
      await ready;
      const subjects = String(req.query.subject || "").split(",").filter((s) => SUBJECT.test(s)).slice(0, 4);
      if (!subjects.length) return res.status(400).json({ error: "subject is required" });
      const rows = (await pool.query("SELECT id, subject, kind, data, uploaded_by, uploaded_at FROM job_photos WHERE subject = ANY($1) ORDER BY uploaded_at", [subjects])).rows;
      res.json({ photos: rows.map((r) => ({ id: r.id, subject: r.subject, kind: r.kind, imageBase64: r.data, by: r.uploaded_by, at: r.uploaded_at })) });
    } catch (e) { res.status(400).json({ error: "could not load" }); }
  });

  app.delete("/job-photos/:id", requireAuth, async (req, res) => {
    try {
      await ready;
      const r = await pool.query("DELETE FROM job_photos WHERE id = $1", [String(req.params.id)]);
      res.json({ deleted: r.rowCount });
    } catch (e) { res.status(400).json({ error: "could not delete" }); }
  });
}

module.exports = { register, KINDS };

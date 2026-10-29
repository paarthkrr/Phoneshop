// Automatic "ready to collect" emails and pickup reminders for repairs.
// - A job marked Ready for pickup: if staff haven't told the customer within 15 minutes,
//   the customer gets the "ready" email.
// - Not collected: a reminder 3 days after they were told, and another 4 days after that.
//   If the customer said when they'd come (pickupAt), reminders wait until a day after that.
// - Only between 9am and 7pm Sydney time, only jobs with an email address, never shop phones.
// What was sent is kept in its own record (system / pickup_reminders), so a staff screen
// saving an older copy of a job can't make anyone get the same email twice.
// Switch off in the Pricing Console > Business (businessSettings.autoPickupEmails = false).

const HOUR = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", hour12: false });
const DAY = 864e5;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const first = (n) => String(n || "").trim().split(/\s+/)[0] || "there";
const clip = (s) => String(s || "").replace(/[<>]/g, "").replace(/https?:\/\/\S+/g, "").slice(0, 80);

function readyAtOf(t) {
  const log = (t.statusLog || []).filter((l) => l && l.status === "ready_for_pickup");
  return Date.parse((log[log.length - 1] || {}).at || t.updatedAt || "") || null;
}

// tickets, state ({ [id]: { readySentAt, reminders, lastAt } }) -> { sends: [...], state }
function planPickupEmails(tickets, state = {}, now = Date.now()) {
  const sends = [], next = { ...state };
  // The email itself adds the greeting, sign-off, address and phone (server.js customerEmailText).
  const hold = " If you need us to hold it for a particular day, just reply to this email.";
  for (const t of tickets || []) {
    if (!t || t.deleted || t.status !== "ready_for_pickup" || t.jobType === "shop") continue;
    const to = String((t.customer && t.customer.email) || "").trim();
    if (!EMAIL.test(to)) continue;
    const dev = clip(`${(t.device && t.device.brand) || ""} ${(t.device && t.device.model) || ""}`.trim()) || "device";
    const s = { reminders: 0, ...(next[t.id] || {}) };
    const readyAt = readyAtOf(t);
    // The status went back to ready after it was collected or reopened: start over.
    if (s.readyAt && readyAt && readyAt > s.readyAt + 60e3) { s.readySentAt = null; s.reminders = 0; s.lastAt = null; }
    if (readyAt) s.readyAt = readyAt;
    const toldAt = Math.max(Date.parse(t.notifiedAt || "") || 0, s.readySentAt || 0, s.lastAt || 0);
    const name = first(t.customer && t.customer.name);
    if (!toldAt) {
      if (!readyAt || now - readyAt < 15 * 60e3) { next[t.id] = s; continue; }
      sends.push({ id: t.id, to, name, kind: "repair ready",
        subject: `Your ${dev} is ready to collect (${clip(t.id)})`,
        text: `Good news: your ${dev} is repaired and ready to collect from Mobile Recellr during opening hours. Job number ${clip(t.id)}.${hold}` });
      s.readySentAt = now;
    } else if (s.reminders < 2) {
      const gap = s.reminders === 0 ? 3 * DAY : 4 * DAY;
      const promised = Date.parse(t.pickupAt || "");
      const waitFor = Number.isFinite(promised) ? promised + DAY : 0;
      if (now - toldAt >= gap && now >= waitFor) {
        sends.push({ id: t.id, to, name, kind: "pickup reminder",
          subject: `Reminder: your ${dev} is waiting for you (${clip(t.id)})`,
          text: `A friendly reminder: your ${dev} is repaired and still waiting for you at Mobile Recellr. Pop in any time during opening hours. Job number ${clip(t.id)}.${hold}` });
        s.reminders += 1; s.lastAt = now;
      }
    }
    next[t.id] = s;
  }
  // Forget jobs that are no longer waiting.
  const waiting = new Set((tickets || []).filter((t) => t && t.status === "ready_for_pickup").map((t) => t.id));
  for (const id of Object.keys(next)) if (!waiting.has(id)) delete next[id];
  return { sends, state: next };
}

function start({ pool, loadSharedList, loadSharedValue, sendEmail, everyMs = 20 * 60 * 1000 }) {
  let running = false;
  const run = async () => {
    if (running) return; running = true;
    try {
      if (!process.env.RESEND_API_KEY) return;
      const h = Number(HOUR.format(new Date()));
      if (h < 9 || h >= 19) return;
      const cfg = (await loadSharedValue("pricing-config")) || {};
      const bs = cfg.businessSettings || {};
      if (bs.autoPickupEmails === false) return;
      const client = await pool.connect();
      let sends = [];
      try {
        // Plan and record in one transaction, so two servers never send the same email.
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('system:pickup_reminders'))");
        const r = await client.query("SELECT value FROM storage WHERE scope = 'system' AND key = 'pickup_reminders'");
        let state = {}; try { state = r.rows[0] ? JSON.parse(r.rows[0].value) || {} : {}; } catch (e) { state = {}; }
        const tickets = await loadSharedList("repair_tickets");
        const plan = planPickupEmails(tickets, state, Date.now());
        sends = plan.sends;
        await client.query(`INSERT INTO storage (scope, key, value, updated_at, updated_by) VALUES ('system', 'pickup_reminders', $1, NOW(), 'system')
          ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [JSON.stringify(plan.state)]);
        await client.query("COMMIT");
      } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
      for (const m of sends) await sendEmail({ to: m.to, subject: m.subject, text: m.text, customer: true, kind: m.kind, name: m.name });
    } catch (e) { console.error("pickup reminders:", e.message); } finally { running = false; }
  };
  setTimeout(run, 2 * 60 * 1000).unref();
  setInterval(run, everyMs).unref();
  return run;
}

module.exports = { planPickupEmails, start };

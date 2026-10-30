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

// A week after a repair is collected: one check-in email (still working? covered by warranty),
// with an optional Google review line and a way to opt out. Only jobs collected 7-10 days
// ago, so turning this on never emails old customers out of the blue.
const REVIEW_URL = "https://g.page/r/CZCxExc--m79ECE/review";
function planFollowUps(tickets, sent = {}, now = Date.now()) {
  const sends = [], next = {};
  for (const t of tickets || []) {
    if (!t || t.deleted || t.status !== "completed" || t.jobType === "shop" || t.noFollowUp) continue;
    const to = String((t.customer && t.customer.email) || "").trim();
    const done = Date.parse(t.completedAt || "");
    if (!EMAIL.test(to) || !Number.isFinite(done)) continue;
    const age = now - done;
    if (sent[t.id]) { if (age < 30 * DAY) next[t.id] = sent[t.id]; continue; }
    if (age < 7 * DAY || age > 10 * DAY) continue;
    const dev = clip(`${(t.device && t.device.brand) || ""} ${(t.device && t.device.model) || ""}`.trim()) || "device";
    const days = Number(t.warrantyDays) || 90;
    sends.push({ id: t.id, to, name: first(t.customer && t.customer.name), kind: "repair follow-up",
      subject: `How's your ${dev} going?`,
      text: `It's been a week since we repaired your ${dev} (job ${clip(t.id)}). We hope it's working perfectly. If anything isn't right, just reply to this email: the repair is covered by our ${days}-day warranty.\n\nIf we looked after you, a quick Google review helps a small local shop a lot: ${REVIEW_URL}\n\n(This is the only follow-up we send for this repair. Don't want emails like this? Reply "no more emails".)` });
    next[t.id] = now;
  }
  return { sends, state: next };
}

// Two more one-off notices per repair:
//  - part arrived: a part the job was waiting on has come in (once per job),
//  - warranty ending: 7 days before the repair warranty runs out (once per job).
function planNotices(tickets, sent = {}, now = Date.now(), opts = {}) {
  const sends = [], next = {};
  for (const t of tickets || []) {
    if (!t || t.deleted || t.jobType === "shop" || t.noFollowUp) continue;
    const to = String((t.customer && t.customer.email) || "").trim();
    if (!EMAIL.test(to)) continue;
    const s = { ...(sent[t.id] || {}) };
    const dev = clip(`${(t.device && t.device.brand) || ""} ${(t.device && t.device.model) || ""}`.trim()) || "device";
    const name = first(t.customer && t.customer.name);
    const arrived = (t.partsNeeded || []).map((n) => Date.parse(n && n.arrivedAt)).filter((x) => Number.isFinite(x)).sort((a, b) => b - a)[0];
    if (opts.partArrived !== false && !s.partArrived && arrived && now - arrived < 2 * DAY && ["awaiting_parts", "in_repair", "diagnosing", "dropped_off"].includes(t.status)) {
      sends.push({ id: t.id, to, name, kind: "part arrived", subject: `The part for your ${dev} has arrived (${clip(t.id)})`,
        text: `Good news: the part we ordered for your ${dev} has arrived, and your repair is next in line. We'll let you know as soon as it's ready to collect. Job number ${clip(t.id)}.` });
      s.partArrived = now;
    }
    const done = Date.parse(t.completedAt || "");
    if (opts.warranty !== false && !s.warrantyEnd && t.status === "completed" && Number.isFinite(done)) {
      const ends = done + (Number(t.warrantyDays) || 90) * DAY;
      if (now >= ends - 7 * DAY && now < ends - 4 * DAY) {
        sends.push({ id: t.id, to, name, kind: "warranty ending", subject: `Your ${dev} repair warranty ends soon`,
          text: `A quick heads-up: the warranty on your ${dev} repair (job ${clip(t.id)}) ends on ${new Date(ends).toLocaleDateString("en-AU", { day: "numeric", month: "long" })}. If anything about the repair isn't right, bring it in before then and we'll sort it out at no charge.\n\n(Don't want emails like this? Reply "no more emails".)` });
        s.warrantyEnd = now;
      }
    }
    if (s.partArrived || s.warrantyEnd) {
      const keep = Number.isFinite(done) ? now - done < 200 * DAY : true;
      if (keep) next[t.id] = s;
    }
  }
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
        {
          const n = await client.query("SELECT value FROM storage WHERE scope = 'system' AND key = 'repair_notices'");
          let sent = {}; try { sent = n.rows[0] ? JSON.parse(n.rows[0].value) || {} : {}; } catch (e) { sent = {}; }
          const pl = planNotices(tickets, sent, Date.now(), { partArrived: bs.autoPartArrived !== false, warranty: bs.autoWarrantyReminder !== false });
          sends = [...sends, ...pl.sends];
          await client.query(`INSERT INTO storage (scope, key, value, updated_at, updated_by) VALUES ('system', 'repair_notices', $1, NOW(), 'system')
            ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [JSON.stringify(pl.state)]);
        }
        if (bs.autoFollowUp !== false) {
          const f = await client.query("SELECT value FROM storage WHERE scope = 'system' AND key = 'repair_followups'");
          let sent = {}; try { sent = f.rows[0] ? JSON.parse(f.rows[0].value) || {} : {}; } catch (e) { sent = {}; }
          const fu = planFollowUps(tickets, sent, Date.now());
          sends = [...sends, ...fu.sends];
          await client.query(`INSERT INTO storage (scope, key, value, updated_at, updated_by) VALUES ('system', 'repair_followups', $1, NOW(), 'system')
            ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [JSON.stringify(fu.state)]);
        }
        await client.query("COMMIT");
      } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; } finally { client.release(); }
      for (const m of sends) await sendEmail({ to: m.to, subject: m.subject, text: m.text, customer: true, kind: m.kind, name: m.name });
    } catch (e) { console.error("pickup reminders:", e.message); } finally { running = false; }
  };
  setTimeout(run, 2 * 60 * 1000).unref();
  setInterval(run, everyMs).unref();
  return run;
}

module.exports = { planPickupEmails, planFollowUps, planNotices, start };

const test = require("node:test");
const assert = require("node:assert");
const { planPickupEmails } = require("../pickup-reminders.js");

const H = 3600e3, D = 24 * H, T0 = Date.parse("2026-11-02T00:00:00Z");
const job = (over = {}) => ({ id: "R-1", status: "ready_for_pickup", customer: { name: "Ann Lee", email: "ann@example.com" }, device: { brand: "Apple", model: "iPhone 14" },
  statusLog: [{ status: "ready_for_pickup", at: new Date(T0).toISOString() }], ...over });

test("tells the customer it's ready once staff haven't, then reminds twice and stops", () => {
  let st = {};
  let p = planPickupEmails([job()], st, T0 + 5 * 60e3); assert.equal(p.sends.length, 0, "gives staff 15 minutes first"); st = p.state;
  p = planPickupEmails([job()], st, T0 + 20 * 60e3); assert.equal(p.sends.length, 1); assert.match(p.sends[0].subject, /ready to collect/); st = p.state;
  p = planPickupEmails([job()], st, T0 + 21 * 60e3); assert.equal(p.sends.length, 0, "never twice"); st = p.state;
  p = planPickupEmails([job()], st, T0 + 3 * D + H); assert.equal(p.sends.length, 1); assert.match(p.sends[0].subject, /Reminder/); st = p.state;
  p = planPickupEmails([job()], st, T0 + 5 * D); assert.equal(p.sends.length, 0); st = p.state;
  p = planPickupEmails([job()], st, T0 + 7 * D + 2 * H); assert.equal(p.sends.length, 1); st = p.state;
  p = planPickupEmails([job()], st, T0 + 30 * D); assert.equal(p.sends.length, 0, "two reminders at most");
});

test("staff already told them: no ready email, reminders count from then", () => {
  const j = job({ notifiedAt: new Date(T0 + H).toISOString() });
  let p = planPickupEmails([j], {}, T0 + 2 * H); assert.equal(p.sends.length, 0);
  p = planPickupEmails([j], p.state, T0 + H + 3 * D + 60e3); assert.equal(p.sends.length, 1); assert.match(p.sends[0].subject, /Reminder/);
});

test("waits for the pickup time the customer gave", () => {
  const j = job({ notifiedAt: new Date(T0).toISOString(), pickupAt: new Date(T0 + 5 * D).toISOString() });
  let p = planPickupEmails([j], {}, T0 + 4 * D); assert.equal(p.sends.length, 0);
  p = planPickupEmails([j], p.state, T0 + 6 * D + H); assert.equal(p.sends.length, 1);
});

test("skips shop phones, no email, other statuses and deleted jobs; forgets collected jobs", () => {
  const p = planPickupEmails([job({ id: "a", jobType: "shop" }), job({ id: "b", customer: { name: "x", email: "" } }), job({ id: "c", status: "in_repair" }), job({ id: "d", deleted: true })], {}, T0 + D);
  assert.equal(p.sends.length, 0);
  const q = planPickupEmails([job({ status: "completed" })], { "R-1": { readySentAt: T0, reminders: 1 } }, T0 + D);
  assert.deepEqual(q.state, {});
});

test("marked ready again later starts over", () => {
  let p = planPickupEmails([job()], {}, T0 + H); assert.equal(p.sends.length, 1);
  const again = job({ statusLog: [{ status: "ready_for_pickup", at: new Date(T0).toISOString() }, { status: "in_repair", at: new Date(T0 + D).toISOString() }, { status: "ready_for_pickup", at: new Date(T0 + 2 * D).toISOString() }] });
  p = planPickupEmails([again], p.state, T0 + 2 * D + H); assert.equal(p.sends.length, 1); assert.match(p.sends[0].subject, /ready to collect/);
});

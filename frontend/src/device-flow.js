// One phone's journey through the shop: trade-in → stock → (repair) → listed → sold.
// Inspection, Register and Repairs all create stock items and shop repair jobs from
// here, so a phone looks the same wherever it was bought and moves between screens
// without anyone retyping it.

const rnd = () => Math.floor(100000 + Math.random() * 900000);

// IMEIs carry a Luhn check digit, which catches most typos before they reach stock.
export function imeiProblem(raw) {
  const s = String(raw || "").replace(/\s|-/g, "");
  if (!s) return "Enter the IMEI (dial *#06# on the phone)";
  if (!/^\d{15}$/.test(s)) return "An IMEI is 15 digits";
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(s[i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0 ? "" : "That IMEI doesn't check out — read it again";
}
export const cleanImei = (raw) => String(raw || "").replace(/\s|-/g, "");

// A stock item for a phone the shop now owns. faults: labels of what's wrong with it.
export function newStockItem({ brand, model, storage, imei, costBasis, region = "AU", currency, sourceOrderId = null, faults = [], staff, needsRepair = false }) {
  const now = new Date().toISOString();
  return {
    id: `INV-${rnd()}`, sourceOrderId, brand, model, storage, imei: cleanImei(imei), gradeId: null,
    costBasis: Math.round((Number(costBasis) || 0) * 100) / 100, currency, region,
    status: needsRepair ? "in_repair" : "in_stock", listedPrice: null, faults,
    receivedAt: now, soldAt: null, staffHandled: staff || "unattributed",
  };
}

// A repair job on the shop's own phone (no customer, no payment). Same shape the
// Repairs screen creates, so it shows in its "shop phones" list and, when finished,
// adds parts and labour to the phone's cost and puts it back in stock.
export function newShopRepairJob({ item, issue, staff }) {
  const now = new Date().toISOString();
  const by = staff || "unattributed";
  return {
    id: `RPR-${rnd()}`, createdAt: now, status: "dropped_off", jobType: "shop",
    customer: { name: "Shop stock", phone: "", email: "" },
    device: { brand: item.brand, model: item.model, imei: item.imei || "", storage: item.storage || "", colour: item.colour || "", condition: "" },
    inventoryItemId: item.id, symptoms: [], partsNeeded: [], priority: "normal", dueAt: null,
    assignedTo: null, assignedAt: null, issue: issue || "Fix up to sell", repairTypeId: null, estimateMins: 0,
    quotedPrice: 0, deposit: 0, depositPayMethod: null, depositAt: null,
    parts: [], finalPrice: null, warrantyDays: 90, warrantyOf: null,
    staffHandled: by, notifiedAt: null, completedAt: null,
    statusLog: [{ status: "dropped_off", at: now, by }],
  };
}

// Prepend one record to a shared list. The server merges shared lists by id, so a
// record added here is never lost to someone else saving the same list meanwhile.
export async function addToSharedList(key, record) {
  if (typeof window === "undefined" || !window.storage) return false;
  try {
    const r = await window.storage.get(key, true);
    const list = r ? JSON.parse(r.value) : [];
    await window.storage.set(key, JSON.stringify([record, ...(Array.isArray(list) ? list : [])]), true);
    return true;
  } catch (e) {
    return false;
  }
}

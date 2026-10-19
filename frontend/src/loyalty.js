// Simple loyalty/store credit system
const LOYALTY_KEY = "loyalty_accounts";

export async function loadLoyalty() {
  if (typeof window === "undefined" || !window.storage) return {};
  try {
    const r = await window.storage.get(LOYALTY_KEY, true);
    return r ? JSON.parse(r.value) : {};
  } catch { return {}; }
}

export async function saveLoyalty(data) {
  if (typeof window === "undefined" || !window.storage) return;
  await window.storage.set(LOYALTY_KEY, JSON.stringify(data), true);
}

export async function addCredit(phone, amount, reason) {
  const data = await loadLoyalty();
  if (!data[phone]) data[phone] = { balance: 0, history: [] };
  data[phone].balance += amount;
  data[phone].history.unshift({ amount, reason, at: new Date().toISOString() });
  await saveLoyalty(data);
  return data[phone];
}

export async function useCredit(phone, amount) {
  const data = await loadLoyalty();
  if (!data[phone] || data[phone].balance < amount) return null;
  data[phone].balance -= amount;
  data[phone].history.unshift({ amount: -amount, reason: "Redeemed", at: new Date().toISOString() });
  await saveLoyalty(data);
  return data[phone];
}

export async function getBalance(phone) {
  const data = await loadLoyalty();
  return data[phone]?.balance || 0;
}

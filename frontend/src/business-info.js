// The shop's contact details, with built-in defaults so they show everywhere even
// before the Business settings in the Pricing Console are filled in. Anything set
// in the console always wins.
export const DEFAULT_BUSINESS = { phone: "0411 931 999", email: "mobilerecellr@outlook.com", whatsapp: "0411 931 999" };

export function withBusinessDefaults(bs) {
  const b = bs || {};
  return { ...b, phone: b.phone || DEFAULT_BUSINESS.phone, email: b.email || DEFAULT_BUSINESS.email, whatsapp: b.whatsapp || b.phone || DEFAULT_BUSINESS.whatsapp };
}

// "0411 931 999" -> "61411931999" (wa.me needs the international number, digits only)
export function waNumber(n) {
  const d = String(n || DEFAULT_BUSINESS.whatsapp).replace(/\D/g, "");
  return d.startsWith("0") ? "61" + d.slice(1) : d;
}
export const waLink = (number, text) => `https://wa.me/${waNumber(number)}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
export const mailLink = (email, subject, body) => `mailto:${email || DEFAULT_BUSINESS.email}?subject=${encodeURIComponent(subject || "Enquiry from mobilerecellr.com.au")}${body ? `&body=${encodeURIComponent(body)}` : ""}`;

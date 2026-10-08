// Built-in answers for the chat assistant. They work with no AI at all (the page uses them when the AI
// is switched off, busy or capped), and they power the quick-reply buttons.
// Every line repeats what the Terms, FAQ, Repairs and About pages already say.

export const FAQ = [
  { id: "warranty", label: "Warranty", keys: ["warranty", "guarantee", "covered", "defect", "faulty", "broke"],
    a: "- 1 year on refurbished phones we sell\n- 90 days on repairs\n- 6 months on parts and accessories\n\nIt covers defects, not drops, cracked screens, bent frames, liquid damage or repairs by someone else. Your Australian Consumer Law rights always apply too.",
    links: [["Warranty details", "/terms#warranty"]] },
  { id: "returns", label: "Returns", keys: ["return", "refund", "change my mind", "money back", "exchange"],
    a: "Refurbished phones and accessories bought online can be returned within 30 days of delivery or collection for a refund if you change your mind. Send them back as received, with accessories and packaging, accounts removed and data erased. Return postage is paid by you unless it's faulty.",
    links: [["Returns policy", "/terms#returns"]] },
  { id: "shipping", label: "Shipping", keys: ["shipping", "delivery", "postage", "post", "express", "click", "collect", "freight"],
    a: "Click and collect is free. Tracked express shipping Australia-wide is free on orders of $100 or more, otherwise a flat $9.95.",
    links: [["Shipping details", "/terms#shipping"]] },
  { id: "repair-time", label: "How long a repair takes", keys: ["how long", "same day", "wait", "turnaround", "time", "quick", "fast"],
    a: "Most screen, battery and charging port repairs are done the same day in store, often while you wait, as long as the part is in stock. Liquid or board damage can take longer, and we tell you before we start. Mail-in repairs usually come back within 3 to 5 business days of arriving, plus postage time.",
    links: [["Book a repair", "/repairs"]] },
  { id: "genuine", label: "Part quality", keys: ["genuine", "original", "aftermarket", "quality", "parts quality"],
    a: "We offer genuine parts and premium-quality aftermarket parts. We explain the difference and the price of each, you choose, and we always tell you exactly which part goes in. Every repair has our 90-day warranty. We also diagnose honestly first and tell you what's wrong before we quote, because a lot of charging port faults are just dust or lint.",
    links: [["About us", "/about"]] },
  { id: "price-match", label: "Price match", keys: ["price match", "cheaper", "match", "competitor", "lower price", "best price"],
    a: "Found the same repair, with the same part quality, or the same device in the same condition, cheaper from an Australian business? Show us the quote or listing and we'll match it. Private sellers, auctions and clearance stock are excluded.",
    links: [["Terms", "/terms"]] },
  { id: "sell-how", label: "How selling works", keys: ["sell", "trade in", "trade-in", "buyback", "cash for", "quote", "old phone", "how much for my"],
    a: "- Get an instant quote online (under a minute, no sign-up, any condition)\n- Your price is held for 14 days\n- Hand it over by home collection in Sydney, drop-off or post\n- We inspect it. If it differs from your description we send a revised offer you can accept or decline\n- Photo ID is checked in person, then you're paid",
    links: [["Get an instant quote", "/quote"]] },
  { id: "sell-pay", label: "How I get paid", keys: ["paid", "payment", "payout", "cash", "bank transfer", "paypal", "get my money"],
    a: "Once the phone passes inspection and your ID is checked at collection or drop-off, you're paid in cash or by bank transfer or PayPal. Posted phones are paid by bank transfer or PayPal after inspection (cash isn't available for those).",
    links: [["Get an instant quote", "/quote"]] },
  { id: "sell-id", label: "Do I need ID", keys: ["id", "photo id", "identification", "licence", "license", "passport"],
    a: "Yes. Second-hand dealer rules mean we check photo ID matching the seller's name in person at collection or drop-off. Please don't send ID details in this chat.",
    links: [["How selling works", "/faq"]] },
  { id: "sell-locked", label: "Locked or broken phones", keys: ["locked", "find my", "icloud", "blacklisted", "stolen", "broken", "cracked", "dead", "finance"],
    a: "We buy phones in any condition, including cracked ones. You must own the phone and remove accounts and locks (Find My, Google account). We can't accept stolen, blacklisted or finance-locked devices.",
    links: [["Get an instant quote", "/quote"]] },
  { id: "grades", label: "Phone conditions", keys: ["grade", "condition", "excellent", "refurbished", "like new", "used"],
    a: "Every refurbished phone gets a 49-point check and is graded:\n- A Excellent: looks like new\n- B Good: light signs of use\n- C Fair: more noticeable wear\n\nAll come with a 1-year warranty.",
    links: [["Browse phones", "/shop"]] },
  { id: "battery", label: "Battery health", keys: ["battery health", "battery life", "80%", "battery"],
    a: "Refurbished phones have battery health of at least 80%. If it's below 80% when you receive it, tell us within 30 days and we'll replace the battery at no cost, or refund you.",
    links: [["Warranty details", "/terms#warranty"]] },
  { id: "mail-in", label: "Mail-in repairs", keys: ["mail in", "mail-in", "send it", "post my", "interstate", "australia wide", "australia-wide"],
    a: "Yes, mail-in repairs are accepted Australia-wide. Pack it securely and drop it at any Australia Post outlet or Parcel Locker, and keep your tracking number. Tracked postage is recommended because devices travel at your risk until we receive them.",
    links: [["Book a repair", "/repairs"]] },
  { id: "collection", label: "Home collection", keys: ["collection", "pick up", "pickup", "come to me", "door", "home"],
    a: "We offer home collection across the Sydney metro area, subject to booking availability. We confirm a time by phone or email. Start with an instant quote and choose collection.",
    links: [["Get an instant quote", "/quote"]] },
  { id: "parts", label: "Parts and DIY kits", keys: ["diy", "parts", "kit", "screen protector", "case", "charger", "accessor"],
    a: "Yes. We sell accessories, genuine and premium repair parts and DIY repair kits, with compatibility by model, and a 6-month warranty on parts and accessories. We also have free repair tutorials.",
    links: [["Shop parts", "/parts?dept=parts"], ["Accessories", "/accessories?dept=accessories"], ["Tutorials", "/tutorials"]] },
  { id: "afterpay", label: "Afterpay or Zip", keys: ["afterpay", "zip", "pay later", "pay in", "instalment", "installment"],
    a: "Where shown on the site, Afterpay and Zip are accepted for in-store purchases only, subject to the provider's approval.",
    links: [["Terms", "/terms"]] },
  { id: "privacy", label: "Privacy", keys: ["privacy", "my data", "personal information", "sell my information"],
    a: "We don't sell your information and don't use it for advertising. Please don't share card, bank or ID numbers in this chat.",
    links: [["Privacy policy", "/privacy"]] },
];

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9%\s-]/g, " ");

// Best matching built-in answer for free text, or null if nothing fits well.
export function matchFaq(text) {
  const t = " " + norm(text) + " ";
  let best = null, bestScore = 0;
  for (const f of FAQ) {
    let score = 0;
    for (const k of f.keys) if (t.includes(" " + k + " ") || (k.length > 4 && t.includes(k))) score += k.includes(" ") ? 2 : 1;
    if (score > bestScore) { best = f; bestScore = score; }
  }
  return bestScore >= 1 ? best : null;
}

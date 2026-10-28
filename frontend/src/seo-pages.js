// Landing pages for what people in Sydney actually search for ("cheap phone repair
// sydney", "iphone screen repair sydney", "used phones sydney"...). Each one answers that
// search properly: real prices (from repair-prices.js, or the Pricing Console at runtime),
// how it works, and the questions people ask. Every fact here is also on the Repairs page,
// Terms or FAQ; nothing is invented for SEO. Used by the page (seo-landing.jsx) and at build
// time (vite.config.js) so Google gets the full text, FAQ and price data in the HTML.

// price: [device, repair name] looked up in the repair price list.
export const SEO_PAGES = {
  "phone-repair-sydney": {
    title: "Cheap Phone Repair Sydney — From $55, Price Match, Same Day",
    desc: "Affordable phone repairs in Sydney: screens from $85, batteries from $59, charging ports from $55. Genuine or premium parts, 90-day warranty, and we'll match any cheaper Australian quote.",
    h1: "Cheap phone repair in Sydney, done properly",
    intro: [
      "Cheap shouldn't mean a mystery part and no warranty. We keep repair prices low by diagnosing first (a charging port that only needs cleaning shouldn't be sold as a new port), then letting you choose genuine or premium-quality parts. You always know exactly what goes in your phone, and every repair carries a 90-day warranty.",
      "Found the same repair, with the same part quality, advertised cheaper by an Australian business? Show us and we'll match it.",
    ],
    prices: [["Phone", "Screen replacement"], ["Phone", "Battery replacement"], ["Phone", "Charging port"], ["Phone", "Camera repair"], ["Phone", "Water damage diagnosis"]],
    sections: [
      { h: "How to get it fixed", list: [
        "In store: most screens, batteries and charging ports are done the same day, often while you wait, when the part is in stock.",
        "At your door: a technician comes to you in Sydney. Inner zone travel fee $15, outer zone $30, taken off the repair if you go ahead.",
        "Mail-in from anywhere in Australia: usually back within 3 to 5 business days of arriving, plus postage.",
      ] },
      { h: "Why the price stays low", list: [
        "We tell you what's wrong before quoting, so you don't pay for parts you don't need.",
        "Genuine or premium aftermarket parts: we explain the difference and the price of each, and you pick.",
        "Price match guarantee on the same repair and part quality from an Australian business.",
      ] },
    ],
    faq: [
      ["How much is a phone screen repair in Sydney?", "Phone screen replacements start from $85. The exact price depends on your model and the part you choose (genuine or premium), and we confirm it before any work starts."],
      ["Is a cheap repair worse quality?", "Not here. You choose genuine or premium-quality parts, we tell you exactly which part goes in, and every repair has a 90-day warranty on the part and our workmanship."],
      ["Do you price match?", "Yes. If an Australian business advertises the same repair with the same part quality for less, show us the quote or listing and we'll match it. Private sellers, auctions and clearance stock are excluded."],
      ["Can you fix it today?", "Most screens, batteries and charging ports are done the same day in store when the part is in stock. Liquid or board damage can take longer, and we'll tell you before starting."],
    ],
    links: [["/iphone-screen-repair-sydney", "iPhone screen repair"], ["/iphone-battery-replacement-sydney", "iPhone battery replacement"], ["/samsung-screen-repair-sydney", "Samsung screen repair"], ["/repairs", "All repairs and booking"]],
    cta: ["/repairs#book", "Book a repair"],
  },

  "iphone-screen-repair-sydney": {
    title: "iPhone Screen Repair Sydney — From $85, Same Day, 90-Day Warranty",
    desc: "Cracked iPhone screen? Replaced same day in Sydney from $85 with genuine or premium parts and a 90-day warranty. Price match guarantee, doorstep and mail-in options.",
    h1: "iPhone screen repair in Sydney",
    intro: [
      "A cracked or unresponsive iPhone screen is the repair we do most. Bring it in and, when the part is in stock, it's usually replaced the same day, often while you wait.",
      "You choose the screen: a genuine part, or a premium-quality replacement that costs less. We explain the difference for your model (brightness, colour and True Tone behave differently on some parts) and confirm the price before we start.",
    ],
    prices: [["Phone", "Screen replacement"]],
    sections: [
      { h: "Before you come in", list: [
        "Back up your iPhone. Screen repairs don't normally touch your data, but backing up is always wise.",
        "Know your passcode: we need to test the touch screen, Face ID and cameras afterwards.",
        "If the phone has also been dropped in water or the back glass is cracked, tell us so we can check it at the same time.",
      ] },
      { h: "What you get", list: [
        "Same-day replacement in store when the part is in stock.",
        "90-day warranty on the screen and our workmanship.",
        "Price match on the same repair and part quality from an Australian business.",
        "Can't come in? A technician can come to your door in Sydney, or post it to us from anywhere in Australia.",
      ] },
    ],
    faq: [
      ["How much does an iPhone screen repair cost in Sydney?", "From $85. The exact price depends on your iPhone model and whether you choose a genuine or premium screen; we confirm it before any work starts."],
      ["How long does an iPhone screen replacement take?", "Usually the same day in store, often while you wait, when the part is in stock."],
      ["Will I lose my data?", "A screen replacement doesn't normally affect your data, but please back up first, as with any repair."],
      ["Is there a warranty?", "Yes, 90 days on the part we fit and our workmanship, on top of your rights under the Australian Consumer Law."],
    ],
    links: [["/iphone-battery-replacement-sydney", "iPhone battery replacement"], ["/phone-repair-sydney", "Cheap phone repair Sydney"], ["/blog/iphone-screen-repair-cost-sydney", "Guide: what an iPhone screen repair costs"], ["/sell/apple", "Or sell your iPhone"]],
    cta: ["/repairs#book", "Book an iPhone screen repair"],
  },

  "iphone-battery-replacement-sydney": {
    title: "iPhone Battery Replacement Sydney — From $59, Same Day",
    desc: "iPhone dying fast or shutting down? Battery replaced same day in Sydney from $59, with a 90-day warranty and price match. In store, at your door, or mail-in.",
    h1: "iPhone battery replacement in Sydney",
    intro: [
      "If your iPhone drains by lunchtime, shuts down in the cold, or shows \"Service\" under Battery Health, a new battery usually brings it back to a full day. Most battery replacements are done the same day in store when the part is in stock.",
      "As with every repair, you can choose a genuine or a premium-quality battery, and we confirm the price for your model before we start.",
    ],
    prices: [["Phone", "Battery replacement"]],
    sections: [
      { h: "Signs it's the battery", list: [
        "Settings › Battery › Battery Health shows below about 80%, or \"Service\".",
        "The phone turns off with charge left, or only works plugged in.",
        "The back or screen is lifting (a swollen battery): stop charging it and bring it in.",
      ] },
      { h: "Not sure it's the battery?", list: [
        "Slow charging is often a dirty charging port, not the battery. We check and clean the port first so you don't pay for a battery you don't need.",
      ] },
    ],
    faq: [
      ["How much is an iPhone battery replacement in Sydney?", "From $59. The exact price depends on your model and battery choice, and we confirm it before any work starts."],
      ["How long does it take?", "Usually the same day in store when the part is in stock."],
      ["Is it worth replacing the battery or should I sell the phone?", "If the rest of the phone is fine, a battery is the cheapest way to get years more use. If you'd rather upgrade, our instant quote shows what we'd pay for it."],
      ["Do you guarantee the new battery?", "Yes, 90 days on the battery and our workmanship."],
    ],
    links: [["/iphone-screen-repair-sydney", "iPhone screen repair"], ["/blog/charging-port-dust-or-real-fault", "Guide: is it the port or the battery?"], ["/phone-repair-sydney", "Cheap phone repair Sydney"], ["/sell/apple", "Sell your iPhone instead"]],
    cta: ["/repairs#book", "Book a battery replacement"],
  },

  "samsung-screen-repair-sydney": {
    title: "Samsung Screen Repair Sydney — Galaxy Screens From $85, Same Day",
    desc: "Cracked Samsung Galaxy screen? Replaced in Sydney from $85 with genuine or premium parts, 90-day warranty and price match. Same day in store when the part is in stock.",
    h1: "Samsung Galaxy screen repair in Sydney",
    intro: [
      "We repair Samsung Galaxy screens, from the A series to the S and Z ranges. When the part is in stock, most screens are replaced the same day in store.",
      "Many Galaxy screens come as a unit with the frame, and some models have curved or folding displays that cost more, so we confirm the exact price for your model, with genuine or premium options, before any work starts.",
    ],
    prices: [["Phone", "Screen replacement"]],
    sections: [
      { h: "Good to know", list: [
        "Green or pink lines, a black screen with sound, or touch that doesn't respond usually mean the screen needs replacing, even if the glass isn't cracked.",
        "If the phone has been in water, tell us: we'll check the board as well as the screen.",
        "Back up your phone and bring your PIN so we can test it afterwards.",
      ] },
    ],
    faq: [
      ["How much is a Samsung screen repair in Sydney?", "From $85. Galaxy S, Note and folding models usually cost more than A-series phones; we confirm the price for your model before any work starts."],
      ["Do you use genuine Samsung screens?", "You choose: a genuine part, or a premium-quality replacement that costs less. We tell you exactly which part goes in."],
      ["How long does it take?", "Usually the same day in store when the part is in stock."],
      ["Is there a warranty?", "Yes, 90 days on the part and our workmanship."],
    ],
    links: [["/phone-repair-sydney", "Cheap phone repair Sydney"], ["/sell/samsung", "Sell your Samsung"], ["/repairs", "All repairs and booking"]],
    cta: ["/repairs#book", "Book a Samsung screen repair"],
  },

  "used-phones-sydney": {
    title: "Used Phones Sydney — Refurbished iPhones & Androids, 1-Year Warranty",
    desc: "Buy a used phone in Sydney without the Marketplace risk: graded, tested and IMEI-checked refurbished phones with a 1-year warranty, 30-day returns and 80%+ battery health.",
    h1: "Used and refurbished phones in Sydney",
    intro: [
      "Buying a second-hand phone from a stranger means guessing: is it stolen, locked to someone's account, or about to need a battery? Every phone we sell has been through our checks, has its IMEI checked against the blacklist, is factory reset and is graded honestly.",
      "You get a 1-year warranty, 30-day returns and at least 80% battery health (conditions apply), at second-hand prices.",
    ],
    stock: true,
    sections: [
      { h: "Our grades", list: [
        "Grade A, Excellent: looks and works like new, no visible wear.",
        "Grade B, Good: light signs of use, works perfectly.",
        "Grade C, Fair: visible wear, works perfectly, the lowest price.",
      ] },
      { h: "Versus buying on Marketplace or Gumtree", list: [
        "IMEI checked: not blacklisted, lost or stolen, and not locked to an account.",
        "1-year warranty from a real business, plus your rights under the Australian Consumer Law.",
        "30-day returns, and someone to call if anything goes wrong.",
      ] },
    ],
    faq: [
      ["Are your used phones unlocked?", "They're factory reset and not locked to anyone's iCloud or Google account. Ask us about a specific phone's network if you're unsure."],
      ["What warranty do used phones have?", "1 year on hardware faults from the date of purchase, plus 30-day returns (conditions apply)."],
      ["What if it's not right for me?", "You have 30 days to return it (conditions apply, see our Terms), and the 1-year warranty covers hardware faults after that."],
      ["Can I trade in my old phone?", "Yes. Get an instant quote for your old phone and put it toward your next one."],
    ],
    links: [["/shop", "See every phone in stock"], ["/blog/refurbished-grades-explained", "Guide: refurbished grades explained"], ["/quote", "Trade in your old phone"]],
    cta: ["/shop", "Shop phones in stock"],
  },
};

export const SEO_SLUGS = Object.keys(SEO_PAGES);

// The repair price rows for a page, from whichever price list is live.
export function pagePrices(page, prices) {
  return (page.prices || []).map(([dev, name]) => {
    const r = (prices[dev] || []).find((x) => x.name === name);
    return r ? { device: dev, name, from: r.from } : null;
  }).filter(Boolean);
}

// One source of truth for the customer menus (desktop dropdowns, mobile drawer, footer).
// Category names come from compatibility.js so the menu always matches what the shop sells.
// Promo lines only repeat claims the site already makes elsewhere (top bar, footer, Terms).
import { PART_CATEGORIES, ACCESSORY_CATEGORIES } from "./compatibility.js";

const qs = (o) => "?" + new URLSearchParams(o).toString();
const accessoryLinks = ACCESSORY_CATEGORIES.filter((c) => c !== "Other").map((c) => ({ label: c, to: "/accessories" + qs({ dept: "accessories", cat: c }) }));
const partLinks = PART_CATEGORIES.filter((c) => c !== "Other parts").map((c) => ({ label: c, to: "/parts" + qs({ dept: "parts", cat: c }) }));

export const MENU = [
  { id: "phones", icon: "phone", label: "Phones", blurb: "Refurbished and tested", to: "/shop", match: ["/shop"], cta: "Browse all phones →",
    groups: [
      { title: "Shop by brand", links: [
        { label: "All phones", to: "/shop" },
        { label: "iPhone", to: "/shop?brand=Apple" },
        { label: "Samsung", to: "/shop?brand=Samsung" },
        { label: "Google Pixel", to: "/shop?brand=Google" },
      ] },
      { title: "Shop by condition", links: [
        { label: "Excellent", note: "Like new", to: "/shop?grade=A" },
        { label: "Good", note: "Light wear", to: "/shop?grade=B" },
        { label: "Fair", note: "More wear", to: "/shop?grade=C" },
      ] },
    ],
    promo: { icon: "shield", title: "Tested before it's sold", text: "49-point check and a 1-year warranty on refurbished phones.", cta: "Browse phones", to: "/shop" } },
  { id: "sell", icon: "tag", label: "Sell", blurb: "Get an instant quote", to: "/quote", match: ["/quote", "/sell"], cta: "Start a quote →",
    groups: [
      { title: "Sell your phone", cols: 2, links: [
        { label: "iPhone", to: "/sell/apple" },
        { label: "Samsung", to: "/sell/samsung" },
        { label: "Google Pixel", to: "/sell/google" },
        { label: "Oppo", to: "/sell/oppo" },
        { label: "Motorola", to: "/sell/motorola" },
        { label: "Xiaomi", to: "/sell/xiaomi" },
        { label: "OnePlus", to: "/sell/oneplus" },
        { label: "Nothing", to: "/sell/nothing" },
        { label: "Vivo", to: "/sell/vivo" },
        { label: "Tablets, laptops, watches", to: "/sell" },
      ] },
      { title: "Good to know", links: [
        { label: "Instant quote", to: "/quote" },
        { label: "Selling FAQ", to: "/faq" },
        { label: "Sell terms", to: "/terms" },
      ] },
    ],
    promo: { icon: "tag", title: "Get an instant quote", text: "Get paid in cash. Home collection across Sydney.", cta: "Start a quote", to: "/quote" } },
  { id: "repairs", icon: "wrench", label: "Repairs", blurb: "Same-day, in store", to: "/repairs", match: ["/repairs", "/tutorials"], cta: "Book a repair →",
    groups: [
      { title: "Repairs", links: [
        { label: "Book a repair", to: "/repairs" },
        { label: "Repair warranty", to: "/terms#warranty" },
        { label: "Repair tutorials", to: "/tutorials" },
      ] },
    ],
    promo: { icon: "wrench", title: "Same-day repairs", text: "Done in store, with a 90-day warranty on repairs.", cta: "Book a repair", to: "/repairs" } },
  { id: "accessories", icon: "zap", label: "Accessories", blurb: "Cases, chargers and more", to: "/accessories" + qs({ dept: "accessories" }), match: ["/accessories"], cta: "Shop accessories →",
    groups: [
      { title: "Shop accessories", cols: 2, links: [{ label: "All accessories", to: "/accessories" + qs({ dept: "accessories" }) }, ...accessoryLinks] },
    ],
    promo: { icon: "zap", title: "Free express shipping", text: "On phones and accessory orders over $100.", cta: "Shop accessories", to: "/accessories" + qs({ dept: "accessories" }) } },
  { id: "parts", icon: "chip", label: "Parts", blurb: "Genuine repair parts", to: "/parts" + qs({ dept: "parts" }), match: ["/parts"], cta: "Browse all parts →",
    groups: [
      { title: "Repair parts", links: [{ label: "All parts", to: "/parts" + qs({ dept: "parts" }) }, ...partLinks] },
    ],
    promo: { icon: "chip", title: "Genuine parts", text: "Screens, batteries, cameras and more for your repair.", cta: "Browse parts", to: "/parts" + qs({ dept: "parts" }) } },
  // Phone drawer only (the desktop bar keeps its simple top-right links).
  { id: "help", icon: "help", label: "Help", blurb: "FAQ, returns and contact", to: "/help", match: [], cta: "Ask a question →", mobileOnly: true,
    groups: [
      { title: "Help and policies", links: [
        { label: "FAQ", to: "/faq" },
        { label: "Contact us", to: "/contact" },
        { label: "30-day returns", to: "/terms#returns" },
        { label: "Warranty", to: "/terms#warranty" },
        { label: "Shipping and postage", to: "/terms#shipping" },
        { label: "Terms", to: "/terms" },
        { label: "Privacy policy", to: "/privacy" },
      ] },
    ] },
];

// Compact "Shop" column for the footer.
export const FOOTER_SHOP = [
  { label: "Refurbished phones", to: "/shop" },
  { label: "iPhone", to: "/shop?brand=Apple" },
  { label: "Samsung", to: "/shop?brand=Samsung" },
  { label: "Google Pixel", to: "/shop?brand=Google" },
  { label: "Accessories", to: "/accessories" + qs({ dept: "accessories" }) },
  { label: "Phone parts", to: "/parts" + qs({ dept: "parts" }) },
];

import React, { useState, useEffect } from "react";

function storageAvailable() {
  return typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
}
async function loadJSON(key, shared) {
  if (!storageAvailable()) return null;
  try { const r = await window.storage.get(key, shared); return r ? JSON.parse(r.value) : null; } catch (e) { return null; }
}

const ink = "#F7F4EC", paper = "#201C18", muted = "#6B6560", brass = "#2150C8", line = "#201C18";
const UPDATED = "28 September 2026";

function useBusiness() {
  const [b, setB] = useState({});
  useEffect(() => { (async () => { const cfg = await loadJSON("pricing-config", true); setB((cfg && cfg.businessSettings) || {}); })(); }, []);
  return {
    name: b.shopName || "Mobile Vault",
    abn: b.abn, address: b.address, phone: b.phone, email: b.email,
  };
}

function Page({ title, children }) {
  return (
    <div style={{ background: ink, color: paper, minHeight: "100%", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;700&display=swap');
        .mv-legal h2 { font-family: 'Archivo Black', sans-serif; font-size: 18px; margin: 30px 0 10px; }
        .mv-legal p, .mv-legal li { font-size: 14.5px; line-height: 1.7; }
        .mv-legal ul { padding-left: 20px; }`}</style>
      <div className="mv-legal" style={{ maxWidth: 720, margin: "0 auto", padding: "40px 16px 80px" }}>
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 30, letterSpacing: "-0.01em", marginBottom: 6 }}>{title}</div>
        <div style={{ color: muted, fontSize: 13, marginBottom: 20 }}>Last updated {UPDATED}</div>
        {children}
      </div>
    </div>
  );
}

function ContactLine({ biz }) {
  const parts = [biz.email && `email ${biz.email}`, biz.phone && `phone ${biz.phone}`].filter(Boolean);
  return parts.length ? <>{parts.join(" or ")}{biz.address ? `, or visit us at ${biz.address}` : ""}</> : <>use our <a href="/contact" style={{ color: brass }}>contact page</a></>;
}

export function PrivacyPolicy() {
  const biz = useBusiness();
  return (
    <Page title="Privacy Policy">
      <p>{biz.name}{biz.abn ? ` (ABN ${biz.abn})` : ""} buys, sells, and repairs phones and other devices. This policy explains what personal information we collect, why, and how we look after it, in line with the Australian Privacy Principles.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Contact details</strong> — your name, email address, and phone number.</li>
        <li><strong>Device details</strong> — the model, condition, and faults you describe, and repair notes.</li>
        <li><strong>When you sell us a device</strong> — the type of photo ID you hold and your name as it appears on it (second-hand dealer laws require us to identify sellers), and optionally a photo of that ID.</li>
        <li><strong>Payment details</strong> — your BSB and account number, or PayPal email, so we can pay you.</li>
        <li><strong>When you buy from us</strong> — your delivery address.</li>
        <li><strong>Messages</strong> you send us through the help form or chat.</li>
      </ul>

      <h2>Why we collect it</h2>
      <p>To give you quotes, complete purchases, sales, and repairs, pay you, contact you about your order, and meet our legal obligations — including second-hand dealer and stolen-goods laws. We don't sell your information, and we don't use it for advertising.</p>

      <h2>Where it's stored</h2>
      <p>Our website and database are hosted by Render (render.com) on servers in the <strong>United States</strong>. By using our services you consent to your information being stored there. Access is limited to our staff, each with their own password-protected login. Passwords are stored in hashed form, and ID photos are encrypted.</p>
      <p>Our pages load fonts from Google Fonts, which means Google receives your device's IP address when you visit.</p>

      <h2>Who we share it with</h2>
      <p>Only the service providers needed to run our business (such as our hosting provider), or where the law requires it — for example, a police request about stolen goods.</p>

      <h2>How long we keep it</h2>
      <p>We keep transaction records for as long as the law requires. ID photos are automatically deleted after 90 days.</p>

      <h2>Cookies and browser storage</h2>
      <p>We use your browser's storage only to keep staff signed in and to make the site work. We don't use advertising or tracking cookies.</p>

      <h2>Accessing or correcting your information</h2>
      <p>You can ask to see or correct the information we hold about you, or make a privacy complaint: <ContactLine biz={biz} />. If you're not satisfied with our response, you can contact the Office of the Australian Information Commissioner at oaic.gov.au.</p>
    </Page>
  );
}

export function Terms() {
  const biz = useBusiness();
  return (
    <Page title="Terms & Warranty">
      <h2>Trade-in quotes</h2>
      <ul>
        <li>Instant quotes are based on the details you give us and are held for 14 days.</li>
        <li>We inspect every device when it arrives. If its condition differs from what you described, we'll send a revised offer, which you can accept or decline. We never pay a reduced amount without your agreement. If you decline, we'll arrange to return your device.</li>
        <li>You must own the device and remove any accounts or locks (such as Find My or Google account protection). We don't accept stolen, blacklisted, or finance-locked devices, and may report them to police.</li>
        <li>Once we've confirmed the price, we pay by bank transfer or PayPal to the details you provide.</li>
      </ul>

      <h2>Price match guarantee</h2>
      <p>If you find the same repair or the same device in the same condition advertised for less by an Australian business, show us the quote or listing and we'll match it. We may need to verify the offer is current and genuine. Private sellers, auction listings, and clearance stock are excluded.</p>

      <h2>Repairs</h2>
      <ul>
        <li>We diagnose first and quote before starting any work.</li>
        <li>Please back up your device before a repair. Some repairs can require a reset.</li>
      </ul>

      <h2>Our 12-month warranty</h2>
      <p>Refurbished devices we sell, and the parts and workmanship of repairs we carry out, are covered against defects for 12 months from purchase or repair. The warranty doesn't cover accidental damage, liquid damage, misuse, or later repairs by anyone else.</p>
      <p>To make a claim, contact us with your order or repair number: <ContactLine biz={biz} />. We'll assess the device and repair, replace, or refund it at no cost to you. Warranty provided by {biz.name}{biz.abn ? `, ABN ${biz.abn}` : ""}{biz.address ? `, ${biz.address}` : ""}.</p>
      <p>This warranty is in addition to your rights under the Australian Consumer Law.</p>

      <h2>Your rights under the Australian Consumer Law</h2>
      <p style={{ border: `2px solid ${line}`, borderRadius: 3, padding: 16, background: "#fff" }}>
        Our goods and services come with guarantees that cannot be excluded under the Australian Consumer Law. For major failures with the service, you are entitled to cancel your service contract with us and to a refund for the unused portion, or to compensation for its reduced value. You are also entitled to choose a replacement or refund for major failures with goods. If a failure with the goods or a service does not amount to a major failure, you are entitled to have the failure rectified in a reasonable time. If this is not done you are entitled to a refund for the goods and to cancel the contract for the service and obtain a refund of any unused portion. You are also entitled to be compensated for any other reasonably foreseeable loss or damage from a failure in the goods or service.
      </p>

      <h2>Questions</h2>
      <p>See our <a href="/privacy" style={{ color: brass }}>Privacy Policy</a>, or get in touch: <ContactLine biz={biz} />.</p>
    </Page>
  );
}

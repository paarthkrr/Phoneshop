// Repair bench diagnosis guide: pick the symptoms, get the likely causes
// (most common first), what to check, and which parts to have ready.
// Causes are ranked from common bench experience; where the maker documents
// a behaviour (charging, parts messages, moisture alerts, fingerprint), the
// official page is linked. Always confirm by testing before quoting a part.

export const SOURCES = {
  apple_charge: { label: "Apple: If your iPhone won't charge", url: "https://support.apple.com/en-us/108805" },
  apple_parts: { label: "Apple: iPhone Parts and Service History", url: "https://support.apple.com/en-us/102658" },
  apple_battery: { label: "Apple: About genuine iPhone batteries", url: "https://support.apple.com/en-us/103269" },
  apple_perf: { label: "Apple: iPhone battery and performance", url: "https://support.apple.com/en-us/101575" },
  samsung_moisture: { label: "Samsung: moisture in the charging port", url: "https://www.samsung.com/uk/support/mobile-devices/what-to-do-if-your-water-resistant-phone-or-tablet-detects-moisture-in-the-charging-port" },
  pixel_fp: { label: "Google: Pixel fingerprint sensor issues", url: "https://support.google.com/pixelphone/answer/13537318" },
  pixel_repair: { label: "Google: Pixel Update and Software Repair", url: "https://pixelrepair.withgoogle.com/" },
};

// Parts the guide can suggest. `match` words find them in Parts Stock by name.
export const PARTS = {
  battery: { label: "Battery", match: ["battery"] },
  screen: { label: "Screen / display assembly", match: ["screen", "display", "lcd", "oled"] },
  charge_port: { label: "Charging port / flex", match: ["charging port", "charge port", "charging flex", "dock", "usb-c port", "lightning port"] },
  back_glass: { label: "Back glass", match: ["back glass", "rear glass", "back cover"] },
  housing: { label: "Housing / frame", match: ["housing", "frame", "chassis"] },
  rear_camera: { label: "Rear camera", match: ["rear camera", "back camera", "main camera"] },
  front_camera: { label: "Front camera", match: ["front camera", "selfie camera"] },
  camera_lens: { label: "Camera lens glass", match: ["camera lens", "lens glass", "lens cover"] },
  loudspeaker: { label: "Loudspeaker", match: ["loudspeaker", "loud speaker", "bottom speaker", "speaker"] },
  earpiece: { label: "Earpiece speaker", match: ["earpiece", "ear speaker"] },
  microphone: { label: "Microphone", match: ["microphone", "mic"] },
  button_flex: { label: "Power / volume button flex", match: ["power flex", "volume flex", "button flex", "power button", "volume button"] },
  sim_tray: { label: "SIM tray / reader", match: ["sim tray", "sim reader", "sim card"] },
  antenna: { label: "Antenna flex / cable", match: ["antenna", "coaxial"] },
  wireless_coil: { label: "Wireless charging coil", match: ["wireless charging", "nfc coil", "charging coil"] },
};

const C = (text, likelihood, part, brands) => ({ text, likelihood, part: part || null, brands: brands || null });

export const SYMPTOMS = [
  {
    id: "no_charge", label: "Not charging / charges slowly",
    checks: [
      "Try a known-good cable and wall adapter first.",
      "Power off, then inspect the port with a light and magnifier. Remove lint with a non-metal pick.",
      "Measure charging current with a USB meter (0 A, low, or normal).",
      "Try wireless charging if the model supports it. Wireless works but cable doesn't points to the port or flex.",
      "Check battery health in Settings.",
    ],
    causes: [
      C("Lint or debris packed in the charging port", "common"),
      C("Faulty cable or adapter", "common"),
      C("Worn or damaged charging port / flex", "common", "charge_port"),
      C("Battery worn out or failed", "possible", "battery"),
      C("Liquid or corrosion in the port", "possible", "charge_port"),
      C("Charging circuit on the logic board (board-level repair)", "less"),
    ],
    brandNotes: {
      apple: "Stopping at 80% is often Optimized Battery Charging or heat, not a fault. iPhone 15 and later can also have a Charge Limit set in Settings.",
      samsung: "A 'moisture detected' alert blocks wired charging until the port is dry (usually 1 to 2 hours). Wireless charging still works. Never push anything into the port.",
    },
    sources: ["apple_charge", "samsung_moisture"],
  },
  {
    id: "no_power", label: "Dead / won't turn on / stuck in boot loop",
    checks: [
      "Charge for 30 minutes on a known-good charger, then force restart.",
      "Watch current draw on a USB meter: 0 A suggests battery or board; normal draw with a black screen suggests the display.",
      "Does it vibrate, ring or show up on a computer? If yes, the phone is running and the screen may be dead.",
      "Try recovery or download mode and a software restore before opening it.",
      "If opened: check for liquid indicators, corrosion and disconnect the battery first.",
    ],
    causes: [
      C("Fully drained or failed battery", "common", "battery"),
      C("Display dead while the phone is running", "common", "screen"),
      C("Software crash or failed update (boot loop)", "possible"),
      C("Liquid damage", "possible"),
      C("Logic board fault", "less"),
    ],
    sources: ["apple_charge"],
  },
  {
    id: "screen_cracked", label: "Cracked screen / touch dead",
    checks: [
      "Draw-test the whole screen for dead touch areas.",
      "Look for lines, black spots or colour bleed under the crack.",
      "Check the frame for bends. A bent frame cracks new screens.",
      "Test Face ID / fingerprint, earpiece and proximity before starting, and note the results.",
    ],
    causes: [
      C("Glass and display assembly damaged", "common", "screen"),
      C("Bent frame from the drop", "possible", "housing"),
    ],
    brandNotes: {
      apple: "On iPhone 11 and later a replacement display shows in Settings > General > About > Parts and Service History. A non-genuine display shows as 'Unknown Part'. Tell the customer before the repair.",
      google: "Pixel 6 and later have the fingerprint sensor under the display. After a screen replacement the customer must re-enrol fingerprints, and the sensor may need recalibrating with Google's repair tools.",
      samsung: "Galaxy S and Note models use an under-display fingerprint sensor. Re-enrol fingerprints after the screen is replaced and test it before handing back.",
    },
    sources: ["apple_parts", "pixel_fp", "pixel_repair"],
  },
  {
    id: "display_lines", label: "Lines, green/pink line, flicker or black spots (no crack)",
    checks: [
      "Do the lines change when you press near the edge? That points to the connector or flex.",
      "Reseat the display connector (battery disconnected).",
      "Test with a known-good screen if you have one.",
      "Ask about recent drops, pressure (back pocket) or liquid.",
    ],
    causes: [
      C("OLED panel failure", "common", "screen"),
      C("Loose or damaged display connector / flex", "possible"),
      C("Software glitch (update and retest)", "less"),
    ],
    brandNotes: {
      samsung: "A permanent green or pink vertical line on Galaxy AMOLED panels is almost always the panel. Check if Samsung runs a free display program for that model before charging the customer.",
    },
  },
  {
    id: "touch_issue", label: "Ghost touch / touch not responding",
    checks: [
      "Remove the case and screen protector, clean the screen.",
      "Try a different charger. Faulty chargers can cause ghost touches.",
      "Ask if the screen was replaced before. Low-quality replacement screens often cause this.",
      "Restart and test again in safe mode.",
    ],
    causes: [
      C("Damaged touch layer / screen", "common", "screen"),
      C("Low-quality aftermarket screen fitted before", "common", "screen"),
      C("Screen protector or case pressing on the glass", "possible"),
      C("Noisy charger", "less"),
      C("Software", "less"),
    ],
  },
  {
    id: "battery_drain", label: "Battery drains fast / shuts off at 20-30%",
    checks: [
      "Check battery health and cycle count (iPhone: Settings > Battery > Battery Health; Samsung: Device care > Battery; Pixel: Settings > Battery).",
      "Look at which apps use the most battery.",
      "Check for swelling: screen lifting or back bulging.",
      "Weak mobile signal drains battery. Ask where it happens.",
    ],
    causes: [
      C("Worn battery (below about 80% health)", "common", "battery"),
      C("App or software drain", "common"),
      C("Weak signal / always searching for network", "possible"),
      C("Logic board current leak", "less"),
    ],
    brandNotes: {
      apple: "Apple treats a battery at or below 80% of original capacity as worn. iPhones may slow down to prevent unexpected shutdowns until the battery is replaced. On iPhone XR and later, a non-genuine battery shows an 'Important battery message' / Unknown Part.",
    },
    sources: ["apple_perf", "apple_battery", "apple_parts"],
  },
  {
    id: "battery_swollen", label: "Swollen battery / screen lifting",
    checks: [
      "Do NOT charge it and do NOT puncture or bend the battery.",
      "Power it off and work in a fire-safe area.",
      "Store the removed battery in a fireproof bag or metal bin, not in general waste.",
      "Check the screen and back glass for damage from the pressure.",
    ],
    causes: [
      C("Degraded battery", "common", "battery"),
      C("Screen damaged by the pressure", "possible", "screen"),
      C("Back glass / housing pushed out", "possible", "back_glass"),
    ],
  },
  {
    id: "biometrics", label: "Face ID / fingerprint not working",
    checks: [
      "Clean the sensors and remove the screen protector, then re-enrol.",
      "Ask whether the screen or front camera was repaired before.",
      "iPhone: check Parts and Service History for 'Finish Repair' or an issue notice.",
    ],
    causes: [
      C("Face ID (TrueDepth) parts damaged by a drop or liquid", "common", null, ["apple"]),
      C("Previous repair not finished or calibrated (shows 'Finish Repair')", "possible", null, ["apple"]),
      C("Earpiece / proximity flex damaged during a screen repair", "possible", "earpiece", ["apple"]),
      C("Screen replaced and fingerprint not re-enrolled or calibrated", "common", null, ["google", "samsung"]),
      C("Non-certified screen protector blocking the sensor", "common", null, ["google", "samsung"]),
      C("Display fitted is not compatible with the under-display sensor", "possible", "screen", ["google", "samsung"]),
    ],
    brandNotes: {
      apple: "Face ID parts are paired to the phone. If the TrueDepth parts are damaged, Face ID usually can't be fixed by swapping parts at a shop. Tell the customer before quoting.",
      google: "Google recommends 'Made for Google' certified screen protectors. Re-enrol fingerprints after fitting one.",
    },
    sources: ["apple_parts", "pixel_fp", "pixel_repair"],
  },
  {
    id: "camera", label: "Camera blurry, black, shaking or won't focus",
    checks: [
      "Clean the lens and remove the case and any magnetic accessories.",
      "Test every lens (wide, ultra wide, telephoto) and the front camera.",
      "Look for a cracked lens cover glass.",
      "Shaking or buzzing usually means the stabiliser in the camera is damaged.",
    ],
    causes: [
      C("Cracked camera lens cover glass", "common", "camera_lens"),
      C("Rear camera module failed or stabiliser damaged", "common", "rear_camera"),
      C("Front camera failed", "possible", "front_camera"),
      C("Software (restart and update)", "less"),
    ],
    brandNotes: {
      apple: "On iPhone 12 and later a replaced camera shows in Parts and Service History.",
    },
    sources: ["apple_parts"],
  },
  {
    id: "speaker", label: "No sound / low sound from speaker",
    checks: [
      "Clean the speaker mesh.",
      "Turn Bluetooth off. A stuck headphone or Bluetooth connection mutes the speaker.",
      "Test ringtone and media volume separately.",
    ],
    causes: [
      C("Speaker mesh blocked with dust", "common"),
      C("Loudspeaker failed", "possible", "loudspeaker"),
      C("Liquid damage", "possible", "loudspeaker"),
      C("Stuck Bluetooth or headphone mode (software)", "possible"),
    ],
  },
  {
    id: "calls_audio", label: "Caller can't hear me / can't hear the caller",
    checks: [
      "Record a voice memo and a video (they use different mics) and play them back.",
      "Test speakerphone and a normal call.",
      "Clean the earpiece and mic holes.",
      "Screen stays on during calls? Check the proximity sensor.",
    ],
    causes: [
      C("Blocked mic or earpiece mesh", "common"),
      C("Bottom microphone failed (on many models it sits on the charging-port flex)", "possible", "microphone"),
      C("Earpiece speaker failed", "possible", "earpiece"),
      C("Proximity sensor damaged during a screen repair", "less", "earpiece"),
    ],
  },
  {
    id: "no_service", label: "No service / SIM not detected / Wi-Fi or Bluetooth problems",
    checks: [
      "Test with a known-good SIM and check the eSIM.",
      "Dial *#06#: is the IMEI showing? A missing IMEI points to the board.",
      "Check the IMEI is not blocked (lost or stolen) and whether the phone is carrier-locked.",
      "Reset network settings.",
      "Wi-Fi switch greyed out usually means a board fault.",
    ],
    causes: [
      C("SIM, eSIM or carrier settings", "common"),
      C("SIM tray or reader damaged", "possible", "sim_tray"),
      C("Antenna cable or flex loose after a previous repair", "possible", "antenna"),
      C("Baseband / board fault after a drop", "less"),
    ],
  },
  {
    id: "liquid", label: "Liquid damage",
    checks: [
      "Do not charge it. Power off.",
      "Open it, disconnect the battery and inspect the liquid indicators and connectors for corrosion.",
      "Clean affected areas with isopropyl alcohol and let it dry fully.",
      "Test every function afterwards and tell the customer the result can't be guaranteed.",
    ],
    causes: [
      C("Corrosion on connectors", "common"),
      C("Screen damaged by liquid", "possible", "screen"),
      C("Charging port / speaker damaged by liquid", "possible", "charge_port"),
      C("Short circuit on the logic board", "possible"),
    ],
    brandNotes: {
      samsung: "A moisture alert in the charging port blocks wired charging until the port is dry. Wireless charging still works.",
    },
    sources: ["samsung_moisture"],
  },
  {
    id: "back_glass", label: "Cracked back glass / bent body",
    checks: [
      "Check the frame for bends and the camera lens cover for cracks.",
      "Check wireless charging and the flash work before starting.",
    ],
    causes: [
      C("Back glass cracked", "common", "back_glass"),
      C("Frame or housing bent", "possible", "housing"),
      C("Wireless charging coil damaged", "less", "wireless_coil"),
    ],
    brandNotes: {
      apple: "On iPhone 8 to 13 the back glass is bonded to the frame, so the job needs a laser or a full housing swap. iPhone 14 and 14 Plus, and the iPhone 15 range onward, were redesigned so the back glass can be replaced on its own (iPhone 14 Pro was not). Confirm for the exact model before quoting.",
    },
  },
  {
    id: "buttons", label: "Power / volume / mute button not working",
    checks: [
      "Remove the case. A tight case can hold buttons down.",
      "Check the frame around the button for dents.",
      "Use the on-screen accessibility button as a workaround for the customer meanwhile.",
    ],
    causes: [
      C("Button flex cable damaged", "common", "button_flex"),
      C("Dirt or liquid under the button", "possible"),
      C("Dent in the frame pressing the button", "possible", "housing"),
    ],
  },
  {
    id: "overheating", label: "Overheating",
    checks: [
      "Ask when it gets hot: charging, gaming, in the car, all the time?",
      "Check for swelling and battery health.",
      "Hot while switched off or idle points to a board short.",
    ],
    causes: [
      C("Heavy use, charging or a hot environment (normal)", "common"),
      C("Worn or swelling battery", "possible", "battery"),
      C("Faulty charger", "possible"),
      C("Short circuit after liquid or a drop", "less"),
    ],
  },
  {
    id: "software", label: "Software: stuck on logo, failed update, locked",
    checks: [
      "Try a restore with a computer (iPhone: Finder or iTunes; Samsung: Smart Switch; Pixel: Google's Pixel software repair page).",
      "Check storage isn't full.",
      "iCloud Activation Lock, Google account lock (FRP) or Samsung account lock can only be removed by the owner. Never buy or refurbish a locked phone.",
    ],
    causes: [
      C("Failed or interrupted update", "common"),
      C("Storage full", "possible"),
      C("Owner account lock still on (iCloud / Google / Samsung)", "common"),
    ],
    sources: ["pixel_repair"],
  },
];

export function brandKey(brand, model) {
  const s = `${brand || ""} ${model || ""}`.toLowerCase();
  if (/apple|iphone|ipad/.test(s)) return "apple";
  if (/samsung|galaxy/.test(s)) return "samsung";
  if (/google|pixel/.test(s)) return "google";
  return "other";
}

const SCORE = { common: 3, possible: 2, less: 1 };
export const LIKELIHOOD_LABEL = { common: "Most common", possible: "Possible", less: "Less common" };

// Combine the picked symptoms into one ranked list. A cause that shows up
// under several picked symptoms (for example a worn battery) moves up.
export function diagnose(symptomIds, brand, model) {
  const bk = brandKey(brand, model);
  const picked = SYMPTOMS.filter((s) => (symptomIds || []).includes(s.id));
  const causes = new Map();
  const parts = new Map();
  const checks = [], notes = [], sources = new Set();
  for (const s of picked) {
    s.checks.forEach((c) => checks.push({ symptom: s.label, text: c }));
    if (s.brandNotes && s.brandNotes[bk]) notes.push({ symptom: s.label, text: s.brandNotes[bk] });
    (s.sources || []).forEach((k) => sources.add(k));
    for (const c of s.causes) {
      if (c.brands && !c.brands.includes(bk)) continue;
      const key = c.text;
      const prev = causes.get(key);
      const score = SCORE[c.likelihood] + (prev ? prev.score : 0);
      causes.set(key, { ...c, score, from: [...(prev ? prev.from : []), s.label] });
      if (c.part) parts.set(c.part, Math.max(parts.get(c.part) || 0, SCORE[c.likelihood]) + (parts.has(c.part) ? 1 : 0));
    }
  }
  return {
    brand: bk,
    causes: [...causes.values()].sort((a, b) => b.score - a.score),
    parts: [...parts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => ({ id, ...PARTS[id] })),
    checks, notes,
    sources: [...sources].map((k) => SOURCES[k]).filter(Boolean),
  };
}

// Stock items whose name fits a suggested part (and the phone model, when the name mentions one).
export function stockFor(partId, stock, model) {
  const p = PARTS[partId];
  if (!p) return [];
  const m = String(model || "").toLowerCase().trim();
  const hits = (stock || []).filter((s) => p.match.some((w) => String(s.name || "").toLowerCase().includes(w)));
  const forModel = m ? hits.filter((s) => String(s.name || "").toLowerCase().includes(m)) : [];
  return forModel.length ? forModel : hits;
}

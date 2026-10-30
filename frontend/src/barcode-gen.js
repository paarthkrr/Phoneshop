// Simple Code128 barcode generator (SVG)
// For items without barcodes - generates unique barcode on add

export function generateBarcode(prefix = "MR") {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

// Real Code 128 (set B) as SVG, so printed labels scan with any barcode reader.
// Each symbol is 6 alternating bar/space widths (11 modules); the stop is 7 (13 modules).
const C128 = ["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"];
export function code128B(text) {
  const chars = String(text).split("").map((c) => Math.max(0, Math.min(94, c.charCodeAt(0) - 32)));
  let sum = 104; chars.forEach((v, i) => { sum += v * (i + 1); });
  return [104, ...chars, sum % 103, 106].map((v) => C128[v]).join("");
}
export function barcodeToSVG(code, opts = {}) {
  const { height = 60, module = 2, quiet = 10 } = opts;
  const widths = code128B(code).split("").map(Number);
  let x = quiet * module, rects = "";
  widths.forEach((w, i) => { if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${w * module}" height="${height - 16}" fill="#000"/>`; x += w * module; });
  const total = x + quiet * module;
  const esc = String(code).replace(/[<>&"]/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${height}" viewBox="0 0 ${total} ${height}"><rect width="${total}" height="${height}" fill="#fff"/>${rects}<text x="${total / 2}" y="${height - 3}" text-anchor="middle" font-size="12" font-family="monospace">${esc}</text></svg>`;
}

export function lookupByBarcode(inventory, code) {
  return inventory.find(item => item.barcode === code || item.imei === code || item.id === code);
}

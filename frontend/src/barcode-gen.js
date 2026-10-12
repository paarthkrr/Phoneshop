// Simple Code128 barcode generator (SVG)
// For items without barcodes - generates unique barcode on add

export function generateBarcode(prefix = "MR") {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

export function barcodeToSVG(code, opts = {}) {
  const { width = 200, height = 60, barWidth = 2 } = opts;
  // Simple visual representation - actual scanning uses the code string
  const bars = code.split("").map((c, i) => {
    const v = c.charCodeAt(0) % 3 + 1;
    return `<rect x="${i * (barWidth + 1)}" y="0" width="${v}" height="${height - 16}" fill="#000"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${code.length * 3} ${height}">
    ${bars}
    <text x="${(code.length * 3) / 2}" y="${height - 2}" text-anchor="middle" font-size="10" font-family="monospace">${code}</text>
  </svg>`;
}

export function lookupByBarcode(inventory, code) {
  return inventory.find(item => item.barcode === code || item.imei === code || item.id === code);
}

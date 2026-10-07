// Sign-in safety helpers: authenticator codes (TOTP), password rules and a
// readable device name. No outside services; works with any authenticator app
// (Google Authenticator, Microsoft Authenticator, 1Password, Authy...).
const crypto = require("crypto");

// ---- Authenticator codes (RFC 6238: 6 digits, 30 seconds, SHA-1) ----
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(buf) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  let bits = 0, value = 0; const out = [];
  for (const ch of String(str).toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
const newTotpSecret = () => base32Encode(crypto.randomBytes(20));
const currentStep = (now = Date.now()) => Math.floor(now / 30000);
function totpCode(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, "0");
}
// Accepts the current code or one 30s either side (phone clocks drift). A code
// that was already used (step <= lastStep) is refused, so an overheard code
// can't be replayed. Returns the matching step, or null.
function checkTotp(secret, code, lastStep = null, now = Date.now()) {
  const c = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const s0 = currentStep(now);
  for (const step of [s0 - 1, s0, s0 + 1]) {
    if (lastStep != null && step <= Number(lastStep)) continue;
    const a = Buffer.from(totpCode(secret, step)), b = Buffer.from(c);
    if (crypto.timingSafeEqual(a, b)) return step;
  }
  return null;
}
const otpauthUri = (username, secret) =>
  `otpauth://totp/${encodeURIComponent("Mobile Recellr")}:${encodeURIComponent(username)}?secret=${secret}&issuer=${encodeURIComponent("Mobile Recellr")}&digits=6&period=30`;

// Authenticator secrets are encrypted at rest with a key derived from
// SESSION_SECRET, so a copied database alone can't produce codes.
function secretBox(sessionSecret) {
  const key = crypto.createHash("sha256").update(`totp-at-rest:${sessionSecret}`).digest();
  return {
    seal(plain) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv("aes-256-gcm", key, iv);
      const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
      return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
    },
    open(sealed) {
      try {
        const [iv, tag, enc] = String(sealed).split(".").map((x) => Buffer.from(x, "base64"));
        const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
        d.setAuthTag(tag);
        return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
      } catch (e) { return null; }
    },
  };
}

// ---- Password rules ----
// Length matters far more than symbols, so: 12+ characters, not a well-known
// password, and not built from the username or the shop's name.
const MIN_PASSWORD = 12;
const COMMON = new Set(["123456789012", "1234567890123", "qwertyuiop12", "password1234", "password12345", "passwordpassword",
  "iloveyou1234", "welcome12345", "admin1234567", "administrator", "letmein12345", "qwerty123456", "abcdefghijkl",
  "111111111111", "000000000000", "aaaaaaaaaaaa", "1q2w3e4r5t6y", "qazwsxedcrfv", "changeme1234", "football1234",
  "sunshine1234", "princess1234", "monkey123456", "dragon123456", "baseball1234", "superman1234", "trustno11234"]);
function passwordProblem(password, username) {
  const p = String(password || "");
  if (p.length < MIN_PASSWORD) return `use at least ${MIN_PASSWORD} characters (a short sentence works well)`;
  if (p.length > 200) return "that password is too long";
  const low = p.toLowerCase();
  if (COMMON.has(low) || /^(.)\1+$/.test(p) || /^(0123456789|1234567890)/.test(low)) return "that password is too common — pick something less guessable";
  const squashed = low.replace(/[^a-z0-9]/g, "");
  const u = String(username || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (u.length >= 3 && squashed.replace(new RegExp(u, "g"), "").length < 6) return "don't build the password from your username";
  if (/(mobile)?recell?r/.test(squashed) && squashed.replace(/(mobile)?recell?r/g, "").length < 6) return "don't build the password from the shop's name";
  return null;
}

// ---- Device ----
function describeDevice(ua) {
  const s = String(ua || "");
  const browser = /Edg\//.test(s) ? "Edge" : /SamsungBrowser/.test(s) ? "Samsung Internet" : /Firefox\//.test(s) ? "Firefox"
    : /Chrome\//.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "a browser";
  const os = /iPhone/.test(s) ? "iPhone" : /iPad/.test(s) ? "iPad" : /Android/.test(s) ? "Android" : /Windows/.test(s) ? "Windows"
    : /Mac OS X|Macintosh/.test(s) ? "Mac" : /Linux/.test(s) ? "Linux" : "an unknown device";
  return `${browser} on ${os}`;
}

module.exports = { newTotpSecret, totpCode, checkTotp, currentStep, otpauthUri, secretBox, passwordProblem, MIN_PASSWORD, describeDevice };

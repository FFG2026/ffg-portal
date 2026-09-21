import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 32;
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;

function signingKey() {
  return process.env.ADMIN_SECRET || "";
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  }).toString("hex");
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = parts[4];
  const expected = parts[5];
  const actual = scryptSync(password, salt, KEYLEN, { N: n, r, p }).toString(
    "hex"
  );
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

export function signAdminSession(email: string) {
  const key = signingKey();
  if (!key) throw new Error("ADMIN_SECRET is not set");
  const payload = Buffer.from(
    JSON.stringify({
      e: email.trim().toLowerCase(),
      exp: Date.now() + SESSION_MS,
    })
  ).toString("base64url");
  const sig = createHmac("sha256", key).update(payload).digest("base64url");
  return `s.${payload}.${sig}`;
}

export function readAdminSession(token: string) {
  const key = signingKey();
  if (!key) return null;
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== "s") return null;
  const payload = parts[1];
  const sig = parts[2];
  const expected = createHmac("sha256", key).update(payload).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data?.e || typeof data.exp !== "number" || data.exp < Date.now()) {
      return null;
    }
    return { email: String(data.e) };
  } catch {
    return null;
  }
}

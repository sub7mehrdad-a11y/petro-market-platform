import crypto from "crypto";

// سیستم لاگینِ چندکاربره‌ی پلتفرم — جایگزین Basic Auth مشترک قبلی (middleware.js
// قدیمی). دو نقش: "viewer" (فقط مشاهده‌ی همه‌ی صفحات) و "commercial" (علاوه بر
// مشاهده، دسترسی به بخش‌های عملیاتی مثل /outreach). کاربران توی
// data/users.json ذخیره می‌شن؛ رمزها هرگز متن‌خام ذخیره نمی‌شن.
//
// عمداً بدون کتابخونه‌ی خارجی (نه bcrypt، نه jose/jsonwebtoken) — ماژول
// داخلی crypto نود برای هم هش رمز (scrypt) هم امضای نشست (HMAC-SHA256) کافیه
// و وابستگی جدیدی به پروژه اضافه نمی‌کنه.

const SESSION_COOKIE = "session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // ۳۰ روز

export const ROLES = ["viewer", "commercial"];

// -------------------------------------------------------------- هش رمز عبور
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

// ------------------------------------------------------------------ نشست
function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET تنظیم نشده — بدون این، هیچ نشستی امن امضا نمی‌شه.");
  }
  return secret;
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(payloadB64) {
  return crypto.createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
}

// payload: { username, role, exp } — exp به ثانیه (unix time)
export function createSessionToken(payload) {
  const payloadB64 = base64url(JSON.stringify(payload));
  const signature = sign(payloadB64);
  return `${payloadB64}.${signature}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return null;

  let expected;
  try {
    expected = sign(payloadB64);
  } catch {
    return null;
  }
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
  if (!payload.exp || Date.now() / 1000 > payload.exp) return null;
  return payload;
}

export function createSession(user) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  return createSessionToken({ username: user.username, role: user.role, exp });
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const SESSION_COOKIE_MAX_AGE = SESSION_MAX_AGE_SECONDS;

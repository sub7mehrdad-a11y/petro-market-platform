import { SESSION_COOKIE_NAME, verifySessionToken } from "../auth";

// «مدیر» مغز: فهرست نام‌کاربری‌ها در BRAIN_ADMINS (جداشده با ویرگول)؛ پیش‌فرض «admin». نقش‌ها (viewer/commercial) و
// ساختار نشست دست‌نخورده می‌ماند؛ مدیر بودن فقط از روی نام کاربری سنجیده می‌شود.
export function isBrainAdmin(username) {
  const list = String(process.env.BRAIN_ADMINS || "admin")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(String(username || "").toLowerCase());
}

/** نشست معتبر یک کاربر «بازرگانی» یا null. proxy.js هم مسیر را نگه می‌دارد؛ این دومین دروازه است. */
export function commercialSession(request) {
  const s = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  return s && s.role === "commercial" ? s : null;
}

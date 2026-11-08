// رله‌ی هوش مصنوعی (اختیاری). سرور لیارا در ایران است و گوگل (Gemini: «User location is not supported») و Groq (۴۰۳)
// درخواست‌های مستقیمش را رد می‌کنند. اگر AI_RELAY_URL تنظیم شود، درخواست‌ها به‌جای سرویس اصلی به یک رله‌ی بیرون از ایران
// (tools/ai-relay/worker.js روی Cloudflare Workers) می‌روند و آن رله به گوگل/Groq می‌فرستد. بدون این متغیر رفتار قبلی
// (مستقیم، یا از راه HTTPS_PROXY) دست‌نخورده است. کلید سرویس همان هدر همیشگی است؛ رمز رله جداست (AI_RELAY_TOKEN).

const DIRECT = { gemini: "https://generativelanguage.googleapis.com", groq: "https://api.groq.com" };

/** {url, headers} برای یک مسیر سرویس؛ path با «/» شروع می‌شود (مثلاً /v1beta/models/x:generateContent). */
export function upstream(service, path) {
  const relay = String(process.env.AI_RELAY_URL || "").trim().replace(/\/+$/, "");
  if (!relay) return { url: `${DIRECT[service]}${path}`, headers: {} };
  const token = process.env.AI_RELAY_TOKEN || "";
  return { url: `${relay}/${service}${path}`, headers: token ? { "x-relay-token": token } : {} };
}

/** پیام فارسی برای خطای «منطقه‌ی پشتیبانی‌نشده»؛ null اگر این خطا نیست. */
export function locationErrorFa(msg) {
  if (!/location is not supported/i.test(String(msg))) return null;
  return (
    "سرور سایت (لیارا) از ایران به سرویس هوش مصنوعی (Gemini/Groq) دسترسی ندارد. راه‌حل: رله‌ی tools/ai-relay را روی Cloudflare Workers بسازید " +
    "و در لیارا AI_RELAY_URL و AI_RELAY_TOKEN را بگذارید (یا یک HTTPS_PROXY بیرون از ایران)."
  );
}

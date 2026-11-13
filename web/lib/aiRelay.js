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

/** خطاهای «اتصال قطع شد» که معمولاً از سوکت keep-alive کهنه می‌آیند (طرف مقابل اتصال بیکار را بسته) و یک بار تلاش دوباره جوابشان را می‌دهد. */
const SOCKET_CODES = new Set(["UND_ERR_SOCKET", "ECONNRESET", "EPIPE", "UND_ERR_CLOSED"]);
export const isSocketError = (e) => SOCKET_CODES.has(e?.cause?.code || e?.code || "");

/** fn را اجرا می‌کند؛ اگر با خطای سوکت قطع شد، یک بار دوباره (با اتصال تازه) امتحان می‌کند. fn هر بار باید signal تازه بسازد. */
export async function retryOnSocketError(fn, { delayMs = 300 } = {}) {
  try {
    return await fn();
  } catch (e) {
    if (!isSocketError(e)) throw e;
    await new Promise((r) => setTimeout(r, delayMs));
    return fn();
  }
}

/** سقف زمان یک درخواست مدل (میلی‌ثانیه). بدون سقف، اگر رله/شبکه گیر کند صفحه تا ابد «در حال تحلیل» می‌ماند. AI_TIMEOUT_MS برای هر دو. */
export function aiTimeoutMs(service) {
  const env = Number(process.env.AI_TIMEOUT_MS);
  if (env > 0) return env;
  return service === "groq" ? 40000 : 70000;
}

/** خطای شبکه/زمان را به پیام فارسی روشن تبدیل می‌کند (علت واقعی را پنهان نمی‌کند: کد خطا هم می‌آید). */
export function netError(label, e) {
  const code = e?.cause?.code || e?.cause?.errors?.[0]?.code || e?.code || "";
  if (e?.name === "TimeoutError" || e?.name === "AbortError") {
    const relay = process.env.AI_RELAY_URL ? " (از راه رله‌ی Cloudflare)" : "";
    return new Error(`${label}: پاسخی در مهلت مجاز نیامد${relay}؛ اتصال سرور به سرویس هوش مصنوعی گیر کرده است.`);
  }
  return new Error(`${label}: اتصال برقرار نشد (${code || String(e?.cause?.message || e?.message || e).slice(0, 80)})`);
}

// بررسی پیش از ارسال آدرس ایمیل (برای جلوگیری از برگشتی و آسیب به اعتبار دامنه‌ی فرستنده):
//  ۱) آدرس نمونه/ساختگی (example@، test@، name@domain.com …) هرگز فرستاده نمی‌شود؛
//  ۲) دامنه باید رکورد MX داشته باشد. سرور ایمیل شرکت (SmarterMail) دامنه‌ی بدون MX را حتی با داشتن رکورد A برمی‌گرداند
//     (کد ۶۰۲ «No MX records»)، پس همین سخت‌گیری را اینجا هم داریم. دامنه‌ای که اصلاً وجود ندارد (ENOTFOUND) هم رد می‌شود؛
//  ۳) خطای موقتِ DNS (تایم‌اوت، SERVFAIL) رد نیست: ارسال به تعویق می‌افتد و بعداً دوباره بررسی می‌شود.
// این بررسی فقط صندوق را نمی‌بیند (وجود کاربر را فقط سرور مقصد می‌داند)؛ برای آن راه‌حل، اصلاح آدرس از سایت خود شرکت است.
// (dns به‌صورت تنبل بارگذاری می‌شود تا import این فایل در بسته‌ی سمت مرورگر مشکلی نسازد)
const defaultResolveMx = async (d) => (await import("node:dns/promises")).resolveMx(d);

const PLACEHOLDER_LOCAL = /^(example|test|sample|demo|name|user|email|mail|your|you|yourmail|abc|xyz|filler|noreply|no-reply|john|johndoe|hello|hi)$/i;
const PLACEHOLDER_DOMAIN = /^(example\.(com|org|net|gr)|domain\.com|email\.com|mail\.com|company\.com|yoursite\.com|your\.mail\.com|sample\.com|businessname\.com|adresse\.com|xyz\.com|abc\.(abc|com)|webmail\.com|test\.com)$/i;

export function isPlaceholderEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return false;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (PLACEHOLDER_DOMAIN.test(domain)) return true;
  // «example@gmail.com» و مانند آن: بخش محلی ساختگی روی دامنه‌ی عمومی
  return /^(example|test|sample|demo|yourmail|youremail|name|email)$/i.test(local) || (PLACEHOLDER_LOCAL.test(local) && /^(gmail\.com|mail\.com|email\.com|domain\.com)$/i.test(domain));
}

const TEMP_CODES = new Set(["ESERVFAIL", "ETIMEOUT", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN", "ECONNRESET", "EREFUSED"]);
const OK_TTL = 24 * 3600 * 1000;
const TEMP_TTL = 5 * 60 * 1000;
const cache = new Map(); // domain -> { at, ttl, result }

/**
 * {ok:true} | {ok:false, permanent:true, reason} | {ok:false, permanent:false, reason}
 * resolveMx قابل‌تزریق برای آزمون. cache قابل‌تزریق نیست؛ از clearEmailCheckCache استفاده کن.
 */
export async function checkEmailDeliverable(email, { resolveMx = defaultResolveMx, now = Date.now() } = {}) {
  const e = String(email || "").trim().toLowerCase();
  if (isPlaceholderEmail(e)) return { ok: false, permanent: true, reason: "آدرس نمونه/ساختگی است (مثل example@…)" };
  const at = e.lastIndexOf("@");
  if (at < 1 || at === e.length - 1) return { ok: false, permanent: true, reason: "فرمت آدرس نامعتبر است" };
  const domain = e.slice(at + 1);
  const hit = cache.get(domain);
  if (hit && now - hit.at < hit.ttl) return hit.result;
  let result;
  try {
    const mx = await resolveMx(domain);
    const real = (mx || []).filter((r) => r && r.exchange && r.exchange !== ".");
    result = real.length ? { ok: true } : { ok: false, permanent: true, reason: `دامنه‌ی ${domain} رکورد MX ندارد (سرور ایمیل ندارد)` };
  } catch (err) {
    const code = err?.code || "";
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN") result = { ok: false, permanent: true, reason: code === "ENODATA" ? `دامنه‌ی ${domain} رکورد MX ندارد (سرور ایمیل ندارد)` : `دامنه‌ی ${domain} وجود ندارد` };
    else if (TEMP_CODES.has(code)) result = { ok: false, permanent: false, reason: `بررسی DNS دامنه‌ی ${domain} موقتاً ممکن نشد (${code})` };
    else result = { ok: false, permanent: false, reason: `بررسی DNS دامنه‌ی ${domain} ناموفق بود (${code || String(err?.message || err).slice(0, 60)})` };
  }
  cache.set(domain, { at: now, ttl: result.ok || result.permanent ? OK_TTL : TEMP_TTL, result });
  return result;
}

export const clearEmailCheckCache = () => cache.clear();

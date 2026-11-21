import fs from "fs";
import path from "path";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import { resolveProxyUrl } from "./groqFetch";
import { aiTimeoutMs, netError, retryOnSocketError, upstream } from "./aiRelay";


// بدون پراکسی از fetch داخلی Node استفاده می‌شود: روی لیارا (۲۰۲۶-۱۱-۲۱) بسته‌ی undici درخواست POST به رله را بی‌جواب می‌گذاشت، ولی fetch داخلی فوری جواب می‌گرفت.
const aiFetch = (dispatcher) => (dispatcher ? undiciFetch : fetch);


/**
 * کلید API را پیدا می‌کند — مخصوص بخش «پاسخ هوشمند» توی /ask، عمداً از یک توکن
 * جدا (GEMINI_API_KEY_ASK) استفاده می‌کند تا سؤال‌های کاربران سهمیه‌ی روزانه‌ی
 * ایجنت‌های خودکار (scripts/*.py، که با GEMINI_API_KEY کار می‌کنند) را نخوابانَد.
 * اگر توکن جدا تنظیم نشده باشد، به همان توکن مشترک قدیمی برمی‌گردد (سازگار با
 * قبل). اول از متغیرهای محیطی، و اگر نبود از فایل .env ریشه‌ی پروژه.
 */
export function resolveApiKey() {
  const fromEnv =
    process.env.GEMINI_API_KEY_ASK ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY;
  if (fromEnv) return fromEnv;

  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "..", ".env"), "utf-8");
    const match =
      raw.match(/^\s*GEMINI_API_KEY_ASK\s*=\s*(.+?)\s*$/m) ||
      raw.match(/^\s*(?:GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*(.+?)\s*$/m);
    return match ? match[1].replace(/^["']|["']$/g, "") : null;
  } catch {
    return null;
  }
}

/**
 * چرا این فایل وجود دارد (مهم برای نگه‌داری بعدی):
 *
 * SDK رسمی جاوااسکریپت گوگل (@google/genai) روی این ماشین با خطای ۴۰۳ برمی‌گشت،
 * در حالی که SDK پایتون با همان کلید کار می‌کرد. علتش کلید یا endpoint نبود —
 * روی این سیستم یک پراکسی محلی (VPN) تنظیم شده و:
 *   - پایتون (httpx) متغیر HTTPS_PROXY را خودکار رعایت می‌کند → درخواست از پراکسی رد می‌شود.
 *   - fetch داخلی Node (undici) متغیرهای پراکسی را کاملاً نادیده می‌گیرد → درخواست
 *     مستقیم می‌رود و گوگل آن را مسدود می‌کند.
 *
 * پس این‌جا خودمان ProxyAgent را وقتی متغیر پراکسی ست شده باشد به undici می‌دهیم.
 * اگر پراکسی تنظیم نشده باشد (مثلاً روی سرور شرکت با دسترسی مستقیم)، همان fetch
 * معمولی استفاده می‌شود و چیزی خراب نمی‌شود.
 */
// آدرس پراکسی از همان جایی خوانده می‌شود که groqFetch می‌خواند — متغیر محیطی و
// اگر نبود، خط HTTPS_PROXY در فایل .env ریشه‌ی پروژه. دلیلش آن‌جا توضیح داده شده.
function getDispatcher() {
  const proxy = resolveProxyUrl();
  return proxy ? new ProxyAgent(proxy) : undefined;
}

// contents: برای گفت‌وگوی چندنوبتی [{role:"user"|"model", parts:[{text}]}] (اگر نباشد، یک نوبت از input ساخته می‌شود).
// generationConfig: مثلاً {temperature, maxOutputTokens, responseMimeType} — اختیاری؛ بدون آن رفتار قبلی حفظ می‌شود.
// retries: تعداد تلاش دوباره برای خطای گذرا (۴۲۹/۵۰۳ «تقاضای زیاد»، قطع اتصال، مهلت)، با فاصله‌ی ۴ و ۱۰ و ۲۰ ثانیه. پیش‌فرض صفر (رفتار قبلی).
const TRANSIENT_RE = /\b(429|500|502|503|504)\b|ECONNRESET|UND_ERR|EPIPE|اتصال برقرار نشد|مهلت مجاز/;
export async function generateContent(opts) {
  const retries = Math.max(0, Number(opts.retries) || 0);
  for (let attempt = 0; ; attempt++) {
    try {
      return await generateContentOnce(opts);
    } catch (err) {
      if (attempt >= retries || !TRANSIENT_RE.test(String(err?.message || err))) throw err;
      await new Promise((r) => setTimeout(r, [4000, 10000, 20000][attempt] || 20000));
    }
  }
}

async function generateContentOnce({ apiKey, model, systemInstruction, input, contents, generationConfig, timeoutMs }) {
  const dispatcher = getDispatcher();

  const up = upstream("gemini", `/v1beta/models/${model}:generateContent`);
  const res = await retryOnSocketError(() => aiFetch(dispatcher)(up.url, {
    signal: AbortSignal.timeout(timeoutMs || aiTimeoutMs("gemini")),
    method: "POST",
    headers: {
      ...up.headers,
      "Content-Type": "application/json",
      // احراز هویت حتماً باید هدر باشد؛ کلیدهای جدید با فرمت "AQ." روی
      // پارامتر ?key= کار نمی‌کنند.
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: contents || [{ role: "user", parts: [{ text: input }] }],
      ...(generationConfig ? { generationConfig } : {}),
    }),
    ...(dispatcher ? { dispatcher } : {}),
  })).catch((e) => { throw netError("Gemini", e); });

  const raw = await res.text();

  if (!res.ok) {
    let detail = raw.slice(0, 300);
    try {
      detail = JSON.parse(raw)?.error?.message || detail;
    } catch {
      // پاسخ HTML بوده (مثل صفحه‌ی خطای گوگل) — همان متن خام کافی است
    }
    throw new Error(`Gemini ${res.status}: ${detail}`);
  }

  const json = JSON.parse(raw);
  const text = json?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text)
    .filter(Boolean)
    .join("\n");

  if (!text) throw new Error("پاسخ خالی از سرویس هوش مصنوعی دریافت شد.");
  return text;
}

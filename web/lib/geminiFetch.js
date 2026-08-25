import fs from "fs";
import path from "path";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import { resolveProxyUrl } from "./groqFetch";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

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

export async function generateContent({ apiKey, model, systemInstruction, input }) {
  const dispatcher = getDispatcher();

  const res = await undiciFetch(`${BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // احراز هویت حتماً باید هدر باشد؛ کلیدهای جدید با فرمت "AQ." روی
      // پارامتر ?key= کار نمی‌کنند.
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: input }] }],
    }),
    ...(dispatcher ? { dispatcher } : {}),
  });

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

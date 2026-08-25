import fs from "fs";
import path from "path";
import { ProxyAgent, fetch as undiciFetch } from "undici";

const BASE = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";

/**
 * موتور پشتیبان Gemini — یک شرکت کاملاً جدا (Groq)، سهمیه‌ی کاملاً مستقل.
 * برای وقتی هر دو توکن Gemini (اصلی + /ask) به سهمیه‌ی روزانه خوردن.
 */
export function resolveGroqApiKey() {
  const fromEnv = process.env.GROQ_API_KEY;
  if (fromEnv) return fromEnv;

  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "..", ".env"), "utf-8");
    const match = raw.match(/^\s*GROQ_API_KEY\s*=\s*(.+?)\s*$/m);
    return match ? match[1].replace(/^["']|["']$/g, "") : null;
  } catch {
    return null;
  }
}

/**
 * آدرس پراکسی — اول از متغیر محیطی، بعد از فایل .env ریشه‌ی پروژه.
 *
 * چرا خواندن از .env هم لازم شد (۲۰۲۶-۰۸-۲۵): سرویس‌های Groq و Gemini از ایران
 * مستقیم در دسترس نیستند و خطای ۴۰۳ می‌دهند. پراکسی محلی روی سیستم فعال بود، ولی
 * فقط داخل ترمینال تنظیم شده بود — نه در متغیرهای محیطی ویندوز. برای همین وقتی
 * سایت با «اجرای-سایت.bat» بالا می‌آمد، پروسه‌ی Node هیچ پراکسی‌ای نمی‌دید و
 * «پاسخ هوشمند» با ۴۰۳ شکست می‌خورد، در حالی که همان درخواست از ترمینال کار می‌کرد.
 * حالا کافی است یک خط HTTPS_PROXY در همان .env کنار کلیدها باشد.
 */
export function resolveProxyUrl() {
  const fromEnv =
    process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy;
  if (fromEnv) return fromEnv;

  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "..", ".env"), "utf-8");
    const match = raw.match(/^\s*(?:HTTPS_PROXY|HTTP_PROXY)\s*=\s*(.+?)\s*$/im);
    return match ? match[1].replace(/^["']|["']$/g, "") : null;
  } catch {
    return null;
  }
}

function getDispatcher() {
  const proxy = resolveProxyUrl();
  return proxy ? new ProxyAgent(proxy) : undefined;
}

// سقف سرویس رایگان Groq: ۸۰۰۰ توکن در دقیقه. نکته‌ی حیاتی این است که Groq مجموع
// «توکن پرامپت + max_tokens درخواستی» را *پیش از اجرا* با این سقف می‌سنجد، نه مصرف
// واقعی را. پس اگر پرامپت بزرگ باشد یا max_tokens سخاوتمندانه، همیشه خطای ۴۱۳
// می‌گیریم. همان درسی که در scripts/groq_utils.py گرفتیم، این‌جا هم لازم است.
const TPM_LIMIT = 8000;
const TPM_MARGIN = 500;

/** تخمین محافظه‌کارانه‌ی توکن؛ فارسی حدود ۲.۵ کاراکتر به‌ازای هر توکن است. */
function estimateTokens(text) {
  return Math.ceil((text || "").length / 2.5) + 1;
}

export async function generateGroqContent({ apiKey, model = DEFAULT_MODEL, systemInstruction, input, maxTokens = 4000 }) {
  const dispatcher = getDispatcher();
  const messages = [];
  if (systemInstruction) messages.push({ role: "system", content: systemInstruction });
  messages.push({ role: "user", content: input });

  const promptTokens = estimateTokens(systemInstruction) + estimateTokens(input);
  const budget = TPM_LIMIT - TPM_MARGIN - promptTokens;
  if (budget < 400) {
    throw new Error(
      `پرامپت بزرگ‌تر از سهمیه‌ی Groq است (تخمین ${promptTokens} توکن). متن ورودی باید کوتاه‌تر شود.`
    );
  }
  if (maxTokens > budget) maxTokens = budget;

  const res = await undiciFetch(BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    // max_tokens صریح چون پیش‌فرض Groq برای خروجی‌های طولانی کافی نیست.
    body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
    ...(dispatcher ? { dispatcher } : {}),
  });

  const raw = await res.text();
  if (!res.ok) {
    let detail = raw.slice(0, 300);
    try {
      detail = JSON.parse(raw)?.error?.message || detail;
    } catch {
      // پاسخ HTML بود (مثل صفحه‌ی خطای Cloudflare) — متن خام کافیه
    }
    throw new Error(`Groq ${res.status}: ${detail}`);
  }

  const json = JSON.parse(raw);
  const text = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error("پاسخ خالی از Groq دریافت شد.");
  return text;
}

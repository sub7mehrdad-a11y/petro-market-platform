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

function getDispatcher() {
  const proxy =
    process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy;
  return proxy ? new ProxyAgent(proxy) : undefined;
}

export async function generateGroqContent({ apiKey, model = DEFAULT_MODEL, systemInstruction, input }) {
  const dispatcher = getDispatcher();
  const messages = [];
  if (systemInstruction) messages.push({ role: "system", content: systemInstruction });
  messages.push({ role: "user", content: input });

  const res = await undiciFetch(BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages }),
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

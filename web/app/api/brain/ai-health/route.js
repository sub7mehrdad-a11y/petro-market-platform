import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { BRAIN_MODEL, resolveBrainKey } from "@/lib/brain";
import { generateContent } from "@/lib/geminiFetch";

// بررسی سریع اتصال سرور به هوش مصنوعی: (۱) رله‌ی Cloudflare زنده است؟ (۲) Gemini به یک درخواست کوچک جواب می‌دهد؟ فقط نقش «بازرگانی».
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function timed(fn) {
  const t0 = Date.now();
  try { return { ok: true, ms: Date.now() - t0, ...(await fn()) }; } catch (e) { return { ok: false, ms: Date.now() - t0, error: String(e?.message || e).slice(0, 200) }; }
}

export async function GET(request) {
  const s = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (s?.role !== "commercial") return NextResponse.json({ error: "دسترسی ندارید." }, { status: 403 });
  const relay = String(process.env.AI_RELAY_URL || "").trim().replace(/\/+$/, "");
  const asked = request.nextUrl.searchParams.get("model") || "";
  const model = /^[\w.\-]{3,60}$/.test(asked) ? asked : BRAIN_MODEL;
  const out = { model, relay_configured: !!relay, timeout_ms: Number(process.env.AI_TIMEOUT_MS) || null };
  // رله بدون رمز باید سریع ۴۰۳ بدهد؛ جواب‌ندادن یعنی مسیر سرور ← رله قطع است
  if (relay) out.relay = await timed(async () => { const r = await fetch(`${relay}/gemini/v1beta/models/x:generateContent`, { method: "POST", body: "{}", signal: AbortSignal.timeout(12000) }); return { status: r.status }; });
  // fetch ساده‌ی Node با کلید نامعتبر: اگر سریع ۴۰۰ بدهد یعنی مسیر سرور←رله←گوگل سالم است و مشکل از undici/پراکسی است
  if (relay) out.raw = await timed(async () => {
    const r = await fetch(`${relay}/gemini/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-relay-token": process.env.AI_RELAY_TOKEN || "", "x-goog-api-key": "invalid-key-probe" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "ping" }] }] }), signal: AbortSignal.timeout(15000) });
    return { status: r.status, body: (await r.text()).slice(0, 120) };
  });
  out.proxy_env = !!(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy);
  const key = resolveBrainKey();
  out.gemini = key ? await timed(async () => ({ text: (await generateContent({ apiKey: request.nextUrl.searchParams.get("probe") === "badkey" ? "invalid-key-probe" : key, model, systemInstruction: "Reply with one word.", input: "ping", generationConfig: { maxOutputTokens: 32 }, timeoutMs: Math.min(100000, Math.max(5000, Number(request.nextUrl.searchParams.get("t")) * 1000 || 25000)) })).slice(0, 40) })) : { ok: false, error: "کلید مغز تنظیم نشده." };
  return NextResponse.json(out);
}

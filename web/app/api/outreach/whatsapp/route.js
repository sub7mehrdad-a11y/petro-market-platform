import { NextResponse } from "next/server";
import { getEmailOutreachSent } from "@/lib/data";
import { WA_ACTIONS, WA_LANGS, getWhatsAppLeads, localLanguageFor, readWhatsAppState, recordWhatsApp, renderWhatsAppMessage, whatsAppStateProblem } from "@/lib/outreachWhatsApp";

// واتساپ نیمه‌خودکار: سرور فقط متن را می‌سازد و وضعیت را ثبت می‌کند؛ هیچ پیامی از سرور نمی‌رود.
// دسترسی: پیشوند /api/outreach در proxy.js فقط برای نقش بازرگانی باز است.
export const dynamic = "force-dynamic";

const sendingEnabled = () => process.env.OUTREACH_SENDING_ENABLED === "true";

export async function GET() {
  const state = readWhatsAppState().items;
  const emailed = new Set(getEmailOutreachSent().map((r) => String(r.email || "").trim().toLowerCase()));
  let missing = [];
  const rows = getWhatsAppLeads().map((lead) => {
    const messages = Object.fromEntries(WA_LANGS.map((l) => [l, renderWhatsAppMessage(lead, l)]));
    const m = messages.en;
    missing = [...new Set([...missing, ...m.missing_catalog])];
    const st = state[lead.id] || null;
    return {
      id: lead.id, name: lead.name, country: lead.country_en, website: lead.website, number: lead.wa_display, wa: String(lead.wa_e164).replace(/\D/g, ""), source_url: lead.wa_source_url,
      exhibition: lead.exhibition, match: lead.match, grade: m.grade, same_number_as: lead.same_number_as || [],
      // site_link = خودِ سایت لینک واتساپ گذاشته؛ mobile_unverified = فقط موبایل معتبر، ثبت‌بودن در واتساپ تأیید نشده
      wa_basis: lead.wa_basis || "site_link", priority: Number.isFinite(lead.priority) ? lead.priority : null,
      emailed: !!lead.email && emailed.has(String(lead.email).trim().toLowerCase()),
      local_lang: localLanguageFor(lead.country_en), messages: Object.fromEntries(WA_LANGS.map((l) => [l, messages[l].text])),
      status: st?.status || "new", opened_at: st?.opened_at || null, sent_at: st?.sent_at || null,
    };
  });
  return NextResponse.json({ rows, sending_enabled: sendingEnabled(), state_problem: whatsAppStateProblem(), missing_catalog_env: missing });
}

export async function POST(request) {
  let b;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 }); }
  if (!WA_ACTIONS.includes(b?.action) || typeof b.id !== "string") return NextResponse.json({ error: "عملیات نامعتبر است." }, { status: 400 });
  if (!getWhatsAppLeads().some((l) => l.id === b.id)) return NextResponse.json({ error: "شرکت پیدا نشد." }, { status: 404 });
  if (b.action === "opened" && !sendingEnabled()) return NextResponse.json({ error: "ارسال هنوز فعال نشده (در انتظار تأیید هیئت‌مدیره)." }, { status: 403 });
  const problem = whatsAppStateProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 500 });
  const item = recordWhatsApp(b.id, b.action, { text: typeof b.text === "string" ? b.text : undefined, lang: WA_LANGS.includes(b.lang) ? b.lang : undefined });
  return NextResponse.json({ ok: true, status: item?.status || "new" });
}

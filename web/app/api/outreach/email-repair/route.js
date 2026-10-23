import { NextResponse } from "next/server";
import { getCompanies } from "@/lib/data";
import { getCompanyEmailStatuses } from "@/lib/outreachCompanyStatus";
import { searchRepair, approveRepair, rejectRepair } from "@/lib/outreachEmailRepair";

// اصلاح ایمیل شرکت‌های برگشتی: search (جست‌وجوی ایمیل صحیح از سایت شرکت) | approve (جایگزینی با پیشنهاد) | reject.
// فقط نقش «بازرگانی» (proxy.js، پیشوند /api/outreach) و فقط وقتی رابط ایمیل روشن است. هیچ ایمیلی ارسال نمی‌شود.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  if (process.env.OUTREACH_UI_ENABLED !== "true") return NextResponse.json({ error: "غیرفعال" }, { status: 404 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }
  const { action, companyId } = body || {};
  const company = getCompanies().find((c) => c.id === companyId);
  if (!company) return NextResponse.json({ error: "شرکت پیدا نشد." }, { status: 404 });

  let result;
  if (action === "search") {
    // فقط شرکتی که ایمیلش «برگشت قطعی با علت آدرس غلط» خورده
    const { companies } = await getCompanyEmailStatuses({ country: company.country });
    const s = companies[companyId];
    if (!s?.bounced || !s.bounce?.wrong_address) {
      return NextResponse.json({ error: "ایمیل این شرکت برگشت قطعی (صندوق/دامنه‌ی ناموجود) نخورده است." }, { status: 400 });
    }
    result = await searchRepair(companyId, { badEmail: s.email, bounce: s.bounce });
  } else if (action === "approve") {
    result = approveRepair(companyId, { by: "manual" });
  } else if (action === "reject") {
    result = rejectRepair(companyId);
  } else {
    return NextResponse.json({ error: "عملیات نامعتبر است." }, { status: 400 });
  }
  if (!result.ok) return NextResponse.json({ error: result.error || "ناموفق" }, { status: 400 });
  const { companies } = await getCompanyEmailStatuses({ country: company.country });
  return NextResponse.json({ ok: true, status: companies[companyId] || null });
}

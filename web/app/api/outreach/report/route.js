import { NextResponse } from "next/server";
import { getCompanies, getEmailOutreachSent } from "@/lib/data";
import { buildOutreachReport } from "@/lib/outreachReport";

// گزارش عملکرد ایمیل معرفی (از روی لاگ ارسال + هدرهای صندوق ورودی). فقط نقش «بازرگانی».
// خواندن IMAP چند ثانیه تا ~یک دقیقه طول می‌کشه؛ پس فقط با درخواست صریح اجرا می‌شه.
export const dynamic = "force-dynamic";

export async function GET(request) {
  const raw = new URL(request.url).searchParams.get("days") || "7";
  const days = raw === "all" ? null : Math.min(Math.max(parseInt(raw, 10) || 7, 1), 365);
  try {
    const report = await buildOutreachReport({
      sentRecords: getEmailOutreachSent(),
      companies: getCompanies(),
      days,
    });
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      { error: `خواندن صندوق ورودی ناموفق بود: ${String(err?.message || err)}` },
      { status: 502 }
    );
  }
}

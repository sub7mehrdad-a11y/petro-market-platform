import { NextResponse } from "next/server";
import { getAutoStatus, runDaily, runWeeklyReport, startOutreachAuto } from "@/lib/outreachAuto";

// وضعیت ارسال خودکار + اجرای دستی گزارش. فقط نقش «بازرگانی» (proxy.js روی /api/outreach).
export const dynamic = "force-dynamic";

export async function GET() {
  startOutreachAuto(); // اگه به هر دلیل از instrumentation بالا نیومده بود
  return NextResponse.json(getAutoStatus());
}

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {}
  const { action } = body;

  if (action === "send_report") {
    // گزارش همین الان برای آدرس OUTREACH_REPORT_TO (بدون CC) — صندوق ورودی خونده می‌شه؛ تا ~۲ دقیقه.
    const r = await runWeeklyReport({ force: true });
    if (r.error) return NextResponse.json({ error: r.error }, { status: 502 });
    if (r.skipped) return NextResponse.json({ error: "آدرس گیرنده‌ی گزارش (OUTREACH_REPORT_TO) تنظیم نشده." }, { status: 400 });
    return NextResponse.json({ ok: true, to: r.to_masked, sent_total: r.totals?.sent ?? null });
  }

  if (action === "run_daily") {
    // فقط در حالت تست (OUTREACH_TEST_REDIRECT) اجازه‌ی اجرای دستی دسته‌ی روزانه داریم؛ در حالت واقعی
    // فقط زمان‌بند، روزی یک‌بار، دسته رو می‌چینه (تا اشتباهی دو بار ۱۵ ایمیل نره).
    if (!(process.env.OUTREACH_TEST_REDIRECT || "").trim()) {
      return NextResponse.json({ error: "اجرای دستی دسته‌ی روزانه فقط در حالت تست (OUTREACH_TEST_REDIRECT) مجازه." }, { status: 403 });
    }
    return NextResponse.json(runDaily({ force: true }));
  }

  return NextResponse.json({ error: "اقدام نامعتبر." }, { status: 400 });
}

import { NextResponse } from "next/server";
import { getFollowupStatus, pollReplies, runReminders, startOutreachFollowup } from "@/lib/outreachFollowup";

// وضعیت یادآوری و فوروارد پاسخ مشتری. فقط نقش «بازرگانی» (proxy.js روی /api/outreach).
export const dynamic = "force-dynamic";

export async function GET() {
  startOutreachFollowup();
  return NextResponse.json(getFollowupStatus());
}

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const testMode = !!(process.env.OUTREACH_TEST_REDIRECT || "").trim();

  if (body.action === "poll_now") {
    // خواندن صندوق ورودی و فوروارد پاسخ‌های جدید همین الان (اگر OUTREACH_FORWARD_ENABLED روشن باشد).
    const r = await pollReplies();
    if (r.error) return NextResponse.json({ error: r.error }, { status: 502 });
    return NextResponse.json(r);
  }
  if (body.action === "run_reminders") {
    // مثل run_daily: اجرای دستی فقط در حالت تست؛ در حالت واقعی فقط زمان‌بند، روزی یک‌بار.
    if (!testMode) return NextResponse.json({ error: "اجرای دستی یادآوری فقط در حالت تست (OUTREACH_TEST_REDIRECT) مجازه." }, { status: 403 });
    return NextResponse.json(await runReminders({ force: true }));
  }
  return NextResponse.json({ error: "اقدام نامعتبر." }, { status: 400 });
}

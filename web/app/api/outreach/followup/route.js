import { NextResponse } from "next/server";
import { auditReplies, getFollowupStatus, pollReplies, runReminders, startOutreachFollowup } from "@/lib/outreachFollowup";
import { reminderSamples } from "@/lib/outreachReminderText.js";
import { loadAutoConfig } from "@/lib/outreachAuto";

// وضعیت یادآوری و فوروارد پاسخ مشتری. فقط نقش «بازرگانی» (proxy.js روی /api/outreach).
export const dynamic = "force-dynamic";

export async function GET(request) {
  // نمونه‌ی متن یادآوری به‌تفکیک زبان برای بازبینی: ?preview=1
  if (new URL(request.url).searchParams.get("preview")) {
    const auto = loadAutoConfig();
    return NextResponse.json({ local_language: auto.reminder_local_language, english_copy: auto.reminder_english_copy, samples: reminderSamples({ englishCopy: auto.reminder_english_copy }) });
  }
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
  if (body.action === "audit_replies") {
    // ممیزی پاسخ‌های فوروارد‌نشده؛ forward:true پاسخ‌های مطابق و فوروارد‌نشده را برای همکار می‌فرستد.
    const r = await auditReplies({ forward: body.forward === true });
    if (r.error && !r.scanned) return NextResponse.json({ error: r.error }, { status: 502 });
    return NextResponse.json(r);
  }
  if (body.action === "run_reminders") {
    // مثل run_daily: اجرای دستی فقط در حالت تست؛ در حالت واقعی فقط زمان‌بند، روزی یک‌بار.
    if (!testMode) return NextResponse.json({ error: "اجرای دستی یادآوری فقط در حالت تست (OUTREACH_TEST_REDIRECT) مجازه." }, { status: 403 });
    return NextResponse.json(await runReminders({ force: true }));
  }
  return NextResponse.json({ error: "اقدام نامعتبر." }, { status: 400 });
}

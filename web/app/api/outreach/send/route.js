import { NextResponse } from "next/server";
import { checkOutreachReady, enqueueCompanies, getQueueSettings, startOutreachWorker } from "@/lib/outreachQueue";

// این API دیگه مستقیم ایمیل نمی‌فرسته — شرکت‌ها رو «در صف می‌ذاره»؛ کارگر پس‌زمینه
// (web/lib/outreachQueue.js) هر N ثانیه (پیش‌فرض ۶۰) یک ایمیل می‌فرسته. دلیل: ارسال
// پشت‌سرهم ریسک اسپم‌شدن/بلاک دامنه داره. سقف هر درخواست بالاتره چون فقط صف‌گذاریه.
const MAX_BATCH_SIZE = 500;

export async function POST(request) {
  // دروازه‌ی تأیید: تا وقتی این متغیر محیطی صراحتاً "true" نباشه، چیزی در صف هم نمی‌ره.
  if (process.env.OUTREACH_SENDING_ENABLED !== "true") {
    return NextResponse.json(
      { error: "ارسال واقعی هنوز فعال نشده (OUTREACH_SENDING_ENABLED)." },
      { status: 403 }
    );
  }

  let companyIds;
  try {
    ({ companyIds } = await request.json());
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }
  if (!Array.isArray(companyIds) || companyIds.length === 0) {
    return NextResponse.json({ error: "هیچ شرکتی انتخاب نشده." }, { status: 400 });
  }
  if (companyIds.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `حداکثر ${MAX_BATCH_SIZE} شرکت در هر درخواست — لطفاً انتخاب رو کمتر کن.` },
      { status: 400 }
    );
  }

  const problem = checkOutreachReady();
  if (problem) {
    return NextResponse.json({ error: problem }, { status: 500 });
  }

  // اگه به هر دلیل کارگر بالا نیومده بود (مثلاً محیط توسعه‌ی بدون instrumentation) همین‌جا شروعش کن.
  startOutreachWorker();

  const { queued, skipped } = enqueueCompanies(companyIds);
  const { intervalSec, dailyLimit, testRedirect } = getQueueSettings();
  return NextResponse.json({
    queued,
    skipped,
    interval_sec: intervalSec,
    daily_limit: dailyLimit,
    test_redirect: !!testRedirect,
  });
}

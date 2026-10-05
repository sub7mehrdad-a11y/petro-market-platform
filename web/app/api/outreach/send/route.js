import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { FIXED_ATTACHMENTS } from "@/lib/outreachTemplate";
import { getOutreachSentStatePath } from "@/lib/data";
import { enqueueCompanies, getQueueSettings, startOutreachWorker } from "@/lib/outreachQueue";

const ROOT = path.join(process.cwd(), "..");
const RESOLVED_FIXED_ATTACHMENTS = FIXED_ATTACHMENTS.map((a) => ({
  filename: a.filename,
  path: path.join(ROOT, a.relativePath),
}));

// این API دیگه مستقیم ایمیل نمی‌فرسته — شرکت‌ها رو «در صف می‌ذاره»؛ کارگر پس‌زمینه
// (web/lib/outreachQueue.js) هر N ثانیه (پیش‌فرض ۶۰) یک ایمیل می‌فرسته. دلیل: ارسال
// پشت‌سرهم ریسک اسپم‌شدن/بلاک دامنه داره. سقف هر درخواست بالاتره چون فقط صف‌گذاریه.
const MAX_BATCH_SIZE = 500;

// قبل از هر ارسالی مطمئن می‌شیم می‌تونیم لاگ رو بنویسیم — ایمیلی که رفته ولی
// ثبت نشده، دفعه‌ی بعد دوباره برای همون شرکت می‌ره.
function checkSentLogWritable() {
  if (process.env.NODE_ENV === "production" && !process.env.OUTREACH_STATE_DIR) {
    return "OUTREACH_STATE_DIR تنظیم نشده: روی سرور لاگ ارسال و صف باید روی دیسک دائمی باشد (وگرنه با دیپلوی بعدی پاک می‌شود و ایمیل تکراری می‌رود).";
  }
  try {
    const file = getOutreachSentStatePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.accessSync(path.dirname(file), fs.constants.W_OK);
    return null;
  } catch (err) {
    return `مسیر لاگ ارسال قابل نوشتن نیست: ${String(err?.message || err)}`;
  }
}

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

  const logProblem = checkSentLogWritable();
  if (logProblem) {
    return NextResponse.json({ error: logProblem }, { status: 500 });
  }

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    return NextResponse.json(
      { error: "تنظیمات SMTP (SMTP_HOST/SMTP_USER/SMTP_PASSWORD) کامل نیست." },
      { status: 500 }
    );
  }

  // شبکه‌ی ایمنی: تا همه‌ی لینک‌های کاتالوگ توی env نباشن، هیچ ایمیلی با «[LINK PENDING]» نمی‌ره.
  const requiredLinkEnvVars = [
    "OUTREACH_CATALOG_URL_FOOD",
    "OUTREACH_CATALOG_URL_FEED_DAIRY",
    "OUTREACH_CATALOG_URL_FEED_POULTRY",
    "OUTREACH_CATALOG_URL_INDUSTRIAL",
  ];
  const missingLinkEnvVars = requiredLinkEnvVars.filter((key) => !process.env[key]);
  if (missingLinkEnvVars.length > 0) {
    return NextResponse.json(
      { error: `لینک‌های کاتالوگ هنوز تنظیم نشدن (متغیرهای env گمشده: ${missingLinkEnvVars.join(", ")}).` },
      { status: 500 }
    );
  }

  const missingAttachments = RESOLVED_FIXED_ATTACHMENTS.filter((a) => !fs.existsSync(a.path));
  if (missingAttachments.length > 0) {
    return NextResponse.json(
      { error: `فایل پیوست پیدا نشد: ${missingAttachments.map((a) => a.filename).join(", ")}` },
      { status: 500 }
    );
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

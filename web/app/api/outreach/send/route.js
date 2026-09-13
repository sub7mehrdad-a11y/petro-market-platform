import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { NextResponse } from "next/server";
import { getCompanies, getCountryEnglishName, getEmailOutreachSent } from "@/lib/data";
import { renderOutreachEmail } from "@/lib/outreachTemplate";

const ROOT = path.join(process.cwd(), "..");
const SENT_LOG_FILE = path.join(ROOT, "data", "email_outreach_sent.json");

// ⚠️ سقف هر درخواست — طبق تصمیم صریح کاربر (دسته‌ای، نه یکجا برای همه‌ی
// شرکت‌ها) تا ریسک اسپم‌فلگ‌شدن دامنه‌ی ایمیل شرکت پایین بمونه.
const MAX_BATCH_SIZE = 30;

function buildTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

function appendToSentLog(records) {
  const existing = getEmailOutreachSent();
  fs.mkdirSync(path.dirname(SENT_LOG_FILE), { recursive: true });
  fs.writeFileSync(SENT_LOG_FILE, JSON.stringify([...existing, ...records], null, 2), "utf-8");
}

// طبق درخواست صریح کاربر: این آدرس‌ها باید بدون استثنا روی CC همه‌ی ایمیل‌های
// معرفی باشن — از env می‌خونیم (نه هاردکد) تا بدون تغییر کد قابل‌ویرایش باشه.
function getCcList() {
  return (process.env.OUTREACH_CC_EMAILS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

export async function POST(request) {
  // دروازه‌ی تأیید هیئت‌مدیره: تا وقتی این متغیر محیطی صراحتاً روی "true"
  // تنظیم نشده، ارسال واقعی امکان‌پذیر نیست — حتی اگه SMTP هم تنظیم شده باشه.
  if (process.env.OUTREACH_SENDING_ENABLED !== "true") {
    return NextResponse.json(
      { error: "ارسال واقعی هنوز فعال نشده (در انتظار تأیید هیئت‌مدیره)." },
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
      { error: `حداکثر ${MAX_BATCH_SIZE} شرکت در هر دسته — لطفاً انتخاب رو کمتر کن.` },
      { status: 400 }
    );
  }

  const transporter = buildTransport();
  if (!transporter) {
    return NextResponse.json(
      { error: "تنظیمات SMTP (SMTP_HOST/SMTP_USER/SMTP_PASSWORD) کامل نیست." },
      { status: 500 }
    );
  }

  // شبکه‌ی ایمنی: حتی اگه یک روز OUTREACH_SENDING_ENABLED زودتر از موعد true
  // بشه، تا وقتی همه‌ی لینک‌های کاتالوگ (بسته‌بندی + هر سه گرید) روی سایت
  // آپلود و توی env گذاشته نشدن، هیچ ایمیلی با لینک "[LINK PENDING]" واقعاً
  // فرستاده نمی‌شه — چون از قبل نمی‌دونیم دسته‌ی انتخاب‌شده چه گریدهایی داره.
  const requiredLinkEnvVars = [
    "OUTREACH_CATALOG_URL_PACKING",
    "OUTREACH_CATALOG_URL_FOOD",
    "OUTREACH_CATALOG_URL_FEED",
    "OUTREACH_CATALOG_URL_INDUSTRIAL",
  ];
  const missingLinkEnvVars = requiredLinkEnvVars.filter((key) => !process.env[key]);
  if (missingLinkEnvVars.length > 0) {
    return NextResponse.json(
      {
        error: `لینک‌های کاتالوگ هنوز روی سایت آپلود/تنظیم نشدن (متغیرهای env گمشده: ${missingLinkEnvVars.join(", ")}).`,
      },
      { status: 500 }
    );
  }

  const byId = new Map(getCompanies().map((c) => [c.id, c]));
  const alreadySent = new Set(getEmailOutreachSent().map((r) => r.email));
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const fromName = process.env.SMTP_FROM_NAME || "Pars Baking Soda Group";
  const ccList = getCcList();

  const results = [];
  const newSentRecords = [];

  for (const id of companyIds) {
    const c = byId.get(id);
    if (!c || !c.email) {
      results.push({ id, ok: false, error: "شرکت یا ایمیلش پیدا نشد" });
      continue;
    }
    const emailLower = c.email.trim().toLowerCase();
    if (alreadySent.has(emailLower)) {
      results.push({ id, ok: false, error: "قبلاً برای این آدرس ارسال شده" });
      continue;
    }

    const rendered = renderOutreachEmail({
      english_name: c.english_name,
      country: c.country,
      country_en: getCountryEnglishName(c.country),
      target_grade: c.target_grade,
    });

    try {
      await transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: c.email,
        ...(ccList.length > 0 ? { cc: ccList } : {}),
        subject: rendered.subject,
        text: rendered.body,
        // عمداً بدون attachments — کاتالوگ‌ها به‌صورت لینک داخل متن ایمیلن
        // (نه فایل پیوست)، چون سرور SMTP شرکت روی پیوست‌های واقعی شکست
        // می‌خورد. جزئیات کامل در web/lib/outreachTemplate.js.
      });
      results.push({ id, ok: true });
      newSentRecords.push({
        email: emailLower,
        name: c.english_name || null,
        grade: rendered.grade,
        sent_at: new Date().toISOString(),
        source: "outreach-page",
      });
      alreadySent.add(emailLower); // جلوی ارسال دوباره‌ی تکراری داخل همین دسته رو هم بگیر
    } catch (err) {
      results.push({ id, ok: false, error: String(err?.message || err) });
    }
  }

  if (newSentRecords.length > 0) {
    appendToSentLog(newSentRecords);
  }

  return NextResponse.json({
    sent: newSentRecords.length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}

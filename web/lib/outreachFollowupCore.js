// منطق «خالص» (بدون IO) برای دو قابلیت پیگیری ایمیل معرفی:
//  ۱) ایمیل یادآوری: شرکتی که بعد از N روز (پیش‌فرض ۱۴) به ایمیل معرفی ما پاسخ ندادهٔ واقعی نداده.
//  ۲) فوروارد پاسخ مشتری به همکار بازرگانی (با ایمیل سازمانی) تا خودش با مشتری وارد ارتباط شود.
//
// عمداً بدون alias «@/» و بدون IMAP/SMTP: تا با `node --test` (web/lib/outreachFollowupCore.test.mjs)
// بدون هیچ اتصال واقعی تست شود. IO در outreachFollowup.js است.

import { FREE_MAIL, AUTO_SUBJECT_RE, DSN_SUBJECT_RE, domainOf } from "./outreachReport.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export const REMINDER_DEFAULTS = { afterDays: 14, maxAgeDays: 60, perDay: 10 };

const clean = (e) => String(e || "").trim().toLowerCase();

// ---------------------------------------------------------------- ۱) یادآوری

/**
 * شرکت‌های مستحق یادآوری.
 *
 * شرط‌ها (همه باید برقرار باشد):
 *  - فقط ارسال‌هایی که خود پلتفرم فرستاده (source = outreach-queue) و message_id دارند؛ کمپین قدیمی عراق
 *    (متن/سابجکت دیگر، بدون Message-ID) یادآوری نمی‌گیرد.
 *  - حداقل afterDays روز از ارسال گذشته و بیشتر از maxAgeDays نیست (جلوگیری از یادآوری خیلی کهنه).
 *  - پاسخ واقعی نیامده؛ برگشتی قطعی (bounce) نیست؛ قبلاً یادآوری نگرفته؛ در فهرست استثنا نیست.
 *  - اگر وضعیت پاسخ‌ها (rowsByEmail) در دست نیست (IMAP ناموفق)، هیچ‌کس یادآوری نمی‌گیرد — «ندانستن» یعنی نفرست.
 *
 * @returns {{ candidates: object[], skipped: Record<string, number> }}  قدیمی‌ترین ارسال اول، حداکثر `limit`.
 */
export function selectReminderCandidates({
  sentRecords, rowsByEmail, reminders = {}, now = Date.now(),
  afterDays = REMINDER_DEFAULTS.afterDays, maxAgeDays = REMINDER_DEFAULTS.maxAgeDays,
  limit = REMINDER_DEFAULTS.perDay, excludeEmails = new Set(),
}) {
  const skipped = { not_platform: 0, too_new: 0, too_old: 0, replied: 0, bounced: 0, already_reminded: 0, excluded: 0, unknown_status: 0 };
  if (!rowsByEmail) return { candidates: [], skipped: { ...skipped, unknown_status: (sentRecords || []).length } };

  const candidates = [];
  const seen = new Set();
  for (const r of sentRecords || []) {
    const email = clean(r.email);
    if (!email || seen.has(email)) continue;
    if (r.source !== "outreach-queue" || !r.message_id) { skipped.not_platform += 1; continue; }
    const sentAt = Date.parse(r.sent_at);
    if (!Number.isFinite(sentAt)) { skipped.not_platform += 1; continue; }
    seen.add(email);
    const age = now - sentAt;
    if (age < afterDays * DAY_MS) { skipped.too_new += 1; continue; }
    if (age > maxAgeDays * DAY_MS) { skipped.too_old += 1; continue; }
    if (reminders[email]) { skipped.already_reminded += 1; continue; }
    if (excludeEmails.has(email)) { skipped.excluded += 1; continue; }
    const row = rowsByEmail.get(email);
    if (!row) { skipped.unknown_status += 1; continue; }
    if (row.replied) { skipped.replied += 1; continue; }
    if (row.status === "failed") { skipped.bounced += 1; continue; }
    candidates.push(r);
  }
  candidates.sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at));
  return { candidates: candidates.slice(0, Math.max(0, limit)), skipped };
}

/**
 * متن ایمیل یادآوری — کوتاه، بدون ادعای جدید، در همان رشته‌ی ایمیل اول (Re: + In-Reply-To).
 * ⚠ متن تازه است و نیاز به تأیید مسئول بازرگانی/هیئت‌مدیره دارد؛ تا آن موقع OUTREACH_REMINDER_ENABLED روشن نشود.
 * امضا عیناً همان امضای ایمیل معرفی است.
 */
export function buildReminderEmail({ originalSubject, companyName }) {
  const subject = /^re:/i.test(originalSubject) ? originalSubject : `Re: ${originalSubject}`;
  const body = [
    `Dear ${companyName || "Sir/Madam"},`,
    "",
    "I am writing to follow up on my previous email below, in which I introduced Pars Baking Soda Group and our sodium bicarbonate.",
    "",
    "If this is relevant to your requirements, please let us know your required grade, packaging and estimated quantity, and we will be glad to prepare a quotation. If another colleague handles purchasing, we would appreciate being directed to the appropriate contact.",
    "",
    "If you prefer not to receive further product information from us, please reply and let us know.",
    "",
    "Kind regards,",
    "Mehrdad Abutalebi",
    "Export Marketing",
    "Pars Baking Soda Group",
  ].join("\n");
  return { subject, body };
}

// ---------------------------------------------------------------- ۲) پاسخ مشتری

/** نوع پیام ورودی: dsn (برگشتی/وضعیت تحویل) | auto (پاسخ خودکار) | normal. */
export function classifyIncoming({ from, subject, headers = {} }) {
  const f = clean(from);
  const subj = subject || "";
  const isDsn = /mailer-daemon|postmaster/.test(f) || /delivery-status|report-type/i.test(headers["content-type"] || "") || DSN_SUBJECT_RE.test(subj);
  if (isDsn) return "dsn";
  const auto =
    (headers["auto-submitted"] && String(headers["auto-submitted"]).toLowerCase() !== "no") ||
    /auto_reply|bulk|junk/i.test(headers["precedence"] || "") ||
    AUTO_SUBJECT_RE.test(subj);
  return auto ? "auto" : "normal";
}

/**
 * این پیام ورودی جواب کدام ایمیل ماست؟ فقط با شواهد واقعی؛ نه «هر ایمیلی که آمد».
 * ترتیب: ۱) In-Reply-To/References = Message-ID ایمیل ما (قطعی) ۲) فرستنده = آدرس گیرنده‌ی ما
 * ۳) فرستنده هم‌دامنه‌ی شرکتی (نه ایمیل رایگان) گیرنده‌ی ما.
 * @returns {{ record: object, via: "thread"|"address"|"domain" } | null}
 */
export function matchIncomingToSent({ from, inReplyTo = "", references = "" }, sentRecords) {
  const refs = `${inReplyTo} ${references}`;
  const sender = clean(from);
  const withId = (sentRecords || []).filter((r) => r.message_id);
  for (const r of withId) {
    const id = String(r.message_id).replace(/[<>]/g, "");
    if (id && refs.includes(id)) return { record: r, via: "thread" };
  }
  const byAddr = (sentRecords || []).find((r) => clean(r.email) === sender);
  if (byAddr) return { record: byAddr, via: "address" };
  const d = domainOf(sender);
  if (d && !FREE_MAIL.has(d)) {
    const byDomain = (sentRecords || []).find((r) => domainOf(r.email) === d);
    if (byDomain) return { record: byDomain, via: "domain" };
  }
  return null;
}

const VIA_FA = { thread: "پاسخ مستقیم به ایمیل ما (رشته‌ی ایمیل)", address: "از همان آدرسی که برایش ایمیل فرستادیم", domain: "از آدرس دیگری در دامنه‌ی همان شرکت" };

const faDate = (d) =>
  d ? new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", dateStyle: "long", timeStyle: "short" }).format(new Date(d)) : "—";

/**
 * ایمیل فوروارد برای همکار بازرگانی. Reply-To = آدرس مشتری تا همکار با «پاسخ» مستقیم به خود مشتری جواب بدهد.
 * متن پاسخ مشتری (کوتاه‌شده) + فایل اصلی .eml (با پیوست‌های مشتری) ضمیمه می‌شود.
 */
export function buildForwardEmail({ record, company, via, customerFrom, customerName, customerSubject, customerDate, customerText, rawEml, maxTextChars = 6000, maxEmlBytes = 12 * 1024 * 1024 }) {
  const name = company?.english_name || record?.name || customerFrom;
  const country = company?.country || record?.country || "—";
  const text = String(customerText || "").replace(/\r\n/g, "\n").trim();
  const excerpt = text.length > maxTextChars ? `${text.slice(0, maxTextChars)}\n[… ادامه‌ی متن در فایل پیوست]` : text || "(متن ساده‌ای در این ایمیل نبود؛ فایل پیوست را ببینید.)";
  const lines = [
    "سلام،",
    "",
    `شرکت «${name}» (${country}) به ایمیل معرفی ما پاسخ داده است. لطفاً برای ادامه‌ی ارتباط پیگیری کنید.`,
    "با زدن «Reply» پاسخ شما مستقیم به خود مشتری می‌رود (Reply-To تنظیم شده).",
    "",
    "──────── مشخصات ────────",
    `شرکت: ${name}`,
    `کشور: ${country}`,
    record?.grade ? `گرید معرفی‌شده: ${record.grade}` : null,
    `آدرس فرستنده‌ی پاسخ: ${customerName ? `${customerName} <${customerFrom}>` : customerFrom}`,
    `نوع تطبیق: ${VIA_FA[via] || via}`,
    `ایمیل معرفی ما ارسال شده در: ${faDate(record?.sent_at)}`,
    `زمان دریافت پاسخ: ${faDate(customerDate)}`,
    `موضوع پاسخ: ${customerSubject || "(بدون موضوع)"}`,
    "",
    "──────── متن پاسخ مشتری ────────",
    excerpt,
    "",
    "──────── ",
    "این پیام را پلتفرم تحقیق و توسعه خودکار فوروارد کرده است؛ فایل اصلی پاسخ (با پیوست‌های احتمالی مشتری) ضمیمه است.",
  ].filter((l) => l !== null);

  const out = {
    subject: `[پاسخ مشتری] ${name} (${country}) — ${customerSubject || "بدون موضوع"}`.slice(0, 250),
    text: lines.join("\n"),
    replyTo: customerFrom,
    attachments: [],
    eml_attached: false,
  };
  if (rawEml && rawEml.length <= maxEmlBytes) {
    out.attachments.push({ filename: "customer-reply.eml", content: rawEml, contentType: "message/rfc822" });
    out.eml_attached = true;
  } else if (rawEml) {
    out.text += `\n⚠ فایل اصلی پاسخ بزرگ‌تر از ${Math.round(maxEmlBytes / 1024 / 1024)} مگابایت بود و ضمیمه نشد؛ در صندوق ورودی ایمیل شرکتی موجود است.`;
  }
  return out;
}

/** آدرس‌های همکار (جداشده با ویرگول) → فقط آدرس‌های معتبر و یکتا. */
export function parseRecipients(value) {
  const re = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
  return [...new Set(String(value || "").split(/[,;]/).map((e) => e.trim().toLowerCase()).filter((e) => re.test(e)))];
}

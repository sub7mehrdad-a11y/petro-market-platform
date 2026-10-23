// وضعیت ایمیل هر شرکت (برای صفحه‌ی شرکت‌های هر کشور): ارسال‌شده / یادآوری / پاسخ / در صف / برگشتی.
//
// منابع (همه فقط‌خواندنی):
//  - لاگ ارسال (پایه + ارسال‌های جدید): آیا ایمیل معرفی رفته و کِی
//  - صف: ایمیل معرفی/یادآوری‌ای که هنوز منتظر ارسال است
//  - وضعیت پیگیری: یادآوری‌های ارسال‌شده
//  - صندوق ورودی (فقط هدر؛ همان buildOutreachReport): پاسخ واقعی و برگشتی.
//    خواندن کل صندوق سنگین است، پس نتیجه ۱۰ دقیقه کش می‌شود. اگر IMAP در دسترس نباشد، وضعیت پاسخ «نامشخص» است
//    (replies_known=false) و بقیه‌ی وضعیت‌ها همچنان از لاگ نمایش داده می‌شود.
import { getCompanies, getEmailOutreachSent } from "@/lib/data";
import { readQueue } from "@/lib/outreachQueue";
import { readFollowupState } from "@/lib/outreachFollowupState";
import { buildOutreachReport } from "@/lib/outreachReport";
import { isValidEmail } from "@/lib/outreachTemplate";

const REPLY_TTL_MS = 10 * 60 * 1000;
const FAIL_BACKOFF_MS = 2 * 60 * 1000;

let replyCache = null; // { at, map }
let replyFailedAt = 0;
let replyInflight = null;

const smtpConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);

async function loadReplyMap() {
  const report = await buildOutreachReport({ sentRecords: getEmailOutreachSent(), companies: getCompanies(), days: null });
  return new Map(report.rows.map((r) => [String(r.email).toLowerCase(), { replied: !!r.replied, auto_replied: !!r.auto_replied, status: r.status }]));
}

/** نقشه‌ی email → {replied, auto_replied, status} یا null اگر خواندن صندوق ممکن نباشد. */
export async function getReplyMap() {
  if (!smtpConfigured()) return null;
  const now = Date.now();
  if (replyCache && now - replyCache.at < REPLY_TTL_MS) return replyCache.map;
  if (replyInflight) return replyInflight;
  if (now - replyFailedAt < FAIL_BACKOFF_MS) return replyCache?.map || null;
  replyInflight = (async () => {
    try {
      const map = await loadReplyMap();
      replyCache = { at: Date.now(), map };
      return map;
    } catch (err) {
      replyFailedAt = Date.now();
      console.error("[outreach-status] خواندن وضعیت پاسخ‌ها از صندوق ورودی ناموفق:", String(err?.message || err));
      return replyCache?.map || null; // کهنه‌تر بهتر از هیچ
    } finally {
      replyInflight = null;
    }
  })();
  return replyInflight;
}

/**
 * وضعیت ایمیل شرکت‌های یک کشور (یا همه).
 * @returns {Promise<{ replies_known: boolean, companies: Record<string, object>, summary: object }>}
 */
export async function getCompanyEmailStatuses({ country = null } = {}) {
  const companies = getCompanies().filter((c) => !country || c.country === country);

  const sentByEmail = new Map();
  for (const r of getEmailOutreachSent()) {
    const key = String(r.email || "").trim().toLowerCase();
    if (!key) continue;
    const prev = sentByEmail.get(key);
    if (!prev || String(r.sent_at || "") > String(prev.sent_at || "")) sentByEmail.set(key, r);
  }

  const queueItems = readQueue().items.filter((i) => i.status === "queued");
  const introQueued = new Set(queueItems.filter((i) => i.kind !== "reminder").map((i) => i.email));
  const reminderQueued = new Set(queueItems.filter((i) => i.kind === "reminder").map((i) => i.email));
  const reminders = readFollowupState().reminders || {};
  const replyMap = await getReplyMap();

  const out = {};
  const summary = { total: companies.length, with_email: 0, sent: 0, reminded: 0, replied: 0, queued: 0, bounced: 0, not_sent: 0 };

  for (const c of companies) {
    const email = String(c.email || "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      out[c.id] = { has_email: false };
      continue;
    }
    summary.with_email += 1;
    const sent = sentByEmail.get(email);
    const rem = reminders[email];
    const rep = replyMap?.get(email);
    const s = {
      has_email: true,
      sent: !!sent,
      sent_at: sent?.sent_at || null,
      legacy: !!sent && sent.source !== "outreach-queue",
      queued: introQueued.has(email),
      reminder: rem?.status === "sent" ? "sent" : rem?.status === "failed" ? "failed" : reminderQueued.has(email) || rem?.status === "queued" ? "queued" : null,
      reminder_at: rem?.sent_at || null,
      replied: !!rep?.replied,
      bounced: rep?.status === "failed",
    };
    out[c.id] = s;
    if (s.sent) summary.sent += 1;
    if (s.reminder === "sent") summary.reminded += 1;
    if (s.replied) summary.replied += 1;
    if (s.queued) summary.queued += 1;
    if (s.bounced) summary.bounced += 1;
    if (!s.sent && !s.queued) summary.not_sent += 1;
  }

  return { replies_known: replyMap !== null, companies: out, summary };
}

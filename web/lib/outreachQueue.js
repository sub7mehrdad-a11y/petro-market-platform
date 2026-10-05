// صف ارسال ایمیل معرفی — ارسال با فاصله‌ی زمانی (پیش‌فرض ۱ ایمیل در دقیقه).
//
// چرا صف: ارسال پشت‌سرهم (تا ۳۰ ایمیل در چند ثانیه از یک سرور SMTP ساده) الگوی
// کلاسیک اسپم است و ریسک بلاک‌شدن دامنه/IP و افتادن در پوشه‌ی اسپم رو بالا می‌بره.
// درخواست HTTP هم نمی‌تونه ۳۰ دقیقه باز بمونه؛ پس API فقط شرکت‌ها رو «در صف می‌ذاره» و
// یک کارگر پس‌زمینه (توی همین پروسه‌ی سرور، از instrumentation.js شروع می‌شه) هر N ثانیه
// یک ایمیل می‌فرسته. صف روی دیسک (کنار لاگ ارسال، پس روی Liara پایدار) ذخیره می‌شه و بعد
// از ری‌استارت ادامه پیدا می‌کنه.
//
// تنظیمات (env):
//   OUTREACH_SEND_INTERVAL_SEC  فاصله‌ی دو ارسال، پیش‌فرض ۶۰ ثانیه (با ±۲۵٪ نوسان تصادفی)
//   OUTREACH_DAILY_LIMIT        سقف ارسال در هر ۲۴ ساعت، پیش‌فرض ۱۵۰
//   OUTREACH_TEST_REDIRECT      اگه ست باشه، همه‌ی ایمیل‌ها فقط به همین آدرس می‌رن (بدون CC و
//                               بدون ثبت در لاگ ارسال) — برای تست امن بدون ایمیل به شرکت واقعی

import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { getCompanies, getCountryEnglishName, getOutreachSentStatePath, getOutreachSentStateOnly } from "@/lib/data";
import { renderOutreachEmail, FIXED_ATTACHMENTS, isValidEmail } from "@/lib/outreachTemplate";

const ROOT = path.join(process.cwd(), "..");
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 10 * 60 * 1000;
const IDLE_POLL_MS = 15 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function getQueueFilePath() {
  return path.join(path.dirname(getOutreachSentStatePath()), "outreach_queue.json");
}

export function getQueueSettings() {
  const interval = Number(process.env.OUTREACH_SEND_INTERVAL_SEC);
  const limit = Number(process.env.OUTREACH_DAILY_LIMIT);
  return {
    intervalSec: Number.isFinite(interval) && interval >= 5 ? interval : 60,
    dailyLimit: Number.isFinite(limit) && limit > 0 ? limit : 150,
    testRedirect: (process.env.OUTREACH_TEST_REDIRECT || "").trim() || null,
  };
}

function emptyState() {
  return { paused: false, next_send_at: null, items: [] };
}

export function readQueue() {
  try {
    const parsed = JSON.parse(fs.readFileSync(getQueueFilePath(), "utf-8"));
    return { ...emptyState(), ...parsed, items: Array.isArray(parsed.items) ? parsed.items : [] };
  } catch {
    return emptyState();
  }
}

function writeQueue(state) {
  const file = getQueueFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf-8");
  fs.renameSync(tmp, file);
}

// نوشتن اتمیک: همه‌ی تغییرها «بخون → تغییر → بنویس» هم‌زمان (بدون await بینشون) انجام
// می‌شن، پس بین API و کارگر پس‌زمینه (هر دو توی یک پروسه) تداخلی پیش نمی‌آد.
export function mutateQueue(fn) {
  const state = readQueue();
  const result = fn(state);
  writeQueue(state);
  return result;
}

export function enqueueCompanies(companyIds) {
  const byId = new Map(getCompanies().map((c) => [c.id, c]));
  const sentEmails = new Set();
  // مقصدهای قبلاً ارسال‌شده (لاگ کامل = پایه + ارسال‌های جدید)
  for (const r of getOutreachSentStateOnly()) sentEmails.add(String(r.email).toLowerCase());
  const baselineFile = path.join(ROOT, "data", "email_outreach_sent.json");
  try {
    for (const r of JSON.parse(fs.readFileSync(baselineFile, "utf-8"))) sentEmails.add(String(r.email).toLowerCase());
  } catch {}

  return mutateQueue((state) => {
    const active = new Set(state.items.filter((i) => i.status === "queued").map((i) => i.email));
    const skipped = [];
    let queued = 0;
    for (const id of companyIds) {
      const c = byId.get(id);
      if (!c || !c.email) { skipped.push({ id, reason: "شرکت یا ایمیلش پیدا نشد" }); continue; }
      if (!isValidEmail(c.email)) { skipped.push({ id, reason: "فرمت ایمیل نامعتبر" }); continue; }
      const email = c.email.trim().toLowerCase();
      if (sentEmails.has(email)) { skipped.push({ id, reason: "قبلاً برای این آدرس ارسال شده" }); continue; }
      if (active.has(email)) { skipped.push({ id, reason: "از قبل در صف است" }); continue; }
      active.add(email);
      state.items.push({
        id: `q-${Date.now().toString(36)}-${state.items.length}`,
        company_id: c.id,
        email,
        name: c.english_name || null,
        country: c.country || null,
        queued_at: new Date().toISOString(),
        status: "queued",
        attempts: 0,
      });
      queued += 1;
    }
    return { queued, skipped };
  });
}

export function getQueueSummary() {
  const state = readQueue();
  const settings = getQueueSettings();
  const counts = { queued: 0, sent: 0, failed: 0, cancelled: 0 };
  for (const i of state.items) counts[i.status] = (counts[i.status] || 0) + 1;
  const since = Date.now() - DAY_MS;
  const sentLast24h = state.items.filter((i) => i.status === "sent" && !i.test && Date.parse(i.sent_at) >= since).length;
  const recent = [...state.items]
    .filter((i) => i.status !== "queued")
    .sort((a, b) => String(b.sent_at || b.failed_at || b.queued_at).localeCompare(String(a.sent_at || a.failed_at || a.queued_at)))
    .slice(0, 8)
    .map((i) => ({ id: i.id, name: i.name, email: i.email, status: i.status, sent_at: i.sent_at || null, error: i.error || null, test: !!i.test }));
  return {
    paused: state.paused,
    next_send_at: state.next_send_at,
    counts,
    sent_last_24h: sentLast24h,
    daily_limit: settings.dailyLimit,
    interval_sec: settings.intervalSec,
    test_redirect: !!settings.testRedirect,
    sending_enabled: process.env.OUTREACH_SENDING_ENABLED === "true",
    worker_running: !!globalThis.__outreachWorkerStarted,
    recent,
  };
}

export function queueAction(action, ids) {
  return mutateQueue((state) => {
    if (action === "pause") state.paused = true;
    else if (action === "resume") state.paused = false;
    else if (action === "cancel_all") {
      for (const i of state.items) if (i.status === "queued") i.status = "cancelled";
    } else if (action === "retry_failed") {
      for (const i of state.items) if (i.status === "failed") { i.status = "queued"; i.attempts = 0; delete i.error; }
    } else if (action === "cancel" && Array.isArray(ids)) {
      const set = new Set(ids);
      for (const i of state.items) if (i.status === "queued" && set.has(i.id)) i.status = "cancelled";
    }
    return { ok: true };
  });
}

function buildTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) return null;
  // تایم‌اوت‌ها: بدون اینها یک اتصال SMTP گیرکرده کل کارگر (و صف) رو بی‌نهایت متوقف می‌کنه.
  return nodemailer.createTransport({
    host, port, secure: port === 465, auth: { user, pass },
    connectionTimeout: 30_000, greetingTimeout: 30_000, socketTimeout: 120_000,
  });
}

function appendToSentLog(record) {
  const file = getOutreachSentStatePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = getOutreachSentStateOnly();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify([...existing, record], null, 2), "utf-8");
  fs.renameSync(tmp, file);
}

function ccList() {
  return (process.env.OUTREACH_CC_EMAILS || "").split(",").map((e) => e.trim()).filter(Boolean);
}

async function sendItem(item) {
  const settings = getQueueSettings();
  const transport = buildTransport();
  if (!transport) throw new Error("تنظیمات SMTP کامل نیست");
  const company = getCompanies().find((c) => c.id === item.company_id);
  if (!company) throw new Error("شرکت دیگر در بانک وجود ندارد");

  const rendered = renderOutreachEmail({
    english_name: company.english_name,
    country: company.country,
    country_en: getCountryEnglishName(company.country),
    target_grade: company.target_grade,
  });
  const attachments = FIXED_ATTACHMENTS.map((a) => ({ filename: a.filename, path: path.join(ROOT, a.relativePath) }));
  for (const a of attachments) if (!fs.existsSync(a.path)) throw new Error(`فایل پیوست پیدا نشد: ${a.filename}`);

  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const fromName = process.env.SMTP_FROM_NAME || "Pars Baking Soda Group";
  const redirect = settings.testRedirect;
  const cc = redirect ? [] : ccList();

  const info = await transport.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to: redirect || item.email,
    ...(cc.length ? { cc } : {}),
    subject: redirect ? `[TEST → ${item.email}] ${rendered.subject}` : rendered.subject,
    text: rendered.body,
    attachments,
  });
  return { info, grade: rendered.grade, company, test: !!redirect };
}

async function processOne() {
  const settings = getQueueSettings();
  const state = readQueue();
  if (state.paused) return { delayMs: IDLE_POLL_MS, idle: true };
  const now = Date.now();
  const item = state.items.find((i) => i.status === "queued" && (!i.retry_after || Date.parse(i.retry_after) <= now));
  if (!item) return { delayMs: IDLE_POLL_MS, idle: true };

  const sentLast24h = state.items.filter((i) => i.status === "sent" && !i.test && Date.parse(i.sent_at) >= now - DAY_MS).length;
  if (!settings.testRedirect && sentLast24h >= settings.dailyLimit) {
    return { delayMs: 10 * 60 * 1000, idle: true, limitReached: true };
  }

  let outcome;
  const t0 = Date.now();
  try {
    const r = await sendItem(item);
    outcome = { ok: true, ...r };
    console.log(`[outreach-worker] ارسال شد (${Math.round((Date.now() - t0) / 1000)} ثانیه)${r.test ? " [تست]" : ""} — ${item.id}`);
  } catch (err) {
    outcome = { ok: false, error: String(err?.message || err) };
    console.error(`[outreach-worker] خطا در ارسال ${item.id}: ${outcome.error}`);
  }

  mutateQueue((s) => {
    const it = s.items.find((x) => x.id === item.id);
    if (!it) return;
    if (outcome.ok) {
      it.status = "sent";
      it.sent_at = new Date().toISOString();
      it.grade = outcome.grade;
      it.message_id = outcome.info?.messageId || null;
      if (outcome.test) it.test = true;
      delete it.error;
    } else {
      it.attempts = (it.attempts || 0) + 1;
      it.error = outcome.error;
      if (it.attempts >= MAX_ATTEMPTS) {
        it.status = "failed";
        it.failed_at = new Date().toISOString();
      } else {
        it.retry_after = new Date(Date.now() + RETRY_DELAY_MS).toISOString();
      }
    }
  });

  // لاگ ارسال (برای جلوگیری از ایمیل تکراری و برای گزارش): فقط ارسال واقعی، نه تست
  if (outcome.ok && !outcome.test) {
    appendToSentLog({
      email: item.email,
      name: item.name,
      company_id: item.company_id,
      country: item.country,
      grade: outcome.grade,
      message_id: outcome.info?.messageId || null,
      sent_at: new Date().toISOString(),
      source: "outreach-queue",
    });
  }

  const jitter = 0.75 + Math.random() * 0.5; // ±۲۵٪
  return { delayMs: Math.round(settings.intervalSec * 1000 * jitter), idle: false };
}

export function startOutreachWorker() {
  if (globalThis.__outreachWorkerStarted) return;
  globalThis.__outreachWorkerStarted = true;

  const loop = async () => {
    let delayMs = IDLE_POLL_MS;
    try {
      if (process.env.OUTREACH_SENDING_ENABLED === "true") {
        const r = await processOne();
        delayMs = r.delayMs;
        // فقط وقتی واقعاً ارسالی انجام شده (یا صف بیکار شده) فایل رو بنویس — نه هر ۱۵ ثانیه.
        const nextAt = r.idle ? null : new Date(Date.now() + delayMs).toISOString();
        if (readQueue().next_send_at !== nextAt) mutateQueue((s) => { s.next_send_at = nextAt; });
      }
    } catch (err) {
      console.error("[outreach-worker]", err);
    }
    setTimeout(loop, delayMs);
  };
  setTimeout(loop, 5000);
  console.log("[outreach-worker] شروع شد");
}

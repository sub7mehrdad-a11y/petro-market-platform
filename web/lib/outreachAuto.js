// ارسال خودکار ایمیل معرفی + گزارش هفتگی — بالای صف ارسال (outreachQueue.js).
//
// ۱) هر روز ساعت «send_hour_tehran» (پیش‌فرض ۱۰ صبح تهران) تا «per_day» شرکت (پیش‌فرض ۱۵) از کشورهای
//    تنظیم‌شده در data/outreach_auto.json انتخاب و «در صف» گذاشته می‌شن؛ کارگر صف (۱ ایمیل/دقیقه) می‌فرسته.
//    انتخاب از کشورها به‌نوبته (از هر کشور یکی، دوباره از اول). شرکتی که قبلاً برای ایمیلش ارسال شده (لاگ ارسال
//    + ۱۵ ایمیل دستی ۴ مهر) یا توی صف هست یا در exclude_company_ids باشه هیچ‌وقت انتخاب نمی‌شه.
// ۲) هر هفته (پیش‌فرض شنبه ساعت ۹ تهران) گزارش کامل (اکسل تیم بازرگانی + HTML هیئت‌مدیره) ساخته و برای
//    آدرس OUTREACH_REPORT_TO (بدون CC) ایمیل می‌شه.
//
// دروازه‌ها (env): OUTREACH_AUTO_ENABLED=true و OUTREACH_SENDING_ENABLED=true هر دو لازمن (ارسال خودکار)؛
// گزارش هفتگی با ست‌بودن OUTREACH_REPORT_TO فعاله. هیچ‌کدوم خودبه‌خود روشن نمی‌شه.
//
// ایمنی: اگه OUTREACH_STATE_DIR روی دیسک جداگانه‌ی mount‌شده نباشه (روی لینوکس/production)، ارسال خودکار
// انجام نمی‌شه — چون لاگ ارسال با هر دیپلوی پاک می‌شه و همون شرکت‌ها دوباره ایمیل می‌گیرن.

import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { getCompanies, getEmailOutreachSent, getOutreachSentStatePath } from "@/lib/data";
import { checkOutreachReady, enqueueCompanies, readQueue } from "@/lib/outreachQueue";
import { isValidEmail } from "@/lib/outreachTemplate";
import { buildOutreachReport } from "@/lib/outreachReport";
import { buildReportXlsx, buildReportHtml, reportFileName } from "@/lib/outreachReportExport";

const ROOT = path.join(process.cwd(), "..");
const CONFIG_FILE = path.join(ROOT, "data", "outreach_auto.json");
const TICK_MS = 60 * 1000;
const REPORT_RETRY_MS = 30 * 60 * 1000;
const REPORT_MAX_ATTEMPTS_PER_DAY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ---------------------------------------------------------------- تنظیمات و وضعیت
export function loadAutoConfig() {
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch {}
  const perDayEnv = Number(process.env.OUTREACH_AUTO_PER_DAY);
  const perDay = Number.isFinite(perDayEnv) && perDayEnv > 0 ? perDayEnv : Number(cfg.per_day) || 15;
  return {
    per_day: Math.min(Math.max(Math.floor(perDay), 1), 200),
    send_hour_tehran: Number.isFinite(Number(cfg.send_hour_tehran)) ? Number(cfg.send_hour_tehran) : 10,
    // کشورهای اولویت‌دار (اوراسیا) اول؛ بعد «countries»؛ «paused_countries» اصلاً ارسال نمی‌شن.
    priority_countries: Array.isArray(cfg.priority_countries) ? cfg.priority_countries : [],
    countries: [
      ...(Array.isArray(cfg.priority_countries) ? cfg.priority_countries : []),
      ...(Array.isArray(cfg.countries) ? cfg.countries : []),
    ].filter((c, i, a) => a.indexOf(c) === i && !(cfg.paused_countries || []).includes(c)),
    paused_countries: Array.isArray(cfg.paused_countries) ? cfg.paused_countries : [],
    exclude_company_ids: new Set(Array.isArray(cfg.exclude_company_ids) ? cfg.exclude_company_ids : []),
    report: {
      weekday: cfg.report?.weekday && WEEKDAYS.includes(cfg.report.weekday) ? cfg.report.weekday : "Saturday",
      hour_tehran: Number.isFinite(Number(cfg.report?.hour_tehran)) ? Number(cfg.report.hour_tehran) : 9,
    },
  };
}

function stateFile() {
  return path.join(path.dirname(getOutreachSentStatePath()), "outreach_auto_state.json");
}

export function readAutoState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), "utf-8"));
  } catch {
    return {};
  }
}

function patchAutoState(patch) {
  const file = stateFile();
  const next = { ...readAutoState(), ...patch };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf-8");
  fs.renameSync(tmp, file);
  return next;
}

// ---------------------------------------------------------------- زمان تهران
export function tehranNow(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", hourCycle: "h23", weekday: "long",
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: parts.weekday };
}

function persianDate(date = new Date()) {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", dateStyle: "long" }).format(date);
}

// ---------------------------------------------------------------- پیش‌شرط‌های ارسال خودکار
function diskProblem() {
  if (process.env.OUTREACH_AUTO_SKIP_DISK_CHECK === "true") return null;
  if (process.platform !== "linux" || process.env.NODE_ENV !== "production") return null;
  try {
    const dir = path.dirname(getOutreachSentStatePath());
    fs.mkdirSync(dir, { recursive: true });
    if (fs.statSync(dir).dev === fs.statSync(process.cwd()).dev) {
      return "OUTREACH_STATE_DIR روی دیسک جداگانه‌ی mount‌شده نیست (همان فایل‌سیستم برنامه‌ست)؛ لاگ ارسال با دیپلوی بعدی پاک می‌شه. دیسک دائم لیارا رو mount کن (liara.json → disks).";
    }
  } catch (err) {
    return `بررسی دیسک ناموفق: ${String(err?.message || err)}`;
  }
  return null;
}

// وضعیت دیسک دائم برای نمایش در پنل (مستقل از روشن‌بودن ارسال خودکار)
export function getDiskStatus() {
  if (process.env.NODE_ENV === "production" && !process.env.OUTREACH_STATE_DIR) {
    return { ok: false, text: "OUTREACH_STATE_DIR تنظیم نشده — لاگ ارسال روی دیسک دائم نیست." };
  }
  const problem = diskProblem();
  if (problem) return { ok: false, text: problem };
  return { ok: true, text: process.env.NODE_ENV === "production" ? "دیسک دائم متصل است." : "محیط توسعه — بررسی دیسک اعمال نمی‌شه." };
}

export function checkAutoReady() {
  if (process.env.OUTREACH_AUTO_ENABLED !== "true") return "ارسال خودکار خاموشه (OUTREACH_AUTO_ENABLED).";
  if (process.env.OUTREACH_SENDING_ENABLED !== "true") return "ارسال واقعی خاموشه (OUTREACH_SENDING_ENABLED).";
  return checkOutreachReady() || diskProblem();
}

// ---------------------------------------------------------------- انتخاب شرکت‌های امروز
function blockedEmails() {
  const blocked = new Set(getEmailOutreachSent().map((r) => String(r.email || "").trim().toLowerCase()));
  // هر چیزی که تا حالا توی صف رفته (حتی شکست‌خورده/لغوشده — خودکار دوباره تلاش نمی‌شه)؛ فقط ارسال‌های «تست» نه.
  for (const i of readQueue().items) if (!i.test) blocked.add(String(i.email || "").trim().toLowerCase());
  return blocked;
}

function ownAddresses() {
  const cc = (process.env.OUTREACH_CC_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return new Set(cc);
}

function numericId(id) {
  return Number(String(id).split("-")[1]) || 0;
}

// شرکت‌های واجد شرایط به تفکیک کشور (به ترتیب شناسه)
export function eligibleByCountry(cfg = loadAutoConfig()) {
  const blocked = blockedEmails();
  const own = ownAddresses();
  const out = new Map(cfg.countries.map((c) => [c, []]));
  const seen = new Set();
  const companies = getCompanies().slice().sort((a, b) => numericId(a.id) - numericId(b.id));
  for (const c of companies) {
    if (!out.has(c.country) || cfg.exclude_company_ids.has(c.id)) continue;
    if (!isValidEmail(c.email)) continue;
    const email = c.email.trim().toLowerCase();
    if (blocked.has(email) || seen.has(email) || own.has(email) || email.endsWith("@parssoda.com")) continue;
    seen.add(email);
    out.get(c.country).push(c);
  }
  return out;
}

export function pickDailyBatch(limit, cfg = loadAutoConfig()) {
  const byCountry = eligibleByCountry(cfg);
  const picked = [];
  // لایه‌ی اول: کشورهای اولویت‌دار (به‌نوبت)؛ فقط وقتی همه‌شون تموم شد → بقیه‌ی کشورها (باز هم به‌نوبت).
  const tiers = [
    cfg.countries.filter((c) => cfg.priority_countries.includes(c)),
    cfg.countries.filter((c) => !cfg.priority_countries.includes(c)),
  ];
  for (const tier of tiers) {
    const pools = tier.map((c) => (byCountry.get(c) || []).slice());
    while (picked.length < limit && pools.some((p) => p.length > 0)) {
      for (const p of pools) {
        if (picked.length >= limit) break;
        if (p.length) picked.push(p.shift());
      }
    }
    if (picked.length >= limit) break;
  }
  return picked;
}

// ---------------------------------------------------------------- اجرای روزانه
export function runDaily({ force = false } = {}) {
  const cfg = loadAutoConfig();
  const t = tehranNow();
  const st = readAutoState();
  if (!force) {
    if (t.hour < cfg.send_hour_tehran) return { skipped: "before-hour" };
    if (st.last_daily?.date === t.date) return { skipped: "already-ran" };
  }
  const problem = checkAutoReady();
  if (problem) {
    if (st.last_error !== problem) {
      console.error(`[outreach-auto] ارسال خودکار انجام نشد: ${problem}`);
      patchAutoState({ last_error: problem, last_error_at: new Date().toISOString() });
    }
    return { error: problem };
  }
  const batch = pickDailyBatch(cfg.per_day, cfg);
  const res = enqueueCompanies(batch.map((c) => c.id));
  const byCountry = {};
  for (const c of batch) byCountry[c.country] = (byCountry[c.country] || 0) + 1;
  patchAutoState({
    last_error: null,
    last_daily: { date: t.date, at: new Date().toISOString(), picked: batch.length, queued: res.queued, by_country: byCountry },
  });
  console.log(`[outreach-auto] ${res.queued} شرکت امروز در صف گذاشته شد`, byCountry);
  return { picked: batch.length, queued: res.queued, skipped: res.skipped, by_country: byCountry };
}

// ---------------------------------------------------------------- گزارش هفتگی
function reportRecipient() {
  return (process.env.OUTREACH_REPORT_TO || "").trim() || null;
}

function reportBody(report, remaining) {
  const n = (v) => Number(v || 0).toLocaleString("fa-IR");
  const weekAgo = Date.now() - 7 * DAY_MS;
  const week = (report.rows || []).filter((r) => Date.parse(r.sent_at) >= weekAgo);
  const wk = {
    sent: week.length,
    failed: week.filter((r) => r.status === "failed").length,
    replied: week.filter((r) => r.replied).length,
  };
  const t = report.totals;
  return [
    "سلام،",
    "",
    `گزارش هفتگی ایمیل معرفی «جوش شیرین پارس» (${persianDate()}) پیوست است:`,
    "• فایل اکسل — مخصوص واحد بازرگانی (ریز ارسال‌ها، وضعیت تحویل و پاسخ‌ها)",
    "• فایل HTML — نسخه‌ی ارائه به مدیریت (با نمودار؛ برای PDF از «چاپ» مرورگر استفاده شود)",
    "",
    "خلاصه‌ی ۷ روز اخیر:",
    `• ارسال‌شده: ${n(wk.sent)}`,
    `• برگشتی قطعی: ${n(wk.failed)}`,
    `• پاسخ واقعی: ${n(wk.replied)}`,
    "",
    "جمع کل از ابتدای کمپین:",
    `• ارسال‌شده: ${n(t.sent)} | تحویل تأییدشده: ${n(t.confirmed_delivered)} | برگشتی: ${n(t.failed)} | پاسخ واقعی: ${n(t.replied)} | پاسخ خودکار: ${n(t.auto_replied)}`,
    "",
    remaining != null ? `شرکت‌های واجد شرایط هنوز ارسال‌نشده در برنامه‌ی ارسال خودکار: ${n(remaining)}` : "",
    "",
    "این ایمیل به‌صورت خودکار از پلتفرم تحقیق و توسعه ارسال شده است.",
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}

export async function sendWeeklyReport() {
  const to = reportRecipient();
  if (!to) throw new Error("OUTREACH_REPORT_TO تنظیم نشده");
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) throw new Error("تنظیمات SMTP کامل نیست");

  const report = await buildOutreachReport({ sentRecords: getEmailOutreachSent(), companies: getCompanies(), days: null });
  const xlsx = await buildReportXlsx(report);
  const html = buildReportHtml(report);
  const remaining = [...eligibleByCountry().values()].reduce((a, l) => a + l.length, 0);

  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 30_000, greetingTimeout: 30_000, socketTimeout: 120_000,
  });
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const info = await transport.sendMail({
    from: `"گزارش خودکار ایمیل معرفی" <${fromAddress}>`,
    to, // عمداً بدون CC
    subject: `گزارش هفتگی ایمیل معرفی جوش شیرین پارس — ${persianDate()}`,
    text: reportBody(report, remaining),
    attachments: [
      { filename: reportFileName(report, "xlsx"), content: xlsx },
      { filename: reportFileName(report, "html"), content: html, contentType: "text/html; charset=utf-8" },
    ],
  });
  return { message_id: info.messageId || null, totals: report.totals, to_masked: to.replace(/^(.).*(@.*)$/, "$1***$2") };
}

let reportBusy = false;
export async function runWeeklyReport({ force = false } = {}) {
  if (!reportRecipient()) return { skipped: "no-recipient" };
  const cfg = loadAutoConfig();
  const t = tehranNow();
  const st = readAutoState();
  if (!force) {
    if (t.weekday !== cfg.report.weekday || t.hour < cfg.report.hour_tehran) return { skipped: "not-time" };
    if (st.last_report?.date === t.date) return { skipped: "already-ran" };
    if (st.report_retry?.date === t.date) {
      if ((st.report_retry.attempts || 0) >= REPORT_MAX_ATTEMPTS_PER_DAY) return { skipped: "max-attempts" };
      if (Date.parse(st.report_retry.after) > Date.now()) return { skipped: "retry-later" };
    }
  }
  if (reportBusy) return { skipped: "busy" };
  reportBusy = true;
  try {
    const r = await sendWeeklyReport();
    patchAutoState({ last_report: { date: t.date, at: new Date().toISOString(), sent: r.totals.sent, to: r.to_masked }, report_retry: null, last_report_error: null });
    console.log(`[outreach-auto] گزارش هفتگی ارسال شد (${r.to_masked})`);
    return { ok: true, ...r };
  } catch (err) {
    const msg = String(err?.message || err);
    const attempts = (st.report_retry?.date === t.date ? st.report_retry.attempts || 0 : 0) + 1;
    patchAutoState({
      report_retry: { date: t.date, attempts, after: new Date(Date.now() + REPORT_RETRY_MS).toISOString() },
      last_report_error: msg,
    });
    console.error(`[outreach-auto] ارسال گزارش هفتگی ناموفق (تلاش ${attempts}): ${msg}`);
    return { error: msg };
  } finally {
    reportBusy = false;
  }
}

// ---------------------------------------------------------------- وضعیت (برای UI)
export function getAutoStatus() {
  const cfg = loadAutoConfig();
  const st = readAutoState();
  const byCountry = {};
  let remaining = 0;
  for (const [country, list] of eligibleByCountry(cfg)) {
    byCountry[country] = list.length;
    remaining += list.length;
  }
  const to = reportRecipient();
  return {
    auto_enabled: process.env.OUTREACH_AUTO_ENABLED === "true",
    sending_enabled: process.env.OUTREACH_SENDING_ENABLED === "true",
    test_redirect: !!(process.env.OUTREACH_TEST_REDIRECT || "").trim(),
    ready_problem: checkAutoReady(),
    scheduler_running: !!globalThis.__outreachAutoStarted,
    per_day: cfg.per_day,
    send_hour_tehran: cfg.send_hour_tehran,
    countries: cfg.countries,
    priority_countries: cfg.priority_countries,
    paused_countries: cfg.paused_countries,
    disk: getDiskStatus(),
    remaining_by_country: byCountry,
    remaining_total: remaining,
    days_left: cfg.per_day > 0 ? Math.ceil(remaining / cfg.per_day) : null,
    last_daily: st.last_daily || null,
    last_error: st.last_error || null,
    report: {
      enabled: !!to,
      to_masked: to ? to.replace(/^(.).*(@.*)$/, "$1***$2") : null,
      weekday: cfg.report.weekday,
      hour_tehran: cfg.report.hour_tehran,
      last: st.last_report || null,
      last_error: st.last_report_error || null,
    },
    now_tehran: tehranNow(),
  };
}

// ---------------------------------------------------------------- زمان‌بند
export function startOutreachAuto() {
  if (globalThis.__outreachAutoStarted) return;
  globalThis.__outreachAutoStarted = true;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      if (process.env.OUTREACH_AUTO_ENABLED === "true") runDaily();
      await runWeeklyReport();
    } catch (err) {
      console.error("[outreach-auto]", err);
    } finally {
      busy = false;
    }
  };
  setTimeout(tick, 30 * 1000);
  setInterval(tick, TICK_MS);
  console.log("[outreach-auto] زمان‌بند شروع شد");
}

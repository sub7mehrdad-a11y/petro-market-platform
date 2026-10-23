// پیگیری ایمیل معرفی — بخش IO (IMAP/SMTP/صف/وضعیت پایدار). منطق خالص در outreachFollowupCore.js (تست‌شده).
//
// دو قابلیت، هر دو **پیش‌فرض خاموش** (تا تأیید بازرگانی/هیئت‌مدیره و تنظیم env روی سرور):
//
//  ۱) یادآوری — OUTREACH_REMINDER_ENABLED=true
//     روزی یک‌بار (بعد از ساعت ارسال خودکار)، شرکت‌هایی که ≥ OUTREACH_REMINDER_AFTER_DAYS (۱۴) روز پیش ایمیل معرفی
//     گرفته‌اند و پاسخ واقعی ندادند و برنگشتند، وارد صف می‌شوند (حداکثر OUTREACH_REMINDER_PER_DAY=۱۰ در روز).
//     هر شرکت فقط یک‌بار یادآوری می‌گیرد. اگر وضعیت پاسخ‌ها از صندوق ورودی خوانده نشود (IMAP خطا)، چیزی ارسال نمی‌شود.
//
//  ۲) فوروارد پاسخ مشتری — OUTREACH_FORWARD_ENABLED=true + OUTREACH_FORWARD_TO=<ایمیل سازمانی همکار>
//     هر OUTREACH_FORWARD_POLL_MIN (۱۰) دقیقه صندوق ورودی را برای پاسخ‌های «واقعی» جدید می‌خواند؛ هر پاسخی که به یکی
//     از ایمیل‌های ما تطبیق خورد (نه هر ایمیل دیگری) برای همکار فرستاده می‌شود: خلاصه‌ی مشخصات + متن پاسخ + فایل اصلی
//     (.eml)، با Reply-To = آدرس مشتری. صندوق فقط خوانده می‌شود (هیچ ایمیلی حذف/علامت‌گذاری نمی‌شود). اولین فعال‌سازی
//     فقط «خط پایه» می‌گذارد: پاسخ‌های قدیمی فوروارد نمی‌شوند.
//
// هر دو با قفل اضطراری (data/outreach_halt.json) و حالت تست (OUTREACH_TEST_REDIRECT) هماهنگ‌اند.

import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getCompanies, getEmailOutreachSent } from "@/lib/data";
import { checkOutreachReady, enqueueReminders, readQueue, getHaltReason } from "@/lib/outreachQueue";
import { buildOutreachReport, parseHeaders, domainOf } from "@/lib/outreachReport";
import { tehranNow, loadAutoConfig } from "@/lib/outreachAuto";
import {
  selectReminderCandidates, classifyIncoming, matchIncomingToSent, buildForwardEmail, parseRecipients, REMINDER_DEFAULTS,
} from "@/lib/outreachFollowupCore.js";
import { readFollowupState, mutateFollowupState } from "@/lib/outreachFollowupState";

const MAX_PER_POLL = 30;
const MAX_FORWARD_ATTEMPTS = 5;
const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

export function followupConfig() {
  return {
    reminder: {
      enabled: process.env.OUTREACH_REMINDER_ENABLED === "true",
      afterDays: num(process.env.OUTREACH_REMINDER_AFTER_DAYS, REMINDER_DEFAULTS.afterDays),
      maxAgeDays: num(process.env.OUTREACH_REMINDER_MAX_AGE_DAYS, REMINDER_DEFAULTS.maxAgeDays),
      perDay: Math.min(num(process.env.OUTREACH_REMINDER_PER_DAY, REMINDER_DEFAULTS.perDay), 50),
    },
    forward: {
      enabled: process.env.OUTREACH_FORWARD_ENABLED === "true",
      to: parseRecipients(process.env.OUTREACH_FORWARD_TO),
      pollMin: Math.max(num(process.env.OUTREACH_FORWARD_POLL_MIN, 10), 2),
    },
  };
}

const platformSent = (records) => records.filter((r) => r.source === "outreach-queue" && r.message_id);

// ---------------------------------------------------------------- ۱) یادآوری
export async function runReminders({ force = false } = {}) {
  const cfg = followupConfig().reminder;
  if (!cfg.enabled) return { skipped: "disabled" };
  const halt = getHaltReason();
  if (halt) return { skipped: "halted", reason: halt };
  const t = tehranNow();
  const st = readFollowupState();
  if (!force) {
    if (t.hour < loadAutoConfig().send_hour_tehran) return { skipped: "before-hour" };
    if (st.last_reminder_run?.date === t.date) return { skipped: "already-ran" };
  }
  if (process.env.OUTREACH_SENDING_ENABLED !== "true") return { skipped: "sending-disabled" };
  const problem = checkOutreachReady();
  if (problem) return { error: problem };

  // آشتی با صف: یادآوری‌ای که در صف لغو شده/گم شده دوباره قابل‌انتخاب است.
  const queued = new Map(readQueue().items.filter((i) => i.kind === "reminder").map((i) => [i.id, i]));
  mutateFollowupState((s) => {
    for (const [email, r] of Object.entries(s.reminders)) {
      if (r.status === "queued" && (!queued.has(r.item_id) || queued.get(r.item_id).status === "cancelled")) delete s.reminders[email];
    }
  });

  const sentAll = getEmailOutreachSent();
  const sent = platformSent(sentAll);
  let report;
  try {
    // وضعیت پاسخ/برگشتی همه‌ی ارسال‌های پلتفرم از صندوق ورودی (فقط هدر) — اگر نشد، یادآوری نمی‌رود.
    report = await buildOutreachReport({ sentRecords: sent, companies: getCompanies(), days: null });
  } catch (err) {
    const msg = `خواندن وضعیت پاسخ‌ها از صندوق ورودی ناموفق بود؛ یادآوری ارسال نشد: ${String(err?.message || err)}`;
    mutateFollowupState((s) => { s.last_reminder_run = { date: t.date, at: new Date().toISOString(), error: msg }; });
    console.error(`[outreach-followup] ${msg}`);
    return { error: msg };
  }
  const rowsByEmail = new Map(report.rows.map((r) => [String(r.email).toLowerCase(), r]));
  const { candidates, skipped } = selectReminderCandidates({
    sentRecords: sent, rowsByEmail, reminders: readFollowupState().reminders,
    afterDays: cfg.afterDays, maxAgeDays: cfg.maxAgeDays, limit: cfg.perDay,
  });
  const res = enqueueReminders(candidates);
  const items = readQueue().items.filter((i) => i.kind === "reminder" && i.status === "queued");
  mutateFollowupState((s) => {
    for (const c of candidates) {
      const email = String(c.email).toLowerCase();
      const item = items.find((i) => i.email === email);
      if (item) s.reminders[email] = { status: "queued", item_id: item.id, queued_at: new Date().toISOString() };
    }
    s.last_reminder_run = { date: t.date, at: new Date().toISOString(), picked: candidates.length, queued: res.queued, skipped };
  });
  console.log(`[outreach-followup] یادآوری: ${res.queued} شرکت وارد صف شد`, skipped);
  return { picked: candidates.length, queued: res.queued, skipped };
}

// ---------------------------------------------------------------- ۲) فوروارد پاسخ مشتری
function internalDomains() {
  const out = new Set();
  for (const v of [process.env.SMTP_USER, process.env.SMTP_FROM, process.env.OUTREACH_REPORT_TO]) if (v) out.add(domainOf(v.replace(/^.*</, "").replace(/>.*$/, "")));
  for (const e of (process.env.OUTREACH_CC_EMAILS || "").split(",")) if (e.trim()) out.add(domainOf(e.trim()));
  for (const e of parseRecipients(process.env.OUTREACH_FORWARD_TO)) out.add(domainOf(e));
  out.delete("");
  // ایمیل رایگان (gmail…) به‌عنوان «دامنه‌ی داخلی» حساب نشود، وگرنه همه‌ی gmail نادیده گرفته می‌شد؛ آدرس‌شان جدا چک می‌شود.
  for (const free of ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com"]) out.delete(free);
  return out;
}
function internalAddresses() {
  const out = new Set();
  for (const v of [process.env.SMTP_USER, process.env.SMTP_FROM, process.env.OUTREACH_REPORT_TO]) if (v) out.add(v.toLowerCase());
  for (const e of (process.env.OUTREACH_CC_EMAILS || "").split(",")) if (e.trim()) out.add(e.trim().toLowerCase());
  for (const e of parseRecipients(process.env.OUTREACH_FORWARD_TO)) out.add(e);
  return out;
}

function buildTransport() {
  const host = process.env.SMTP_HOST, user = process.env.SMTP_USER, pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass }, connectionTimeout: 30_000, greetingTimeout: 30_000, socketTimeout: 120_000 });
}

function imapClient() {
  return new ImapFlow({
    host: process.env.SMTP_HOST, port: 993, secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    tls: { rejectUnauthorized: process.env.IMAP_TLS_REJECT_UNAUTHORIZED !== "false" },
    logger: false,
  });
}

let polling = false;

/**
 * یک دور خواندن صندوق ورودی و فوروارد پاسخ‌های جدید. idempotent: پیشرفت (last_uid) بعد از هر پیام ذخیره می‌شود.
 */
export async function pollReplies({ deps = {} } = {}) {  // deps: فقط برای تست (client/transport جعلی)
  const cfg = followupConfig().forward;
  if (!cfg.enabled) return { skipped: "disabled" };
  if (cfg.to.length === 0) return { skipped: "no-recipient" };
  const halt = getHaltReason();
  if (halt) return { skipped: "halted", reason: halt };
  // فوروارد یک ایمیل «داخلی» است (به همکار)؛ فقط به SMTP/IMAP و دیسک پایدار نیاز دارد — نه به لینک کاتالوگ و پیوست معرفی.
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) return { error: "تنظیمات SMTP/IMAP (SMTP_HOST/SMTP_USER/SMTP_PASSWORD) کامل نیست." };
  if (process.env.NODE_ENV === "production" && !process.env.OUTREACH_STATE_DIR) return { error: "OUTREACH_STATE_DIR تنظیم نشده؛ وضعیت فوروارد روی دیسک دائم نیست (بعد از دیپلوی ممکن است پاسخ‌ها دوباره فوروارد شوند)." };
  if (polling) return { skipped: "busy" };
  polling = true;

  const redirect = (process.env.OUTREACH_TEST_REDIRECT || "").trim() || null;
  const nowIso = () => new Date().toISOString();
  const patch = (fn) => mutateFollowupState((s) => { s.reply_forward = s.reply_forward || {}; fn(s.reply_forward); });
  const result = { forwarded: 0, ignored: 0, auto_or_dsn: 0, baselined: false };
  const client = deps.client || imapClient();
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      const mb = client.mailbox;
      const st = readFollowupState().reply_forward || {};
      // ImapFlow مقدار uidValidity را BigInt می‌دهد و JSON.stringify آن را نمی‌پذیرد → به رشته تبدیل می‌شود.
      const uidValidity = String(mb.uidValidity);
      if (st.uidvalidity !== uidValidity || st.last_uid == null) {
        // اولین اجرا (یا صندوق عوض شده): فقط خط پایه — پاسخ‌های قدیمی فوروارد نمی‌شوند.
        patch((r) => { r.uidvalidity = uidValidity; r.last_uid = Number(mb.uidNext || 1) - 1; r.baseline_at = nowIso(); r.last_run = nowIso(); r.last_error = null; });
        console.log(`[outreach-followup] خط پایه‌ی صندوق ورودی ثبت شد (UID ${(mb.uidNext || 1) - 1})؛ از این به بعد پاسخ‌های جدید فوروارد می‌شوند.`);
        return { ...result, baselined: true };
      }

      const lastUid = Number(st.last_uid);
      const found = (await client.search({ uid: `${lastUid + 1}:*` }, { uid: true })) || [];
      const uids = found.filter((u) => u > lastUid).sort((a, b) => a - b).slice(0, MAX_PER_POLL);
      const sentRecords = getEmailOutreachSent();
      const internalDom = internalDomains();
      const internalAddr = internalAddresses();
      const transport = deps.transport || buildTransport();
      const companies = getCompanies();

      for (const uid of uids) {
        const msg = await client.fetchOne(uid, { uid: true, envelope: true, internalDate: true, headers: ["in-reply-to", "references", "auto-submitted", "content-type", "precedence", "message-id"] }, { uid: true });
        const h = parseHeaders(msg?.headers);
        const from = (msg?.envelope?.from?.[0]?.address || "").toLowerCase();
        const subject = msg?.envelope?.subject || "";
        const advance = () => patch((r) => { r.last_uid = uid; });

        const kind = classifyIncoming({ from, subject, headers: h });
        if (kind !== "normal") { result.auto_or_dsn += 1; advance(); continue; }
        if (!from || internalAddr.has(from) || internalDom.has(domainOf(from)) || /^\[پاسخ مشتری\]/.test(subject)) { result.ignored += 1; advance(); continue; }
        const match = matchIncomingToSent({ from, inReplyTo: h["in-reply-to"] || "", references: h["references"] || "" }, sentRecords);
        if (!match) { result.ignored += 1; advance(); continue; } // ایمیل بی‌ارتباط با کمپین: فوروارد نمی‌شود

        const key = (h["message-id"] || `uid-${uid}`).replace(/[<>\s]/g, "");
        if (readFollowupState().reply_forward?.forwarded?.[key]) { advance(); continue; }

        try {
          const full = await client.fetchOne(uid, { uid: true, source: true }, { uid: true });
          const raw = full?.source || null;
          const parsed = raw ? await simpleParser(raw) : null;
          const company = companies.find((c) => c.id === match.record.company_id) || companies.find((c) => (c.email || "").toLowerCase() === match.record.email?.toLowerCase());
          const fwd = buildForwardEmail({
            record: match.record, company, via: match.via, customerFrom: from,
            customerName: parsed?.from?.value?.[0]?.name || null,
            customerSubject: subject, customerDate: msg.internalDate || msg.envelope?.date || null,
            customerText: parsed?.text || "", rawEml: raw,
          });
          const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
          const fromName = process.env.SMTP_FROM_NAME || "Pars Baking Soda Group";
          const to = redirect ? [redirect] : cfg.to;
          await transport.sendMail({
            from: `"${fromName}" <${fromAddress}>`,
            to,
            subject: redirect ? `[TEST] ${fwd.subject}` : fwd.subject,
            text: fwd.text,
            replyTo: fwd.replyTo,
            attachments: fwd.attachments,
          });
          patch((r) => {
            r.forwarded = r.forwarded || {};
            r.forwarded[key] = { at: nowIso(), uid, company: match.record.name || match.record.email, from, via: match.via, test: !!redirect };
            r.last_uid = uid;
            r.last_forwarded_at = nowIso();
            r.forwarded_count = (r.forwarded_count || 0) + 1;
            r.last_error = null;
          });
          result.forwarded += 1;
          console.log(`[outreach-followup] پاسخ «${match.record.name || match.record.email}» برای همکار فوروارد شد (${match.via})`);
        } catch (err) {
          const msgErr = String(err?.message || err);
          let giveUp = false;
          patch((r) => {
            r.failures = r.failures || {};
            const n = ((r.failures[uid] || {}).n || 0) + 1;
            r.failures[uid] = { n, error: msgErr, at: nowIso() };
            r.last_error = `فوروارد UID ${uid} ناموفق (${n}/${MAX_FORWARD_ATTEMPTS}): ${msgErr}`;
            if (n >= MAX_FORWARD_ATTEMPTS) { giveUp = true; r.last_uid = uid; r.skipped_after_failures = (r.skipped_after_failures || 0) + 1; }
          });
          console.error(`[outreach-followup] فوروارد ناموفق (UID ${uid}): ${msgErr}`);
          if (!giveUp) break; // پیشرفت را جلوتر نمی‌بریم؛ دور بعد دوباره همین پیام
        }
      }
    } finally {
      lock.release();
    }
    patch((r) => { r.last_run = nowIso(); });
  } catch (err) {
    const msg = `اتصال/خواندن صندوق ورودی ناموفق: ${String(err?.message || err)}`;
    patch((r) => { r.last_run = nowIso(); r.last_error = msg; });
    console.error(`[outreach-followup] ${msg}`);
    return { ...result, error: msg };
  } finally {
    await client.logout().catch(() => {});
    polling = false;
  }
  return result;
}

// ---------------------------------------------------------------- وضعیت برای پنل
export function getFollowupStatus() {
  const cfg = followupConfig();
  const st = readFollowupState();
  const rem = Object.values(st.reminders);
  const rf = st.reply_forward || {};
  const mask = (e) => e.replace(/^(.).*(@.*)$/, "$1***$2");
  return {
    halted: !!getHaltReason(),
    reminder: {
      enabled: cfg.reminder.enabled,
      after_days: cfg.reminder.afterDays,
      max_age_days: cfg.reminder.maxAgeDays,
      per_day: cfg.reminder.perDay,
      counts: { queued: rem.filter((r) => r.status === "queued").length, sent: rem.filter((r) => r.status === "sent").length, failed: rem.filter((r) => r.status === "failed").length },
      last_run: st.last_reminder_run,
    },
    forward: {
      enabled: cfg.forward.enabled,
      recipients_masked: cfg.forward.to.map(mask),
      poll_min: cfg.forward.pollMin,
      test_redirect: !!(process.env.OUTREACH_TEST_REDIRECT || "").trim(),
      baseline_at: rf.baseline_at || null,
      last_run: rf.last_run || null,
      last_forwarded_at: rf.last_forwarded_at || null,
      forwarded_count: rf.forwarded_count || 0,
      skipped_after_failures: rf.skipped_after_failures || 0,
      last_error: rf.last_error || null,
    },
  };
}

// ---------------------------------------------------------------- زمان‌بند
export function startOutreachFollowup() {
  if (globalThis.__outreachFollowupStarted) return;
  globalThis.__outreachFollowupStarted = true;
  let busyReminders = false;
  const tickReminders = async () => {
    if (busyReminders) return;
    busyReminders = true;
    try { await runReminders(); } catch (err) { console.error("[outreach-followup] reminders", err); } finally { busyReminders = false; }
  };
  const tickReplies = async () => {
    try { await pollReplies(); } catch (err) { console.error("[outreach-followup] replies", err); }
  };
  setTimeout(tickReminders, 60 * 1000);
  setInterval(tickReminders, 10 * 60 * 1000); // در عمل «روزی یک‌بار» است (last_reminder_run.date)
  setTimeout(tickReplies, 90 * 1000);
  const every = Math.max(followupConfig().forward.pollMin, 2) * 60 * 1000;
  setInterval(tickReplies, every);
  console.log("[outreach-followup] زمان‌بند پیگیری شروع شد (یادآوری و فوروارد پاسخ؛ پیش‌فرض خاموش)");
}

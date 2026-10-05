// گزارش عملکرد ایمیل معرفی — با خواندن «هدرهای» صندوق ورودی ایمیل شرکتی (IMAP) و تطبیق با
// لاگ ارسال: چندتا ارسال شد، برای کدام گرید، چندتا برگشت خورد (bounce)، چندتا واقعاً پاسخ دادن.
//
// نکات صادقانه (برای درست تفسیر کردن عددها):
//  - «تحویل‌شده» برآوردی است: ارسال منهای برگشتی‌های قطعی (hard bounce). SMTP فقط می‌گه سرور
//    مقصد پذیرفته؛ اینکه ایمیل به اینباکس رسید یا اسپم شد قابل دانستن نیست.
//  - برگشتی‌ها گاهی تا چند روز بعد می‌رسن؛ پس عدد ارسال‌های خیلی تازه کامل نیست.
//  - «پاسخ» = ایمیل واردی که یا In-Reply-To به Message-ID ایمیل ما داره، یا از همان آدرس/دامنه‌ی
//    شرکتیِ گیرنده است — پاسخ‌های خودکار (Out of Office) جدا شمرده می‌شن و پاسخ حساب نمی‌شن.
//  - فقط هدر و تکه‌ی ابتدایی پیام‌های برگشتی خوانده می‌شه؛ متن ایمیل‌های مشتری‌ها نه.
//  - سرور ایمیل شرکت (MailEnable) چهار نوع پیام وضعیت (DSN) می‌فرسته: «Delivered:» (تحویل به
//    صندوق مقصد — تأیید واقعی)، «Relayed:» (به سرور بعدی سپرده شد، نه تأیید نهایی)، «Delivery
//    Delay» (تأخیر، هنوز تلاش می‌کنه) و «Delivery Failure/Failed:» (برگشت قطعی).
//
// عمداً بدون alias «@/» تا هم Next و هم اسکریپت خط فرمان (scripts/outreach-report.mjs) بتونن import کنن.

import { ImapFlow } from "imapflow";
import { classifyGrade } from "./outreachTemplate.js";

const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "hotmail.com", "outlook.com", "live.com", "msn.com",
  "icloud.com", "mail.ru", "yandex.ru", "yandex.com", "aol.com", "protonmail.com", "qq.com", "163.com",
]);
const AUTO_SUBJECT_RE = /automatic reply|auto.?reply|out of office|autoreply|away from|vacation|خارج از دفتر|پاسخ خودکار/i;
const DSN_SUBJECT_RE = /undeliver|delivery status|failure notice|returned mail|delivery (has )?failed|mail delivery|could not be delivered|message not delivered/i;

const domainOf = (email) => String(email || "").toLowerCase().split("@")[1] || "";

function parseHeaders(buf) {
  const out = {};
  const text = buf ? buf.toString("utf-8") : "";
  // unfold + split
  const unfolded = text.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).toLowerCase()] = line.slice(i + 1).trim();
  }
  return out;
}

// نوع پیام وضعیت: delivered | relayed | delayed | failed — اول از موضوع، بعد از فیلدهای DSN
function dsnKind(subject, text) {
  if (/^\s*delivered:/i.test(subject) || /Action:\s*delivered/i.test(text)) return "delivered";
  if (/^\s*relayed:/i.test(subject) || /Action:\s*relayed/i.test(text)) return "relayed";
  if (/delivery delay|^\s*delayed:/i.test(subject) || /Action:\s*delayed/i.test(text)) return "delayed";
  if (/delivery failure|^\s*failed:|undeliver|returned mail|failure notice|could not be delivered|not delivered/i.test(subject) || /Action:\s*failed/i.test(text) || /Status:\s*5\./i.test(text)) return "failed";
  return "delayed";
}

function parseDsn(subject, sourceText, sentSet) {
  const kind = dsnKind(subject, sourceText);
  const recipients = new Set();
  for (const re of [/Final-Recipient:\s*rfc822;\s*<?([^\s;<>]+@[^\s;<>]+)>?/gi, /X-Failed-Recipients:\s*<?([^\s,;<>]+@[^\s,;<>]+)/gi, /Original-Recipient:\s*rfc822;\s*<?([^\s;<>]+@[^\s;<>]+)>?/gi]) {
    for (const m of sourceText.matchAll(re)) recipients.add(m[1].toLowerCase());
  }
  if (recipients.size === 0) {
    // MailEnable آدرس مقصد رو توی متن می‌نویسه: هر آدرسی که یکی از گیرنده‌های ما باشه
    for (const m of sourceText.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)) {
      const a = m[0].toLowerCase();
      if (sentSet.has(a)) recipients.add(a);
    }
  }
  return { kind, recipients: [...recipients] };
}

// اولویت وضعیت یک گیرنده وقتی چند پیام داره: failed > delivered > relayed > delayed
const KIND_RANK = { failed: 4, delivered: 3, relayed: 2, delayed: 1 };

/**
 * @param {{ sentRecords: object[], companies: object[], days?: number|null }} opts  days=null → همه‌ی زمان
 */
export async function buildOutreachReport({ sentRecords, companies, days = 7 }) {
  const since = days ? new Date(Date.now() - days * 86400000) : null;
  const companyByEmail = new Map();
  for (const c of companies) if (c.email) companyByEmail.set(String(c.email).trim().toLowerCase(), c);

  // ۱) ارسال‌ها (در بازه) با گرید
  const gradeOf = (r) => {
    if (r.grade) return r.grade;
    const c = companyByEmail.get(String(r.email).toLowerCase());
    return c ? classifyGrade(c.target_grade) : "unknown";
  };
  const allSent = sentRecords.map((r) => ({ ...r, email: String(r.email).toLowerCase(), _grade: gradeOf(r) }));
  const inWindow = allSent.filter((r) => !since || Date.parse(r.sent_at) >= since.getTime());
  const sentSet = new Set(allSent.map((r) => r.email));
  const windowByEmail = new Map(inWindow.map((r) => [r.email, r]));
  const messageIds = new Map(allSent.filter((r) => r.message_id).map((r) => [r.message_id, r]));
  const domainToRecord = new Map();
  for (const r of allSent) {
    const d = domainOf(r.email);
    if (d && !FREE_MAIL.has(d) && !domainToRecord.has(d)) domainToRecord.set(d, r);
  }

  // ۲) صندوق ورودی (فقط هدر)
  const client = new ImapFlow({
    host: process.env.SMTP_HOST,
    port: 993,
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    // گواهی TLS سرور ایمیل فعلی (mail.parssoda.com) منقضی‌شده (۲۰۲۴-۱۱) و برای دامنه‌ی دیگری
    // (mail.petrocaspiansepehr.com) صادر شده؛ تا وقتی هاست تمدیدش نکرده، بدون این تنظیم
    // اتصال IMAP با CERT_HAS_EXPIRED رد می‌شه. با IMAP_TLS_REJECT_UNAUTHORIZED=true (پس از تمدید)
    // دوباره سخت‌گیر می‌شه.
    tls: { rejectUnauthorized: process.env.IMAP_TLS_REJECT_UNAUTHORIZED !== "false" },
    logger: false,
  });
  const dsnState = new Map(); // email -> kind (failed|delivered|relayed|delayed)
  const replied = new Map(); // email|domain-key -> record
  const autoReplied = new Set();
  let inboxScanned = 0;
  let unmatchedDsn = 0;
  let otherMail = 0;

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      const query = since ? { since } : { all: true };
      const uids = await client.search(query, { uid: true });
      const headerMsgs = [];
      for await (const msg of client.fetch(uids, { uid: true, envelope: true, internalDate: true, headers: ["in-reply-to", "references", "auto-submitted", "content-type", "precedence"] }, { uid: true })) {
        headerMsgs.push(msg);
      }
      inboxScanned = headerMsgs.length;

      const dsnUids = [];
      const dsnSubject = new Map();
      const classified = [];
      for (const msg of headerMsgs) {
        const h = parseHeaders(msg.headers);
        const from = (msg.envelope?.from?.[0]?.address || "").toLowerCase();
        const subj = msg.envelope?.subject || "";
        const isDsn = /mailer-daemon|postmaster/.test(from) || /delivery-status|report-type/i.test(h["content-type"] || "") || DSN_SUBJECT_RE.test(subj);
        if (isDsn) { dsnUids.push(msg.uid); dsnSubject.set(msg.uid, subj); continue; }
        const auto = (h["auto-submitted"] && h["auto-submitted"].toLowerCase() !== "no") || /auto_reply|bulk/i.test(h["precedence"] || "") || AUTO_SUBJECT_RE.test(subj);
        classified.push({ msg, h, from, auto });
      }

      // برگشتی‌ها: فقط ابتدای پیام (۶۰ کیلوبایت) — پیوست ۲ مگابایتی ایمیل اصلی رو نمی‌گیریم
      if (dsnUids.length) {
        for await (const m of client.fetch(dsnUids, { uid: true, source: { start: 0, maxLength: 60000 } }, { uid: true })) {
          const parsed = parseDsn(dsnSubject.get(m.uid) || "", m.source.toString("utf-8"), sentSet);
          const matched = parsed.recipients.filter((e) => sentSet.has(e));
          if (matched.length === 0) { unmatchedDsn += 1; continue; }
          for (const e of matched) {
            const prev = dsnState.get(e);
            if (!prev || KIND_RANK[parsed.kind] > KIND_RANK[prev]) dsnState.set(e, parsed.kind);
          }
        }
      }

      for (const { h, from, auto, msg } of classified) {
        const refs = `${h["in-reply-to"] || ""} ${h["references"] || ""}`;
        let rec = null;
        for (const [mid, r] of messageIds) if (mid && refs.includes(mid.replace(/[<>]/g, ""))) { rec = r; break; }
        if (!rec && sentSet.has(from)) rec = allSent.find((r) => r.email === from);
        if (!rec) {
          const d = domainOf(from);
          if (d && !FREE_MAIL.has(d)) rec = domainToRecord.get(d) || null;
        }
        if (!rec) { otherMail += 1; continue; }
        if (auto) { autoReplied.add(rec.email); continue; }
        if (!replied.has(rec.email)) replied.set(rec.email, { rec, date: msg.internalDate || msg.envelope?.date || null });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  // ۳) تجمیع به تفکیک گرید (فقط ارسال‌های داخل بازه)
  const grades = {};
  const bucket = (g) => (grades[g] ||= { sent: 0, failed: 0, confirmed_delivered: 0, relayed: 0, delayed: 0, replied: 0, auto_replied: 0 });
  for (const r of inWindow) {
    const b = bucket(r._grade);
    b.sent += 1;
    const st = dsnState.get(r.email);
    if (st === "failed") b.failed += 1;
    else if (st === "delivered") b.confirmed_delivered += 1;
    else if (st === "relayed") b.relayed += 1;
    else if (st === "delayed") b.delayed += 1;
    if (replied.has(r.email)) b.replied += 1;
    if (autoReplied.has(r.email)) b.auto_replied += 1;
  }
  const totals = { sent: 0, failed: 0, confirmed_delivered: 0, relayed: 0, delayed: 0, replied: 0, auto_replied: 0 };
  for (const g of Object.values(grades)) for (const k of Object.keys(totals)) totals[k] += g[k];
  const finish = (o) => ({
    ...o,
    delivered_est: o.sent - o.failed,
    reply_rate_pct: o.sent - o.failed > 0 ? Math.round((o.replied / (o.sent - o.failed)) * 1000) / 10 : null,
    bounce_rate_pct: o.sent > 0 ? Math.round((o.failed / o.sent) * 1000) / 10 : null,
  });

  const repliedList = [...replied.values()]
    .filter(({ rec }) => windowByEmail.has(rec.email))
    .map(({ rec, date }) => ({ name: rec.name || null, grade: rec._grade, country: rec.country || companyByEmail.get(rec.email)?.country || null, date: date ? new Date(date).toISOString() : null }));

  // ردیف‌های تفصیلی هر ارسال (برای خروجی اکسل و نمودار زمانی)
  const rows = inWindow.map((r) => ({
    name: r.name || companyByEmail.get(r.email)?.english_name || null,
    country: r.country || companyByEmail.get(r.email)?.country || null,
    email: r.email,
    grade: r._grade,
    sent_at: r.sent_at,
    status: dsnState.get(r.email) || "none", // failed | delivered | relayed | delayed | none
    replied: replied.has(r.email),
    auto_replied: autoReplied.has(r.email),
  }));

  return {
    generated_at: new Date().toISOString(),
    window_days: days,
    rows,
    since: since ? since.toISOString() : null,
    totals: finish(totals),
    by_grade: Object.fromEntries(Object.entries(grades).map(([g, v]) => [g, finish(v)])),
    replied_companies: repliedList,
    inbox: { scanned: inboxScanned, unmatched_dsn: unmatchedDsn, other_mail: otherMail },
    notes: [
      "«تحویل‌تأییدشده» = پیام «Delivered» سرور ایمیل؛ «تحویل‌شده(برآورد)» = ارسال منهای برگشتی قطعی. اینکه به اینباکس رسید یا اسپم شد قابل‌تشخیص نیست.",
      "برگشتی‌ها تا چند روز بعد از ارسال می‌رسن؛ ارسال‌های خیلی تازه کامل نیستن.",
    ],
  };
}

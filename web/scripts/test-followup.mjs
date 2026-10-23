// تست یکپارچه‌ی یادآوری و فوروارد پاسخ — بدون هیچ اتصال واقعی: IMAP جعلی + سرور SMTP محلی (سینک).
// اجرا (از پوشه‌ی web):  node --import ./scripts/alias-loader.mjs scripts/test-followup.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import assert from "node:assert/strict";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "followup-"));
process.env.OUTREACH_STATE_DIR = tmp;
process.env.SMTP_USER = "export@parssoda.com";
process.env.SMTP_PASSWORD = "x";
process.env.SMTP_HOST = "127.0.0.1";
process.env.OUTREACH_FORWARD_ENABLED = "true";
process.env.OUTREACH_FORWARD_TO = "colleague@parssoda.com";
process.env.OUTREACH_CC_EMAILS = "sales@parssoda.com";
process.env.OUTREACH_TEST_REDIRECT = "";

// ---- سینک SMTP ساده (AUTH PLAIN/LOGIN) که پیام‌ها را نگه می‌دارد
const inbox = [];
const server = net.createServer((sock) => {
  let data = false;
  let buf = "";
  let cur = { to: [], body: "" };
  const w = (s) => sock.write(s + "\r\n");
  w("220 sink ESMTP");
  sock.on("data", (d) => {
    buf += d.toString("utf-8");
    for (;;) {
      if (data) {
        const i = buf.indexOf("\r\n.\r\n");
        if (i < 0) return;
        cur.body = buf.slice(0, i);
        buf = buf.slice(i + 5);
        data = false;
        inbox.push(cur);
        cur = { to: [], body: "" };
        w("250 queued");
        continue;
      }
      const i = buf.indexOf("\r\n");
      if (i < 0) return;
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (/^EHLO|^HELO/i.test(line)) sock.write("250-sink\r\n250-AUTH PLAIN\r\n250 8BITMIME\r\n");
      else if (/^AUTH PLAIN/i.test(line)) w("235 ok");
      else if (/^MAIL FROM/i.test(line)) w("250 ok");
      else if (/^RCPT TO:/i.test(line)) {
        cur.to.push(line.replace(/^RCPT TO:\s*<?/i, "").replace(/>.*$/, ""));
        w("250 ok");
      } else if (/^DATA/i.test(line)) {
        data = true;
        w("354 go");
      } else if (/^QUIT/i.test(line)) {
        w("221 bye");
        sock.end();
      } else w("250 ok");
    }
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
process.env.SMTP_PORT = String(server.address().port);

const { pollReplies, getFollowupStatus } = await import("../lib/outreachFollowup.js");
const { readFollowupState } = await import("../lib/outreachFollowupState.js");
const { enqueueReminders, sendItem, readQueue } = await import("../lib/outreachQueue.js");
const { getCompanies } = await import("../lib/data.js");

// ---- داده‌ی ارسال‌شده‌ها (لاگ پایدار موقت)
const iso = (d) => new Date(Date.now() - d * 86400000).toISOString();
fs.writeFileSync(
  path.join(tmp, "email_outreach_sent.json"),
  JSON.stringify([
    { email: "buyer@acme.kz", name: "Acme", company_id: "c1", country: "قزاقستان", grade: "food", message_id: "<orig-acme@parssoda.com>", sent_at: iso(20), source: "outreach-queue" },
    { email: "owner@gmail.com", name: "Gmail Owner", company_id: "c2", country: "ارمنستان", grade: "feed", message_id: "<orig-gm@parssoda.com>", sent_at: iso(20), source: "outreach-queue" },
  ])
);

// ---- IMAP جعلی
const raw = (from, subject, body, extra = "") =>
  Buffer.from(`From: ${from}\r\nTo: export@parssoda.com\r\nSubject: ${subject}\r\nMessage-ID: <${Math.random().toString(36).slice(2)}@x>\r\n${extra}Content-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n`);
const msgs = new Map();
const add = (uid, from, subject, body, hdr = "") =>
  msgs.set(uid, { uid, from, subject, headers: Buffer.from(hdr + `Message-ID: <m${uid}@x>\r\n`), source: raw(from, subject, body, hdr), internalDate: new Date() });
const mailbox = { uidValidity: 1n, uidNext: 5 }; // ImapFlow: uidValidity از نوع BigInt است
const client = {
  mailbox,
  connect: async () => {},
  logout: async () => {},
  getMailboxLock: async () => ({ release() {} }),
  search: async () => [...msgs.keys()].sort((a, b) => a - b),
  fetchOne: async (uid, q) => {
    const m = msgs.get(uid);
    if (!m) return false;
    return { uid, envelope: { from: [{ address: m.from }], subject: m.subject, date: m.internalDate }, internalDate: m.internalDate, headers: m.headers, source: q.source ? m.source : undefined };
  },
};
const sentMails = [];
let failNext = 0;
const transport = {
  sendMail: async (o) => {
    if (failNext > 0) {
      failNext--;
      throw new Error("smtp down");
    }
    sentMails.push(o);
    return { messageId: "<fwd>" };
  },
};
const deps = { client, transport };

// ۱) اجرای اول: فقط خط پایه
add(1, "old@acme.kz", "Re: old", "old reply before activation", "In-Reply-To: <orig-acme@parssoda.com>\r\n");
let r = await pollReplies({ deps });
assert.equal(r.baselined, true);
assert.equal(sentMails.length, 0, "پاسخ قدیمی نباید فوروارد شود");
assert.equal(readFollowupState().reply_forward.last_uid, 4);

// ۲) پیام‌های جدید
add(5, "buyer@acme.kz", "Re: Stable supply of food-grade sodium bicarbonate", "Please send price for 25 tons FOB.", "In-Reply-To: <orig-acme@parssoda.com>\r\n");
add(6, "buyer@acme.kz", "Automatic reply: out of office", "I am away", "Auto-Submitted: auto-replied\r\n");
add(7, "random@spam.org", "Cheap SEO", "buy now");
add(8, "sales@parssoda.com", "Re: Stable supply", "internal cc chatter", "In-Reply-To: <orig-acme@parssoda.com>\r\n");
add(9, "owner@gmail.com", "Interested", "Send catalog please");
add(10, "MAILER-DAEMON@x.com", "Undelivered Mail", "bounce");
mailbox.uidNext = 11;
r = await pollReplies({ deps });
assert.equal(r.forwarded, 2, JSON.stringify(r));
assert.equal(sentMails.length, 2);
const f1 = sentMails[0];
assert.deepEqual(f1.to, ["colleague@parssoda.com"]);
assert.equal(f1.replyTo, "buyer@acme.kz");
assert.match(f1.subject, /^\[پاسخ مشتری\] Acme/);
assert.match(f1.text, /Please send price for 25 tons FOB\./);
assert.equal(f1.attachments[0].filename, "customer-reply.eml");
assert.equal(sentMails[1].replyTo, "owner@gmail.com");
assert.equal(readFollowupState().reply_forward.last_uid, 10);

// ۳) تکرار: چیزی دوباره فوروارد نمی‌شود
r = await pollReplies({ deps });
assert.equal(r.forwarded, 0);
assert.equal(sentMails.length, 2);

// ۴) خطای SMTP: پیشرفت جلو نمی‌رود، تلاش بعد موفق می‌شود
add(11, "buyer@acme.kz", "Re: second", "another reply", "In-Reply-To: <orig-acme@parssoda.com>\r\n");
mailbox.uidNext = 12;
failNext = 1;
r = await pollReplies({ deps });
assert.equal(r.forwarded, 0);
assert.equal(readFollowupState().reply_forward.last_uid, 10, "با خطا نباید جلو برود");
assert.match(getFollowupStatus().forward.last_error, /ناموفق \(1\/5\)/);
r = await pollReplies({ deps });
assert.equal(r.forwarded, 1);
assert.equal(readFollowupState().reply_forward.last_uid, 11);

// ۵) غیرفعال
process.env.OUTREACH_FORWARD_ENABLED = "false";
assert.equal((await pollReplies({ deps })).skipped, "disabled");
process.env.OUTREACH_FORWARD_ENABLED = "true";

// ۶) یادآوری: ارسال واقعی کد صف به سینک (حالت تست → فقط به آدرس تست؛ Re: + In-Reply-To؛ بدون پیوست)
const company = getCompanies().find((c) => c.email && /@/.test(c.email));
process.env.OUTREACH_TEST_REDIRECT = "tester@example.com";
enqueueReminders([{ email: company.email, company_id: company.id, name: company.english_name, country: company.country, message_id: "<orig-xyz@parssoda.com>", sent_at: iso(20) }]);
const item = readQueue().items.find((i) => i.kind === "reminder");
assert.ok(item, "یادآوری وارد صف شد");
const before = inbox.length;
const res = await sendItem(item);
assert.equal(res.test, true);
assert.equal(inbox.length, before + 1);
const mail = inbox[inbox.length - 1];
assert.ok(mail.to.includes("tester@example.com"));
assert.ok(!mail.to.includes(company.email.toLowerCase()), "در حالت تست نباید به شرکت واقعی برود");
assert.match(mail.body, /In-Reply-To: <orig-xyz@parssoda.com>/i);
const { simpleParser } = await import("mailparser");
const parsedMail = await simpleParser(mail.body);
assert.match(parsedMail.subject, /^\[TEST .*Re: Stable supply/);
assert.ok(!/Content-Disposition: attachment/i.test(mail.body), "یادآوری پیوست ندارد");
assert.match(mail.body, /follow up on my previous email/i);

console.log("✔ همه‌ی تست‌های یکپارچه گذشت");
server.close();
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(0);

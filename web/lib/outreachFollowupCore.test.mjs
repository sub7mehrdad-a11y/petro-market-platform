// اجرا: node --test web/lib/outreachFollowupCore.test.mjs   (بدون هیچ اتصال واقعی IMAP/SMTP)
import test from "node:test";
import assert from "node:assert/strict";
import {
  selectReminderCandidates, buildReminderEmail, classifyIncoming, matchIncomingToSent, buildForwardEmail, parseRecipients,
} from "./outreachFollowupCore.js";

const DAY = 86400000;
const NOW = Date.parse("2026-11-01T10:00:00Z");
const iso = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();
const rec = (email, daysAgo, extra = {}) => ({ email, name: email, sent_at: iso(daysAgo), source: "outreach-queue", message_id: `<m-${email}@x>`, country: "قزاقستان", grade: "food", ...extra });
const rows = (obj) => new Map(Object.entries(obj));

test("یادآوری: فقط بی‌پاسخِ ≥۱۴ روز و ≤۶۰ روز، قدیمی‌ترین اول", () => {
  const sent = [rec("new@a.com", 5), rec("ok1@a.com", 20), rec("ok2@a.com", 30), rec("old@a.com", 90), rec("replied@a.com", 20), rec("bounced@a.com", 20)];
  const r = selectReminderCandidates({
    sentRecords: sent, now: NOW,
    rowsByEmail: rows({ "new@a.com": {}, "ok1@a.com": {}, "ok2@a.com": {}, "old@a.com": {}, "replied@a.com": { replied: true }, "bounced@a.com": { status: "failed" } }),
  });
  assert.deepEqual(r.candidates.map((c) => c.email), ["ok2@a.com", "ok1@a.com"]);
  assert.equal(r.skipped.too_new, 1); assert.equal(r.skipped.too_old, 1); assert.equal(r.skipped.replied, 1); assert.equal(r.skipped.bounced, 1);
});

test("یادآوری: اگر وضعیت پاسخ‌ها معلوم نیست (IMAP ناموفق) هیچ‌کس انتخاب نمی‌شود", () => {
  const r = selectReminderCandidates({ sentRecords: [rec("a@a.com", 30)], rowsByEmail: null, now: NOW });
  assert.equal(r.candidates.length, 0);
});

test("یادآوری: کمپین قدیمی (بدون message_id/غیر پلتفرم) و یادآوری قبلی و استثنا حذف می‌شوند", () => {
  const sent = [rec("legacy@a.com", 30, { source: "legacy-iraq-campaign", message_id: null }), rec("done@a.com", 30), rec("skip@a.com", 30), rec("go@a.com", 30)];
  const r = selectReminderCandidates({
    sentRecords: sent, now: NOW, reminders: { "done@a.com": { sent_at: iso(1) } }, excludeEmails: new Set(["skip@a.com"]),
    rowsByEmail: rows({ "done@a.com": {}, "skip@a.com": {}, "go@a.com": {} }),
  });
  assert.deepEqual(r.candidates.map((c) => c.email), ["go@a.com"]);
});

test("یادآوری: سقف روزانه (limit) رعایت می‌شود", () => {
  const sent = Array.from({ length: 5 }, (_, i) => rec(`c${i}@a.com`, 20 + i));
  const r = selectReminderCandidates({ sentRecords: sent, now: NOW, limit: 2, rowsByEmail: rows(Object.fromEntries(sent.map((s) => [s.email, {}]))) });
  assert.equal(r.candidates.length, 2);
});

test("متن یادآوری: Re: روی سابجکت اصلی، بدون ادعای جدید", () => {
  const m = buildReminderEmail({ originalSubject: "Stable supply of food-grade sodium bicarbonate, direct from the producer", companyName: "Acme Ltd" });
  assert.match(m.subject, /^Re: Stable supply/);
  assert.match(m.body, /^Dear Acme Ltd,/);
  assert.match(m.body, /Pars Baking Soda Group$/);
  assert.equal(buildReminderEmail({ originalSubject: "Re: x" }).subject, "Re: x");
});

test("طبقه‌بندی ورودی: dsn / auto / normal", () => {
  assert.equal(classifyIncoming({ from: "MAILER-DAEMON@x.com", subject: "Undelivered" }), "dsn");
  assert.equal(classifyIncoming({ from: "a@b.com", subject: "Automatic reply: Hi" }), "auto");
  assert.equal(classifyIncoming({ from: "a@b.com", subject: "x", headers: { "auto-submitted": "auto-replied" } }), "auto");
  assert.equal(classifyIncoming({ from: "a@b.com", subject: "Re: your offer" }), "normal");
});

test("تطبیق پاسخ: thread > address > domain؛ ایمیل رایگان هم‌دامنه حساب نمی‌شود؛ بی‌ارتباط = null", () => {
  const sent = [rec("buyer@acme.kz", 20), rec("x@gmail.com", 20)];
  assert.equal(matchIncomingToSent({ from: "someone@other.com", inReplyTo: "<m-buyer@acme.kz@x>" }, sent).via, "thread");
  assert.equal(matchIncomingToSent({ from: "buyer@acme.kz" }, sent).via, "address");
  assert.equal(matchIncomingToSent({ from: "boss@acme.kz" }, sent).via, "domain");
  assert.equal(matchIncomingToSent({ from: "random@gmail.com" }, sent), null);
  assert.equal(matchIncomingToSent({ from: "spam@unknown.org" }, sent), null);
});

test("فوروارد: Reply-To مشتری، متن و .eml ضمیمه؛ eml بزرگ ضمیمه نمی‌شود", () => {
  const base = { record: rec("buyer@acme.kz", 20), company: { english_name: "Acme", country: "قزاقستان" }, via: "thread", customerFrom: "buyer@acme.kz", customerSubject: "Re: offer", customerDate: iso(1), customerText: "Please send price for 25 tons." };
  const f = buildForwardEmail({ ...base, rawEml: Buffer.from("From: a\r\n\r\nhi") });
  assert.equal(f.replyTo, "buyer@acme.kz");
  assert.match(f.subject, /^\[پاسخ مشتری\] Acme/);
  assert.match(f.text, /Please send price for 25 tons\./);
  assert.equal(f.attachments[0].filename, "customer-reply.eml");
  const big = buildForwardEmail({ ...base, rawEml: Buffer.alloc(13 * 1024 * 1024) });
  assert.equal(big.attachments.length, 0); assert.match(big.text, /ضمیمه نشد/);
  const long = buildForwardEmail({ ...base, customerText: "x".repeat(7000) });
  assert.match(long.text, /ادامه‌ی متن در فایل پیوست/);
});

test("گیرنده‌ها: فقط آدرس معتبر و یکتا", () => {
  assert.deepEqual(parseRecipients("A@b.com, bad, a@b.com; c@d.ir"), ["a@b.com", "c@d.ir"]);
  assert.deepEqual(parseRecipients(""), []);
});

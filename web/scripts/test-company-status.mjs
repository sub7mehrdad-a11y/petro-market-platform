// تست وضعیت ایمیل شرکت‌ها (outreachCompanyStatus) بدون هیچ اتصال واقعی: بدون SMTP → پاسخ‌ها «نامشخص»، بقیه از لاگ/صف/وضعیت.
// اجرا (از پوشه‌ی web):  node --import ./scripts/alias-loader.mjs scripts/test-company-status.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cstatus-"));
process.env.OUTREACH_STATE_DIR = tmp;
for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"]) process.env[k] = "";

const { getCompanies } = await import("../lib/data.js");
const { getCompanyEmailStatuses } = await import("../lib/outreachCompanyStatus.js");
const { countByGrade } = await import("../lib/companyGrades.js");

const country = "قزاقستان";
const cs = getCompanies().filter((c) => c.country === country && /@/.test(c.email || ""));
assert.ok(cs.length >= 4, "برای تست حداقل ۴ شرکت با ایمیل لازم است");
const [a, b, c, d] = cs;
const iso = (days) => new Date(Date.now() - days * 86400000).toISOString();

// a: ارسال‌شده + یادآوری ارسال‌شده؛ b: فقط ارسال‌شده؛ c: در صف؛ d: هیچ
fs.writeFileSync(
  path.join(tmp, "email_outreach_sent.json"),
  JSON.stringify([
    { email: a.email, name: a.english_name, company_id: a.id, message_id: "<a@x>", sent_at: iso(20), source: "outreach-queue" },
    { email: b.email.toUpperCase(), name: b.english_name, company_id: b.id, sent_at: iso(40), source: "legacy" },
  ])
);
fs.writeFileSync(
  path.join(tmp, "outreach_followup_state.json"),
  JSON.stringify({ reminders: { [a.email.toLowerCase()]: { status: "sent", sent_at: iso(5) } }, reply_forward: {} })
);
fs.writeFileSync(
  path.join(tmp, "outreach_queue.json"),
  JSON.stringify({ paused: false, items: [{ id: "q1", email: c.email.toLowerCase(), status: "queued", company_id: c.id }] })
);

const r = await getCompanyEmailStatuses({ country });
assert.equal(r.replies_known, false);
assert.equal(r.companies[a.id].sent, true);
assert.equal(r.companies[a.id].reminder, "sent");
assert.equal(r.companies[a.id].legacy, false);
assert.equal(r.companies[b.id].sent, true);
assert.equal(r.companies[b.id].legacy, true, "بدون source پلتفرم = کمپین قبلی");
assert.equal(r.companies[b.id].reminder, null);
assert.equal(r.companies[c.id].queued, true);
assert.equal(r.companies[c.id].sent, false);
assert.equal(r.companies[d.id].sent, false);
assert.equal(r.companies[d.id].queued, false);
assert.equal(r.summary.total, getCompanies().filter((x) => x.country === country).length);
assert.ok(r.summary.sent >= 2 && r.summary.reminded >= 1 && r.summary.queued >= 1);

const g = countByGrade(getCompanies().filter((x) => x.country === country));
assert.equal(Object.values(g).reduce((s, n) => s + n, 0), r.summary.total, "مجموع گریدها = تعداد شرکت‌ها");

console.log("✔ تست وضعیت ایمیل شرکت‌ها گذشت");
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(0);

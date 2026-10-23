// تست اصلاح ایمیل برگشتی بدون شبکه‌ی واقعی: fetch و DNS جعلی، وضعیت در پوشه‌ی موقت.
// اجرا (از پوشه‌ی web):  node --import ./scripts/alias-loader.mjs scripts/test-email-repair.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "erepair-"));
process.env.OUTREACH_STATE_DIR = tmp;

const { getCompanies } = await import("../lib/data.js");
const { findCorrectEmail, searchRepair, approveRepair, rejectRepair, getRepairs } = await import("../lib/outreachEmailRepair.js");
const { hostOf, registeredDomain, isDirectoryHost } = await import("../lib/outreachEmailRepairCore.js");

const tok = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length >= 4 && !/^(company|limited|group|trading|industries|industry|food|foods|products|international|factory|plant|corporation|holding)$/.test(t));
const company = getCompanies().find((c) => c.website && c.email && !isDirectoryHost(hostOf(/^https?:/.test(c.website) ? c.website : `https://${c.website}`)) && tok(c.english_name).length >= 1);
assert.ok(company, "شرکت مناسب برای تست پیدا نشد");
const rootUrl = /^https?:/.test(company.website) ? company.website : `https://${company.website}`;
const dom = registeredDomain(hostOf(rootUrl));
const nameWord = tok(company.english_name)[0];

const page = (body) => ({ ok: true, url: rootUrl, headers: { get: () => "text/html" }, text: async () => body });
const mkFetch = (pages) => async (url) => {
  const key = new URL(url).pathname;
  const html = pages[key] ?? pages[url];
  if (html == null) return { ok: false, status: 404, headers: { get: () => "text/html" }, text: async () => "" };
  return { ok: true, url, headers: { get: () => "text/html" }, text: async () => html };
};
const resolveMx = async (d) => { if (d === dom || d === "gmail.com") return [{ exchange: "mx." + d, priority: 10 }]; throw new Error("ENOTFOUND"); };
const resolve4 = async () => { throw new Error("ENOTFOUND"); };

// ۱) ایمیل هم‌دامنه روی صفحه‌ی تماس → same_domain، و ایمیل خراب/ردیاب نادیده
let r = await findCorrectEmail(company, {
  badEmail: company.email,
  deps: { fetchImpl: mkFetch({ "/": `<title>${company.english_name} official</title><a href="/contacts">Contacts</a>`, "/contacts": `<p>${company.english_name}</p><a href="mailto:info@${dom}">m</a> 605a7baede844d278b89dc95ae0a9123@sentry-next.wixpress.com` }), resolveMx, resolve4 },
});
assert.equal(r.ok, true, JSON.stringify(r));
assert.equal(r.email, `info@${dom}`);
assert.equal(r.confidence, "same_domain");

// ۲) ایمیل خراب پیشنهاد نمی‌شود
r = await findCorrectEmail(company, {
  badEmail: `info@${dom}`,
  deps: { fetchImpl: mkFetch({ "/": `<p>${company.english_name}</p><a href="mailto:info@${dom}">m</a>` }), resolveMx, resolve4 },
});
assert.equal(r.ok, false);
assert.match(r.reason, /دیده نشد/);

// ۳) دامنه‌ی ایمیل DNS ندارد → رد
r = await findCorrectEmail(company, { badEmail: "x@y.com", deps: { fetchImpl: mkFetch({ "/": `<p>${company.english_name}</p><a href="mailto:sales@deadmail-domain.com">m</a>` }), resolveMx, resolve4 } });
assert.equal(r.ok, false);

// ۴) سایت مال شرکت دیگری (نام روی صفحه نیست) → رد
r = await findCorrectEmail(company, { badEmail: "x@y.com", deps: { fetchImpl: mkFetch({ "/": `<p>Completely unrelated shop</p><a href="mailto:info@${dom}">m</a>` }), resolveMx, resolve4 } });
assert.equal(r.ok, false);
assert.match(r.reason, /نام شرکت/);

// ۵) سایت باز نمی‌شود
r = await findCorrectEmail(company, { badEmail: "x@y.com", deps: { fetchImpl: async () => { throw new Error("ECONNREFUSED"); }, resolveMx, resolve4 } });
assert.equal(r.ok, false);
assert.match(r.reason, /باز نشد/);

// ۶) جریان کامل: search → suggested → approve → getCompanies ایمیل جدید را می‌دهد؛ وضعیت پایدار
const deps = { fetchImpl: mkFetch({ "/": `<p>${company.english_name}</p><a href="mailto:sales@${dom}">m</a>` }), resolveMx, resolve4 };
const out = await searchRepair(company.id, { badEmail: company.email, bounce: { class: "no_mailbox" }, deps });
assert.equal(out.ok, true);
assert.equal(getRepairs()[company.id].status, "suggested");
assert.equal(getRepairs()[company.id].suggestion.email, `sales@${dom}`);
assert.equal(approveRepair(company.id).ok, true);
const after = getCompanies().find((c) => c.id === company.id);
assert.equal(after.email, `sales@${dom}`);
assert.equal(after.email_overridden, true);
assert.equal(getRepairs()[company.id].status, "applied");

// ۷) اگر ایمیل مخزن بعداً عوض شد، لایه‌ی override کنار می‌رود (پایمال نمی‌کند)
const state = JSON.parse(fs.readFileSync(path.join(tmp, "outreach_followup_state.json"), "utf-8"));
state.email_overrides[company.id].bad_email = "something-else@nowhere.example";
fs.writeFileSync(path.join(tmp, "outreach_followup_state.json"), JSON.stringify(state));
assert.equal(getCompanies().find((c) => c.id === company.id).email, company.email);

// ۸) رد پیشنهاد → دفعه‌ی بعد همان ایمیل دوباره پیشنهاد نمی‌شود
fs.rmSync(path.join(tmp, "outreach_followup_state.json"));
await searchRepair(company.id, { badEmail: company.email, bounce: { class: "no_domain" }, deps });
assert.equal(rejectRepair(company.id).ok, true);
const again = await searchRepair(company.id, { badEmail: company.email, bounce: { class: "no_domain" }, deps });
assert.equal(again.repair.status, "none_found", JSON.stringify(again.repair));

console.log("✔ تست اصلاح ایمیل برگشتی گذشت");
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(0);

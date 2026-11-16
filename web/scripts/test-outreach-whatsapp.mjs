// تست واتساپ نیمه‌خودکار: فهرست تأییدشده، متن آماده، لینک wa.me، ثبت وضعیت (باز شد ← ارسال شد ← بازنشانی).
//   node --import ./scripts/alias-loader.mjs scripts/test-outreach-whatsapp.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wa-"));
process.env.OUTREACH_STATE_DIR = tmp;
delete process.env.OUTREACH_CATALOG_URL_FOOD;
const W = await import("../lib/outreachWhatsApp.js");

// ---------------------------------------------------------------- فهرست
const leads = W.getWhatsAppLeads();
assert.ok(leads.length >= 300, `فهرست واتساپ: ${leads.length}`);
assert.equal(new Set(leads.map((l) => l.id)).size, leads.length, "شناسه‌ها یکتا");
assert.equal(new Set(leads.map((l) => l.wa_e164)).size, leads.length, "هر شماره فقط یک‌بار (بدون پیام تکراری به یک شماره)");
assert.ok(leads.every((l) => /^\+\d{8,15}$/.test(l.wa_e164) && l.name && l.wa_source_url), "هر ردیف شماره‌ی معتبر، نام و صفحه‌ی منبع دارد");
assert.ok(leads.some((l) => l.company_id), "بخشی از شرکت‌ها به companies.json وصل‌اند");

// ---------------------------------------------------------------- متن
const l0 = leads.find((l) => l.target_grade && /food|خوراک/i.test(l.target_grade) && !/feed|دام|صنعت|industrial/i.test(l.target_grade)) || leads[0];
let m = W.renderWhatsAppMessage({ ...l0, target_grade: "خوراکی (E500ii)" });
assert.equal(m.grade, "food");
assert.match(m.text, new RegExp(`^Hello ${l0.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} team,`));
assert.match(m.text, /15,000 metric tons per month/);
assert.match(m.text, /SGS and COA/);
assert.doesNotMatch(m.text, /LINK PENDING|undefined|null/);
assert.ok(m.missing_catalog.includes("OUTREACH_CATALOG_URL_FOOD"), "لینک تنظیم‌نشده گزارش می‌شود، ولی خط کاتالوگ نمی‌آید");
assert.doesNotMatch(m.text, /Catalogue/);
assert.doesNotMatch(m.text, /\b(?:price|USD|\$)\b/i, "قیمت در پیام نیست");

process.env.OUTREACH_CATALOG_URL_FOOD = "https://parssoda.com/food";
m = W.renderWhatsAppMessage({ ...l0, target_grade: "خوراکی" });
assert.match(m.text, /Food Grade Catalogue: https:\/\/parssoda\.com\/food/);
assert.deepEqual(m.missing_catalog, []);

m = W.renderWhatsAppMessage({ name: "X Co", target_grade: null });
assert.equal(m.grade, "unclear");
assert.doesNotMatch(m.text, /We understand you may be sourcing/, "گرید نامعلوم ← جمله‌ی گرید نمی‌آید (حدس نمی‌زنیم)");
assert.match(W.renderWhatsAppMessage({ name: "Y", target_grade: "Feed" }).text, /Feed Grade sodium bicarbonate for animal nutrition/);

// ---------------------------------------------------------------- لینک
const link = W.whatsAppLink("+971506453445", "Hello & welcome\nline2");
assert.equal(link, "https://wa.me/971506453445?text=Hello%20%26%20welcome%0Aline2");
assert.equal(W.whatsAppLink("abc", "x"), null);
assert.equal(W.whatsAppLink("+123", "x"), null);
assert.ok(W.whatsAppLink("+971506453445", "a".repeat(5000)).length < 2300, "متن بلند بریده می‌شود");

// ---------------------------------------------------------------- وضعیت
assert.equal(W.whatsAppStateProblem(), null);
assert.deepEqual(W.readWhatsAppState().items, {});
const id = leads[0].id;
let r = W.recordWhatsApp(id, "opened", { text: "متن نهایی", at: new Date("2026-11-16T10:00:00Z") });
assert.equal(r.status, "opened");
assert.equal(r.opened_at, "2026-11-16T10:00:00.000Z");
assert.equal(r.history[0].text, "متن نهایی");
r = W.recordWhatsApp(id, "sent", { at: new Date("2026-11-16T10:05:00Z") });
assert.equal(r.status, "sent");
assert.equal(r.opened_at, "2026-11-16T10:00:00.000Z", "زمان باز‌شدن حفظ می‌شود");
assert.equal(r.sent_at, "2026-11-16T10:05:00.000Z");
assert.equal(r.history.length, 2);
assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, "whatsapp_outreach.json"), "utf-8")).items[id].status, "sent", "روی دیسک state ذخیره شد");
assert.equal(W.recordWhatsApp(id, "reset"), null);
assert.deepEqual(W.readWhatsAppState().items, {});
for (let i = 0; i < 30; i++) W.recordWhatsApp(id, "opened");
assert.equal(W.readWhatsAppState().items[id].history.length, 20, "تاریخچه سقف دارد");

// production بدون دیسک دائمی ← مشکل
const prevEnv = process.env.NODE_ENV, prevDir = process.env.OUTREACH_STATE_DIR;
process.env.NODE_ENV = "production"; delete process.env.OUTREACH_STATE_DIR;
assert.match(W.whatsAppStateProblem(), /OUTREACH_STATE_DIR/);
process.env.NODE_ENV = prevEnv; process.env.OUTREACH_STATE_DIR = prevDir;

console.log("test-outreach-whatsapp: همه‌ی بررسی‌ها گذشت");

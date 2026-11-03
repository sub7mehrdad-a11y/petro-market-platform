// تست بخش عملکرد فروش: قالب اکسل → پر کردن با داده‌ی ساختگی (تاریخ شمسی، کشور انگلیسی، ارقام فارسی) → تجزیه → ذخیره → تحلیل.
// هیچ داده‌ی واقعی و هیچ شبکه‌ای در کار نیست. اجرا (از پوشه‌ی web):
//   node --import ./scripts/alias-loader.mjs scripts/test-sales.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sales-"));
process.env.SALES_STATE_DIR = tmp;

const fmt = await import("../lib/salesFormat.js");
const { buildTemplateXlsx } = await import("../lib/salesTemplate.js");
const { parseSalesXlsx } = await import("../lib/salesParse.js");
const store = await import("../lib/salesStore.js");
const { summarizeSales, salesContextForBrain } = await import("../lib/salesAnalytics.js");

// --- تاریخ ---
assert.deepEqual(fmt.jalaliToGregorian(1405, 8, 12), [2026, 11, 3], "۱۴۰۵/۰۸/۱۲ = 2026-11-03");
assert.equal(fmt.parseDateCell("۱۴۰۵/۰۸/۱۲"), "2026-11-03");
assert.equal(fmt.parseDateCell("2026-11-03"), "2026-11-03");
assert.equal(fmt.parseDateCell(new Date(Date.UTC(2026, 10, 3))), "2026-11-03");
assert.equal(fmt.parseDateCell(46329), "2026-11-03"); // سریال اکسل
assert.equal(fmt.parseDateCell("نامعتبر"), null);
assert.equal(fmt.weekStartOf("2026-11-03"), "2026-10-31", "سه‌شنبه → شنبه‌ی همان هفته");
assert.equal(fmt.weekStartOf("2026-10-31"), "2026-10-31", "خود شنبه");
assert.equal(fmt.weekStartOf("2026-11-06"), "2026-10-31", "جمعه آخر هفته است");

// --- قالب ---
const tpl = await buildTemplateXlsx();
const wbT = new ExcelJS.Workbook();
await wbT.xlsx.load(tpl);
assert.equal(wbT.worksheets[0].getRow(1).getCell(3).value, "شرکت طرف قرارداد");
assert.ok(wbT.worksheets[1], "شیت راهنما");

// فایل خالی (فقط ردیف نمونه) → هیچ ردیف معتبری نیست
let p = await parseSalesXlsx(tpl);
assert.equal(p.rows.length, 0, "ردیف نمونه نادیده گرفته می‌شود");

// --- ساخت گزارش ساختگی از روی قالب ---
async function makeFile(rows) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(tpl);
  const ws = wb.worksheets[0];
  ws.spliceRows(2, 1); // ردیف نمونه حذف
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
// ترتیب ستون‌ها: date, doc_no, buyer, country, grade, tons, price, incoterm, currency, amount, status, payment_terms, notes
const week1 = await makeFile([
  ["۱۴۰۵/۰۸/۰۱", "A1", "Buyer One LLC", "عراق", "خوراکی", 25, 262, "FOB", "USD", "", "قرارداد", "LC", ""],
  ["2026-10-29", "A2", "Buyer Two", "Uzbekistan", "صنعتی", "۴۰", "۲۴۵", "FOB", "", "", "ارسال‌شده", "", ""],
  ["۱۴۰۵/۰۸/۰۳", "A3", "Buyer One LLC", "عراق", "دامی", 20, 300, "CIF", "USD", 6000, "", "", ""],
]);
p = await parseSalesXlsx(week1);
assert.equal(p.errors.length, 0, JSON.stringify(p.errors));
assert.equal(p.rows.length, 3);
assert.equal(p.rows[1].country, "ازبکستان", "نام انگلیسی کشور فارسی می‌شود");
assert.equal(p.rows[1].tons, 40, "رقم فارسی در سلول");
assert.equal(p.rows[1].currency, "USD", "ارز پیش‌فرض");
assert.equal(p.rows[0].amount, 6550, "مبلغ = تناژ × قیمت");
assert.equal(p.rows[2].grade, "دامی");

// ردیف‌های بد
const bad = await makeFile([
  ["", "B1", "X Co", "عراق", "خوراکی", 10, 250, "FOB", "USD", "", "", "", ""],
  ["۱۴۰۵/۰۸/۰۱", "B2", "", "عراق", "خوراکی", 10, 250, "FOB", "USD", "", "", "", ""],
  ["۱۴۰۵/۰۸/۰۱", "B3", "Y Co", "عراق", "خوراکی", 0, 250, "FOB", "USD", "", "", "", ""],
  ["۱۴۰۵/۰۸/۰۱", "B4", "Z Co", "Atlantis", "خوراکی", 5, 250, "", "EUR", "", "", "", ""],
]);
p = await parseSalesXlsx(bad);
assert.equal(p.errors.length, 3, "سه ردیف خطا");
assert.equal(p.rows.length, 1);
assert.ok(p.warnings.some((w) => /Atlantis/.test(w.message)) && p.warnings.some((w) => /EUR/.test(w.message)), "کشور ناشناخته و ارز غیردلاری هشدار می‌دهند");

// ستون الزامی گم‌شده
const wbBad = new ExcelJS.Workbook();
wbBad.addWorksheet("x").addRow(["الف", "ب"]);
p = await parseSalesXlsx(Buffer.from(await wbBad.xlsx.writeBuffer()));
assert.match(p.errors[0].message, /ستون‌های الزامی/);

// --- ذخیره و تحلیل چندهفته‌ای ---
assert.equal(store.salesStorageProblem(), null);
const parsed1 = await parseSalesXlsx(week1);
store.saveSalesReport({ weekStart: "2026-10-24", rows: parsed1.rows, filename: "w1.xlsx", uploadedBy: "t", rawBuffer: week1 });
const week2 = await makeFile([
  ["2026-10-31", "C1", "Buyer One LLC", "عراق", "خوراکی", 10, 200, "FOB", "USD", "", "قرارداد", "", ""],
  ["2026-11-01", "C2", "Buyer Three", "Kazakhstan", "خوراکی", 5, 280, "FOB", "USD", "", "قرارداد", "", ""],
]);
const parsed2 = await parseSalesXlsx(week2);
store.saveSalesReport({ weekStart: "2026-10-31", rows: parsed2.rows, filename: "w2.xlsx", uploadedBy: "t" });
// جایگزینی همان هفته
const re = store.saveSalesReport({ weekStart: "2026-10-31", rows: parsed2.rows, filename: "w2b.xlsx", uploadedBy: "t" });
assert.equal(re.replaced_count, 1);
assert.equal(store.readSalesReports().length, 2, "جایگزین شد، تکراری نشد");
assert.ok(fs.readdirSync(path.join(tmp, "uploads")).length >= 1, "فایل اصلی برای ممیزی ذخیره شد");

const s = summarizeSales(store.readSalesReports(), {
  countryScores: [{ country: "عراق", tier: "A", rank: 5 }, { country: "قزاقستان", tier: "A", rank: 4 }, { country: "هند", tier: "A", rank: 1 }],
});
assert.equal(s.empty, false);
assert.equal(s.weekly.length, 2);
assert.equal(s.latest.week, "2026-10-31");
assert.equal(s.latest.tons, 15);
assert.equal(s.weekly[0].tons, 85);
assert.equal(s.latest.avg_price, Math.round(((10 * 200 + 5 * 280) / 15) * 10) / 10, "میانگین وزنی");
assert.equal(s.changes.tons_pct, Math.round(((15 - 85) / 85) * 1000) / 10);
assert.ok(s.alerts.some((a) => /کمتر از هفته‌ی قبل/.test(a.text)), "افت تناژ هشدار می‌دهد");
assert.ok(s.alerts.some((a) => /زیر قیمت مرجع/.test(a.text)), "فروش FOB زیر مرجع (۲۰۰ < ۲۲۵) هشدار می‌دهد");
assert.ok(s.new_buyers_latest.some((b) => b.name === "Buyer Three"));
assert.ok(s.new_countries_latest.includes("قزاقستان"));
assert.ok(s.alignment.tier_a_without_sales.includes("هند"), "ردهٔ A بدون فروش");
assert.equal(s.by_country[0].key, "عراق");

// متن برای مغز: هرگز نام مشتری یا شماره قرارداد
const ctx = salesContextForBrain(s);
assert.ok(ctx.includes("عراق"));
assert.ok(!/Buyer/.test(ctx) && !/C1|A1/.test(ctx), "نام مشتری/شماره قرارداد در متن مغز نیست");

assert.equal(store.deleteSalesReport("2026-10-24"), true);
assert.equal(store.readSalesReports().length, 1);
assert.equal(summarizeSales([]).empty, true);
fs.rmSync(tmp, { recursive: true, force: true });
console.log("✔ تست بخش عملکرد فروش گذشت");

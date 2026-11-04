// تست بخش عملکرد فروش با فرمت واقعی فایل «Sales Report» تیم (سرستون‌ها ردیف ۳، تجمعی، سفارش قطعی/پیشنهاد، پرداخت).
// همه‌ی داده ساختگی است؛ هیچ داده‌ی واقعی و هیچ شبکه‌ای در کار نیست. اجرا (از پوشه‌ی web):
//   node --import ./scripts/alias-loader.mjs scripts/test-sales.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import JSZip from "jszip";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sales-"));
process.env.SALES_STATE_DIR = tmp;

const fmt = await import("../lib/salesFormat.js");
const { buildTemplateXlsx, NATIVE_HEADERS } = await import("../lib/salesTemplate.js");
const { parseSalesXlsx, normalizeCountry } = await import("../lib/salesParse.js");
const store = await import("../lib/salesStore.js");
const { summarizeSales, salesContextForBrain } = await import("../lib/salesAnalytics.js");

// --- تاریخ و هفته ---
assert.deepEqual(fmt.jalaliToGregorian(1405, 8, 12), [2026, 11, 3], "۱۴۰۵/۰۸/۱۲ = 2026-11-03");
assert.equal(fmt.parseDateCell("۱۴۰۵/۰۸/۱۲"), "2026-11-03");
assert.equal(fmt.parseDateCell("2026-11-03"), "2026-11-03");
assert.equal(fmt.parseDateCell(new Date(Date.UTC(2026, 10, 3))), "2026-11-03");
assert.equal(fmt.parseDateCell(46329), "2026-11-03"); // سریال اکسل
assert.equal(fmt.parseDateCell("نامعتبر"), null);
assert.equal(fmt.weekStartOf("2026-11-03"), "2026-10-31", "سه‌شنبه → شنبه‌ی همان هفته");
assert.equal(fmt.weekStartOf("2026-10-31"), "2026-10-31");
assert.equal(fmt.weekStartOf("2026-11-06"), "2026-10-31", "جمعه آخر هفته است");
assert.equal(fmt.daysBetween("2026-10-01", "2026-11-04"), 34);

// --- نرمال‌سازی‌ها ---
assert.equal(fmt.normalizeStage("PI issued"), "firm");
assert.equal(fmt.normalizeStage("Just quoted "), "quote");
assert.equal(fmt.normalizeStage(""), "unknown");
assert.equal(fmt.normalizePayment("Done"), "paid");
assert.equal(fmt.normalizePayment("Yet to pay"), "unpaid");
assert.equal(fmt.normalizePayment("Prepayment received"), "partial");
assert.equal(fmt.extractIncoterm("FCA(SHZ)"), "FCA");
assert.equal(fmt.extractIncoterm("dap"), "DAP");
assert.equal(fmt.extractIncoterm("Ex-works"), "");
assert.equal(fmt.normalizeGrade("Feed"), "دامی");
assert.equal(fmt.normalizeGrade("Poultry"), "دامی");
assert.equal(fmt.normalizeGrade("Food"), "خوراکی");

// --- نام کشور و غلط‌های املایی واقعی تیم ---
for (const [raw, fa] of [["Iraq", "عراق"], ["Uzbakistan", "ازبکستان"], ["UZB", "ازبکستان"], ["Aremenai", "ارمنستان"], ["afghinisn", "افغانستان"],
  ["Belarous", "بلاروس"], ["UAE", "امارات"], ["Iraq(Kurdestan)", "عراق"], ["russia", "روسیه"], ["ازبکستان", "ازبکستان"]]) {
  const c = normalizeCountry(raw);
  assert.equal(c.name, fa, `${raw} → ${fa}`);
  assert.ok(c.known, `${raw} شناخته‌شده`);
}
assert.equal(normalizeCountry("Atlantisia").known, false, "ناشناخته حدس زده نمی‌شود");

// --- ساخت فایل به فرمت واقعی ---
const tpl = await buildTemplateXlsx();
const wbT = new ExcelJS.Workbook();
await wbT.xlsx.load(tpl);
assert.equal(wbT.worksheets[0].getRow(3).getCell(13).value, "Order volume(mt)");
assert.deepEqual(NATIVE_HEADERS.slice(0, 3), ["ROW ", "File NO", "Plant"]);

async function makeFile(rows, { wideValidation = false } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(tpl);
  const ws = wb.worksheets[0];
  ws.spliceRows(4, 1); // ردیف نمونه حذف
  for (const r of rows) ws.addRow(NATIVE_HEADERS.map((h) => r[h.trim()] ?? null));
  let buf = Buffer.from(await wb.xlsx.writeBuffer());
  if (wideValidation) {
    // مثل فایل واقعی تیم: اعتبارسنجی داده‌ی تمام‌ستونی که exceljs را می‌ترکاند
    const zip = await JSZip.loadAsync(buf);
    const name = "xl/worksheets/sheet1.xml";
    let xml = await zip.file(name).async("string");
    xml = xml.replace(/<dataValidations[\s\S]*?<\/dataValidations>/g, "");
    xml = xml.replace("</worksheet>", '<dataValidations count="1"><dataValidation type="list" allowBlank="1" sqref="A1:XFD1048576"><formula1>"a,b"</formula1></dataValidation></dataValidations></worksheet>');
    zip.file(name, xml);
    buf = await zip.generateAsync({ type: "nodebuffer" });
  }
  return buf;
}
const R = (o) => ({ Plant: "SHZ", Currency: "USD", ...o });

// فایل خالی (فقط ردیف نمونه) → هیچ ردیفی نیست
let p = await parseSalesXlsx(tpl);
assert.equal(p.rows.length, 0, "ردیف نمونه نادیده گرفته می‌شود");
assert.equal(p.header_row, 3);

// سرستون ناشناخته
const wbBad = new ExcelJS.Workbook();
wbBad.addWorksheet("x").addRow(["الف", "ب"]);
p = await parseSalesXlsx(Buffer.from(await wbBad.xlsx.writeBuffer()));
assert.match(p.errors[0].message, /سرستون/);

// --- تجزیه ---
const snap1File = await makeFile([
  R({ "File NO": 1, Company: "Alpha Trading", "Customer name": "Mr A", "Final destination": "Iraq", "PI date": new Date(Date.UTC(2026, 9, 5)), "Proposal offer": "PI issued", Grade: "Food", "Order volume(mt)": 25, "Net price(per ton)": 260, "Delivery terms": "FCA(SHZ)", "payment Status": "Yet to pay" }),
  R({ "File NO": 2, Company: "Beta Co", "Final destination": "Aremenai", "PI date": new Date(Date.UTC(2026, 9, 12)), "Proposal offer": "PI issued", Grade: "Food", "Order volume(mt)": 30, "Net price(per ton)": 245, "Delivery terms": "FOB", "payment Status": "Done", Plant: "MHD" }),
  R({ Company: "Gamma LLC", "Final destination": "Uzbakistan", "PI date": new Date(Date.UTC(2026, 8, 1)), "Proposal offer": "Just quoted ", Grade: "Food", "Order volume(mt)": 50, "Net price(per ton)": 255, "Delivery terms": "DAP" }),
  {}, // ردیف کاملاً خالی
], { wideValidation: true });
p = await parseSalesXlsx(snap1File);
assert.equal(p.errors.length, 0, JSON.stringify(p.errors));
assert.equal(p.rows.length, 3);
assert.equal(p.rows[1].country, "ارمنستان");
assert.equal(p.rows[2].country, "ازبکستان");
assert.equal(p.rows[0].incoterm, "FCA");
assert.equal(p.rows[0].amount, 6500, "مبلغ = حجم × قیمت");
assert.equal(p.rows[0].currency, "USD", "ارز خالی = USD");
assert.equal(p.rows[0].stage, "firm");
assert.equal(p.rows[2].stage, "quote");
assert.equal(p.rows[0].payment_status, "unpaid");
assert.ok(p.warnings.some((w) => /Aremenai/.test(w.message) && /Uzbakistan/.test(w.message)), "تصحیح املا گزارش می‌شود");

// ردیف‌های بد/ناقص
const bad = await makeFile([
  R({ Company: "X", "Final destination": "Iraq", "Order volume(mt)": "abc", "Net price(per ton)": 250 }),
  R({ Company: "Y", "Final destination": "Iraq", "Order volume(mt)": 10 }),
  R({ Company: "Z", "Final destination": "Atlantisia", "Order volume(mt)": 5, "Net price(per ton)": 250, Currency: "EUR", "Delivery terms": "Ex-works" }),
  R({ Company: "SAMPLE - delete", "Final destination": "Iraq", "Order volume(mt)": 5, "Net price(per ton)": 250 }),
]);
p = await parseSalesXlsx(bad);
assert.equal(p.errors.length, 1, "حجم غیرعددی خطا است");
assert.equal(p.rows.length, 2, "ردیف بدون قیمت ذخیره می‌شود (با هشدار)؛ نمونه نادیده");
assert.equal(p.rows[0].price, null);
assert.equal(p.rows[0].amount, null);
assert.ok(p.warnings.some((w) => /قیمت واحد ندارد/.test(w.message)));
assert.ok(p.warnings.some((w) => /EUR/.test(w.message)) && p.warnings.some((w) => /Atlantisia/.test(w.message)));

// --- ذخیره: عکس‌های لحظه‌ای ---
assert.equal(store.salesStorageProblem(), null);
store.saveSalesSnapshot({ asOf: "2026-10-28", rows: (await parseSalesXlsx(snap1File)).rows, filename: "s1.xlsx", uploadedBy: "t", rawBuffer: snap1File });
const snap2File = await makeFile([
  R({ "File NO": 1, Company: "Alpha Trading", "Final destination": "Iraq", "PI date": new Date(Date.UTC(2026, 9, 5)), "Proposal offer": "PI issued", Grade: "Food", "Order volume(mt)": 25, "Net price(per ton)": 260, "Delivery terms": "FCA(SHZ)", "payment Status": "Done" }),
  R({ "File NO": 2, Company: "Beta Co", "Final destination": "Armenia", "PI date": new Date(Date.UTC(2026, 9, 12)), "Proposal offer": "PI issued", Grade: "Food", "Order volume(mt)": 30, "Net price(per ton)": 245, "Delivery terms": "FOB", "payment Status": "Done", Plant: "MHD" }),
  R({ "File NO": 3, Company: "Gamma LLC", "Final destination": "Uzbekistan", "PI date": new Date(Date.UTC(2026, 8, 1)), "Proposal offer": "PI issued", Grade: "Food", "Order volume(mt)": 50, "Net price(per ton)": 255, "Delivery terms": "DAP" }),
  R({ "File NO": 4, Company: "Delta Inc", "Final destination": "Iraq", "PI date": new Date(Date.UTC(2026, 10, 2)), "Proposal offer": "PI issued", Grade: "Feed", "Order volume(mt)": 20, "Net price(per ton)": 200, "Delivery terms": "FCA(MHD)", "payment Status": "Yet to pay", Plant: "MHD" }),
  R({ Company: "Eps Ltd", "Final destination": "Jordan", "PI date": new Date(Date.UTC(2026, 8, 10)), "Proposal offer": "Just quoted", Grade: "Food", "Order volume(mt)": 10, "Net price(per ton)": 260, "Delivery terms": "DAP" }),
]);
const parsed2 = await parseSalesXlsx(snap2File);
store.saveSalesSnapshot({ asOf: "2026-11-04", rows: parsed2.rows, filename: "s2.xlsx", uploadedBy: "t" });
const re = store.saveSalesSnapshot({ asOf: "2026-11-04", rows: parsed2.rows, filename: "s2b.xlsx", uploadedBy: "t" });
assert.equal(re.replaced_count, 1);
assert.equal(store.readSalesSnapshots().length, 2, "جایگزین شد، تکراری نشد");
assert.ok(fs.readdirSync(path.join(tmp, "uploads")).length >= 1, "فایل اصلی برای ممیزی ذخیره شد");

// --- تحلیل ---
const s = summarizeSales(store.readSalesSnapshots(), {
  countryScores: [{ country: "عراق", tier: "A", rank: 5 }, { country: "هند", tier: "A", rank: 1 }, { country: "ارمنستان", tier: "B", rank: 11 }],
});
assert.equal(s.as_of, "2026-11-04");
assert.equal(s.firm_totals.tons, 125, "پیشنهاد در فروش نمی‌آید");
assert.equal(s.firm_totals.deals, 4);
assert.equal(s.pipeline.tons, 10);
assert.equal(s.firm_totals.avg_price, 244.8, "میانگین وزنی");
assert.equal(s.price.fob_avg, 238, "فقط FOB/FCA/EXW");
assert.equal(s.weekly.length, 10, "هفته‌ها پر می‌شوند (۲۹ آگوست تا ۳۱ اکتبر)");
assert.ok(s.weekly.some((w) => w.tons === 0), "هفته‌ی بدون سفارش با صفر می‌آید");
assert.equal(s.weekly[s.weekly.length - 1].in_progress, true);
assert.equal(s.weekly[s.weekly.length - 1].tons, 20);
assert.equal(s.window30.last.tons, 50);
assert.equal(s.window30.prev.tons, 25);
assert.equal(s.window30.tons_pct, 100);
assert.equal(s.receivables.unpaid_tons, 20);
assert.equal(s.receivables.aging[0].deals, 1, "بدهی تا ۳۰ روز");
assert.equal(s.since_last.new_firm.deals, 2, "سفارش 3 (تبدیل پیشنهاد) و 4 جدید");
assert.equal(s.since_last.new_firm.tons, 70);
assert.equal(s.since_last.newly_paid.deals, 1);
assert.ok(s.alerts.some((a) => /زیر قیمت مرجع/.test(a.text)), "فروش FCA با ۲۰۰ دلار زیر مرجع");
assert.ok(s.alerts.some((a) => /Just quoted/.test(a.text)), "پیشنهاد بیش از ۴۵ روز مانده");
assert.ok(s.alignment.tier_a_without_sales.includes("هند"));
assert.equal(s.by_country[0].key, "ازبکستان");
assert.equal(s.by_plant.find((x) => x.key === "MHD").tons, 50);
assert.equal(s.concentration.buyer_count, 4);

// متن برای مغز: هرگز نام مشتری، تماس یا شماره PI/فایل
const ctx = salesContextForBrain(s);
assert.ok(ctx.includes("عراق"));
assert.ok(!/Alpha|Beta|Gamma|Delta|Eps|Mr A/.test(ctx), "نام مشتری در متن مغز نیست");

assert.equal(store.deleteSalesSnapshot("2026-10-28"), true);
assert.equal(store.readSalesSnapshots().length, 1);
assert.equal(summarizeSales([]).empty, true);
fs.rmSync(tmp, { recursive: true, force: true });
console.log("✔ تست بخش عملکرد فروش گذشت");

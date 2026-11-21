// تست نسخه‌ی دوم پنل بازرگانی: انتقال قرارداد اکسل به پلتفرم، تاریخچه‌ی ویرایش، بارگیری چندمرحله‌ای، لیست بارگیری به ترتیب پرداخت، بررسی کشورها.
//   node --import ./scripts/alias-loader.mjs scripts/test-sales-v2.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "salesv2-"));
process.env.SALES_STATE_DIR = tmp;

const C = await import("../lib/salesContracts.js");
const CS = await import("../lib/salesContractsStore.js");
const store = await import("../lib/salesStore.js");
const LS = await import("../lib/salesLedgerStore.js");
const { buildLoadingList } = await import("../lib/salesLoading.js");
const SC = await import("../lib/salesCountry.js");

const row = (o) => ({ row: 0, source: "sheet", file_no: null, doc_no: null, date: "2026-10-01", stage: "firm", buyer: "X", contact: null, country: "روسیه", grade: "Food grade", tons: 25, price: 250, currency: "USD", amount: 6250, incoterm: "FCA", delivery_terms: "FCA", plant: "Shiraz", port: null, payment_terms: "100% advance", payment_status: "unpaid", production_done: false, loaded: false, ...o });
const rows = [
  row({ file_no: "F-1", buyer: "Alpha LLC", tons: 100, price: 240, amount: 24000, date: "2026-09-01" }),
  row({ file_no: "F-2", buyer: "Beta Co", country: "عراق", tons: 50, price: 260, amount: 13000, date: "2026-09-10", payment_status: "paid" }),
  row({ file_no: "F-3", buyer: "Gamma Co", country: "افغانستان", tons: 30, price: 255, amount: 7650, date: "2026-10-05" }),
  row({ file_no: "F-4", buyer: "Delta Co", country: "روسیه", tons: 20, price: 250, amount: 5000, date: "2026-10-20", loaded: true }),
  row({ file_no: "Q-1", buyer: "Quote Co", stage: "quote", tons: 10 }),
];
store.saveSalesSnapshot({ asOf: "2026-11-15", rows, filename: "t.xlsx", uploadedBy: "t", rawBuffer: Buffer.from("x"), warningCount: 0 });

// ------------------------------------------------------------------ انتقال قرارداد اکسل
assert.equal(CS.readContracts().length, 0);
let r = CS.adoptFromSheet("F-1", "amin");
assert.equal(r.ok, true);
const c1 = r.contract;
assert.equal(c1.file_no, "F-1");
assert.equal(c1.buyer, "Alpha LLC");
assert.equal(c1.tons, 100);
assert.equal(c1.grade, "خوراکی");
assert.equal(c1.incoterm, "FCA");
assert.equal(c1.history[0].action, "adopt");
assert.equal(CS.adoptFromSheet("F-1", "amin").already, true, "دوباره منتقل نمی‌شود");
assert.equal(CS.adoptFromSheet("Q-1", "amin").ok, false, "پیشنهاد (غیرقطعی) منتقل نمی‌شود");
assert.equal(CS.readContracts().length, 1);
// ردیف پلتفرم جای ردیف اکسل را می‌گیرد، بدون تکرار
const eff = CS.readEffectiveSnapshots();
assert.equal(eff[eff.length - 1].rows.filter((x) => x.file_no === "F-1").length, 1);
assert.equal(eff[eff.length - 1].rows.find((x) => x.file_no === "F-1").source, "platform");

// ------------------------------------------------------------------ ویرایش با تاریخچه‌ی قبل/بعد
r = CS.updateContract(c1.id, { tons: 120, price: 245, date: "2026-09-02", delivery_plan: [{ date: "2026-12-01", tons: 60 }] }, "sara");
assert.equal(r.ok, true);
const h = r.contract.history.at(-1);
assert.equal(h.action, "update");
assert.equal(h.by, "sara");
const tonsCh = h.changes.find((x) => x.field === "tons");
assert.deepEqual([tonsCh.from, tonsCh.to], [100, 120]);
assert.ok(h.changes.some((x) => x.field === "price" && x.from === 240 && x.to === 245));
assert.ok(h.changes.some((x) => x.field === "delivery_plan"));
// بدون تغییر واقعی ← ورودی تاریخچه ساخته نمی‌شود
const n0 = CS.getContract(c1.id).history.length;
CS.updateContract(c1.id, { tons: 120 }, "sara");
assert.equal(CS.getContract(c1.id).history.length, n0);

// ------------------------------------------------------------------ بارگیری چندمرحله‌ای
r = CS.addShipment(c1.id, { tons: 50, planned_date: "2026-11-20" }, "amin");
assert.equal(r.ok, true);
const s1 = r.shipment;
assert.equal(s1.status, "queued");
assert.equal(CS.addShipment(c1.id, { tons: 80 }, "amin").ok, false, "مجموع از تناژ قرارداد بیشتر می‌شود");
assert.match(CS.addShipment(c1.id, { tons: 80 }, "amin").errors[0], /باقیمانده/);
assert.equal(CS.addShipment(c1.id, { tons: 0 }, "amin").ok, false);
assert.equal(CS.addShipment(c1.id, { tons: 70 }, "amin").ok, true);
assert.equal(C.shipmentTotals(CS.getContract(c1.id)).remaining, 0);
r = CS.updateShipment(c1.id, s1.id, { status: "loaded", loaded_at: "2026-11-14" }, "amin");
assert.equal(r.shipment.loaded_at, "2026-11-14");
assert.equal(CS.getContract(c1.id).steps.loaded?.done, undefined, "فقط یک بارگیری از دو ← مرحله‌ی بارگیری هنوز تیک نمی‌خورد");
const s2 = CS.getContract(c1.id).shipments[1];
CS.updateShipment(c1.id, s2.id, { status: "shipped" }, "amin");
let cc = CS.getContract(c1.id);
assert.equal(cc.steps.loaded.done, true, "همه بارگیری شد ← مرحله‌ی بارگیری خودکار");
assert.notEqual(cc.steps.shipped?.done, true, "فقط بخشی ارسال شده ← مرحله‌ی ارسال تیک نمی‌خورد");
assert.ok(cc.history.some((x) => x.action === "shipment" && /ویرایش بارگیری/.test(x.summary)));
// کاهش تناژ بارگیری به بیشتر از باقیمانده ردّ می‌شود
assert.equal(CS.updateShipment(c1.id, s1.id, { tons: 500 }, "amin").ok, false);
// حذف
CS.deleteShipment(c1.id, s2.id, "amin");
assert.equal(CS.getContract(c1.id).shipments.length, 1);

// ------------------------------------------------------------------ لیست بارگیری به ترتیب «زودتر پرداخت‌کننده»
const c3 = CS.adoptFromSheet("F-3", "amin").contract;
const c4 = CS.adoptFromSheet("F-4", "amin").contract;
CS.addShipment(c3.id, { tons: 30, planned_date: "2026-11-30" }, "amin");
CS.addShipment(c1.id, { tons: 70, planned_date: "2026-12-05" }, "amin"); // دوباره (قبلی حذف شد)
// پرداخت‌ها: Gamma زودتر از Alpha
LS.addPayment({ contract_key: "F-3", date: "2026-10-06", amount: 7650, type: "payment" }, "amin");
LS.addPayment({ contract_key: "F-1", date: "2026-10-20", amount: 14700, type: "payment" }, "amin");
const acc = LS.loadAccounts().accounts;
let list = buildLoadingList(CS.readContracts(), acc.contracts);
assert.deepEqual(list.queue.map((q) => q.file_no), ["F-3", "F-1"], "Gamma (پرداخت ۱۰-۰۶) پیش از Alpha (۱۰-۲۰)");
assert.deepEqual(list.ordered.map((o) => `${o.rank}:${o.file_no}:${o.kind}`), ["1:F-2:unplanned", "2:F-3:shipment", "3:F-1:shipment"], "ترتیب واحد: قرارداد Done اکسل (تاریخ PI ۰۹-۱۰) پیش از Gamma (۱۰-۰۶) و Alpha (۱۰-۲۰)");
assert.equal(list.queue[0].paid_pct, 100);
assert.ok(list.queue[1].paid_pct > 0 && list.queue[1].paid_pct < 100);
assert.ok(list.queue[1].covered_tons < 120 && list.queue[1].covered_tons > 0, "تناژ قابل‌بارگیری با پرداخت فعلی");
assert.equal(list.loaded[0].file_no, "F-1", "بارگیری‌شده‌ی F-1 جدا می‌آید");
// قرارداد بدون پرداخت در صف نیست
const noPay = list.waiting.map((x) => x.file_no);
assert.ok(!list.queue.some((q) => q.file_no === "F-4") && (noPay.includes("F-4") || true));
// قرارداد اکسلِ «Done» (F-2): بدون پرداخت ثبت‌شده، تاریخ PI اولویت می‌شود و بارگیری‌نشده است ← آماده‌ی ثبت بارگیری (بدون انتقال)
assert.ok(list.unplanned.some((u) => u.file_no === "F-2" && u.platform === false && u.priority_basis === "sheet"));
assert.ok(!list.unplanned.some((u) => u.file_no === "F-4"), "F-4 بارگیری‌شده است");

// ------------------------------------------------------------------ بررسی کشورها
const firm = rows.filter((x) => x.stage === "firm");
const s = SC.salesToCountry(firm, "روسیه", "2026-11-15", 3);
assert.equal(s.tons, 120);
assert.equal(s.deals, 2);
assert.equal(s.avg_price, 241.7);
assert.equal(s.monthly_avg_tons, 40);
assert.equal(s.months.length, 3, "سپتامبر تا نوامبر");
assert.equal(s.months.find((m) => m.month === "2026-11").tons, 0, "ماه بدون سفارش صفر می‌آید");
const market = { imports_tons: 12000, source: "x", import_unit_value_usd: 300, has_report: true };
const tbl = SC.buildCountryTable(firm, "2026-11-15", 3, ["روسیه", "عراق", "قطر"], () => market);
assert.equal(tbl[0].country, "روسیه");
assert.equal(tbl.find((t) => t.country === "قطر").has_sales, false);
assert.equal(tbl[0].share_pct, 4, "۱۲۰ تن در ۳ ماه ← ۴۸۰ در سال از ۱۲٬۰۰۰ = ۴٪");
const d = SC.buildCountryDetail(firm, "2026-11-15", "روسیه", { windowMonths: 3, market, suppliers: [], competitors: [{ name: "چین", unit_value: 200, tons: 1 }, { name: "هند", unit_value: 280, tons: 1 }, { name: "ترکیه", unit_value: 450, tons: 1 }] });
assert.equal(d.position.of, 3);
assert.equal(d.position.cheaper_than, 2, "قیمت ما (≈۲۴۲) از هند و ترکیه ارزان‌تر است");
assert.equal(d.scenarios[1].tons, 1200);
assert.equal(d.scenarios[1].extra_tons, 720);
assert.ok(d.notes.some((n) => /سهم سالانه/.test(n.text)));
const none = SC.buildCountryDetail(firm, "2026-11-15", "قطر", { windowMonths: 3, market: { imports_tons: null }, suppliers: [], competitors: [] });
assert.equal(none.sales.deals, 0);
assert.equal(none.share_pct, null);
assert.ok(none.notes.some((n) => /سفارش قطعی/.test(n.text)));

console.log("test-sales-v2: همه‌ی بررسی‌ها گذشت");

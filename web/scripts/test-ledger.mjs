// تست حسابداری فروش (قرارداد ↔ پرداخت ↔ حساب مشتری) با داده‌ی ساختگی. اجرا (از پوشه‌ی web):
//   node --import ./scripts/alias-loader.mjs scripts/test-ledger.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-"));
process.env.SALES_STATE_DIR = tmp;

const L = await import("../lib/salesLedger.js");
const store = await import("../lib/salesStore.js");
const ls = await import("../lib/salesLedgerStore.js");
const { buildStatementXlsx } = await import("../lib/salesStatement.js");

// --- مهلت و کلید مشتری ---
assert.equal(L.dueDaysFor("100%Cash in advance"), 0);
assert.equal(L.dueDaysFor("Credit"), 30);
assert.equal(L.dueDaysFor("70%Prepayment-30% upon documents"), 30);
assert.equal(L.dueDaysFor("Net 45 days"), 45);
assert.equal(L.dueDaysFor(""), 14);
assert.equal(L.customerKeyOf("Alpha Trading LLC"), L.customerKeyOf("ALPHA  trading"));
assert.equal(L.customerKeyOf("Limited Liability Company «RBS»"), L.customerKeyOf("RBS LLC"));
assert.notEqual(L.customerKeyOf("Beta Co"), L.customerKeyOf("Gamma"));

// --- عکس گزارش فروش ساختگی ---
const row = (o) => ({ stage: "firm", currency: "USD", incoterm: "FCA", payment_status: "unknown", payment_terms: "100%Cash in advance", tons: 0, price: null, amount: null, ...o });
const rows = [
  row({ file_no: "1", doc_no: "P1", buyer: "Alpha Trading LLC", country: "عراق", date: "2026-09-01", tons: 100, price: 250, amount: 25000, payment_status: "paid" }),
  row({ file_no: "2", doc_no: "P2", buyer: "ALPHA TRADING", country: "عراق", date: "2026-10-01", tons: 40, price: 260, amount: 10400, payment_status: "unpaid" }),
  row({ file_no: "3", doc_no: "P3", buyer: "Beta Co", country: "ارمنستان", date: "2026-10-20", tons: 20, price: 250, amount: 5000, payment_status: "unpaid", payment_terms: "Credit" }),
  row({ file_no: "4", doc_no: "P4", buyer: "Gamma", country: "روسیه", date: "2026-10-25", tons: 10 }), // بدون قیمت/مبلغ
  row({ file_no: "5", doc_no: "P5", buyer: "Delta", country: "امارات", date: "2026-10-26", tons: 5, price: 200, amount: 1000, currency: "EUR" }),
  row({ stage: "quote", file_no: "9", buyer: "Quote Only", country: "اردن", date: "2026-10-01", tons: 50, price: 250, amount: 12500 }),
];
store.saveSalesSnapshot({ asOf: "2026-11-04", rows, filename: "t.xlsx", uploadedBy: "t" });

let { accounts: a } = ls.loadAccounts();
assert.equal(a.contracts.length, 5, "پیشنهاد قرارداد نیست");
const c = (k) => a.contracts.find((x) => x.key === k);
assert.equal(c("1").status, "paid");
assert.equal(c("1").basis, "sheet", "Done در گزارش = پرداخت‌شده «طبق گزارش»");
assert.equal(c("2").status, "unpaid");
assert.equal(c("2").days_since, 34);
assert.equal(c("2").overdue_days, 34, "پیش‌پرداخت نقدی: مهلت ۰ روز");
assert.equal(c("3").overdue, false, "Credit = ۳۰ روز مهلت؛ ۱۵ روز گذشته");
assert.equal(c("4").status, "no_total");
assert.equal(a.customers.length, 4, "Alpha دو نام یک مشتری است");
const alpha = a.customers.find((x) => /alpha/i.test(x.name));
assert.equal(alpha.deals, 2);
assert.equal(alpha.total, 35400);
assert.equal(alpha.paid, 25000);
assert.equal(alpha.balance, 10400);
assert.equal(alpha.name_variants.length, 2);
assert.equal(a.totals.invoiced, 40400, "فقط دلاری و دارای مبلغ: 25000+10400+5000");
assert.equal(a.totals.outstanding, 15400);
assert.equal(a.totals.overdue, 10400);
assert.equal(a.totals.non_usd, 1);
assert.equal(a.totals.no_total, 1);
assert.equal(a.totals.from_sheet.contracts, 1);

// --- ثبت پرداخت ---
let r = ls.addPayment({ contract_key: "2", date: "2026-10-10", amount: 4000, method: "bank", reference: "TT-1" }, "u1");
assert.ok(r.ok, JSON.stringify(r));
({ accounts: a } = ls.loadAccounts());
assert.equal(a.contracts.find((x) => x.key === "2").status, "partial");
assert.equal(a.contracts.find((x) => x.key === "2").balance, 6400);
assert.equal(a.contracts.find((x) => x.key === "2").basis, "ledger");

// خطاها و هشدارها
assert.equal(ls.addPayment({ contract_key: "2", date: "2026-10-10", amount: -5 }, "u1").ok, false);
assert.equal(ls.addPayment({ contract_key: "nope", date: "2026-10-10", amount: 5 }, "u1").ok, false);
assert.equal(ls.addPayment({ contract_key: "2", date: "نامعتبر", amount: 5 }, "u1").ok, false);
r = ls.addPayment({ contract_key: "2", date: "2026-10-11", amount: 99999 }, "u1");
assert.equal(r.ok, false);
assert.ok(r.needs_confirm, "بیش‌پرداخت نیاز به تأیید دارد");
r = ls.addPayment({ contract_key: "2", date: "2026-10-10", amount: 4000, reference: "TT-1" }, "u1");
assert.ok(r.needs_confirm && /تکراری/.test(r.warnings.join(" ")), "پرداخت تکراری هشدار می‌دهد");
r = ls.addPayment({ contract_key: "2", date: "2026-11-01", amount: 6400, method: "cash" }, "u1");
assert.ok(r.ok);
({ accounts: a } = ls.loadAccounts());
assert.equal(a.contracts.find((x) => x.key === "2").status, "paid");
assert.equal(a.contracts.find((x) => x.key === "2").payments.length, 2);

// استرداد
r = ls.addPayment({ contract_key: "2", date: "2026-11-02", amount: 400, type: "refund", note: "اصلاح" }, "u1");
assert.ok(r.ok);
({ accounts: a } = ls.loadAccounts());
assert.equal(a.contracts.find((x) => x.key === "2").paid, 10000, "استرداد از پرداختی کم می‌شود");
assert.equal(a.contracts.find((x) => x.key === "2").balance, 400);

// پرداخت بدون قرارداد (پیش‌دریافت مشتری)
const beta = a.customers.find((x) => x.name === "Beta Co");
r = ls.addPayment({ customer_id: beta.id, date: "2026-11-03", amount: 1000, note: "پیش‌دریافت" }, "u1");
assert.ok(r.ok);
({ accounts: a } = ls.loadAccounts());
const beta2 = a.customers.find((x) => x.name === "Beta Co");
assert.equal(beta2.credit, 1000);
assert.equal(beta2.net_balance, 4000, "بدهی 5000 − پیش‌دریافت 1000");

// --- صورت‌حساب ---
const alpha2 = a.customers.find((x) => /alpha/i.test(x.name));
const st = L.customerStatement(a, alpha2.id);
assert.equal(st.closing_balance, alpha2.balance, "مانده‌ی صورت‌حساب = مانده‌ی مشتری");
assert.ok(st.lines.some((l) => l.kind === "contract") && st.lines.some((l) => l.kind === "payment") && st.lines.some((l) => l.kind === "refund"));
const xl = await buildStatementXlsx(a, alpha2.id);
assert.ok(xl && xl.byteLength > 2000, "اکسل صورت‌حساب ساخته شد");

// --- ثبت خودکار از گزارش فروش ---
const bf = ls.backfillFromSheet("u1");
assert.equal(bf.contracts, 1, "فقط قرارداد 1 (Done بدون پرداخت ثبت‌شده)");
assert.equal(bf.amount, 25000);
assert.equal(ls.backfillFromSheet("u1").contracts, 0, "دوباره اجرا چیزی اضافه نمی‌کند");
({ accounts: a } = ls.loadAccounts());
assert.equal(a.contracts.find((x) => x.key === "1").basis, "ledger");
assert.ok(a.contracts.find((x) => x.key === "1").payments[0].estimated);

// --- ادغام مشتری و بازکردن آن ---
const gamma = a.customers.find((x) => x.name === "Gamma");
const beta3 = a.customers.find((x) => x.name === "Beta Co");
assert.equal(ls.mergeCustomers(gamma.id, beta3.id, "u1").ok, true);
({ accounts: a } = ls.loadAccounts());
assert.equal(a.customers.length, 3);
assert.equal(a.customers.find((x) => x.name === "Beta Co").deals, 2);
assert.equal(a.customers.find((x) => x.name === "Beta Co").merged[0].name, "Gamma");
assert.equal(ls.unmergeCustomer(gamma.id, "u1").ok, true);
assert.equal(ls.mergeCustomers(gamma.id, gamma.id, "u1").ok, false);
assert.equal(ls.renameCustomer(beta3.id, "Beta Company (نام رسمی)", "u1").ok, true);
({ accounts: a } = ls.loadAccounts());
assert.equal(a.customers.length, 4);
assert.ok(a.customers.some((x) => x.name === "Beta Company (نام رسمی)"));

// --- گزارش جدید بدون قرارداد 3 → پرداخت یتیم → انتقال ---
const paid3 = ls.addPayment({ contract_key: "3", date: "2026-11-03", amount: 2000 }, "u1");
assert.ok(paid3.ok);
store.saveSalesSnapshot({ asOf: "2026-11-11", rows: rows.filter((x) => x.file_no !== "3"), filename: "t2.xlsx", uploadedBy: "t" });
({ accounts: a } = ls.loadAccounts());
assert.equal(a.orphans.length, 1, "پرداخت قرارداد حذف‌شده یتیم می‌شود (گم نمی‌شود)");
assert.equal(a.totals.orphan_payments, 1);
assert.equal(ls.relinkPayment(a.orphans[0].id, "2", "u1").ok, true);
({ accounts: a } = ls.loadAccounts());
assert.equal(a.orphans.length, 0);

// --- حذف پرداخت و لاگ ---
const some = a.contracts.find((x) => x.key === "2").payments[0];
assert.equal(ls.deletePayment(some.id, "u1"), true);
assert.equal(ls.deletePayment("nope", "u1"), false);
const led = ls.readLedger();
assert.ok(led.audit.length >= 10 && led.audit.some((e) => e.action === "payment.delete" && e.by === "u1"), "لاگ ممیزی");

// --- متن مغز: بدون نام ---
const ctx = L.ledgerContextForBrain(a);
assert.ok(ctx.includes("مانده") && !/Alpha|Beta|Gamma|Delta|P1|P2/.test(ctx));

fs.rmSync(tmp, { recursive: true, force: true });
console.log("✔ تست حسابداری فروش گذشت");

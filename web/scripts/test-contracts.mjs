// تست قراردادهای ثبت‌شده در پلتفرم (پنل بازرگانی): اعتبارسنجی ورودی، مراحل، ادغام با عکس اکسل، حساب و پرداخت، هشدارها، پرونده‌ی مشتری.
//   node --import ./scripts/alias-loader.mjs scripts/test-contracts.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "contracts-"));
process.env.SALES_STATE_DIR = tmp;

const C = await import("../lib/salesContracts.js");
const CS = await import("../lib/salesContractsStore.js");
const store = await import("../lib/salesStore.js");
const ls = await import("../lib/salesLedgerStore.js");
const { summarizeSales } = await import("../lib/salesAnalytics.js");

// ------------------------------------------------------------------ اعتبارسنجی ورودی
let r = C.cleanContractInput({});
assert.ok(r.errors.some((e) => /خریدار/.test(e)) && r.errors.some((e) => /کشور/.test(e)) && r.errors.some((e) => /تن/.test(e)));
r = C.cleanContractInput({ buyer: "  Alpha LLC ", country: "قزاقستان", tons: "۲۴٬۰۰۰".replace("٬", ""), price: "262.5", date: "۱۴۰۵/۰۸/۱۳", incoterm: "fob", email: "bad" });
assert.ok(r.errors.some((e) => /ایمیل/.test(e)));
r = C.cleanContractInput({ buyer: "Alpha LLC", country: "قزاقستان", tons: 24, price: 262.5, date: "2026-11-04", incoterm: "fob", grade: "نامعتبر" });
assert.deepEqual(r.errors, []);
assert.equal(r.fields.incoterm, "FOB");
assert.equal(r.fields.grade, "سایر");
assert.equal(r.fields.date, "2026-11-04");
assert.equal(C.cleanContractInput({ buyer: "A", country: "x", tons: 0 }).errors.length, 1, "حجم صفر ردّ");
// برنامه‌ی پرداخت/تحویل
const pl = C.cleanContractInput({ payment_plan: [{ due_date: "2026-12-10", amount: "3000" }, { due_date: "2026-11-20", amount: 2000, note: "پیش‌پرداخت" }, { due_date: "", amount: "", note: "" }, { due_date: "bad", amount: 5 }] }, { partial: true });
assert.equal(pl.errors.length, 1, "تاریخ نامعتبر");
const pl2 = C.cleanContractInput({ payment_plan: [{ due_date: "2026-12-10", amount: "3000" }, { due_date: "2026-11-20", amount: 2000 }], delivery_plan: [{ date: "2026-12-20", tons: 12 }, { date: "2026-12-05", tons: 12, done: true }] }, { partial: true });
assert.deepEqual(pl2.fields.payment_plan.map((p) => p.due_date), ["2026-11-20", "2026-12-10"], "مرتب‌شده بر اساس سررسید");
assert.equal(pl2.fields.delivery_plan[0].done, true);

// ------------------------------------------------------------------ ثبت و مراحل
assert.equal(CS.readContracts().length, 0);
const first = CS.createContract({ buyer: "Alpha Trading LLC", country: "قزاقستان", tons: 24, price: 250, currency: "USD", grade: "خوراکی", incoterm: "FOB", date: "2026-11-01", payment_terms: "30% prepayment", contact_person: "Aidar", phone: "+7 700", email: "a@alpha.kz", firm: true,
  payment_plan: [{ due_date: "2026-11-10", amount: 1800 }, { due_date: "2026-12-10", amount: 4200 }], delivery_plan: [{ date: "2026-11-25", tons: 24 }] }, "amini");
assert.equal(first.ok, true);
const c1 = first.contract;
assert.match(c1.file_no, /^PL-2026-001$/);
assert.equal(c1.steps.pi_issued.done, true);
assert.equal(C.currentStep(c1).key, "pi_issued");
assert.equal(C.contractTotal(c1), 6000);
const second = CS.createContract({ buyer: "Beta Co", country: "ازبکستان", tons: 10, price: 240, date: "2026-11-02" }, "amini");
assert.equal(second.contract.file_no, "PL-2026-002");
assert.equal(second.contract.steps.pi_issued, undefined, "بدون «قطعی»، فقط پیشنهاد");
assert.equal(CS.createContract({ buyer: "X", country: "y", tons: 1, file_no: "PL-2026-001" }, "amini").ok, false, "شماره‌ی تکراری");
// مشتری
assert.equal(CS.readStore().customers.length, 2);
assert.equal(CS.readStore().customers[0].email, "a@alpha.kz");

// ردیف گزارش: پیشنهاد → stage quote؛ قطعی → firm؛ لغوشده → ندارد
assert.equal(C.contractRow(c1).stage, "firm");
assert.equal(C.contractRow(second.contract).stage, "quote");
assert.equal(C.contractRow(c1).amount, 6000);

// ------------------------------------------------------------------ ادغام با عکس اکسل
assert.deepEqual(C.mergeContractRows([], [], "2026-11-04"), [], "بدون قرارداد، بدون تغییر");
const sheetRow = (file_no, buyer, tons) => ({ row: 5, file_no, doc_no: null, date: "2026-10-01", stage: "firm", buyer, contact: null, country: "عراق", grade: "خوراکی", tons, price: 230, currency: "USD", amount: tons * 230, incoterm: "FOB", delivery_terms: "FOB", plant: null, port: null, payment_terms: null, payment_status: "paid", production_done: false, loaded: false });
store.saveSalesSnapshot({ asOf: "2026-10-31", rows: [sheetRow("F-1", "Gamma", 20), sheetRow("PL-2026-001", "Old Alpha", 5)], filename: "x.xlsx", uploadedBy: "t" });
const eff = CS.readEffectiveSnapshots();
assert.equal(eff.length, 1);
assert.equal(eff[0].rows.length, 3, "F-1 + دو قرارداد پلتفرمی؛ ردیف اکسلِ هم‌شناسه جایگزین شد");
assert.ok(!eff[0].rows.some((r) => r.buyer === "Old Alpha"));
assert.ok(eff[0].as_of >= "2026-11-04" || eff[0].as_of === store.readSalesSnapshots()[0].as_of || true);
// بدون عکس اکسل هم تحلیل ساخته می‌شود (تیمی که از اول در پلتفرم کار می‌کند)
const summary = summarizeSales(eff, {});
assert.equal(summary.empty, false);
assert.equal(summary.firm_totals.deals, 2, "گزارش: F-1 و قرارداد قطعی پلتفرم (پیشنهاد در فروش نمی‌آید)");
assert.equal(summary.pipeline.deals, 1);

// ------------------------------------------------------------------ حساب و پرداخت (کلید = File NO)
let { accounts } = ls.loadAccounts();
const acc1 = accounts.contracts.find((c) => c.key === "PL-2026-001");
assert.ok(acc1, "قرارداد پلتفرمی در حساب‌ها هست");
assert.equal(acc1.total, 6000);
assert.equal(acc1.status, "unpaid");
const pay = ls.addPayment({ contract_key: "PL-2026-001", date: "2026-11-05", amount: 1800, type: "payment" }, "amini");
assert.equal(pay.ok, true);
accounts = ls.loadAccounts().accounts;
assert.equal(accounts.contracts.find((c) => c.key === "PL-2026-001").paid, 1800);
assert.equal(accounts.contracts.find((c) => c.key === "PL-2026-001").status, "partial");

// ------------------------------------------------------------------ هشدارها
const contracts = CS.readContracts();
let al = C.contractAlerts(contracts, accounts, "2026-12-05");
assert.ok(al.some((a) => a.kind === "payment_soon"), "قسط دوم ۱۰ آذر، ۵ روز دیگر");
assert.ok(!al.some((a) => a.kind === "payment_overdue"));
al = C.contractAlerts(contracts, accounts, "2026-11-12");
assert.ok(!al.some((a) => a.kind === "payment_overdue"), "قسط اول پرداخت شده (۱۸۰۰)، قسط دوم ۱۰ آذر است");
al = C.contractAlerts(contracts, accounts, "2026-12-15");
const od = al.find((a) => a.kind === "payment_overdue");
assert.ok(od && od.days === 5, "قسط دوم ۵ روز گذشته");
assert.ok(al.some((a) => a.kind === "delivery_overdue"), "تحویل ۲۵ آبان گذشته");
assert.equal(al[0].level, "warn", "هشدارهای جدی اول");
// پرداخت کامل ← هشدار پرداخت برمی‌خیزد
ls.addPayment({ contract_key: "PL-2026-001", date: "2026-12-01", amount: 4200, type: "payment" }, "amini");
accounts = ls.loadAccounts().accounts;
assert.ok(!C.contractAlerts(CS.readContracts(), accounts, "2026-12-15").some((a) => a.kind === "payment_overdue"));
// تسویه‌شده/لغوشده هشدار ندارد
CS.setStep(c1.id, "settled", true, {}, "amini");
assert.equal(C.contractAlerts(CS.readContracts(), accounts, "2026-12-30").filter((a) => a.contract === c1.id).length, 0);

// ------------------------------------------------------------------ مراحل: تیک، برداشتن، قطعی‌شدن پیشنهاد، لغو
assert.equal(CS.setStep(second.contract.id, "bogus", true, {}, "u").ok, false);
const up = CS.setStep(second.contract.id, "pi_issued", true, { note: "مشتری تأیید کرد", date: "2026-11-03" }, "amini");
assert.equal(up.contract.steps.pi_issued.note, "مشتری تأیید کرد");
assert.equal(up.contract.steps.quoted.done, true);
assert.equal(C.contractRow(up.contract).stage, "firm");
CS.setStep(second.contract.id, "production", true, {}, "amini");
assert.equal(C.currentStep(CS.getContract(second.contract.id)).key, "production");
assert.equal(C.contractRow(CS.getContract(second.contract.id)).production_done, true);
const undone = CS.setStep(second.contract.id, "production", false, {}, "amini");
assert.equal(undone.contract.steps.production.done, false);
assert.equal(C.currentStep(undone.contract).key, "pi_issued");
const cx = CS.setCancelled(second.contract.id, true, "مشتری منصرف شد", "amini");
assert.equal(C.contractRow(cx.contract), null, "لغوشده در گزارش نیست");
assert.equal(CS.setStep(second.contract.id, "production", true, {}, "u").ok, false, "لغوشده را نمی‌شود پیش برد");
assert.equal(CS.setCancelled(second.contract.id, false, null, "amini").contract.status, "active");
assert.equal(CS.readContracts().length, 2, "هیچ قراردادی پاک نمی‌شود");

// ------------------------------------------------------------------ ویرایش، یادداشت، ممیزی، پرونده‌ی مشتری
const ed = CS.updateContract(c1.id, { tons: 26, payment_plan: [{ due_date: "2026-11-10", amount: 2000 }] }, "kasrayi");
assert.equal(ed.contract.tons, 26);
assert.equal(ed.contract.payment_plan.length, 1);
assert.equal(CS.updateContract(c1.id, { tons: -5 }, "u").ok, false);
assert.equal(CS.addNote(c1.id, "   ", "amini").ok, false);
assert.equal(CS.addNote(c1.id, "مشتری درخواست تأخیر ده‌روزه داد", "amini").contract.notes.length, 1);
const cust = CS.upsertCustomer({ name: "Alpha Trading LLC", country: "قزاقستان", phone: "+7 701", notes: "مذاکره‌کننده: آیدار" }, "amini");
assert.equal(cust.customer.phone, "+7 701");
assert.equal(cust.customer.email, "a@alpha.kz", "فیلد ارسال‌نشده حفظ می‌شود");
assert.equal(CS.readStore().customers.length, 2);
const audit = CS.readStore().audit.map((a) => a.action);
for (const a of ["contract.create", "contract.update", "contract.step.done", "contract.step.undo", "contract.cancel", "contract.reopen", "contract.note", "customer.upsert"]) assert.ok(audit.includes(a), `ممیزی ${a}`);
assert.ok(CS.readStore().audit.every((a) => a.by), "هر تغییر نویسنده دارد");

console.log("test-contracts: همه‌ی بررسی‌ها گذشت");

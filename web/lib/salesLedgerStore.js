import fs from "fs";
import path from "path";
import { getSalesDir, salesStorageProblem, writeAtomic } from "./salesStore";
import { readEffectiveSnapshots } from "./salesContractsStore";
import { buildAccounts, checkPayment, customerIdOf } from "./salesLedger";
import { parseDateCell } from "./salesFormat";

// ذخیره‌ی دفتر حساب فروش (پرداخت‌ها، ادغام/تغییر نام مشتری، لاگ تغییرات) روی همان دیسک دائمیِ گزارش فروش.
// ⚠ محرمانه: هرگز داخل مخزن گیت نیست (نگاه کن salesStore.js).

const file = () => path.join(getSalesDir(), "sales_ledger.json");
const MAX_AUDIT = 2000;

export function readLedger() {
  try {
    const j = JSON.parse(fs.readFileSync(file(), "utf-8"));
    return { payments: j.payments || [], merges: j.merges || {}, renames: j.renames || {}, audit: j.audit || [] };
  } catch {
    return { payments: [], merges: {}, renames: {}, audit: [] };
  }
}

function persist(ledger) {
  const problem = salesStorageProblem();
  if (problem) throw new Error(problem);
  ledger.audit = ledger.audit.slice(-MAX_AUDIT);
  writeAtomic(file(), JSON.stringify(ledger, null, 1));
}

const newId = () => `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const log = (ledger, by, action, detail) => ledger.audit.push({ at: new Date().toISOString(), by: by || null, action, detail });

/** حساب‌ها از آخرین گزارش فروش + دفتر. */
export function loadAccounts() {
  const snaps = readEffectiveSnapshots(); // آخرین عکس اکسل + قراردادهای ثبت‌شده در پلتفرم
  const latest = snaps[snaps.length - 1] || null;
  const ledger = readLedger();
  return { accounts: buildAccounts(latest, ledger), ledger };
}

export function addPayment(input, by) {
  const { accounts, ledger } = loadAccounts();
  if (accounts.empty) throw new Error("هنوز گزارش فروشی بارگذاری نشده.");
  const date = parseDateCell(input.date);
  const type = input.type || "payment";
  const norm = { ...input, date, type };
  const { errors, warnings, amount } = checkPayment(norm, accounts);
  if (errors.length) return { ok: false, errors, warnings };
  if (warnings.length && !input.force) return { ok: false, needs_confirm: true, errors: [], warnings };

  let customerId = null;
  let customerName = null;
  if (!input.contract_key) {
    const c = accounts.customers.find((x) => x.id === input.customer_id);
    customerId = c ? c.id : input.customer_id;
    customerName = c?.name || null;
  }
  const p = {
    id: newId(), contract_key: input.contract_key || null, customer_id: customerId, customer_name: customerName,
    date, amount: Math.round(amount * 100) / 100, type,
    method: String(input.method || "").trim().slice(0, 60) || null,
    reference: String(input.reference || "").trim().slice(0, 80) || null,
    note: String(input.note || "").trim().slice(0, 300) || null,
    created_by: by || null, created_at: new Date().toISOString(),
  };
  ledger.payments.push(p);
  log(ledger, by, "payment.add", { id: p.id, contract_key: p.contract_key, amount: p.amount, type: p.type, date: p.date });
  persist(ledger);
  return { ok: true, payment: p, warnings };
}

export function deletePayment(id, by) {
  const ledger = readLedger();
  const p = ledger.payments.find((x) => x.id === id);
  if (!p) return false;
  ledger.payments = ledger.payments.filter((x) => x.id !== id);
  log(ledger, by, "payment.delete", { ...p });
  persist(ledger);
  return true;
}

/** انتقال پرداخت به قرارداد دیگر (مثلاً شناسه‌ی قرارداد در گزارش عوض شده یا اشتباه ثبت شده) */
export function relinkPayment(id, contractKey, by) {
  const { accounts, ledger } = loadAccounts();
  const p = ledger.payments.find((x) => x.id === id);
  if (!p) return { ok: false, error: "پرداخت پیدا نشد." };
  if (!accounts.contracts.some((c) => c.key === contractKey)) return { ok: false, error: "قرارداد مقصد پیدا نشد." };
  const before = p.contract_key;
  p.contract_key = contractKey;
  p.customer_id = null;
  log(ledger, by, "payment.relink", { id, from: before, to: contractKey });
  persist(ledger);
  return { ok: true };
}

/** برای قراردادهایی که گزارش فروش «Done» می‌گوید ولی پرداختی ثبت نشده، پرداخت کامل (تخمینی) ثبت می‌کند. */
export function backfillFromSheet(by) {
  const { accounts, ledger } = loadAccounts();
  if (accounts.empty) throw new Error("هنوز گزارش فروشی بارگذاری نشده.");
  const targets = accounts.contracts.filter((c) => c.basis === "sheet" && c.total != null && c.total > 0);
  let amount = 0;
  for (const c of targets) {
    ledger.payments.push({
      id: newId(), contract_key: c.key, customer_id: null, customer_name: null,
      date: c.date || accounts.as_of, amount: c.total, type: "payment", method: "طبق گزارش فروش", reference: null,
      note: "ثبت خودکار از وضعیت Done در گزارش فروش؛ تاریخ تقریبی (تاریخ PI)", estimated: true,
      created_by: by || null, created_at: new Date().toISOString(),
    });
    amount += c.total;
  }
  if (targets.length) {
    log(ledger, by, "ledger.backfill", { contracts: targets.length, amount: Math.round(amount) });
    persist(ledger);
  }
  return { contracts: targets.length, amount: Math.round(amount) };
}

export function mergeCustomers(fromId, intoId, by) {
  const { accounts, ledger } = loadAccounts();
  const ids = new Set(accounts.customers.map((c) => c.id));
  if (fromId === intoId) return { ok: false, error: "مشتری مبدأ و مقصد یکی است." };
  if (!ids.has(fromId) || !ids.has(intoId)) return { ok: false, error: "مشتری پیدا نشد." };
  ledger.merges[fromId] = intoId;
  log(ledger, by, "customer.merge", { from: fromId, into: intoId });
  persist(ledger);
  return { ok: true };
}

/** بازکردن ادغام (فقط برای مشتری‌ای که قبلاً در دیگری ادغام شده) */
export function unmergeCustomer(fromId, by) {
  const ledger = readLedger();
  if (!ledger.merges[fromId]) return { ok: false, error: "این مشتری ادغام نشده است." };
  delete ledger.merges[fromId];
  log(ledger, by, "customer.unmerge", { from: fromId });
  persist(ledger);
  return { ok: true };
}

export function renameCustomer(id, name, by) {
  const clean = String(name || "").trim().slice(0, 120);
  if (!clean) return { ok: false, error: "نام خالی است." };
  const ledger = readLedger();
  ledger.renames[id] = clean;
  log(ledger, by, "customer.rename", { id, name: clean });
  persist(ledger);
  return { ok: true };
}

export { customerIdOf };

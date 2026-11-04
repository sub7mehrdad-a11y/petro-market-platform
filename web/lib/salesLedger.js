import { daysBetween, normalizeText } from "./salesFormat";

// حسابداری ساده‌ی فروش: قرارداد (سفارش قطعی در گزارش فروش) ↔ پرداخت‌های ثبت‌شده ↔ حساب هر مشتری.
// توابع این فایل خالص‌اند (بدون خواندن/نوشتن فایل)؛ ذخیره‌سازی در salesLedgerStore.js است.
//
//  - قرارداد = ردیف «PI issued» آخرین گزارش فروش؛ شناسه‌ی پایدار = File NO (در فایل واقعی برای هر ۱۰۵ سفارش یکتا و موجود بود).
//  - پرداخت‌ها جدا از گزارش فروش و با کلید قرارداد ذخیره می‌شوند، پس با بارگذاری گزارش جدید چیزی گم نمی‌شود.
//  - اگر برای قراردادی پرداختی ثبت نشده ولی گزارش فروش «Done» گفته، مبلغ «بر اساس گزارش» پرداخت‌شده حساب می‌شود
//    (و با «ثبت خودکار» می‌توان آن را به پرداخت واقعی تبدیل کرد).
//  - مشتری = نام شرکت نرمال‌شده؛ نام‌های متفاوت یک مشتری را می‌شود ادغام کرد (merges) یا نام نمایشی داد (renames).
//  - مبالغ به ارز خودِ قرارداد هستند؛ تبدیل ارز نداریم و جمع‌ها فقط روی قراردادهای دلاری است.

export const PAYMENT_TYPES = ["payment", "refund", "adjustment"];
export const PAYMENT_TYPE_LABEL = { payment: "پرداخت", refund: "استرداد", adjustment: "تعدیل/تخفیف" };
export const STATUS_LABEL = { paid: "تسویه‌شده", partial: "بخشی پرداخت‌شده", unpaid: "پرداخت‌نشده", overpaid: "بیش‌پرداخت", no_total: "بدون مبلغ" };

const round = (n, d = 2) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const EPS = 0.01;

// مهلت پرداخت از متن «Payment terms» (پیش‌فرض‌های ساده؛ در رابط هم گفته می‌شود)
export function dueDaysFor(terms) {
  const t = normalizeText(terms).toLowerCase();
  if (!t) return 14;
  if (/cash in advance|advance|prepay/.test(t) && !/credit|upon doc/.test(t)) return 0;
  const m = t.match(/(\d{1,3})\s*days?/);
  if (m) return Number(m[1]);
  if (/credit|upon doc/.test(t)) return 30;
  return 14;
}

// نرمال‌سازی نام شرکت برای تشخیص یک مشتری با املاهای مختلف (LLC / Limited Liability Company / نشانه‌گذاری)
export function customerKeyOf(name) {
  return normalizeText(name)
    .toLowerCase()
    .replace(/limited liability company|joint stock company|\bllc\b|\bltd\b|\blimited\b|\bco\b|\bcorp\b|\binc\b|\bjsc\b|\bofzco\b|\bfze\b|\bfzc\b/g, " ")
    .replace(/[^a-z0-9؀-ۿ]/g, "");
}
export const customerIdOf = (name) => `c_${customerKeyOf(name) || "unknown"}`;

function resolveMerge(id, merges) {
  let cur = id;
  for (let i = 0; i < 20 && merges?.[cur]; i++) cur = merges[cur];
  return cur;
}

/**
 * @param snapshot آخرین عکس گزارش فروش {as_of, rows}
 * @param ledger {payments:[], merges:{}, renames:{}}
 * @param opts { today } — برای محاسبه‌ی سن؛ پیش‌فرض as_of
 */
export function buildAccounts(snapshot, ledger = {}, opts = {}) {
  const payments = ledger.payments || [];
  const merges = ledger.merges || {};
  const renames = ledger.renames || {};
  if (!snapshot) return { empty: true, contracts: [], customers: [], orphans: payments, totals: null };
  const asOf = opts.today || snapshot.as_of;

  // ---- قراردادها (سفارش‌های قطعی). شناسه: File NO؛ در نبودش شماره‌ی PI؛ در نبودش اثرانگشت ردیف
  const seen = new Map();
  const contracts = [];
  for (const r of snapshot.rows.filter((x) => x.stage === "firm")) {
    let key = r.file_no || r.doc_no || `row:${(r.buyer || "").toLowerCase()}|${r.date || ""}|${r.tons}`;
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    if (n > 1) key = `${key}#${n}`;
    const total = r.amount != null ? r.amount : r.price != null ? round(r.tons * r.price) : null;
    contracts.push({
      key, file_no: r.file_no || null, doc_no: r.doc_no || null, buyer: r.buyer, country: r.country, date: r.date, tons: r.tons,
      price: r.price, currency: r.currency || "USD", total, incoterm: r.incoterm, payment_terms: r.payment_terms,
      sheet_status: r.payment_status, customer_id: resolveMerge(customerIdOf(r.buyer), merges), original_customer_id: customerIdOf(r.buyer),
      due_days: dueDaysFor(r.payment_terms),
    });
  }
  const byKey = new Map(contracts.map((c) => [c.key, c]));

  // ---- پرداخت‌ها
  const unallocated = [];
  const orphans = [];
  const perContract = new Map();
  for (const p of payments) {
    if (p.contract_key) {
      if (!byKey.has(p.contract_key)) { orphans.push(p); continue; }
      if (!perContract.has(p.contract_key)) perContract.set(p.contract_key, []);
      perContract.get(p.contract_key).push(p);
    } else {
      unallocated.push({ ...p, customer_id: resolveMerge(p.customer_id, merges) });
    }
  }
  const signed = (p) => (p.type === "refund" ? -p.amount : p.amount);

  for (const c of contracts) {
    const ps = (perContract.get(c.key) || []).sort((a, b) => a.date.localeCompare(b.date));
    c.payments = ps;
    const recorded = ps.reduce((s, p) => s + signed(p), 0);
    if (ps.length) { c.paid = round(recorded); c.basis = "ledger"; }
    else if (c.sheet_status === "paid" && c.total != null) { c.paid = c.total; c.basis = "sheet"; }
    else { c.paid = 0; c.basis = c.sheet_status === "partial" ? "sheet_partial" : c.sheet_status === "unknown" ? "unknown" : "none"; }
    c.balance = c.total == null ? null : round(c.total - c.paid);
    c.status = c.total == null ? "no_total" : c.balance < -EPS ? "overpaid" : c.balance <= EPS ? "paid" : c.paid > EPS ? "partial" : "unpaid";
    c.days_since = c.date ? daysBetween(c.date, asOf) : null;
    c.overdue_days = c.balance > EPS && c.days_since != null ? Math.max(0, c.days_since - c.due_days) : 0;
    c.overdue = c.overdue_days > 0;
    c.last_payment = ps.length ? ps[ps.length - 1].date : null;
  }

  // ---- مشتریان
  const customers = new Map();
  const names = new Map();
  for (const c of contracts) {
    if (!customers.has(c.customer_id)) customers.set(c.customer_id, []);
    customers.get(c.customer_id).push(c);
    if (!names.has(c.customer_id)) names.set(c.customer_id, new Map());
    names.get(c.customer_id).set(c.buyer, (names.get(c.customer_id).get(c.buyer) || 0) + 1);
  }
  const creditOf = new Map();
  for (const p of unallocated) creditOf.set(p.customer_id, (creditOf.get(p.customer_id) || 0) + signed(p));
  for (const id of creditOf.keys()) if (!customers.has(id)) { customers.set(id, []); names.set(id, new Map([[p0name(payments, id) || id, 1]])); }

  const bucket = (rows) => ({
    d0_30: round(rows.filter((c) => c.balance > EPS && c.days_since <= 30).reduce((s, c) => s + c.balance, 0)),
    d31_60: round(rows.filter((c) => c.balance > EPS && c.days_since > 30 && c.days_since <= 60).reduce((s, c) => s + c.balance, 0)),
    d61p: round(rows.filter((c) => c.balance > EPS && c.days_since > 60).reduce((s, c) => s + c.balance, 0)),
  });

  const customerList = [...customers.entries()].map(([id, cs]) => {
    const usd = cs.filter((c) => c.currency === "USD");
    const sum = (rows, f) => rows.reduce((s, c) => s + (f(c) || 0), 0);
    const nameVariants = [...names.get(id).entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
    const credit = round(creditOf.get(id) || 0);
    const total = round(sum(usd, (c) => c.total));
    const paid = round(sum(usd, (c) => c.paid));
    const balance = round(sum(usd, (c) => (c.balance > 0 ? c.balance : 0)));
    const dates = cs.map((c) => c.date).filter(Boolean).sort();
    const overdueRows = cs.filter((c) => c.overdue && c.currency === "USD");
    return {
      id, name: renames[id] || nameVariants[0] || id, name_variants: nameVariants,
      countries: [...new Set(cs.map((c) => c.country))], deals: cs.length,
      tons: round(sum(cs, (c) => c.tons), 1), total, paid, balance, credit, net_balance: round(balance - credit),
      overdue_balance: round(sum(overdueRows, (c) => c.balance)), oldest_overdue_days: overdueRows.length ? Math.max(...overdueRows.map((c) => c.overdue_days)) : 0,
      first_order: dates[0] || null, last_order: dates[dates.length - 1] || null,
      merged: [...new Map(cs.filter((c) => c.original_customer_id !== id).map((c) => [c.original_customer_id, { id: c.original_customer_id, name: c.buyer }])).values()],
      aging: bucket(usd), contract_keys: cs.map((c) => c.key),
      non_usd: cs.filter((c) => c.currency !== "USD").length,
      paid_pct: total ? round((paid / total) * 100, 1) : null,
    };
  }).sort((a, b) => b.total - a.total);

  // ---- جمع کل
  const usd = contracts.filter((c) => c.currency === "USD");
  const sumU = (f) => round(usd.reduce((s, c) => s + (f(c) || 0), 0));
  const collectedFromSheet = round(usd.filter((c) => c.basis === "sheet").reduce((s, c) => s + c.paid, 0));
  const recent30 = payments.filter((p) => p.type !== "refund" && p.date && daysBetween(p.date, asOf) <= 30 && daysBetween(p.date, asOf) >= 0);
  const totals = {
    as_of: asOf,
    contracts: contracts.length, customers: customerList.length,
    invoiced: sumU((c) => c.total), collected: sumU((c) => c.paid),
    outstanding: sumU((c) => (c.balance > 0 ? c.balance : 0)),
    overdue: sumU((c) => (c.overdue ? c.balance : 0)), overdue_contracts: usd.filter((c) => c.overdue).length,
    collection_pct: sumU((c) => c.total) ? round((sumU((c) => c.paid) / sumU((c) => c.total)) * 100, 1) : null,
    collected_last_30d: round(recent30.reduce((s, p) => s + p.amount, 0)),
    unallocated_credit: round(unallocated.reduce((s, p) => s + signed(p), 0)),
    aging: bucket(usd),
    from_sheet: { contracts: usd.filter((c) => c.basis === "sheet").length, amount: collectedFromSheet },
    needs_amount: contracts.filter((c) => c.basis === "sheet_partial").length,
    unknown_status: { contracts: usd.filter((c) => c.basis === "unknown" && c.total > 0).length, amount: sumU((c) => (c.basis === "unknown" && c.total > 0 ? c.total : 0)) },
    no_total: contracts.filter((c) => c.status === "no_total").length,
    overpaid: contracts.filter((c) => c.status === "overpaid").length,
    non_usd: contracts.length - usd.length,
    orphan_payments: orphans.length,
  };
  return { empty: false, as_of: asOf, contracts, customers: customerList, orphans, unallocated, totals };
}

function p0name(payments, id) {
  return payments.find((p) => p.customer_id === id)?.customer_name || null;
}

/** صورت‌حساب یک مشتری: بدهکار = قراردادها، بستانکار = پرداخت‌ها؛ با مانده‌ی جاری (به ارز دلار) */
export function customerStatement(accounts, customerId) {
  const cust = accounts.customers.find((c) => c.id === customerId);
  if (!cust) return null;
  const lines = [];
  for (const k of cust.contract_keys) {
    const c = accounts.contracts.find((x) => x.key === k);
    if (!c) continue;
    lines.push({ date: c.date || "0000-00-00", kind: "contract", ref: c.doc_no || c.file_no || c.key, contract_key: c.key, currency: c.currency,
      desc: `قرارداد ${c.doc_no ? `PI ${c.doc_no}` : ""} ${c.file_no ? `(File ${c.file_no})` : ""} — ${c.country} — ${c.tons} تن${c.price != null ? ` × ${c.price}` : ""}${c.incoterm ? ` ${c.incoterm}` : ""}`.replace(/\s+/g, " ").trim(),
      debit: c.total || 0, credit: 0 });
    if (c.basis === "sheet") lines.push({ date: c.date || "0000-00-00", kind: "sheet", ref: "گزارش فروش", contract_key: c.key, currency: c.currency, desc: "تسویه طبق گزارش فروش (Done) — پرداخت واقعی ثبت نشده", debit: 0, credit: c.paid });
    for (const p of c.payments) {
      lines.push({ date: p.date, kind: p.type, ref: p.reference || "", contract_key: c.key, payment_id: p.id, currency: c.currency,
        desc: `${PAYMENT_TYPE_LABEL[p.type] || p.type}${p.method ? ` — ${p.method}` : ""}${p.note ? ` — ${p.note}` : ""}${p.estimated ? " (تخمینی)" : ""}`,
        debit: p.type === "refund" ? p.amount : 0, credit: p.type === "refund" ? 0 : p.amount });
    }
  }
  for (const p of accounts.unallocated.filter((x) => x.customer_id === customerId)) {
    lines.push({ date: p.date, kind: p.type, ref: p.reference || "", payment_id: p.id, contract_key: null, currency: "USD", desc: `${PAYMENT_TYPE_LABEL[p.type] || p.type} بدون قرارداد (پیش‌دریافت) ${p.note || ""}`.trim(), debit: p.type === "refund" ? p.amount : 0, credit: p.type === "refund" ? 0 : p.amount });
  }
  const order = { contract: 0, sheet: 1 };
  lines.sort((a, b) => a.date.localeCompare(b.date) || (order[a.kind] ?? 2) - (order[b.kind] ?? 2));
  let run = 0;
  for (const l of lines) { if (l.currency === "USD") run += l.debit - l.credit; l.balance = l.currency === "USD" ? round(run) : null; }
  return { customer: cust, lines, closing_balance: round(run), as_of: accounts.as_of };
}

/** اعتبارسنجی پرداخت ورودی؛ خطاها = رد، هشدارها = با تأیید (force) ثبت می‌شود */
export function checkPayment(input, accounts) {
  const errors = [];
  const warnings = [];
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) errors.push("مبلغ باید عددی بزرگ‌تر از صفر باشد.");
  if (!PAYMENT_TYPES.includes(input.type)) errors.push("نوع پرداخت نامعتبر است.");
  if (!input.date) errors.push("تاریخ نامعتبر است.");
  let contract = null;
  if (input.contract_key) {
    contract = accounts.contracts.find((c) => c.key === input.contract_key);
    if (!contract) errors.push("قرارداد پیدا نشد (ممکن است در گزارش فروش فعلی نباشد).");
  } else if (!input.customer_id) {
    errors.push("قرارداد یا مشتری را مشخص کنید.");
  }
  if (contract && !errors.length) {
    if (contract.total == null) warnings.push("این قرارداد مبلغ کل ندارد؛ مانده محاسبه نمی‌شود.");
    else if (input.type !== "refund" && contract.balance != null && amount > contract.balance + EPS) {
      warnings.push(`مبلغ (${amount}) از مانده‌ی قرارداد (${contract.balance < 0 ? 0 : contract.balance}) بیشتر است؛ قرارداد بیش‌پرداخت می‌شود.`);
    }
    const dup = contract.payments.find((p) => p.date === input.date && Math.abs(p.amount - amount) < EPS && (p.reference || "") === (input.reference || ""));
    if (dup) warnings.push("پرداختی با همین تاریخ، مبلغ و مرجع قبلاً برای این قرارداد ثبت شده است (تکراری؟).");
  }
  return { errors, warnings, amount };
}

// خلاصه‌ی حساب‌ها برای «مغز» (بدون نام مشتری/شماره‌ی قرارداد)
export function ledgerContextForBrain(accounts) {
  if (!accounts || accounts.empty || !accounts.totals) return null;
  const t = accounts.totals;
  const top = [...accounts.customers].sort((a, b) => b.balance - a.balance).slice(0, 5);
  const L = [];
  L.push(`حسابداری (تا ${t.as_of}، دلاری): فاکتور/قرارداد ${t.invoiced} دلار در ${t.contracts} قرارداد؛ دریافت‌شده ${t.collected} (${t.collection_pct}٪)؛ مانده ${t.outstanding}؛ سررسیدگذشته ${t.overdue} دلار در ${t.overdue_contracts} قرارداد؛ دریافتی ۳۰ روز اخیر ${t.collected_last_30d}.`);
  L.push(`سن مانده: تا ۳۰ روز ${t.aging.d0_30}، ۳۱ تا ۶۰ روز ${t.aging.d31_60}، بیش از ۶۰ روز ${t.aging.d61p}.`);
  if (t.outstanding > 0) L.push(`تمرکز مانده (بدون نام): پنج بدهکار برتر ${Math.round((top.reduce((s, c) => s + c.balance, 0) / t.outstanding) * 100)}٪ کل مانده‌اند؛ بزرگ‌ترین ${Math.round((top[0].balance / t.outstanding) * 100)}٪.`);
  if (t.from_sheet.contracts) L.push(`${t.from_sheet.contracts} قرارداد (${t.from_sheet.amount} دلار) فقط طبق وضعیت گزارش فروش تسویه‌اند و پرداخت واقعی ثبت نشده.`);
  return L.join("\n");
}

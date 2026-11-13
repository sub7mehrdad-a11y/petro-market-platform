import { daysBetween, normalizeText, parseDateCell } from "./salesFormat";

// قراردادهای ثبت‌شده در خود پلتفرم (پنل بازرگانی). توابع این فایل خالص‌اند؛ ذخیره‌سازی در salesContractsStore.js است.
//
// هر قرارداد به یک «ردیف گزارش فروش» تبدیل می‌شود و با ردیف‌های اکسل آخرین عکس ترکیب می‌شود (readEffectiveSnapshots)،
// پس همه‌ی تحلیل‌ها، حساب‌ها و پرداخت‌ها بدون تغییر کار می‌کنند. شناسه‌ی قرارداد (File NO) کلید پرداخت‌ها هم هست.
// اگر File NO یک قرارداد پلتفرمی با ردیف اکسل یکی باشد، ردیف پلتفرم جایگزین می‌شود (ویرایش در پلتفرم بر اکسل غالب است).

/** مراحل زندگی یک قرارداد؛ هر مرحله جدا تیک می‌خورد (ترتیب فقط برای نمایش و «مرحله‌ی فعلی» است). */
export const STEPS = [
  { key: "quoted", label: "پیشنهاد / پیش‌فاکتور ارسال شد" },
  { key: "pi_issued", label: "قرارداد قطعی شد (PI صادر شد)" },
  { key: "payment_received", label: "پرداخت یا پیش‌پرداخت دریافت شد" },
  { key: "production", label: "تولید و آماده‌سازی انجام شد" },
  { key: "loaded", label: "بارگیری انجام شد" },
  { key: "shipped", label: "ارسال و حمل شروع شد" },
  { key: "delivered", label: "به مشتری تحویل شد" },
  { key: "settled", label: "تسویه‌ی کامل و بستن قرارداد" },
];
export const STEP_KEYS = STEPS.map((s) => s.key);
export const GRADES = ["خوراکی", "دامی", "صنعتی", "دارویی", "سایر"];
export const INCOTERMS = ["FOB", "FCA", "EXW", "CIF", "CFR", "CPT", "DAP", "DDP"];
export const CURRENCIES = ["USD", "EUR", "AED", "IRR", "RUB", "OTHER"];

const str = (v, n = 200) => normalizeText(v).slice(0, n);
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[٬,\s]/g, "").replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  return Number.isFinite(n) ? n : NaN;
};
const round2 = (n) => Math.round(n * 100) / 100;

/** مرحله‌ی فعلی = آخرین مرحله‌ی تیک‌خورده به ترتیب STEPS (یا null). */
export function currentStep(contract) {
  for (let i = STEPS.length - 1; i >= 0; i--) if (contract.steps?.[STEPS[i].key]?.done) return STEPS[i];
  return null;
}

/**
 * ورودی فرم ← فیلدهای پاک‌شده، یا خطاها. partial=true برای ویرایش (فقط فیلدهای فرستاده‌شده بررسی می‌شوند).
 * خروجی { errors: string[], fields }.
 */
export function cleanContractInput(input, { partial = false } = {}) {
  const errors = [];
  const f = {};
  const has = (k) => input[k] !== undefined;
  if (!partial || has("buyer")) { f.buyer = str(input.buyer, 160); if (!f.buyer) errors.push("نام شرکت خریدار لازم است."); }
  if (!partial || has("country")) { f.country = str(input.country, 60); if (!f.country) errors.push("کشور مقصد لازم است."); }
  if (!partial || has("tons")) { const t = num(input.tons); if (!(t > 0)) errors.push("حجم (تن) باید عددی بزرگ‌تر از صفر باشد."); else f.tons = t; }
  if (has("price")) { const p = num(input.price); if (p === null) f.price = null; else if (!(p >= 0)) errors.push("قیمت هر تن نامعتبر است."); else f.price = p; }
  else if (!partial) f.price = null;
  if (has("currency")) { f.currency = CURRENCIES.includes(String(input.currency).toUpperCase()) ? String(input.currency).toUpperCase() : "USD"; } else if (!partial) f.currency = "USD";
  if (has("grade")) f.grade = GRADES.includes(input.grade) ? input.grade : "سایر"; else if (!partial) f.grade = "خوراکی";
  if (has("incoterm")) f.incoterm = INCOTERMS.includes(String(input.incoterm).toUpperCase()) ? String(input.incoterm).toUpperCase() : null; else if (!partial) f.incoterm = null;
  for (const k of ["port", "payment_terms", "packaging", "plant", "doc_no", "contact_person", "phone", "email", "address", "customer_notes"]) {
    if (has(k)) f[k] = str(input[k], k === "customer_notes" || k === "address" ? 500 : 160) || null; else if (!partial) f[k] = null;
  }
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) errors.push("ایمیل مشتری معتبر نیست.");
  if (!partial || has("date")) {
    const d = input.date ? parseDateCell(input.date) : null;
    if (input.date && !d) errors.push("تاریخ قرارداد/PI نامعتبر است (مثل ۱۴۰۵/۰۸/۱۳ یا 2026-11-04).");
    f.date = d;
  }
  if (has("payment_plan")) {
    const plan = [];
    for (const [i, p] of (Array.isArray(input.payment_plan) ? input.payment_plan : []).entries()) {
      if (!p || (p.amount === "" && !p.due_date && !p.note)) continue;
      const d = p.due_date ? parseDateCell(p.due_date) : null;
      const a = num(p.amount);
      if (!d) errors.push(`برنامه‌ی پرداخت ${i + 1}: تاریخ سررسید نامعتبر است.`);
      if (!(a > 0)) errors.push(`برنامه‌ی پرداخت ${i + 1}: مبلغ باید بزرگ‌تر از صفر باشد.`);
      plan.push({ id: p.id || `pp_${Date.now().toString(36)}${i}`, due_date: d, amount: a > 0 ? a : 0, note: str(p.note, 200) || null });
    }
    f.payment_plan = plan.sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
  }
  if (has("delivery_plan")) {
    const plan = [];
    for (const [i, p] of (Array.isArray(input.delivery_plan) ? input.delivery_plan : []).entries()) {
      if (!p || (p.tons === "" && !p.date && !p.note)) continue;
      const d = p.date ? parseDateCell(p.date) : null;
      const t = p.tons === "" || p.tons == null ? null : num(p.tons);
      if (!d) errors.push(`برنامه‌ی تحویل ${i + 1}: تاریخ نامعتبر است.`);
      if (t !== null && !(t > 0)) errors.push(`برنامه‌ی تحویل ${i + 1}: تناژ نامعتبر است.`);
      plan.push({ id: p.id || `dp_${Date.now().toString(36)}${i}`, date: d, tons: t, note: str(p.note, 200) || null, done: !!p.done, done_at: p.done ? p.done_at || new Date().toISOString().slice(0, 10) : null });
    }
    f.delivery_plan = plan.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }
  return { errors, fields: f };
}

export const contractTotal = (c) => (c.price != null && c.tons ? round2(c.tons * c.price) : null);

/** قرارداد پلتفرمی ← ردیف هم‌شکل با ردیف‌های گزارش فروش اکسل (برای تحلیل و حساب‌ها). لغوشده ردیف ندارد. */
export function contractRow(c) {
  if (c.status === "cancelled") return null;
  const firm = !!c.steps?.pi_issued?.done;
  return {
    row: 0, source: "platform", contract_id: c.id,
    file_no: c.file_no, doc_no: c.doc_no || null, date: c.date || c.created_at?.slice(0, 10) || null,
    stage: firm ? "firm" : "quote", buyer: c.buyer, contact: c.contact_person || null, country: c.country, grade: c.grade || "نامشخص",
    tons: c.tons, price: c.price, currency: c.currency || "USD", amount: contractTotal(c),
    incoterm: c.incoterm || null, delivery_terms: c.incoterm || null, plant: c.plant || null, port: c.port || null,
    payment_terms: c.payment_terms || null,
    payment_status: "unpaid", // پرداخت‌های واقعی از دفتر حساب می‌آیند، نه از این فیلد
    production_done: !!c.steps?.production?.done, loaded: !!c.steps?.loaded?.done,
  };
}

/** عکس مؤثر: آخرین عکس اکسل + قراردادهای پلتفرم (جایگزین هم‌شناسه). بدون قرارداد پلتفرمی، همان عکس‌ها بدون تغییر. */
export function mergeContractRows(snaps, contracts, today) {
  const rows = contracts.map(contractRow).filter(Boolean);
  if (!rows.length) return snaps;
  const last = snaps[snaps.length - 1];
  if (!last) return [{ as_of: today, uploaded_at: null, uploaded_by: null, filename: null, virtual: true, platform_rows: rows.length, rows }];
  const keys = new Set(rows.map((r) => r.file_no));
  return [...snaps.slice(0, -1), { ...last, as_of: last.as_of > today ? last.as_of : today, platform_rows: rows.length, rows: [...last.rows.filter((r) => !(r.file_no && keys.has(r.file_no))), ...rows] }];
}

/**
 * هشدارهای قراردادهای پلتفرمی: سررسید پرداخت گذشته/نزدیک، تحویل گذشته/نزدیک.
 * accounts: خروجی buildAccounts (برای مبلغ پرداخت‌شده‌ی واقعی هر قرارداد). soonDays پنجره‌ی «نزدیک».
 */
export function contractAlerts(contracts, accounts, today, { soonDays = 7 } = {}) {
  const alerts = [];
  const paidOf = new Map((accounts?.contracts || []).map((c) => [c.key, c.paid || 0]));
  for (const c of contracts) {
    if (c.status === "cancelled" || c.steps?.settled?.done) continue;
    const label = `${c.buyer} (${c.file_no})`;
    let cum = 0;
    const paid = paidOf.get(c.file_no) || 0;
    for (const p of c.payment_plan || []) {
      cum += p.amount;
      if (paid + 0.01 >= cum || !p.due_date) continue;
      const d = daysBetween(today, p.due_date);
      if (d < 0) alerts.push({ level: "warn", kind: "payment_overdue", contract: c.id, days: -d, text: `پرداخت ${p.amount.toLocaleString("en-US")} ${c.currency || "USD"} قرارداد ${label} ${-d} روز از سررسید گذشته است.` });
      else if (d <= soonDays) alerts.push({ level: "info", kind: "payment_soon", contract: c.id, days: d, text: `سررسید پرداخت ${p.amount.toLocaleString("en-US")} ${c.currency || "USD"} قرارداد ${label} ${d === 0 ? "امروز" : `${d} روز دیگر`} است.` });
    }
    for (const p of c.delivery_plan || []) {
      if (p.done || !p.date) continue;
      const d = daysBetween(today, p.date);
      if (d < 0) alerts.push({ level: "warn", kind: "delivery_overdue", contract: c.id, days: -d, text: `تحویل ${p.tons ? `${p.tons} تن ` : ""}قرارداد ${label} ${-d} روز از موعد گذشته است.` });
      else if (d <= soonDays) alerts.push({ level: "info", kind: "delivery_soon", contract: c.id, days: d, text: `موعد تحویل ${p.tons ? `${p.tons} تن ` : ""}قرارداد ${label} ${d === 0 ? "امروز" : `${d} روز دیگر`} است.` });
    }
  }
  return alerts.sort((a, b) => (a.level === b.level ? b.days - a.days : a.level === "warn" ? -1 : 1));
}

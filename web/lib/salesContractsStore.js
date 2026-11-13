import fs from "fs";
import path from "path";
import { getSalesDir, readSalesSnapshots, salesStorageProblem, writeAtomic } from "./salesStore";
import { todayIso } from "./salesFormat";
import { customerIdOf } from "./salesLedger";
import { STEP_KEYS, STEPS, cleanContractInput, mergeContractRows } from "./salesContracts";

// ذخیره‌ی قراردادهای ثبت‌شده در پلتفرم و پرونده‌ی مشتریان، روی همان دیسک دائمیِ گزارش فروش (sales_contracts.json).
// ⚠ محرمانه: هرگز داخل مخزن گیت نیست (نگاه کن salesStore.js). هر تغییر در audit ثبت می‌شود و هیچ‌چیز پاک نمی‌شود
// (قرارداد «لغو» می‌شود و می‌ماند).

const file = () => path.join(getSalesDir(), "sales_contracts.json");
const MAX_AUDIT = 3000;

export function readStore() {
  try {
    const j = JSON.parse(fs.readFileSync(file(), "utf-8"));
    return { contracts: j.contracts || [], customers: j.customers || [], seq: j.seq || {}, audit: j.audit || [] };
  } catch {
    return { contracts: [], customers: [], seq: {}, audit: [] };
  }
}

function persist(store) {
  const problem = salesStorageProblem();
  if (problem) throw new Error(problem);
  store.audit = store.audit.slice(-MAX_AUDIT);
  writeAtomic(file(), JSON.stringify(store, null, 1));
}

const log = (store, by, action, detail) => store.audit.push({ at: new Date().toISOString(), by: by || null, action, detail });
const newId = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const readContracts = () => readStore().contracts;

/** عکس‌های مؤثر تحلیل: آخرین عکس اکسل + قراردادهای ثبت‌شده در پلتفرم. */
export function readEffectiveSnapshots() {
  return mergeContractRows(readSalesSnapshots(), readContracts(), todayIso());
}

/** شماره‌ی خودکار PL-سال-۰۰۱ (یکتا در میان قراردادهای پلتفرم و ردیف‌های اکسل). */
function nextFileNo(store, year) {
  const taken = new Set([...store.contracts.map((c) => c.file_no), ...readSalesSnapshots().flatMap((s) => s.rows.map((r) => r.file_no))].filter(Boolean));
  let n = (store.seq[year] || 0) + 1;
  let no;
  do { no = `PL-${year}-${String(n).padStart(3, "0")}`; n += 1; } while (taken.has(no));
  store.seq[year] = n - 1;
  return no;
}

function upsertCustomerIn(store, c, by) {
  const id = customerIdOf(c.buyer);
  const prev = store.customers.find((x) => x.id === id);
  const next = {
    id, name: c.buyer, country: c.country, person: c.contact_person ?? prev?.person ?? null, phone: c.phone ?? prev?.phone ?? null, email: c.email ?? prev?.email ?? null,
    address: c.address ?? prev?.address ?? null, notes: c.customer_notes ?? prev?.notes ?? null, updated_at: new Date().toISOString(), updated_by: by || null,
    created_at: prev?.created_at || new Date().toISOString(),
  };
  if (prev) Object.assign(prev, next); else store.customers.push(next);
  return next;
}

export function createContract(input, by) {
  const { errors, fields } = cleanContractInput(input);
  if (errors.length) return { ok: false, errors };
  const store = readStore();
  const now = new Date().toISOString();
  const year = (fields.date || todayIso()).slice(0, 4);
  let fileNo = String(input.file_no || "").trim();
  if (fileNo) {
    const dup = store.contracts.some((c) => c.file_no === fileNo);
    if (dup) return { ok: false, errors: [`شماره‌ی قرارداد ${fileNo} قبلاً در پلتفرم ثبت شده است.`] };
  } else fileNo = nextFileNo(store, year);
  const steps = {};
  const c = {
    id: newId("ct"), file_no: fileNo, status: "active", ...fields, date: fields.date || todayIso(),
    payment_plan: fields.payment_plan || [], delivery_plan: fields.delivery_plan || [], notes: [], steps,
    created_by: by || null, created_at: now, updated_at: now,
  };
  // مرحله‌ی اولیه: پیشنهاد یا قرارداد قطعی (اگر کاربر «قطعی» را انتخاب کرده)
  steps.quoted = { done: true, at: c.date, by: by || null, note: null };
  if (input.firm) steps.pi_issued = { done: true, at: c.date, by: by || null, note: null };
  store.contracts.push(c);
  upsertCustomerIn(store, c, by);
  log(store, by, "contract.create", { id: c.id, file_no: c.file_no, buyer: c.buyer, tons: c.tons });
  persist(store);
  return { ok: true, contract: c };
}

export function getContract(id) {
  return readStore().contracts.find((c) => c.id === id) || null;
}

/** ویرایش فیلدها و برنامه‌های پرداخت/تحویل. */
export function updateContract(id, input, by) {
  const store = readStore();
  const c = store.contracts.find((x) => x.id === id);
  if (!c) return { ok: false, errors: ["قرارداد پیدا نشد."] };
  const { errors, fields } = cleanContractInput(input, { partial: true });
  if (errors.length) return { ok: false, errors };
  const before = { buyer: c.buyer, tons: c.tons, price: c.price };
  Object.assign(c, fields, { updated_at: new Date().toISOString() });
  upsertCustomerIn(store, c, by);
  log(store, by, "contract.update", { id, file_no: c.file_no, fields: Object.keys(fields), before });
  persist(store);
  return { ok: true, contract: c };
}

/** تیک‌زدن/برداشتن یک مرحله. «قطعی شدن» مرحله‌ی پیشنهاد را هم خودکار تیک می‌زند؛ تسویه‌ی کامل به «بستن» می‌انجامد. */
export function setStep(id, key, done, { note, date }, by) {
  if (!STEP_KEYS.includes(key)) return { ok: false, errors: ["مرحله‌ی نامعتبر."] };
  const store = readStore();
  const c = store.contracts.find((x) => x.id === id);
  if (!c) return { ok: false, errors: ["قرارداد پیدا نشد."] };
  if (c.status === "cancelled") return { ok: false, errors: ["قرارداد لغو شده است؛ ابتدا آن را بازگردانی کنید."] };
  const at = date || todayIso();
  c.steps[key] = done ? { done: true, at, by: by || null, note: String(note || "").slice(0, 300) || null } : { done: false, at: null, by: by || null, note: null, undone_at: new Date().toISOString() };
  if (done && key === "pi_issued" && !c.steps.quoted?.done) c.steps.quoted = { done: true, at, by: by || null, note: null };
  c.updated_at = new Date().toISOString();
  log(store, by, done ? "contract.step.done" : "contract.step.undo", { id, file_no: c.file_no, step: key, label: STEPS.find((s) => s.key === key).label });
  persist(store);
  return { ok: true, contract: c };
}

export function addNote(id, text, by) {
  const t = String(text || "").trim().slice(0, 1000);
  if (!t) return { ok: false, errors: ["متن یادداشت خالی است."] };
  const store = readStore();
  const c = store.contracts.find((x) => x.id === id);
  if (!c) return { ok: false, errors: ["قرارداد پیدا نشد."] };
  c.notes.push({ id: newId("n"), at: new Date().toISOString(), by: by || null, text: t });
  c.updated_at = new Date().toISOString();
  log(store, by, "contract.note", { id, file_no: c.file_no });
  persist(store);
  return { ok: true, contract: c };
}

export function setCancelled(id, cancelled, reason, by) {
  const store = readStore();
  const c = store.contracts.find((x) => x.id === id);
  if (!c) return { ok: false, errors: ["قرارداد پیدا نشد."] };
  c.status = cancelled ? "cancelled" : "active";
  if (cancelled) c.cancel = { at: new Date().toISOString(), by: by || null, reason: String(reason || "").slice(0, 300) || null };
  else delete c.cancel;
  c.updated_at = new Date().toISOString();
  log(store, by, cancelled ? "contract.cancel" : "contract.reopen", { id, file_no: c.file_no, reason: reason || null });
  persist(store);
  return { ok: true, contract: c };
}

export function upsertCustomer(input, by) {
  const buyer = String(input.name || "").trim().slice(0, 160);
  if (!buyer) return { ok: false, errors: ["نام شرکت لازم است."] };
  const { errors, fields } = cleanContractInput({ buyer, country: input.country || "—", tons: 1, contact_person: input.person, phone: input.phone, email: input.email, address: input.address, customer_notes: input.notes }, {});
  if (errors.length) return { ok: false, errors };
  const store = readStore();
  const c = upsertCustomerIn(store, { ...fields, buyer, country: String(input.country || "").trim().slice(0, 60) }, by);
  log(store, by, "customer.upsert", { id: c.id, name: c.name });
  persist(store);
  return { ok: true, customer: c };
}

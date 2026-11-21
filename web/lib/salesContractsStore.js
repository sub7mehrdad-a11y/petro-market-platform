import fs from "fs";
import path from "path";
import { getSalesDir, readSalesSnapshots, salesStorageProblem, writeAtomic } from "./salesStore";
import { parseDateCell, todayIso } from "./salesFormat";
import { customerIdOf } from "./salesLedger";
import { CURRENCIES, INCOTERMS, SHIPMENT_KEYS, STEP_KEYS, STEPS, cleanContractInput, diffContract, gradeFromSheet, mergeContractRows, shipmentTotals } from "./salesContracts";

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

const MAX_HISTORY = 400;
/** تاریخچه‌ی هر قرارداد: چه کسی، کی، چه چیزی را از چه مقداری به چه مقداری تغییر داد (هیچ‌چیز پاک نمی‌شود). */
function addHistory(c, by, action, summary, changes = []) {
  c.history = [...(c.history || []), { id: newId("h"), at: new Date().toISOString(), by: by || null, action, summary, changes }].slice(-MAX_HISTORY);
}

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
  addHistory(c, by, "create", `ثبت قرارداد ${c.file_no} (${c.buyer}، ${c.tons} تن)`);
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
  const changes = diffContract(c, fields);
  Object.assign(c, fields, { updated_at: new Date().toISOString() });
  if (changes.length) addHistory(c, by, "update", `ویرایش: ${changes.map((x) => x.label).join("، ")}`, changes);
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
  addHistory(c, by, "step", `${done ? "انجام شد" : "برداشته شد"}: ${STEPS.find((x) => x.key === key).label}${done ? ` (${at})` : ""}${note && done ? ` — ${String(note).slice(0, 120)}` : ""}`);
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
  addHistory(c, by, "note", "یادداشت تازه");
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
  addHistory(c, by, cancelled ? "cancel" : "reopen", cancelled ? `لغو قرارداد${reason ? `: ${String(reason).slice(0, 120)}` : ""}` : "بازگردانی قرارداد");
  log(store, by, cancelled ? "contract.cancel" : "contract.reopen", { id, file_no: c.file_no, reason: reason || null });
  persist(store);
  return { ok: true, contract: c };
}

// ---------------------------------------------------------------------------------------------- پرونده‌ی مشتری (پروفایل شرکت)
export const CUSTOMER_STATUS = ["فعال", "بالقوه", "غیرفعال"];
export const CONTACT_INFLUENCE = ["تصمیم‌گیرنده", "تأثیرگذار", "خرید و بازرگانی", "مالی", "فنی و کیفیت", "اجرایی و لجستیک", "سایر"];
export const CUSTOMER_CHANNELS = ["ایمیل", "واتساپ", "تلفن", "تلگرام", "لینکدین", "حضوری"];
const CUSTOMER_TEXT = {
  country: 60, person: 120, phone: 160, email: 160, address: 400, notes: 2000, website: 200, city: 80, activity: 200, registration_no: 80,
  manager: 100, whatsapp: 60, telegram: 100, linkedin: 200, language: 60,
};
const CUSTOMER_LABEL = {
  name: "نام شرکت", country: "کشور", person: "شخص تماس اصلی", phone: "تلفن", email: "ایمیل", address: "آدرس", notes: "یادداشت", website: "وب‌سایت", city: "شهر",
  activity: "حوزه‌ی فعالیت", registration_no: "شماره ثبت/شناسه", manager: "مسئول پیگیری", whatsapp: "واتساپ", telegram: "تلگرام", linkedin: "لینکدین",
  language: "زبان مکاتبه", status: "وضعیت", preferred_channel: "کانال ترجیحی", contacts: "افراد کلیدی",
};
const MAX_CUSTOMER_HISTORY = 200;

function cleanContacts(list) {
  const out = [];
  for (const [i, c] of (Array.isArray(list) ? list : []).slice(0, 30).entries()) {
    const name = String(c?.name || "").trim().slice(0, 120);
    const row = {
      id: c?.id || newId("pc"), name, role: String(c?.role || "").trim().slice(0, 120) || null,
      influence: CONTACT_INFLUENCE.includes(c?.influence) ? c.influence : null,
      phone: String(c?.phone || "").trim().slice(0, 100) || null, whatsapp: String(c?.whatsapp || "").trim().slice(0, 60) || null,
      email: String(c?.email || "").trim().slice(0, 160) || null, notes: String(c?.notes || "").trim().slice(0, 500) || null,
    };
    if (!name && !row.phone && !row.email && !row.whatsapp) continue;
    if (!name) return { error: `فرد کلیدی ${i + 1}: نام لازم است.` };
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return { error: `فرد کلیدی ${i + 1}: ایمیل معتبر نیست.` };
    out.push(row);
  }
  return { contacts: out };
}

const contactsText = (list) => (list || []).map((c) => `${c.name}${c.role ? ` (${c.role})` : ""}`).join("، ") || "—";

/** ایجاد/ویرایش پرونده‌ی مشتری. input.id = ویرایش همان مشتری (حتی با تغییر نام)؛ بدون id، شناسه از نام ساخته می‌شود. */
export function upsertCustomer(input, by) {
  const name = String(input.name || "").trim().slice(0, 160);
  if (!name) return { ok: false, errors: ["نام شرکت لازم است."] };
  const errors = [];
  const f = {};
  for (const [k, n] of Object.entries(CUSTOMER_TEXT)) if (input[k] !== undefined) f[k] = String(input[k] ?? "").trim().slice(0, n) || null;
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) errors.push("ایمیل شرکت معتبر نیست.");
  if (input.status !== undefined) { if (input.status && !CUSTOMER_STATUS.includes(input.status)) errors.push("وضعیت مشتری نامعتبر است."); else f.status = input.status || null; }
  if (input.preferred_channel !== undefined) { if (input.preferred_channel && !CUSTOMER_CHANNELS.includes(input.preferred_channel)) errors.push("کانال ترجیحی نامعتبر است."); else f.preferred_channel = input.preferred_channel || null; }
  let contacts;
  if (input.contacts !== undefined) { const r = cleanContacts(input.contacts); if (r.error) errors.push(r.error); else contacts = r.contacts; }
  if (errors.length) return { ok: false, errors };

  const store = readStore();
  const id = input.id && store.customers.some((x) => x.id === input.id) ? input.id : customerIdOf(name);
  const prev = store.customers.find((x) => x.id === id);
  const before = prev ? { ...prev } : null;
  const now = new Date().toISOString();
  const next = {
    id, name, country: prev?.country ?? null, person: prev?.person ?? null, phone: prev?.phone ?? null, email: prev?.email ?? null, address: prev?.address ?? null, notes: prev?.notes ?? null,
    ...(prev || {}), name, ...f, ...(contacts !== undefined ? { contacts } : {}), updated_at: now, updated_by: by || null, created_at: prev?.created_at || now,
  };
  next.contacts = next.contacts || [];
  // فقط تغییرهای واقعی در تاریخچه
  const changes = [];
  for (const k of ["name", ...Object.keys(CUSTOMER_TEXT), "status", "preferred_channel"]) {
    const a = before?.[k] ?? null, b = next[k] ?? null;
    if (String(a ?? "") !== String(b ?? "")) changes.push({ field: k, label: CUSTOMER_LABEL[k] || k, from: a, to: b });
  }
  if (contacts !== undefined && contactsText(before?.contacts) !== contactsText(contacts)) changes.push({ field: "contacts", label: CUSTOMER_LABEL.contacts, from: contactsText(before?.contacts), to: contactsText(contacts) });
  if (changes.length || !prev) {
    next.history = [...(prev?.history || []), { id: newId("ch"), at: now, by: by || null, summary: prev ? `ویرایش: ${changes.map((x) => x.label).join("، ")}` : "ایجاد پرونده‌ی مشتری", changes }].slice(-MAX_CUSTOMER_HISTORY);
  }
  if (prev) Object.assign(prev, next); else store.customers.push(next);
  log(store, by, "customer.upsert", { id, name });
  persist(store);
  return { ok: true, customer: prev || next };
}

export const getCustomerRecord = (id) => readStore().customers.find((c) => c.id === id) || null;

// ---------------------------------------------------------------------------------------------- قرارداد اکسل ← قرارداد قابل‌ویرایش پلتفرم
/**
 * قراردادی که فقط در فایل «Sales Report» هست را (با همان File NO) در پلتفرم می‌سازد تا همه‌ی فیلدها، مراحل، پرداخت‌ها و بارگیری‌هایش
 * قابل‌ویرایش و دارای تاریخچه شود. ردیف پلتفرم جای ردیف اکسل را می‌گیرد (mergeContractRows)؛ وضعیت پرداخت اکسل تا اولین پرداخت ثبت‌شده می‌ماند.
 */
export function adoptFromSheet(fileKey, by) {
  const store = readStore();
  const existing = store.contracts.find((c) => c.file_no === fileKey);
  if (existing) return { ok: true, contract: existing, already: true };
  const snaps = readSalesSnapshots();
  const latest = snaps[snaps.length - 1];
  const row = latest?.rows.find((r) => r.stage === "firm" && (r.file_no === fileKey || r.doc_no === fileKey));
  if (!row) return { ok: false, errors: ["قرارداد در گزارش فروش پیدا نشد."] };
  const fileNo = row.file_no || row.doc_no;
  const dup = store.contracts.find((c) => c.file_no === fileNo);
  if (dup) return { ok: true, contract: dup, already: true };
  const now = new Date().toISOString();
  const date = row.date || todayIso();
  const done = (flag) => ({ done: !!flag, at: flag ? date : null, by: by || null, note: null });
  const steps = { quoted: done(true), pi_issued: done(true) };
  if (row.production_done) steps.production = done(true);
  if (row.loaded) steps.loaded = done(true);
  if (row.payment_status === "paid") steps.payment_received = done(true);
  const c = {
    id: newId("ct"), file_no: fileNo, status: "active", buyer: row.buyer, country: row.country, tons: row.tons, price: row.price ?? null,
    currency: CURRENCIES.includes(row.currency) ? row.currency : "USD", grade: gradeFromSheet(row.grade),
    incoterm: INCOTERMS.includes(String(row.incoterm || "").toUpperCase()) ? String(row.incoterm).toUpperCase() : null,
    port: row.port || null, payment_terms: row.payment_terms || null, plant: row.plant || null, doc_no: row.doc_no || null,
    packaging: null, contact_person: row.contact || null, phone: null, email: null, address: null, customer_notes: null, date,
    payment_plan: [], delivery_plan: [], shipments: [], notes: [], steps, sheet_payment_status: row.payment_status || null,
    adopted_from_sheet: { at: now, by: by || null, as_of: latest.as_of },
    created_by: by || null, created_at: now, updated_at: now,
  };
  addHistory(c, by, "adopt", `انتقال از گزارش فروش (${latest.as_of}) برای ویرایش در پلتفرم`);
  store.contracts.push(c);
  upsertCustomerIn(store, c, by);
  log(store, by, "contract.adopt", { id: c.id, file_no: fileNo });
  persist(store);
  return { ok: true, contract: c };
}

// ---------------------------------------------------------------------------------------------- بارگیری و ارسال (چندمرحله‌ای)
const round2 = (n) => Math.round(n * 100) / 100;
function shipmentFields(input, { partial = false } = {}) {
  const errors = [];
  const f = {};
  if (!partial || input.tons !== undefined) {
    const t = Number(String(input.tons ?? "").replace(/[٬,\s]/g, ""));
    if (!(t > 0)) errors.push("تناژ بارگیری باید عددی بزرگ‌تر از صفر باشد."); else f.tons = round2(t);
  }
  for (const k of ["planned_date", "loaded_at", "shipped_at"]) {
    if (input[k] === undefined) continue;
    if (!input[k]) { f[k] = null; continue; }
    const d = parseDateCell(input[k]);
    if (!d) errors.push("تاریخ نامعتبر است (مثل ۱۴۰۵/۰۸/۱۳ یا 2026-11-04)."); else f[k] = d;
  }
  if (input.status !== undefined) { if (!SHIPMENT_KEYS.includes(input.status)) errors.push("وضعیت بارگیری نامعتبر است."); else f.status = input.status; }
  if (input.note !== undefined) f.note = String(input.note || "").trim().slice(0, 200) || null;
  if (input.vehicle !== undefined) f.vehicle = String(input.vehicle || "").trim().slice(0, 120) || null;
  return { errors, f };
}

function syncStepsFromShipments(c, by) {
  const t = shipmentTotals(c);
  const set = (key, label) => {
    if (c.steps[key]?.done) return;
    c.steps[key] = { done: true, at: todayIso(), by: by || null, note: "خودکار از بارگیری‌ها" };
    addHistory(c, by, "step", `انجام شد (خودکار): ${label}`);
  };
  if (c.tons > 0 && t.loaded + 0.001 >= c.tons) set("loaded", "بارگیری انجام شد");
  if (c.tons > 0 && t.shipped + 0.001 >= c.tons) set("shipped", "ارسال و حمل شروع شد");
}

export function addShipment(id, input, by) {
  const store = readStore();
  const c = store.contracts.find((x) => x.id === id);
  if (!c) return { ok: false, errors: ["قرارداد پیدا نشد."] };
  if (c.status === "cancelled") return { ok: false, errors: ["قرارداد لغو شده است."] };
  const { errors, f } = shipmentFields(input);
  if (errors.length) return { ok: false, errors };
  const rest = shipmentTotals(c).remaining;
  if (f.tons > rest + 0.001) return { ok: false, errors: [`مجموع بارگیری‌ها از تناژ قرارداد بیشتر می‌شود (باقیمانده‌ی بدون برنامه: ${rest} تن).`] };
  const status = f.status || "queued";
  const s = { id: newId("sh"), tons: f.tons, planned_date: f.planned_date || null, status, loaded_at: status !== "queued" ? f.loaded_at || todayIso() : null, shipped_at: status === "shipped" ? f.shipped_at || todayIso() : null, note: f.note || null, vehicle: f.vehicle || null, created_at: new Date().toISOString(), created_by: by || null };
  c.shipments = [...(c.shipments || []), s];
  c.updated_at = s.created_at;
  addHistory(c, by, "shipment", `بارگیری ${s.tons} تن ثبت شد${s.planned_date ? ` (برنامه: ${s.planned_date})` : ""}`);
  syncStepsFromShipments(c, by);
  log(store, by, "contract.shipment.add", { id, file_no: c.file_no, tons: s.tons });
  persist(store);
  return { ok: true, contract: c, shipment: s };
}

const SHIP_LABEL = { tons: "تناژ بارگیری", planned_date: "تاریخ برنامه", loaded_at: "تاریخ بارگیری", shipped_at: "تاریخ ارسال", status: "وضعیت", note: "توضیح", vehicle: "وسیله/شماره" };

export function updateShipment(id, shipmentId, input, by) {
  const store = readStore();
  const c = store.contracts.find((x) => x.id === id);
  const s = c?.shipments?.find((x) => x.id === shipmentId);
  if (!s) return { ok: false, errors: ["بارگیری پیدا نشد."] };
  const { errors, f } = shipmentFields(input, { partial: true });
  if (errors.length) return { ok: false, errors };
  if (f.tons !== undefined) {
    const rest = shipmentTotals(c).remaining + s.tons;
    if (f.tons > rest + 0.001) return { ok: false, errors: [`مجموع بارگیری‌ها از تناژ قرارداد بیشتر می‌شود (حداکثر برای این بارگیری: ${round2(rest)} تن).`] };
  }
  const changes = [];
  for (const [k, v] of Object.entries(f)) if (String(s[k] ?? "") !== String(v ?? "")) changes.push({ field: k, label: SHIP_LABEL[k] || k, from: s[k] ?? null, to: v ?? null });
  Object.assign(s, f);
  if (s.status === "loaded" && !s.loaded_at) s.loaded_at = todayIso();
  if (s.status === "shipped") { if (!s.loaded_at) s.loaded_at = todayIso(); if (!s.shipped_at) s.shipped_at = todayIso(); }
  if (s.status === "queued") { s.loaded_at = null; s.shipped_at = null; }
  c.updated_at = new Date().toISOString();
  if (changes.length) addHistory(c, by, "shipment", `ویرایش بارگیری ${s.tons} تن: ${changes.map((x) => x.label).join("، ")}`, changes);
  syncStepsFromShipments(c, by);
  log(store, by, "contract.shipment.update", { id, file_no: c.file_no, shipment: shipmentId, fields: Object.keys(f) });
  persist(store);
  return { ok: true, contract: c, shipment: s };
}

export function deleteShipment(id, shipmentId, by) {
  const store = readStore();
  const c = store.contracts.find((x) => x.id === id);
  const s = c?.shipments?.find((x) => x.id === shipmentId);
  if (!s) return { ok: false, errors: ["بارگیری پیدا نشد."] };
  c.shipments = c.shipments.filter((x) => x.id !== shipmentId);
  c.updated_at = new Date().toISOString();
  addHistory(c, by, "shipment", `حذف بارگیری ${s.tons} تن (${s.status === "queued" ? "در صف" : s.status === "loaded" ? "بارگیری‌شده" : "ارسال‌شده"})`);
  log(store, by, "contract.shipment.delete", { id, file_no: c.file_no, shipment: { ...s } });
  persist(store);
  return { ok: true, contract: c };
}

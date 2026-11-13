"use client";

import { useEffect, useState } from "react";

// فرم ثبت/ویرایش قرارداد: اطلاعات مشتری، مشخصات سفارش، برنامه‌ی پرداخت و برنامه‌ی تحویل.
// تاریخ‌ها را هم شمسی (۱۴۰۵/۰۸/۱۳) و هم میلادی (2026-11-04) می‌پذیرد؛ سرور به میلادی تبدیل می‌کند.

const inputCls = "mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm";
const Field = ({ label, children, className = "" }) => <label className={`block text-xs text-text-muted ${className}`}>{label}{children}</label>;

const empty = {
  buyer: "", country: "", contact_person: "", phone: "", email: "", address: "", customer_notes: "",
  grade: "خوراکی", tons: "", price: "", currency: "USD", incoterm: "", port: "", payment_terms: "", packaging: "", date: "", file_no: "", firm: true,
  payment_plan: [], delivery_plan: [],
};

export default function ContractForm({ initial = null, meta, onSaved, submitLabel = "ثبت قرارداد" }) {
  const [f, setF] = useState(() => (initial ? { ...empty, ...initial, price: initial.price ?? "", tons: initial.tons ?? "" } : empty));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState([]);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const editing = !!initial;

  // انتخاب مشتری موجود، اطلاعات تماس را پر می‌کند (فقط در ثبت جدید و فقط برای فیلدهای خالی)
  useEffect(() => {
    if (editing || !meta) return;
    const c = meta.customers.find((x) => x.name.toLowerCase() === f.buyer.trim().toLowerCase());
    if (!c) return;
    setF((p) => ({ ...p, country: p.country || c.country || "", contact_person: p.contact_person || c.person || "", phone: p.phone || c.phone || "", email: p.email || c.email || "", address: p.address || c.address || "" }));
  }, [f.buyer, meta, editing]);

  const list = (key) => (id, patch) => setF((p) => ({ ...p, [key]: p[key].map((r, i) => (i === id ? { ...r, ...patch } : r)) }));
  const addRow = (key, row) => setF((p) => ({ ...p, [key]: [...p[key], row] }));
  const delRow = (key, i) => setF((p) => ({ ...p, [key]: p[key].filter((_, j) => j !== i) }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErrors([]);
    const body = { ...f };
    const res = await fetch("/api/sales/contracts", {
      method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing ? { action: "update", id: initial.id, fields: body } : body),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErrors(j.errors || [j.error || "ذخیره نشد."]); return; }
    onSaved?.(j.contract);
  }

  const total = Number(f.tons) > 0 && f.price !== "" && Number(f.price) >= 0 ? Number(f.tons) * Number(f.price) : null;

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className="card space-y-3 p-5">
        <h2 className="text-sm font-bold text-text">مشتری</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="نام شرکت خریدار *">
            <input list="cust-list" value={f.buyer} onChange={set("buyer")} className={inputCls} dir="auto" required />
            <datalist id="cust-list">{(meta?.customers || []).map((c) => <option key={c.id} value={c.name} />)}</datalist>
          </Field>
          <Field label="کشور مقصد *">
            <input list="country-list" value={f.country} onChange={set("country")} className={inputCls} required />
            <datalist id="country-list">{(meta?.countries || []).map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="شخص تماس"><input value={f.contact_person || ""} onChange={set("contact_person")} className={inputCls} dir="auto" /></Field>
          <Field label="تلفن"><input value={f.phone || ""} onChange={set("phone")} className={inputCls} dir="ltr" /></Field>
          <Field label="ایمیل"><input type="email" value={f.email || ""} onChange={set("email")} className={inputCls} dir="ltr" /></Field>
          <Field label="آدرس"><input value={f.address || ""} onChange={set("address")} className={inputCls} dir="auto" /></Field>
          <Field label="یادداشت درباره‌ی مشتری" className="sm:col-span-2"><input value={f.customer_notes || ""} onChange={set("customer_notes")} className={inputCls} dir="auto" /></Field>
        </div>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="text-sm font-bold text-text">مشخصات سفارش</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="گرید"><select value={f.grade} onChange={set("grade")} className={inputCls}>{(meta?.grades || ["خوراکی", "دامی", "صنعتی", "دارویی", "سایر"]).map((g) => <option key={g}>{g}</option>)}</select></Field>
          <Field label="حجم (تن) *"><input value={f.tons} onChange={set("tons")} className={inputCls} dir="ltr" inputMode="decimal" required /></Field>
          <Field label="قیمت هر تن"><input value={f.price} onChange={set("price")} className={inputCls} dir="ltr" inputMode="decimal" /></Field>
          <Field label="ارز"><select value={f.currency} onChange={set("currency")} className={inputCls}>{(meta?.currencies || ["USD"]).map((g) => <option key={g}>{g}</option>)}</select></Field>
          <Field label="شرایط تحویل (اینکوترمز)"><select value={f.incoterm || ""} onChange={set("incoterm")} className={inputCls}><option value="">—</option>{(meta?.incoterms || []).map((g) => <option key={g}>{g}</option>)}</select></Field>
          <Field label="بندر/محل تحویل"><input value={f.port || ""} onChange={set("port")} className={inputCls} dir="auto" /></Field>
          <Field label="شرایط پرداخت (مثلاً 30% prepayment)"><input value={f.payment_terms || ""} onChange={set("payment_terms")} className={inputCls} dir="ltr" /></Field>
          <Field label="بسته‌بندی"><input value={f.packaging || ""} onChange={set("packaging")} className={inputCls} dir="auto" /></Field>
          <Field label="تاریخ قرارداد/PI (پیش‌فرض امروز)"><input value={f.date || ""} onChange={set("date")} placeholder="۱۴۰۵/۰۸/۱۳" className={inputCls} dir="ltr" /></Field>
          {!editing && <Field label="شماره‌ی قرارداد (File NO؛ خالی = خودکار)"><input value={f.file_no} onChange={set("file_no")} className={inputCls} dir="ltr" /></Field>}
        </div>
        {total != null && <p className="text-xs text-text-muted">مبلغ کل: <b className="text-text" dir="ltr">{total.toLocaleString("en-US", { maximumFractionDigits: 2 })} {f.currency}</b></p>}
        {!editing && (
          <label className="flex items-center gap-2 text-sm text-text">
            <input type="checkbox" checked={f.firm} onChange={set("firm")} /> قرارداد قطعی است (PI صادر شده). اگر فقط پیشنهاد است برندارید؛ بعداً از صفحه‌ی قرارداد قطعی می‌شود.
          </label>
        )}
      </section>

      <section className="card space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-text">برنامه‌ی پرداخت</h2>
          <button type="button" onClick={() => addRow("payment_plan", { due_date: "", amount: "", note: "" })} className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-canvas cursor-pointer">+ قسط</button>
        </div>
        {f.payment_plan.length === 0 && <p className="text-xs text-text-muted">قسطی ثبت نشده. سررسید هر پرداخت را اضافه کنید تا هشدار بگیرید.</p>}
        {f.payment_plan.map((p, i) => (
          <div key={p.id || i} className="grid gap-2 sm:grid-cols-[10rem_10rem_1fr_auto]">
            <input value={p.due_date || ""} onChange={(e) => list("payment_plan")(i, { due_date: e.target.value })} placeholder="سررسید ۱۴۰۵/۰۹/۲۰" dir="ltr" className={inputCls} />
            <input value={p.amount} onChange={(e) => list("payment_plan")(i, { amount: e.target.value })} placeholder="مبلغ" dir="ltr" inputMode="decimal" className={inputCls} />
            <input value={p.note || ""} onChange={(e) => list("payment_plan")(i, { note: e.target.value })} placeholder="یادداشت (مثلاً پیش‌پرداخت ۳۰٪)" className={inputCls} />
            <button type="button" onClick={() => delRow("payment_plan", i)} className="text-xs text-danger hover:underline cursor-pointer">حذف</button>
          </div>
        ))}
      </section>

      <section className="card space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-text">برنامه‌ی تحویل</h2>
          <button type="button" onClick={() => addRow("delivery_plan", { date: "", tons: "", note: "" })} className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-canvas cursor-pointer">+ محموله</button>
        </div>
        {f.delivery_plan.length === 0 && <p className="text-xs text-text-muted">محموله‌ای ثبت نشده.</p>}
        {f.delivery_plan.map((p, i) => (
          <div key={p.id || i} className="grid gap-2 sm:grid-cols-[10rem_10rem_1fr_auto]">
            <input value={p.date || ""} onChange={(e) => list("delivery_plan")(i, { date: e.target.value })} placeholder="تاریخ ۱۴۰۵/۰۹/۲۵" dir="ltr" className={inputCls} />
            <input value={p.tons ?? ""} onChange={(e) => list("delivery_plan")(i, { tons: e.target.value })} placeholder="تن" dir="ltr" inputMode="decimal" className={inputCls} />
            <input value={p.note || ""} onChange={(e) => list("delivery_plan")(i, { note: e.target.value })} placeholder="یادداشت (کشتی، کامیون، بندر…)" className={inputCls} />
            <button type="button" onClick={() => delRow("delivery_plan", i)} className="text-xs text-danger hover:underline cursor-pointer">حذف</button>
          </div>
        ))}
      </section>

      {errors.length > 0 && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger"><ul className="list-disc ps-5">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
      <button type="submit" disabled={busy} className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 cursor-pointer">{busy ? "…" : submitLabel}</button>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import PageHeader from "../../../components/PageHeader";
import { SalesNav, fa } from "../../salesUi";
import ContractForm from "../ContractForm";

const money = (n, cur = "USD") => (n == null ? "—" : `${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${cur}`);
const fd = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("fa-IR", { timeZone: "UTC" }) : "—");
const today = () => new Date().toISOString().slice(0, 10);
const inputCls = "rounded-lg border border-border bg-surface px-3 py-2 text-sm";

async function api(url, opts) {
  const res = await fetch(url, opts);
  let j = {};
  try { j = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, ...j };
}
const patch = (body) => api("/api/sales/contracts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function PaymentForm({ contract, onDone }) {
  const [f, setF] = useState({ date: today(), amount: contract.account?.balance > 0 ? String(contract.account.balance) : "", type: "payment", method: "", reference: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  async function submit(e, force = false) {
    e?.preventDefault();
    setBusy(true); setErr("");
    const r = await api("/api/sales/ledger/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, contract_key: contract.file_no, force }) });
    setBusy(false);
    if (r.status === 409 && r.needs_confirm) { if (confirm(`${r.warnings.join("\n")}\n\nمتوجه هستید؛ ثبت شود؟`)) submit(null, true); return; }
    if (!r.ok) { setErr(r.error || "ثبت نشد."); return; }
    setF((p) => ({ ...p, amount: "", reference: "", note: "" }));
    onDone();
  }
  return (
    <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-6">
      <input value={f.date} onChange={set("date")} placeholder="تاریخ" dir="ltr" className={inputCls} />
      <input value={f.amount} onChange={set("amount")} placeholder="مبلغ" dir="ltr" inputMode="decimal" className={inputCls} required />
      <select value={f.type} onChange={set("type")} className={inputCls}><option value="payment">پرداخت</option><option value="refund">استرداد</option><option value="adjustment">تعدیل/تخفیف</option></select>
      <input value={f.method} onChange={set("method")} placeholder="روش (TT، نقد…)" className={inputCls} />
      <input value={f.reference} onChange={set("reference")} placeholder="مرجع/شماره" dir="ltr" className={inputCls} />
      <button type="submit" disabled={busy} className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white disabled:opacity-50 cursor-pointer">{busy ? "…" : "ثبت پرداخت"}</button>
      {err && <p className="text-xs text-danger sm:col-span-6">{err}</p>}
    </form>
  );
}

export default function ContractDetail({ id }) {
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api(`/api/sales/contracts?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!r.ok) { setError(r.error || "خطا"); return; }
    setError(""); setData(r);
  }, [id]);
  useEffect(() => { load(); api("/api/sales/contracts", { cache: "no-store" }).then((r) => r.ok && setMeta(r)); }, [load]);

  async function act(body) {
    setBusy(true);
    const r = await patch({ id, ...body });
    setBusy(false);
    if (!r.ok) { alert(r.error || "انجام نشد"); return false; }
    await load();
    return true;
  }
  async function toggleStep(key, done) {
    if (done) { const n = prompt("یادداشت این مرحله (اختیاری):", "") ?? null; if (n === null) return; await act({ action: "step", key, done: true, note: n }); }
    else if (confirm("تیک این مرحله برداشته شود؟")) await act({ action: "step", key, done: false });
  }
  async function toggleDelivery(i) {
    const c = data.contract;
    const plan = c.delivery_plan.map((p, j) => (j === i ? { ...p, done: !p.done, done_at: !p.done ? today() : null } : p));
    await act({ action: "update", fields: { delivery_plan: plan } });
  }

  const c = data?.contract;
  if (error) return <div className="space-y-6"><SalesNav active="/sales/contracts" /><div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div></div>;
  if (!c) return <div className="space-y-6"><SalesNav active="/sales/contracts" /><p className="text-sm text-text-muted">در حال بارگذاری…</p></div>;

  // سررسید هر قسط نسبت به پرداخت واقعی: قسط‌ها به ترتیب سررسید از پرداخت‌شده‌ی کل پوشش داده می‌شوند
  let cum = 0;
  const plan = (c.payment_plan || []).map((p) => { cum += p.amount; const covered = (c.account?.paid || 0) + 0.01 >= cum; return { ...p, covered, late: !covered && p.due_date && p.due_date < today() }; });
  const cancelled = c.status === "cancelled";

  return (
    <div className="space-y-6">
      <PageHeader title={`قرارداد ${c.file_no}`} subtitle={`${c.buyer} — ${c.country} — ${fa(c.tons, 1)} تن ${c.grade || ""}${c.incoterm ? ` ${c.incoterm}` : ""}`} />
      <SalesNav active="/sales/contracts" />

      {cancelled && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">این قرارداد لغو شده است{c.cancel?.reason ? `: ${c.cancel.reason}` : ""}. در گزارش‌ها نمی‌آید.</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["مبلغ کل", money(c.total, c.currency)], ["پرداخت‌شده", money(c.account?.paid, c.currency)], ["مانده", money(c.account?.balance, c.currency)], ["مرحله‌ی فعلی", c.current_step_label || "—"]].map(([l, v]) => (
          <div key={l} className="card p-4"><div className="text-xs text-text-muted">{l}</div><div className="mt-1 text-base font-bold text-text" dir="auto">{v}</div></div>
        ))}
      </div>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-bold text-text">مراحل قرارداد</h2>
        <ol className="space-y-2">
          {data.steps.map((s) => {
            const st = c.steps?.[s.key];
            return (
              <li key={s.key} className="flex flex-wrap items-center gap-3 text-sm">
                <button type="button" disabled={busy || cancelled} onClick={() => toggleStep(s.key, !st?.done)} aria-pressed={!!st?.done}
                  className={`flex h-6 w-6 items-center justify-center rounded border text-xs cursor-pointer disabled:opacity-50 ${st?.done ? "border-success bg-success text-white" : "border-border bg-surface"}`}>{st?.done ? "✓" : ""}</button>
                <span className={st?.done ? "text-text" : "text-text-muted"}>{s.label}</span>
                {st?.done && <span className="text-[11px] text-text-muted">{fd(st.at)}{st.by ? ` · ${st.by}` : ""}{st.note ? ` · ${st.note}` : ""}</span>}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="card p-5">
        <h2 className="mb-2 text-sm font-bold text-text">پرداخت‌ها</h2>
        {c.account?.payments?.length ? (
          <table className="w-full text-xs">
            <thead><tr className="border-b border-border text-text-muted">{["تاریخ", "مبلغ", "نوع", "روش", "مرجع", "ثبت‌کننده"].map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody>{c.account.payments.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0"><td className="px-2 py-1.5">{fd(p.date)}</td><td className="px-2 py-1.5" dir="ltr">{money(p.amount, c.currency)}</td><td className="px-2 py-1.5">{{ payment: "پرداخت", refund: "استرداد", adjustment: "تعدیل" }[p.type]}</td><td className="px-2 py-1.5">{p.method || "—"}</td><td className="px-2 py-1.5" dir="ltr">{p.reference || "—"}</td><td className="px-2 py-1.5">{p.created_by || "—"}</td></tr>
            ))}</tbody>
          </table>
        ) : <p className="text-xs text-text-muted">پرداختی ثبت نشده.</p>}
        {!cancelled && <PaymentForm contract={c} onDone={load} />}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-2 text-sm font-bold text-text">برنامه‌ی پرداخت</h2>
          {plan.length === 0 && <p className="text-xs text-text-muted">قسطی تعریف نشده (از «ویرایش» اضافه کنید).</p>}
          <ul className="space-y-1.5 text-sm">
            {plan.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${p.covered ? "bg-success-soft text-success" : p.late ? "bg-danger-soft text-danger" : "bg-canvas text-text-muted"}`}>{p.covered ? "پرداخت‌شده" : p.late ? "سررسیدگذشته" : "در انتظار"}</span>
                <span dir="ltr">{money(p.amount, c.currency)}</span><span className="text-text-muted">تا {fd(p.due_date)}</span>{p.note && <span className="text-xs text-text-muted">{p.note}</span>}
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="mb-2 text-sm font-bold text-text">برنامه‌ی تحویل</h2>
          {(c.delivery_plan || []).length === 0 && <p className="text-xs text-text-muted">محموله‌ای تعریف نشده.</p>}
          <ul className="space-y-1.5 text-sm">
            {(c.delivery_plan || []).map((p, i) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={busy || cancelled} onClick={() => toggleDelivery(i)} aria-pressed={p.done}
                  className={`flex h-5 w-5 items-center justify-center rounded border text-[11px] cursor-pointer ${p.done ? "border-success bg-success text-white" : "border-border bg-surface"}`}>{p.done ? "✓" : ""}</button>
                <span className={p.done ? "text-text-muted line-through" : p.date < today() ? "text-danger" : "text-text"}>{fd(p.date)}</span>
                {p.tons != null && <span>{fa(p.tons, 1)} تن</span>}{p.note && <span className="text-xs text-text-muted">{p.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card p-5">
        <h2 className="mb-2 text-sm font-bold text-text">یادداشت‌ها</h2>
        <ul className="mb-3 space-y-2 text-sm">
          {(c.notes || []).length === 0 && <li className="text-xs text-text-muted">یادداشتی نیست.</li>}
          {[...(c.notes || [])].reverse().map((n) => (
            <li key={n.id} className="rounded-lg bg-canvas p-2.5"><div className="text-[11px] text-text-muted">{new Date(n.at).toLocaleString("fa-IR")} · {n.by || "؟"}</div><div className="mt-0.5 whitespace-pre-wrap leading-7">{n.text}</div></li>
          ))}
        </ul>
        <form onSubmit={async (e) => { e.preventDefault(); if (await act({ action: "note", text: note })) setNote(""); }} className="flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="یادداشت تازه (مذاکره، تماس، قول مشتری…)" className={`${inputCls} flex-1`} />
          <button type="submit" disabled={busy || !note.trim()} className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white disabled:opacity-50 cursor-pointer">افزودن</button>
        </form>
      </section>

      <section className="card p-5 text-sm leading-7">
        <h2 className="mb-2 text-sm font-bold text-text">مشتری و مشخصات</h2>
        <div className="grid gap-x-6 sm:grid-cols-2">
          <div>شرکت: <b>{c.buyer}</b></div><div>کشور: {c.country}</div>
          <div>شخص تماس: {c.contact_person || "—"}</div><div>تلفن: <span dir="ltr">{c.phone || "—"}</span></div>
          <div>ایمیل: <span dir="ltr">{c.email || "—"}</span></div><div>آدرس: {c.address || "—"}</div>
          <div>شرایط پرداخت: <span dir="ltr">{c.payment_terms || "—"}</span></div><div>بندر/تحویل: {c.port || "—"}</div>
          <div>قیمت هر تن: <span dir="ltr">{money(c.price, c.currency)}</span></div><div>تاریخ قرارداد: {fd(c.date)}</div>
        </div>
        {data.customer?.notes && <p className="mt-2 text-xs text-text-muted">یادداشت مشتری: {data.customer.notes}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing((v) => !v)} className="rounded-lg border border-border px-4 py-1.5 text-xs hover:bg-canvas cursor-pointer">{editing ? "بستن ویرایش" : "ویرایش قرارداد و برنامه‌ها"}</button>
          {!cancelled && <button type="button" disabled={busy} onClick={() => { const r = prompt("دلیل لغو قرارداد:", ""); if (r !== null) act({ action: "cancel", reason: r }); }} className="rounded-lg border border-danger px-4 py-1.5 text-xs text-danger hover:bg-danger-soft cursor-pointer">لغو قرارداد</button>}
          {cancelled && <button type="button" disabled={busy} onClick={() => act({ action: "reopen" })} className="rounded-lg border border-border px-4 py-1.5 text-xs hover:bg-canvas cursor-pointer">بازگردانی قرارداد</button>}
          <Link href="/sales/accounts" className="rounded-lg border border-border px-4 py-1.5 text-xs hover:bg-canvas">حساب‌ها و پرداخت‌ها</Link>
        </div>
      </section>

      {editing && meta && <ContractForm initial={c} meta={meta} submitLabel="ذخیره‌ی تغییرات" onSaved={() => { setEditing(false); load(); }} />}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

export const fa = (n, d = 0) => (n == null ? "—" : Number(n).toLocaleString("fa-IR", { maximumFractionDigits: d }));
export const usd = (n) => (n == null ? "—" : `${n < 0 ? "-" : ""}$${Math.abs(Number(n)).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
const today = () => new Date().toISOString().slice(0, 10);

export const STATUS_STYLE = {
  paid: "bg-success-soft text-success", partial: "bg-warning-soft text-warning", unpaid: "bg-danger-soft text-danger",
  overpaid: "bg-primary-soft text-primary-hover", no_total: "bg-canvas text-text-muted",
};
export const STATUS_FA = { paid: "تسویه‌شده", partial: "بخشی پرداخت‌شده", unpaid: "پرداخت‌نشده", overpaid: "بیش‌پرداخت", no_total: "بدون مبلغ" };
const TYPE_FA = { payment: "پرداخت", refund: "استرداد", adjustment: "تعدیل/تخفیف" };

export async function api(url, opts) {
  const res = await fetch(url, opts);
  let j = {};
  try { j = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, ...j };
}

export function Kpi({ label, value, sub, tone }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-text-muted">{label}</div>
      <div className={`mt-1 text-xl font-bold ${tone || "text-text"}`}>{value}</div>
      {sub && <div className="mt-1 text-[11px] text-text-muted">{sub}</div>}
    </div>
  );
}

export function PaymentForm({ contract, customerId, defaultAmount, onDone }) {
  const [f, setF] = useState({ date: today(), amount: defaultAmount > 0 ? String(defaultAmount) : "", type: "payment", method: "", reference: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [warn, setWarn] = useState(null);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(force) {
    setBusy(true); setErr(""); setWarn(null);
    const r = await api("/api/sales/ledger/payments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, amount: Number(String(f.amount).replace(/[,٬\s]/g, "")), contract_key: contract?.key || null, customer_id: contract ? null : customerId, force: force || undefined }),
    });
    setBusy(false);
    if (r.status === 409 && r.needs_confirm) { setWarn(r.warnings); return; }
    if (!r.ok) { setErr(r.error || "ثبت نشد"); return; }
    setF((p) => ({ ...p, amount: "", reference: "", note: "" }));
    onDone();
  }

  const inp = "mt-1 block w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm";
  return (
    <div className="rounded-lg border border-border bg-canvas p-3">
      <div className="mb-2 text-xs font-bold text-text">{contract ? "ثبت پرداخت برای این قرارداد" : "ثبت پرداخت بدون قرارداد (پیش‌دریافت)"}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-[11px] text-text-muted">تاریخ<input value={f.date} onChange={set("date")} dir="ltr" placeholder="۱۴۰۵/۰۸/۱۳" className={inp} /></label>
        <label className="text-[11px] text-text-muted">مبلغ{contract ? ` (${contract.currency})` : " (USD)"}<input value={f.amount} onChange={set("amount")} dir="ltr" inputMode="decimal" className={inp} /></label>
        <label className="text-[11px] text-text-muted">نوع
          <select value={f.type} onChange={set("type")} className={inp}>{Object.entries(TYPE_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="text-[11px] text-text-muted">روش<input value={f.method} onChange={set("method")} placeholder="حواله/نقد/LC" className={inp} /></label>
        <label className="text-[11px] text-text-muted">مرجع (شماره حواله)<input value={f.reference} onChange={set("reference")} dir="ltr" className={inp} /></label>
        <label className="col-span-2 text-[11px] text-text-muted">توضیح<input value={f.note} onChange={set("note")} className={inp} /></label>
        <div className="flex items-end"><button type="button" disabled={busy || !f.amount} onClick={() => submit(false)} className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 cursor-pointer">{busy ? "…" : "ثبت"}</button></div>
      </div>
      {err && <div className="mt-2 text-xs text-danger">{err}</div>}
      {warn && (
        <div className="mt-2 rounded-lg border border-warning bg-warning-soft p-2 text-xs leading-6 text-warning">
          {warn.map((w, i) => <div key={i}>⚠ {w}</div>)}
          <button type="button" onClick={() => submit(true)} className="mt-1 rounded bg-warning px-3 py-1 text-white cursor-pointer">با وجود هشدار ثبت کن</button>
        </div>
      )}
    </div>
  );
}

export function PaymentList({ payments, onChange }) {
  if (!payments?.length) return <div className="text-xs text-text-muted">پرداختی ثبت نشده.</div>;
  async function remove(id) {
    if (!confirm("این پرداخت حذف شود؟ (در لاگ ممیزی می‌ماند)")) return;
    const r = await api(`/api/sales/ledger/payments?id=${id}`, { method: "DELETE" });
    if (r.ok) onChange(); else alert(r.error || "حذف نشد");
  }
  return (
    <table className="w-full text-xs">
      <thead><tr className="border-b border-border text-text-muted">{["تاریخ", "نوع", "مبلغ", "روش", "مرجع", "توضیح", ""].map((h) => <th key={h} className="px-2 py-1 text-start font-medium">{h}</th>)}</tr></thead>
      <tbody>
        {payments.map((p) => (
          <tr key={p.id} className="border-b border-border last:border-0">
            <td className="px-2 py-1">{p.date}</td>
            <td className="px-2 py-1">{TYPE_FA[p.type] || p.type}{p.estimated && <span className="ms-1 text-[10px] text-warning">(تخمینی)</span>}</td>
            <td className="px-2 py-1 font-semibold" dir="ltr" style={{ textAlign: "start" }}>{p.type === "refund" ? "-" : ""}{p.amount.toLocaleString("en-US")}</td>
            <td className="px-2 py-1">{p.method || "—"}</td>
            <td className="px-2 py-1" dir="ltr" style={{ textAlign: "start" }}>{p.reference || "—"}</td>
            <td className="px-2 py-1">{p.note || ""}</td>
            <td className="px-2 py-1"><button type="button" onClick={() => remove(p.id)} className="text-danger hover:underline cursor-pointer">حذف</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CustomerPanel({ cust, customers, reload, onClose }) {
  const [st, setSt] = useState(null);
  const [mergeInto, setMergeInto] = useState("");
  useEffect(() => { api(`/api/sales/ledger/statement?customer=${cust.id}`).then(setSt); }, [cust.id, cust.balance, cust.paid, cust.deals]);
  async function act(body) {
    const r = await api("/api/sales/ledger/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) reload(); else alert(r.error || "انجام نشد");
  }
  return (
    <section className="card border-primary p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-text">{cust.name}</h2>
          <div className="text-[11px] text-text-muted">{cust.countries.join("، ")} · {fa(cust.deals)} قرارداد · {fa(cust.tons, 1)} تن · از {cust.first_order || "—"} تا {cust.last_order || "—"}</div>
          {cust.name_variants.length > 1 && <div className="text-[11px] text-text-muted">نام‌های ثبت‌شده در گزارش: {cust.name_variants.join(" | ")}</div>}
        </div>
        <button type="button" onClick={onClose} className="text-xs text-text-muted hover:underline cursor-pointer">بستن ✕</button>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5 text-xs">
        {[["جمع خرید", usd(cust.total)], ["پرداخت‌شده", usd(cust.paid)], ["مانده", usd(cust.balance)], ["پیش‌دریافت", usd(cust.credit)], ["سررسیدگذشته", usd(cust.overdue_balance)]].map(([l, v]) => (
          <div key={l} className="rounded-lg bg-canvas p-2"><div className="text-text-muted">{l}</div><div className="mt-0.5 text-sm font-bold text-text">{v}</div></div>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <a href={`/api/sales/ledger/statement?customer=${cust.id}&format=xlsx`} className="rounded-lg border border-border px-3 py-1.5 font-medium text-primary hover:bg-canvas">دانلود صورت‌حساب (اکسل) ↓</a>
        <button type="button" onClick={() => { const n = prompt("نام نمایشی مشتری:", cust.name); if (n) act({ action: "rename", id: cust.id, name: n }); }} className="rounded-lg border border-border px-3 py-1.5 cursor-pointer">تغییر نام</button>
        <select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-1.5">
          <option value="">ادغام این مشتری با…</option>
          {customers.filter((c) => c.id !== cust.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {mergeInto && <button type="button" onClick={() => { if (confirm("این مشتری در مشتری انتخاب‌شده ادغام شود؟ (قابل بازگشت است)")) act({ action: "merge", from: cust.id, into: mergeInto }); }} className="rounded-lg bg-warning px-3 py-1.5 text-white cursor-pointer">ادغام</button>}
      </div>
      {cust.merged?.length > 0 && (
        <div className="mb-3 text-[11px] text-text-muted">ادغام‌شده در این حساب: {cust.merged.map((m) => <span key={m.id} className="me-2">{m.name} <button type="button" onClick={() => act({ action: "unmerge", from: m.id })} className="text-danger hover:underline cursor-pointer">(جدا کن)</button></span>)}</div>
      )}
      <h3 className="mb-1 text-sm font-bold text-text">صورت‌حساب</h3>
      {st?.lines ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-border text-text-muted">{["تاریخ", "شرح", "بدهکار (قرارداد)", "بستانکار (پرداخت)", "مانده"].map((h) => <th key={h} className="px-2 py-1 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {st.lines.map((l, i) => (
                <tr key={i} className={`border-b border-border last:border-0 ${l.kind === "contract" ? "bg-canvas/50" : ""}`}>
                  <td className="px-2 py-1">{l.date === "0000-00-00" ? "—" : l.date}</td>
                  <td className="px-2 py-1">{l.desc}</td>
                  <td className="px-2 py-1" dir="ltr" style={{ textAlign: "start" }}>{l.debit ? l.debit.toLocaleString("en-US") : ""}</td>
                  <td className="px-2 py-1 text-success" dir="ltr" style={{ textAlign: "start" }}>{l.credit ? l.credit.toLocaleString("en-US") : ""}</td>
                  <td className="px-2 py-1 font-semibold" dir="ltr" style={{ textAlign: "start" }}>{l.balance == null ? "—" : l.balance.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-1 text-[11px] text-text-muted">مانده‌ی پایانی: <b>{usd(st.closing_balance)}</b> (قراردادهای دلاری)</div>
        </div>
      ) : <div className="text-xs text-text-muted">در حال بارگذاری…</div>}
      <div className="mt-4"><PaymentForm customerId={cust.id} onDone={reload} /></div>
    </section>
  );
}

export function CustomersTab({ data, reload }) {
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState(null);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return data.customers.filter((c) => !t || [c.name, ...c.name_variants, ...c.countries].some((x) => String(x).toLowerCase().includes(t)));
  }, [data.customers, q]);
  const sel = data.customers.find((c) => c.id === selId);
  return (
    <div className="space-y-4">
      {sel && <CustomerPanel cust={sel} customers={data.customers} reload={reload} onClose={() => setSelId(null)} />}
      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-text">حساب مشتریان ({fa(data.customers.length)})</h2>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی مشتری یا کشور…" className="w-56 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-border text-text-muted">{["مشتری", "کشور", "قرارداد", "تن", "جمع خرید", "پرداخت‌شده", "مانده", "سررسیدگذشته", "آخرین سفارش"].map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} onClick={() => { setSelId(c.id); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={`cursor-pointer border-b border-border hover:bg-canvas ${selId === c.id ? "bg-primary-soft" : ""}`}>
                  <td className="px-2 py-1.5 font-medium text-text">{c.name}</td>
                  <td className="px-2 py-1.5">{c.countries.join("، ")}</td>
                  <td className="px-2 py-1.5">{fa(c.deals)}</td>
                  <td className="px-2 py-1.5">{fa(c.tons, 1)}</td>
                  <td className="px-2 py-1.5">{usd(c.total)}</td>
                  <td className="px-2 py-1.5">{usd(c.paid)}{c.paid_pct != null && <span className="ms-1 text-[10px] text-text-muted">{fa(c.paid_pct)}٪</span>}</td>
                  <td className={`px-2 py-1.5 font-semibold ${c.balance > 0 ? "text-warning" : ""}`}>{usd(c.balance)}</td>
                  <td className={`px-2 py-1.5 ${c.overdue_balance > 0 ? "text-danger font-semibold" : ""}`}>{c.overdue_balance > 0 ? usd(c.overdue_balance) : "—"}</td>
                  <td className="px-2 py-1.5">{c.last_order || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function Orphans({ data, reload }) {
  if (!data.orphans?.length) return null;
  async function relink(id, key) {
    if (!key) return;
    const r = await api("/api/sales/ledger/payments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, contract_key: key }) });
    if (r.ok) reload(); else alert(r.error || "انتقال نشد");
  }
  return (
    <section className="card border-warning p-4">
      <h2 className="mb-1 text-sm font-bold text-warning">⚠ {fa(data.orphans.length)} پرداخت به قراردادی وصل است که در گزارش فروش فعلی نیست</h2>
      <ul className="space-y-2 text-xs">
        {data.orphans.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2">
            <span>{p.date} — {p.amount.toLocaleString("en-US")} — قرارداد قبلی: <b dir="ltr">{p.contract_key}</b></span>
            <select defaultValue="" onChange={(e) => relink(p.id, e.target.value)} className="rounded border border-border bg-surface px-2 py-1">
              <option value="">انتقال به…</option>
              {data.contracts.map((c) => <option key={c.key} value={c.key}>{c.file_no || c.key} — {c.buyer}</option>)}
            </select>
          </li>
        ))}
      </ul>
    </section>
  );
}

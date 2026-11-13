"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../../components/PageHeader";
import { SalesNav } from "../salesUi";

const fa = (n, d = 0) => (n == null ? "—" : Number(n).toLocaleString("fa-IR", { maximumFractionDigits: d }));
const usd = (n) => (n == null ? "—" : `${n < 0 ? "-" : ""}$${Math.abs(Number(n)).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
const today = () => new Date().toISOString().slice(0, 10);

const STATUS_STYLE = {
  paid: "bg-success-soft text-success", partial: "bg-warning-soft text-warning", unpaid: "bg-danger-soft text-danger",
  overpaid: "bg-primary-soft text-primary-hover", no_total: "bg-canvas text-text-muted",
};
const STATUS_FA = { paid: "تسویه‌شده", partial: "بخشی پرداخت‌شده", unpaid: "پرداخت‌نشده", overpaid: "بیش‌پرداخت", no_total: "بدون مبلغ" };
const TYPE_FA = { payment: "پرداخت", refund: "استرداد", adjustment: "تعدیل/تخفیف" };

async function api(url, opts) {
  const res = await fetch(url, opts);
  let j = {};
  try { j = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, ...j };
}

function Kpi({ label, value, sub, tone }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-text-muted">{label}</div>
      <div className={`mt-1 text-xl font-bold ${tone || "text-text"}`}>{value}</div>
      {sub && <div className="mt-1 text-[11px] text-text-muted">{sub}</div>}
    </div>
  );
}

function PaymentForm({ contract, customerId, defaultAmount, onDone }) {
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

function PaymentList({ payments, onChange }) {
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

function ContractsTab({ data, reload }) {
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");
  const [openKey, setOpenKey] = useState(null);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return data.contracts
      .filter((c) => (filter === "all" ? true : filter === "open" ? c.status === "unpaid" || c.status === "partial" : filter === "overdue" ? c.overdue : c.status === filter))
      .filter((c) => !t || [c.buyer, c.country, c.file_no, c.doc_no].some((x) => String(x || "").toLowerCase().includes(t)))
      .sort((a, b) => (b.balance || 0) - (a.balance || 0));
  }, [data.contracts, filter, q]);
  const chips = [["open", "باز (مانده‌دار)"], ["overdue", "سررسیدگذشته"], ["unpaid", "پرداخت‌نشده"], ["partial", "بخشی"], ["paid", "تسویه‌شده"], ["all", "همه"]];
  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {chips.map(([k, l]) => <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1 text-xs cursor-pointer ${filter === k ? "border-primary bg-primary-soft text-primary-hover font-bold" : "border-border text-text-muted"}`}>{l}</button>)}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو: مشتری، کشور، File NO، PI…" className="ms-auto w-60 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-border text-text-muted">{["File / PI", "مشتری", "کشور", "تاریخ PI", "تن", "مبلغ", "پرداخت‌شده", "مانده", "وضعیت"].map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((c) => (
              <Fragment key={c.key}>
                <tr onClick={() => setOpenKey(openKey === c.key ? null : c.key)} className="cursor-pointer border-b border-border hover:bg-canvas">
                  <td className="px-2 py-1.5" dir="ltr" style={{ textAlign: "start" }}>{c.file_no || "—"}{c.doc_no ? ` / ${c.doc_no}` : ""}</td>
                  <td className="px-2 py-1.5">{c.buyer}</td>
                  <td className="px-2 py-1.5">{c.country}</td>
                  <td className="px-2 py-1.5">{c.date || "—"}</td>
                  <td className="px-2 py-1.5">{fa(c.tons, 1)}</td>
                  <td className="px-2 py-1.5">{c.currency === "USD" ? usd(c.total) : `${c.total ?? "—"} ${c.currency}`}</td>
                  <td className="px-2 py-1.5">{usd(c.paid)}{c.basis === "sheet" && <span className="ms-1 text-[10px] text-text-muted">(طبق گزارش)</span>}</td>
                  <td className={`px-2 py-1.5 font-semibold ${c.overdue ? "text-danger" : ""}`}>{usd(c.balance)}{c.overdue && <span className="ms-1 text-[10px]">({fa(c.overdue_days)} روز دیرکرد)</span>}</td>
                  <td className="px-2 py-1.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[c.status]}`}>{STATUS_FA[c.status]}</span></td>
                </tr>
                {openKey === c.key && (
                  <tr className="border-b border-border bg-surface">
                    <td colSpan={9} className="space-y-3 p-3">
                      <div className="text-[11px] text-text-muted">شرایط پرداخت: {c.payment_terms || "—"} (مهلت {fa(c.due_days)} روز) · تحویل: {c.incoterm || "—"} · {fa(c.days_since)} روز از PI</div>
                      {c.basis === "unknown" && <div className="rounded border border-warning bg-warning-soft px-2 py-1 text-[11px] text-warning">وضعیت پرداخت این قرارداد در گزارش فروش خالی است؛ تا ثبت پرداخت، پرداخت‌نشده حساب می‌شود.</div>}
                      {c.basis === "sheet" && <div className="rounded border border-warning bg-warning-soft px-2 py-1 text-[11px] text-warning">فقط طبق «Done» در گزارش فروش تسویه حساب شده؛ پرداخت واقعی ثبت نشده. با ثبت اولین پرداخت، مبلغ‌های ثبت‌شده جایگزین می‌شوند.</div>}
                      <PaymentList payments={c.payments} onChange={reload} />
                      <PaymentForm contract={c} defaultAmount={c.balance} onDone={reload} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!rows.length && <tr><td colSpan={9} className="px-2 py-6 text-center text-text-muted">موردی نیست.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[11px] text-text-muted">{fa(rows.length)} قرارداد. روی هر ردیف بزنید تا پرداخت‌ها و فرم ثبت پرداخت باز شود.</div>
    </section>
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

function CustomersTab({ data, reload }) {
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

function Orphans({ data, reload }) {
  if (!data.orphans?.length) return null;
  async function relink(id, key) {
    if (!key) return;
    const r = await api("/api/sales/ledger/payments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, contract_key: key }) });
    if (r.ok) reload(); else alert(r.error || "انتقال نشد");
  }
  return (
    <section className="card border-warning p-4">
      <h2 className="mb-1 text-sm font-bold text-warning">⚠ {fa(data.orphans.length)} پرداخت به قراردادی وصل است که در گزارش فروش فعلی نیست</h2>
      <p className="mb-2 text-[11px] leading-5 text-text-muted">معمولاً یعنی File NO قرارداد در فایل جدید عوض شده یا ردیف حذف شده. پرداخت‌ها گم نشده‌اند؛ به قرارداد درست منتقل کنید.</p>
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

export default function AccountsClient() {
  const [res, setRes] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("contracts");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api("/api/sales/ledger", { cache: "no-store" });
    if (!r.ok) setError(r.error || "خطا در بارگذاری"); else { setRes(r); setError(""); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function backfill() {
    if (!confirm(`برای ${fa(res.accounts.totals.from_sheet.contracts)} قرارداد که گزارش فروش «Done» می‌گوید، پرداخت کامل (تخمینی، با تاریخ PI) ثبت شود؟ بعداً قابل ویرایش/حذف است.`)) return;
    setBusy(true);
    const r = await api("/api/sales/ledger/backfill", { method: "POST" });
    setBusy(false);
    if (r.ok) load(); else alert(r.error || "انجام نشد");
  }

  const a = res?.accounts;
  const t = a?.totals;
  return (
    <div className="space-y-6">
      <PageHeader title="حساب‌ها و پرداخت‌ها" subtitle="هر قرارداد (سفارش قطعی گزارش فروش) با پرداخت‌ها و مانده‌اش، و حساب جدا برای هر مشتری با جمع خرید و صورت‌حساب. پرداخت‌ها جدا از گزارش فروش ذخیره می‌شوند و با بارگذاری گزارش جدید گم نمی‌شوند. فقط نقش بازرگانی؛ داده روی دیسک سرور است، نه در گیت." />
      <SalesNav active="/sales/accounts" />

      {error && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      {res?.storage_problem && <div className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-sm text-warning">⚠ {res.storage_problem}</div>}
      {a?.empty && <section className="card p-5 text-sm text-text-muted">اول یک قرارداد <Link href="/sales/contracts/new" className="text-primary hover:underline">ثبت کنید</Link> یا فایل «Sales Report» را در <Link href="/sales/reports" className="text-primary hover:underline">گزارش‌ها</Link> بارگذاری کنید؛ قراردادها از آن ساخته می‌شوند.</section>}

      {t && (
        <>
          <p className="text-xs text-text-muted">تا تاریخ <b>{t.as_of}</b> · مبالغ دلاری (قراردادهای غیردلاری {fa(t.non_usd)} مورد جداگانه دیده می‌شوند). سررسید: پیش‌پرداخت نقدی = همان روز PI، «Credit»/«upon documents» = ۳۰ روز، «N days» = N روز، بدون شرط = ۱۴ روز.</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Kpi label="جمع قراردادها" value={usd(t.invoiced)} sub={`${fa(t.contracts)} قرارداد · ${fa(t.customers)} مشتری`} />
            <Kpi label="دریافت‌شده" value={usd(t.collected)} sub={`${fa(t.collection_pct, 1)}٪ از جمع`} tone="text-success" />
            <Kpi label="مانده (طلب)" value={usd(t.outstanding)} tone={t.outstanding > 0 ? "text-warning" : undefined} sub={`تا ۳۰ روز ${usd(t.aging.d0_30)} · ۳۱–۶۰ ${usd(t.aging.d31_60)} · +۶۰ ${usd(t.aging.d61p)}`} />
            <Kpi label="سررسیدگذشته" value={usd(t.overdue)} tone={t.overdue > 0 ? "text-danger" : undefined} sub={`${fa(t.overdue_contracts)} قرارداد`} />
            <Kpi label="دریافتی ۳۰ روز اخیر" value={usd(t.collected_last_30d)} sub="فقط پرداخت‌های ثبت‌شده" />
            <Kpi label="پیش‌دریافت بدون قرارداد" value={usd(t.unallocated_credit)} />
          </div>

          {t.from_sheet.contracts > 0 && (
            <section className="card border-warning p-4 text-sm leading-7">
              <b className="text-warning">{fa(t.from_sheet.contracts)} قرارداد ({usd(t.from_sheet.amount)})</b> فقط طبق وضعیت «Done» در گزارش فروش تسویه‌شده حساب می‌شوند و پرداخت واقعی (تاریخ/روش) برایشان ثبت نشده است.
              <button type="button" disabled={busy} onClick={backfill} className="ms-3 rounded-lg bg-warning px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 cursor-pointer">{busy ? "…" : "ثبت خودکار پرداخت کامل (تخمینی)"}</button>
            </section>
          )}
          {(t.needs_amount > 0 || t.no_total > 0 || t.overpaid > 0 || t.unknown_status.contracts > 0) && (
            <section className="card p-3 text-xs leading-6 text-text-muted">
              {t.unknown_status.contracts > 0 && <div>• <b className="text-warning">{fa(t.unknown_status.contracts)} قرارداد ({usd(t.unknown_status.amount)})</b> وضعیت پرداخت در گزارش فروش خالی است؛ فعلاً «پرداخت‌نشده» حساب شده‌اند و در مانده آمده‌اند. وضعیت واقعی را (Done یا پرداخت) در گزارش یا همین‌جا مشخص کنید.</div>}
              {t.needs_amount > 0 && <div>• {fa(t.needs_amount)} قرارداد «پیش‌پرداخت دریافت شد» دارند ولی مبلغش در گزارش نیست؛ تا ثبت پرداخت، کل مبلغ مانده حساب می‌شود.</div>}
              {t.no_total > 0 && <div>• {fa(t.no_total)} قرارداد مبلغ کل ندارد (قیمت در گزارش خالی است) و در مانده نمی‌آید.</div>}
              {t.overpaid > 0 && <div>• {fa(t.overpaid)} قرارداد بیش‌پرداخت شده است؛ بررسی کنید.</div>}
            </section>
          )}

          <Orphans data={a} reload={load} />

          <div className="flex gap-2 border-b border-border">
            {[["contracts", `قراردادها (${fa(a.contracts.length)})`], ["customers", `مشتریان (${fa(a.customers.length)})`]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k)} className={`px-4 py-2 text-sm cursor-pointer ${tab === k ? "border-b-2 border-primary font-bold text-primary" : "text-text-muted"}`}>{l}</button>
            ))}
          </div>
          {tab === "contracts" ? <ContractsTab data={a} reload={load} /> : <CustomersTab data={a} reload={load} />}
        </>
      )}
    </div>
  );
}

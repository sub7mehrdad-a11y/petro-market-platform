"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import PageHeader from "../../components/PageHeader";
import { Kpi, SalesNav, fa, fdate } from "../salesUi";

const today = () => new Date().toISOString().slice(0, 10);
const inputCls = "rounded-lg border border-border bg-surface px-3 py-2 text-sm";

async function api(url, opts) {
  const res = await fetch(url, opts);
  let j = {};
  try { j = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, ...j };
}
const patch = (body) => api("/api/sales/contracts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const refOf = (r) => (r.contract_id ? { id: r.contract_id } : { contract_key: r.file_no });
const link = (r) => `/sales/contracts/${encodeURIComponent(r.file_no)}`;

function Pay({ r }) {
  return (
    <div className="min-w-24">
      <div className="h-1.5 rounded bg-canvas"><div className={`h-1.5 rounded ${r.paid_pct >= 100 ? "bg-success" : "bg-warning"}`} style={{ width: `${r.paid_pct ?? 0}%` }} /></div>
      <div className="mt-0.5 text-[10px] text-text-muted">{r.paid_pct != null ? `${fa(r.paid_pct, 0)}٪ پرداخت` : "بدون مبلغ"}</div>
    </div>
  );
}

function PlanForm({ r, onDone }) {
  const [f, setF] = useState({ tons: String(r.remaining_tons ?? ""), planned_date: "", note: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    const res = await patch({ ...refOf(r), action: "shipment_add", shipment: f });
    setBusy(false);
    if (!res.ok) { setErr(res.errors?.join(" ") || res.error || "ثبت نشد"); return; }
    onDone();
  }
  return (
    <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[8rem_10rem_1fr_auto]">
      <input value={f.tons} onChange={(e) => setF({ ...f, tons: e.target.value })} placeholder="تن" dir="ltr" inputMode="decimal" className={inputCls} />
      <input value={f.planned_date} onChange={(e) => setF({ ...f, planned_date: e.target.value })} placeholder="تاریخ برنامه ۱۴۰۵/۰۹/۲۰" dir="ltr" className={inputCls} />
      <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="توضیح (کامیون، کانتینر…)" className={inputCls} />
      <button type="submit" disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white disabled:opacity-50 cursor-pointer">ثبت در صف بارگیری</button>
      {err && <p className="text-xs text-danger sm:col-span-4">{err}</p>}
    </form>
  );
}

export default function LoadingClient() {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [openKey, setOpenKey] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api("/api/sales/loading", { cache: "no-store" });
    if (!r.ok) { setError(r.error || "خطا"); return; }
    setError(""); setD(r);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setStatus(r, status) {
    const label = status === "loaded" ? "تاریخ بارگیری" : "تاریخ ارسال";
    const date = prompt(`${label} (خالی = امروز):`, today());
    if (date === null) return;
    setBusy(true);
    const body = { status };
    if (status === "loaded") body.loaded_at = date || today(); else body.shipped_at = date || today();
    const res = await patch({ ...refOf(r), action: "shipment_update", shipment_id: r.shipment.id, shipment: body });
    setBusy(false);
    if (res.ok) load(); else alert(res.errors?.join(" ") || res.error || "انجام نشد");
  }

  const t = d?.totals;
  const basisFa = (r) => (r.priority_basis === "sheet" ? "تاریخ PI (طبق گزارش)" : "اولین پرداخت");

  return (
    <div className="space-y-6">
      <PageHeader title="بارگیری و ارسال" />
      <SalesNav active="/sales/loading" />
      {error && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      {d?.storage_problem && <div className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-sm text-warning">⚠ {d.storage_problem}</div>}
      {!d && !error && <p className="text-sm text-text-muted">در حال بارگذاری…</p>}

      {t && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi label="در صف بارگیری" value={`${fa(t.queued_tons, 1)} تن`} />
          <Kpi label="پرداخت‌شده، بدون برنامه" value={`${fa(t.unplanned_tons, 1)} تن`} tone={t.unplanned_tons > 0 ? "text-warning" : undefined} />
          <Kpi label="بارگیری‌شده، منتظر ارسال" value={`${fa(t.loaded_tons, 1)} تن`} />
          <Kpi label="ارسال‌شده" value={`${fa(t.shipped_tons, 1)} تن`} tone="text-success" />
          <Kpi label="منتظر پرداخت" value={fa(t.waiting_contracts)} sub="قرارداد" />
        </div>
      )}

      {d && (
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-bold text-text">صف بارگیری ({fa(d.ordered.length)})</h2>
          {d.ordered.length === 0 && <p className="text-xs text-text-muted">موردی در صف نیست.</p>}
          {d.ordered.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-border text-text-muted">{["ترتیب", "قرارداد", "مشتری", "کشور", "تن بارگیری", "تاریخ برنامه", "اولویت (پرداخت)", "پرداخت", "قابل‌بارگیری با پرداخت", ""].map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {d.ordered.map((r) => {
                    const k = `${r.file_no}|${r.shipment?.id || "u"}`;
                    return (
                      <Fragment key={k}>
                        <tr className="border-b border-border">
                          <td className="px-2 py-1.5 font-bold">{fa(r.rank)}</td>
                          <td className="px-2 py-1.5"><Link href={link(r)} className="font-semibold text-primary-hover hover:underline" dir="ltr">{r.file_no}</Link></td>
                          <td className="px-2 py-1.5">{r.buyer}</td>
                          <td className="px-2 py-1.5">{r.country}</td>
                          <td className="px-2 py-1.5 font-semibold">{r.kind === "shipment" ? fa(r.shipment.tons, 1) : <span className="text-warning">{fa(r.remaining_tons, 1)} (بدون برنامه)</span>}</td>
                          <td className="px-2 py-1.5">{r.kind === "shipment" ? fdate(r.shipment.planned_date) : "—"}</td>
                          <td className="px-2 py-1.5">{fdate(r.priority_date)} <span className="text-[10px] text-text-muted">{basisFa(r)}</span></td>
                          <td className="px-2 py-1.5"><Pay r={r} /></td>
                          <td className="px-2 py-1.5">{r.covered_tons != null ? `${fa(r.covered_tons, 1)} از ${fa(r.contract_tons, 1)} تن` : "—"}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            {r.kind === "shipment" ? <button type="button" disabled={busy} onClick={() => setStatus(r, "loaded")} className="rounded-lg border border-primary px-3 py-1 text-primary hover:bg-primary-soft cursor-pointer">بارگیری شد</button>
                              : <button type="button" onClick={() => setOpenKey(openKey === k ? null : k)} className="rounded-lg border border-border px-3 py-1 hover:bg-canvas cursor-pointer">{openKey === k ? "بستن" : "ثبت بارگیری"}</button>}
                          </td>
                        </tr>
                        {openKey === k && r.kind === "unplanned" && (
                          <tr className="border-b border-border bg-canvas"><td colSpan={10} className="p-3"><PlanForm r={r} onDone={() => { setOpenKey(null); load(); }} /></td></tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {d?.waiting.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-bold text-text">منتظر پرداخت ({fa(d.waiting.length)})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border text-text-muted">{["قرارداد", "مشتری", "کشور", "تن", "تاریخ برنامه", "پرداخت"].map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {d.waiting.map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-2 py-1.5"><Link href={link(r)} className="text-primary-hover hover:underline" dir="ltr">{r.file_no}</Link></td>
                    <td className="px-2 py-1.5">{r.buyer}</td><td className="px-2 py-1.5">{r.country}</td>
                    <td className="px-2 py-1.5">{fa(r.shipment ? r.shipment.tons : r.remaining_tons, 1)}</td>
                    <td className="px-2 py-1.5">{r.shipment ? fdate(r.shipment.planned_date) : "—"}</td>
                    <td className="px-2 py-1.5"><Pay r={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {d?.loaded.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-bold text-text">بارگیری‌شده، منتظر ارسال ({fa(d.loaded.length)})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border text-text-muted">{["قرارداد", "مشتری", "کشور", "تن", "تاریخ بارگیری", "توضیح", ""].map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {d.loaded.map((r) => (
                  <tr key={r.shipment.id} className="border-b border-border last:border-0">
                    <td className="px-2 py-1.5"><Link href={link(r)} className="text-primary-hover hover:underline" dir="ltr">{r.file_no}</Link></td>
                    <td className="px-2 py-1.5">{r.buyer}</td><td className="px-2 py-1.5">{r.country}</td><td className="px-2 py-1.5 font-semibold">{fa(r.shipment.tons, 1)}</td>
                    <td className="px-2 py-1.5">{fdate(r.shipment.loaded_at)}</td><td className="px-2 py-1.5">{[r.shipment.vehicle, r.shipment.note].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-2 py-1.5"><button type="button" disabled={busy} onClick={() => setStatus(r, "shipped")} className="rounded-lg border border-primary px-3 py-1 text-primary hover:bg-primary-soft cursor-pointer">ارسال شد</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {d?.shipped.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-bold text-text">ارسال‌شده ({fa(d.shipped.length)})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border text-text-muted">{["قرارداد", "مشتری", "کشور", "تن", "تاریخ بارگیری", "تاریخ ارسال"].map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {d.shipped.slice(0, 40).map((r) => (
                  <tr key={r.shipment.id} className="border-b border-border last:border-0">
                    <td className="px-2 py-1.5"><Link href={link(r)} className="text-primary-hover hover:underline" dir="ltr">{r.file_no}</Link></td>
                    <td className="px-2 py-1.5">{r.buyer}</td><td className="px-2 py-1.5">{r.country}</td><td className="px-2 py-1.5">{fa(r.shipment.tons, 1)}</td>
                    <td className="px-2 py-1.5">{fdate(r.shipment.loaded_at)}</td><td className="px-2 py-1.5">{fdate(r.shipment.shipped_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

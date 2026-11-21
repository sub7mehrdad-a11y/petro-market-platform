"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "../../components/PageHeader";
import { SalesNav, fdate } from "../salesUi";
import { CustomersTab, Kpi, Orphans, PaymentForm, PaymentList, STATUS_FA, STATUS_STYLE, api, fa, usd } from "../accounts/AccountsClient";

// قراردادها و حسابداری (یک بخش): همه‌ی قراردادها (اکسل + پلتفرم) با پرداخت و مانده؛ هر ردیف پرداخت‌ها و ثبت پرداخت را باز می‌کند؛
// «پرونده‌ی کامل» برای ویرایش همه‌چیز، مراحل، بارگیری و تاریخچه.

export default function ContractsClient() {
  const [res, setRes] = useState(null);
  const [platform, setPlatform] = useState([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("contracts");
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");
  const [openKey, setOpenKey] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [a, c] = await Promise.all([api("/api/sales/ledger", { cache: "no-store" }), api("/api/sales/contracts", { cache: "no-store" })]);
    if (!a.ok) { setError(a.error || "خطا در بارگذاری"); return; }
    setError(""); setRes(a); setPlatform(c.contracts || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const a = res?.accounts;
  const t = a?.totals;
  const platByNo = useMemo(() => new Map(platform.map((c) => [c.file_no, c])), [platform]);

  const rows = useMemo(() => {
    if (!a) return [];
    const term = q.trim().toLowerCase();
    return a.contracts
      .filter((c) => (filter === "all" ? true : filter === "open" ? c.status === "unpaid" || c.status === "partial" : filter === "overdue" ? c.overdue : c.status === filter))
      .filter((c) => !term || [c.buyer, c.country, c.file_no, c.doc_no].some((x) => String(x || "").toLowerCase().includes(term)))
      .sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
  }, [a, filter, q]);

  async function backfill() {
    if (!confirm(`برای ${fa(t.from_sheet.contracts)} قرارداد که گزارش فروش «Done» می‌گوید، پرداخت کامل (تخمینی، با تاریخ PI) ثبت شود؟`)) return;
    setBusy(true);
    const r = await api("/api/sales/ledger/backfill", { method: "POST" });
    setBusy(false);
    if (r.ok) load(); else alert(r.error || "انجام نشد");
  }

  const chips = [["open", "باز (مانده‌دار)"], ["overdue", "سررسیدگذشته"], ["unpaid", "پرداخت‌نشده"], ["partial", "بخشی"], ["paid", "تسویه‌شده"], ["all", "همه"]];

  return (
    <div className="space-y-6">
      <PageHeader title="قراردادها و حسابداری" actions={<Link href="/sales/contracts/new" className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-hover">+ قرارداد جدید</Link>} />
      <SalesNav active="/sales/contracts" />

      {error && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      {res?.storage_problem && <div className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-sm text-warning">⚠ {res.storage_problem}</div>}
      {!res && !error && <p className="text-sm text-text-muted">در حال بارگذاری…</p>}
      {a?.empty && <section className="card p-5 text-sm text-text-muted">قراردادی ثبت نشده است. <Link href="/sales/contracts/new" className="text-primary hover:underline">قرارداد جدید</Link></section>}

      {t && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Kpi label="جمع قراردادها" value={usd(t.invoiced)} sub={`${fa(t.contracts)} قرارداد · ${fa(t.customers)} مشتری`} />
            <Kpi label="دریافت‌شده" value={usd(t.collected)} sub={`${fa(t.collection_pct, 1)}٪ از جمع`} tone="text-success" />
            <Kpi label="مانده (طلب)" value={usd(t.outstanding)} tone={t.outstanding > 0 ? "text-warning" : undefined} sub={`تا ۳۰ روز ${usd(t.aging.d0_30)} · ۳۱–۶۰ ${usd(t.aging.d31_60)} · +۶۰ ${usd(t.aging.d61p)}`} />
            <Kpi label="سررسیدگذشته" value={usd(t.overdue)} tone={t.overdue > 0 ? "text-danger" : undefined} sub={`${fa(t.overdue_contracts)} قرارداد`} />
            <Kpi label="دریافتی ۳۰ روز اخیر" value={usd(t.collected_last_30d)} />
            <Kpi label="پیش‌دریافت بدون قرارداد" value={usd(t.unallocated_credit)} />
          </div>

          {t.from_sheet.contracts > 0 && (
            <section className="card flex flex-wrap items-center gap-3 border-warning p-3 text-sm">
              <span><b className="text-warning">{fa(t.from_sheet.contracts)} قرارداد ({usd(t.from_sheet.amount)})</b> فقط طبق «Done» در گزارش فروش تسویه حساب می‌شوند و پرداخت ثبت‌شده ندارند.</span>
              <button type="button" disabled={busy} onClick={backfill} className="rounded-lg bg-warning px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 cursor-pointer">{busy ? "…" : "ثبت پرداخت‌ها از گزارش"}</button>
            </section>
          )}

          <Orphans data={a} reload={load} />

          <div className="flex gap-2 border-b border-border">
            {[["contracts", `قراردادها (${fa(a.contracts.length)})`], ["customers", `حساب مشتریان (${fa(a.customers.length)})`]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k)} className={`px-4 py-2 text-sm cursor-pointer ${tab === k ? "border-b-2 border-primary font-bold text-primary" : "text-text-muted"}`}>{l}</button>
            ))}
          </div>

          {tab === "customers" && <CustomersTab data={a} reload={load} />}

          {tab === "contracts" && (
            <section className="card p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {chips.map(([k, l]) => <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1 text-xs cursor-pointer ${filter === k ? "border-primary bg-primary-soft text-primary-hover font-bold" : "border-border"}`}>{l}</button>)}
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو: مشتری، کشور، شماره" className="ms-auto w-60 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-text-muted">
                      {["شماره", "مشتری", "کشور", "تاریخ", "تن", "مبلغ", "پرداخت‌شده", "مانده", "بارگیری", "وضعیت"].map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => {
                      const p = platByNo.get(c.file_no || c.key);
                      const sh = p?.shipment_totals;
                      return (
                        <Fragment key={c.key}>
                          <tr onClick={() => setOpenKey(openKey === c.key ? null : c.key)} className="cursor-pointer border-b border-border hover:bg-canvas">
                            <td className="px-2 py-1.5" dir="ltr" style={{ textAlign: "start" }}>{c.file_no || c.key}</td>
                            <td className="px-2 py-1.5">{c.buyer}</td>
                            <td className="px-2 py-1.5">{c.country}</td>
                            <td className="px-2 py-1.5">{fdate(c.date)}</td>
                            <td className="px-2 py-1.5">{fa(c.tons, 1)}</td>
                            <td className="px-2 py-1.5">{c.currency === "USD" ? usd(c.total) : `${c.total ?? "—"} ${c.currency}`}</td>
                            <td className="px-2 py-1.5">{usd(c.paid)}</td>
                            <td className={`px-2 py-1.5 font-semibold ${c.overdue ? "text-danger" : ""}`}>{usd(c.balance)}{c.overdue && <span className="ms-1 text-[10px]">({fa(c.overdue_days)} روز دیرکرد)</span>}</td>
                            <td className="px-2 py-1.5">{c.loaded && !sh ? "بارگیری‌شده" : sh && sh.planned > 0 ? `${fa(sh.loaded, 1)} از ${fa(c.tons, 1)} تن` : "—"}</td>
                            <td className="px-2 py-1.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[c.status]}`}>{STATUS_FA[c.status]}</span></td>
                          </tr>
                          {openKey === c.key && (
                            <tr className="border-b border-border bg-surface">
                              <td colSpan={10} className="space-y-3 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted">
                                  <span>شرایط پرداخت: {c.payment_terms || "—"} · تحویل: {c.incoterm || "—"} · {fa(c.days_since)} روز از PI</span>
                                  <Link href={`/sales/contracts/${encodeURIComponent(c.file_no || c.key)}`} className="rounded-lg border border-primary px-3 py-1 text-xs font-medium text-primary hover:bg-primary-soft">پرونده‌ی کامل و ویرایش ←</Link>
                                </div>
                                <PaymentList payments={c.payments} onChange={load} />
                                <PaymentForm contract={c} defaultAmount={c.balance} onDone={load} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {!rows.length && <tr><td colSpan={10} className="px-2 py-6 text-center text-text-muted">موردی نیست.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 text-[11px] text-text-muted">{fa(rows.length)} قرارداد</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

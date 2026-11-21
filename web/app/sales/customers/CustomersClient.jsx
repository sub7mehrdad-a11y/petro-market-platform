"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "../../components/PageHeader";
import { SalesNav, fa, usd } from "../salesUi";

const STATUS_CLS = { فعال: "bg-success-soft text-success", بالقوه: "bg-warning-soft text-warning", غیرفعال: "bg-canvas text-text-muted" };

export default function CustomersClient() {
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetch("/api/sales/contracts/customers", { cache: "no-store" })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "خطا"); setList(j.customers); })
      .catch((e) => setError(e.message));
  }, []);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (list || [])
      .filter((c) => (filter === "balance" ? c.account?.balance > 0 : filter === "profile" ? !c.sheet_only : filter === "noprofile" ? c.sheet_only : true))
      .filter((c) => !t || `${c.name} ${c.country || ""} ${c.person || ""} ${(c.contacts || []).map((x) => x.name).join(" ")}`.toLowerCase().includes(t));
  }, [list, q, filter]);

  const chips = [["all", "همه"], ["balance", "دارای مانده"], ["profile", "پرونده‌دار"], ["noprofile", "بدون پرونده‌ی تماس"]];

  return (
    <div className="space-y-6">
      <PageHeader title="مشتریان" actions={<Link href="/sales/customers/new" className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-hover">+ مشتری جدید</Link>} />
      <SalesNav active="/sales/customers" />
      {error && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      {!list && !error && <p className="text-sm text-text-muted">در حال بارگذاری…</p>}

      {list && (
        <section className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {chips.map(([k, l]) => <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1 text-xs cursor-pointer ${filter === k ? "border-primary bg-primary-soft font-bold text-primary-hover" : "border-border"}`}>{l}</button>)}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو: شرکت، کشور، نام فرد" className="ms-auto w-60 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs" />
          </div>
          {rows.length === 0 && <p className="text-xs text-text-muted">مشتری‌ای پیدا نشد.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border text-text-muted">{["شرکت", "کشور", "وضعیت", "تماس اصلی", "قرارداد", "تن", "جمع خرید", "مانده", ""].map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-canvas">
                    <td className="px-2 py-2"><Link href={`/sales/customers/${encodeURIComponent(c.id)}`} className="font-semibold text-primary-hover hover:underline">{c.name}</Link></td>
                    <td className="px-2 py-2">{c.country || "—"}</td>
                    <td className="px-2 py-2">{c.status ? <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_CLS[c.status] || ""}`}>{c.status}</span> : c.sheet_only ? <span className="text-[11px] text-text-muted">بدون پرونده</span> : "—"}</td>
                    <td className="px-2 py-2">{[c.person || c.contacts?.[0]?.name, c.phone || c.contacts?.[0]?.phone, c.email].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-2 py-2">{fa(c.account?.deals ?? c.deals)}</td>
                    <td className="px-2 py-2">{fa(c.account?.tons, 1)}</td>
                    <td className="px-2 py-2">{usd(c.account?.total)}</td>
                    <td className={`px-2 py-2 font-semibold ${c.account?.balance > 0 ? "text-warning" : ""}`}>{usd(c.account?.balance)}{c.account?.overdue_balance > 0 && <span className="ms-1 text-[10px] text-danger">سررسیدگذشته</span>}</td>
                    <td className="px-2 py-2"><Link href={`/sales/customers/${encodeURIComponent(c.id)}`} className="rounded-lg border border-border px-3 py-1 hover:bg-canvas">پرونده و ویرایش</Link></td>
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

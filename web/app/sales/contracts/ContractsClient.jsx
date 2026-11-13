"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "../../components/PageHeader";
import { SalesNav, fa } from "../salesUi";

const money = (n, cur = "USD") => (n == null ? "—" : `${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })} ${cur}`);
const STATUS = {
  paid: ["تسویه‌شده", "bg-success-soft text-success"], partial: ["بخشی پرداخت‌شده", "bg-warning-soft text-warning"], unpaid: ["پرداخت‌نشده", "bg-danger-soft text-danger"],
  overpaid: ["بیش‌پرداخت", "bg-primary-soft text-primary-hover"], no_total: ["بدون مبلغ", "bg-canvas text-text-muted"],
};

export default function ContractsClient() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [show, setShow] = useState("active");

  useEffect(() => {
    fetch("/api/sales/contracts", { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "خطا"); setData(j); })
      .catch((e) => setError(e.message));
  }, []);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.contracts || []).filter((c) => (show === "all" || (show === "cancelled" ? c.status === "cancelled" : c.status !== "cancelled"))
      && (!t || `${c.file_no} ${c.buyer} ${c.country}`.toLowerCase().includes(t)));
  }, [data, q, show]);

  return (
    <div className="space-y-6">
      <PageHeader title="مدیریت قراردادها و حسابداری" subtitle="قراردادهای ثبت‌شده در پلتفرم، مرحله‌ی هرکدام و وضعیت پرداختشان. برای حساب مشتریان و ثبت پرداخت به «حساب‌ها و پرداخت‌ها» بروید؛ گزارش‌های تفصیلی در «گزارش‌ها» است." />
      <SalesNav active="/sales/contracts" />
      {error && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      {data?.storage_problem && <div className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-sm text-warning">⚠ {data.storage_problem}</div>}

      <section className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو: شماره، شرکت، کشور" className="min-w-52 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
          <select value={show} onChange={(e) => setShow(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <option value="active">فعال</option><option value="cancelled">لغوشده</option><option value="all">همه</option>
          </select>
          <Link href="/sales/contracts/new" className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-hover">+ ثبت قرارداد جدید</Link>
        </div>
        {data && rows.length === 0 && <p className="text-xs text-text-muted">قراردادی پیدا نشد. با «ثبت قرارداد جدید» شروع کنید.</p>}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  {["شماره", "خریدار", "کشور", "تن", "مبلغ", "مرحله", "پرداخت‌شده", "مانده", "وضعیت"].map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const st = c.account ? STATUS[c.account.status] : null;
                  return (
                    <tr key={c.id} className={`border-b border-border last:border-0 ${c.status === "cancelled" ? "opacity-50" : ""}`}>
                      <td className="px-2 py-1.5"><Link href={`/sales/contracts/${c.id}`} className="font-semibold text-primary-hover hover:underline" dir="ltr">{c.file_no}</Link></td>
                      <td className="px-2 py-1.5">{c.buyer}</td>
                      <td className="px-2 py-1.5">{c.country}</td>
                      <td className="px-2 py-1.5">{fa(c.tons, 1)}</td>
                      <td className="px-2 py-1.5" dir="ltr">{money(c.total, c.currency)}</td>
                      <td className="px-2 py-1.5">{c.status === "cancelled" ? "لغو شد" : c.current_step_label || "—"}</td>
                      <td className="px-2 py-1.5" dir="ltr">{c.account?.paid != null ? money(c.account.paid, c.currency) : "—"}</td>
                      <td className="px-2 py-1.5" dir="ltr">{c.account?.balance != null ? money(c.account.balance, c.currency) : "—"}</td>
                      <td className="px-2 py-1.5">{st ? <span className={`rounded-full px-2 py-0.5 ${st[1]}`}>{st[0]}{c.account.overdue ? ` · ${fa(c.account.overdue_days)} روز دیرکرد` : ""}</span> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data?.sheet_contracts?.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-1 text-sm font-bold text-text">قراردادهای فایل «Sales Report» ({fa(data.sheet_contracts.length)})</h2>
          <p className="mb-2 text-[11px] leading-5 text-text-muted">این‌ها از فایل اکسل می‌آیند و فقط‌خواندنی‌اند؛ حسابشان در «حساب‌ها و پرداخت‌ها» است. برای مدیریت کامل (مرحله، برنامه‌ی پرداخت/تحویل، یادداشت) قرارداد را با همان شماره در پلتفرم ثبت کنید.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border text-text-muted">{["شماره", "خریدار", "کشور", "تن", "مبلغ", "مانده", "وضعیت"].map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {data.sheet_contracts.slice(0, 60).map((c) => {
                  const st = STATUS[c.status];
                  return (
                    <tr key={c.key} className="border-b border-border last:border-0">
                      <td className="px-2 py-1.5" dir="ltr">{c.key}</td><td className="px-2 py-1.5">{c.buyer}</td><td className="px-2 py-1.5">{c.country}</td>
                      <td className="px-2 py-1.5">{fa(c.tons, 1)}</td><td className="px-2 py-1.5" dir="ltr">{money(c.total, c.currency)}</td><td className="px-2 py-1.5" dir="ltr">{money(c.balance, c.currency)}</td>
                      <td className="px-2 py-1.5">{st ? <span className={`rounded-full px-2 py-0.5 ${st[1]}`}>{st[0]}</span> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.sheet_contracts.length > 60 && <p className="mt-1 text-[11px] text-text-muted">… و {fa(data.sheet_contracts.length - 60)} قرارداد دیگر (در «حساب‌ها و پرداخت‌ها»).</p>}
        </section>
      )}
    </div>
  );
}

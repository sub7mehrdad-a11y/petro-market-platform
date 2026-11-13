"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import { Kpi, WeeklyChart, fa, price, usd } from "./salesUi";

export default function SalesHome() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/sales/summary", { cache: "no-store" })
      .then(async (res) => { const j = await res.json(); if (!res.ok) throw new Error(j.error || "خطا"); setData(j); })
      .catch((e) => setError(e.message));
  }, []);

  const s = data?.summary;
  const w30 = s?.window30;
  const t = data?.accounts_totals;
  const alerts = [...(data?.contract_alerts || []).map((a) => ({ level: a.level, text: a.text })), ...(s?.alerts || [])];

  return (
    <div className="space-y-6">
      <PageHeader title="پلتفرم جامع بازرگانی" subtitle="قراردادها، مشتریان، پرداخت‌ها و برنامه‌ی تحویل تیم بازرگانی در یک‌جا. این بخش فقط برای نقش بازرگانی دیده می‌شود و داده‌ها روی دیسک دائمی سرور می‌مانند، نه در گیت." />

      {error && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      {data?.storage_problem && <div className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-sm text-warning">⚠ {data.storage_problem}</div>}

      {/* ۱) جدول گزارش کلی */}
      {s && !s.empty && (
        <>
          <section aria-label="گزارش کلی" className="space-y-2">
            <h2 className="text-sm font-bold text-text">گزارش کلی <span className="font-normal text-text-muted">— تا {s.as_of}</span></h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Kpi label="سفارش قطعی از ابتدای سال" value={`${fa(s.firm_totals.tons)} تن`} sub={`${fa(s.firm_totals.deals)} سفارش · ${usd(s.firm_totals.revenue_usd)}`} />
              <Kpi label="۳۰ روز اخیر" value={`${fa(w30.last.tons)} تن`} sub={`قبلش ${fa(w30.prev.tons)} تن`} delta={w30.tons_pct} />
              <Kpi label="میانگین وزنی قیمت" value={price(s.firm_totals.avg_price)} sub={s.price.fob_avg != null ? `FOB/FCA ${price(s.price.fob_avg)}` : `مرجع ${s.ref_price} FOB`} />
              <Kpi label="پایپ‌لاین (پیشنهادهای باز)" value={`${fa(s.pipeline.tons)} تن`} sub={`${fa(s.pipeline.deals)} پیشنهاد`} />
              <Kpi label="منتظر پرداخت" value={`${fa(s.receivables.unpaid_tons)} تن`} sub={`${fa(s.receivables.unpaid_deals)} سفارش · ${usd(s.receivables.unpaid_usd)}`} tone={s.receivables.unpaid_deals ? "text-warning" : undefined} />
            </div>
            {t && (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi label="دریافت‌شده" value={usd(t.collected)} sub={`${fa(t.collection_pct, 1)}٪ از ${usd(t.invoiced)}`} />
                <Kpi label="مانده‌ی دریافتنی" value={usd(t.outstanding)} sub={`${fa(t.contracts)} قرارداد`} tone={t.outstanding ? "text-warning" : undefined} />
                <Kpi label="سررسیدگذشته" value={usd(t.overdue)} sub={`${fa(t.overdue_contracts)} قرارداد`} tone={t.overdue ? "text-danger" : undefined} />
                <Kpi label="دریافتی ۳۰ روز اخیر" value={usd(t.collected_last_30d)} />
              </div>
            )}
          </section>

          {/* ۲) نمودار میله‌ای و خطی فروش */}
          <section className="card p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-text">روند هفتگی فروش (میله: تناژ، خط نارنجی: میانگین قیمت)</h2>
              <span className="text-[11px] text-text-muted">هفته‌ی روشن‌تر = هفته‌ی جاری (ناتمام)</span>
            </div>
            <WeeklyChart weekly={s.weekly} />
          </section>
        </>
      )}

      {s?.empty && (
        <section className="card p-5 text-sm leading-7 text-text-muted">
          هنوز قرارداد یا گزارشی ثبت نشده است. از دکمه‌ی «ثبت قرارداد جدید» زیر شروع کنید، یا فایل «Sales Report» را از بخش گزارش‌ها بارگذاری کنید.
        </section>
      )}

      {/* ۳) هشدارها */}
      <section className="card p-4" aria-label="هشدارها">
        <h2 className="mb-2 text-sm font-bold text-text">هشدارها</h2>
        {!data && !error && <p className="text-xs text-text-muted">در حال بارگذاری…</p>}
        {data && alerts.length === 0 && <p className="text-xs text-text-muted">هشداری نیست؛ سررسید پرداخت یا تحویل عقب‌افتاده‌ای دیده نشد.</p>}
        <ul className="space-y-1.5">
          {alerts.slice(0, 15).map((a, i) => (
            <li key={i} className={`flex gap-2 text-sm leading-7 ${a.level === "warn" ? "text-warning" : "text-text"}`}>
              <span>{a.level === "warn" ? "⚠" : "ℹ"}</span><span>{a.text}</span>
            </li>
          ))}
        </ul>
        {alerts.length > 15 && <p className="mt-1 text-[11px] text-text-muted">… و {fa(alerts.length - 15)} هشدار دیگر (در بخش گزارش‌ها).</p>}
      </section>

      {/* ۴) ورود به مدیریت قراردادها و حسابداری (گزارش‌ها از داخل همان بخش باز می‌شود) */}
      <section className="grid gap-3 sm:grid-cols-2" aria-label="ورود به بخش‌ها">
        <Link href="/sales/contracts" className="card block border-primary p-5 hover:bg-canvas">
          <div className="text-base font-bold text-text">مدیریت قراردادها و حسابداری ←</div>
          <p className="mt-1 text-xs leading-6 text-text-muted">فهرست قراردادها و مرحله‌ی هرکدام، پرداخت‌ها و مانده‌ی مشتریان، پرونده‌ی مشتریان و گزارش‌گیری.</p>
          {data?.platform_contracts && <p className="mt-2 text-[11px] text-text-muted">{fa(data.platform_contracts.active)} قرارداد فعال ثبت‌شده در پلتفرم</p>}
        </Link>
        <Link href="/sales/contracts/new" className="card block p-5 hover:bg-canvas">
          <div className="text-base font-bold text-text">+ ثبت قرارداد جدید</div>
          <p className="mt-1 text-xs leading-6 text-text-muted">اطلاعات مشتری، مشخصات سفارش، برنامه‌ی پرداخت و تحویل را ثبت کنید و مراحل قرارداد را پیش ببرید.</p>
        </Link>
      </section>
    </div>
  );
}

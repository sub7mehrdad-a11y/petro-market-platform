"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import { Delta, Kpi, WeeklyChart, fa, fdate, price, usd } from "./salesUi";

async function get(url) {
  const res = await fetch(url, { cache: "no-store" });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "خطا");
  return j;
}

export default function SalesHome() {
  const [data, setData] = useState(null);
  const [countries, setCountries] = useState(null);
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState("");
  const [allCountries, setAllCountries] = useState(false);

  useEffect(() => {
    get("/api/sales/summary").then(setData).catch((e) => setError(e.message));
    get("/api/sales/countries").then(setCountries).catch(() => {});
    get("/api/sales/loading").then(setLoading).catch(() => {});
  }, []);

  const s = data?.summary;
  const w30 = s?.window30;
  const t = data?.accounts_totals;
  const alerts = [...(data?.contract_alerts || []).map((a) => ({ level: a.level, text: a.text })), ...(s?.alerts || [])];
  const rows = useMemo(() => (countries?.table || []).filter((r) => allCountries || r.has_sales), [countries, allCountries]);

  return (
    <div className="space-y-6">
      <PageHeader title="پلتفرم جامع بازرگانی" />

      {error && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      {data?.storage_problem && <div className="rounded-lg border border-warning bg-warning-soft px-3 py-2 text-sm text-warning">⚠ {data.storage_problem}</div>}

      {/* ۱) ورود به قراردادها و حسابداری (یک بخش) */}
      <Link href="/sales/contracts" className="card block border-primary p-5 hover:bg-canvas" aria-label="ورود به قراردادها و حسابداری">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-base font-bold text-text">ورود به قراردادها و حسابداری ←</div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-muted">
            {t && <span>مانده‌ی دریافتنی <b className="text-text">{usd(t.outstanding)}</b></span>}
            {t && t.overdue > 0 && <span>سررسیدگذشته <b className="text-danger">{usd(t.overdue)}</b></span>}
            {loading && <span>در صف بارگیری <b className="text-text">{fa(loading.totals.queued_tons, 0)} تن</b></span>}
            {data?.platform_contracts && <span>{fa(data.platform_contracts.active)} قرارداد ثبت‌شده در پلتفرم</span>}
          </div>
        </div>
      </Link>

      {/* ۲) گزارش کلی */}
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

          <section className="card p-5">
            <h2 className="mb-2 text-sm font-bold text-text">روند هفتگی فروش</h2>
            <WeeklyChart weekly={s.weekly} />
          </section>
        </>
      )}
      {s?.empty && <section className="card p-5 text-sm text-text-muted">قرارداد یا گزارشی ثبت نشده است.</section>}

      {/* ۳) هشدارها */}
      <section className="card p-4" aria-label="هشدارها">
        <h2 className="mb-2 text-sm font-bold text-text">هشدارها</h2>
        {!data && !error && <p className="text-xs text-text-muted">در حال بارگذاری…</p>}
        {data && alerts.length === 0 && <p className="text-xs text-text-muted">هشداری نیست.</p>}
        <ul className="space-y-1.5">
          {alerts.slice(0, 15).map((a, i) => (
            <li key={i} className={`flex gap-2 text-sm leading-7 ${a.level === "warn" ? "text-warning" : "text-text"}`}>
              <span>{a.level === "warn" ? "⚠" : "ℹ"}</span><span>{a.text}</span>
            </li>
          ))}
        </ul>
        {alerts.length > 15 && <p className="mt-1 text-[11px] text-text-muted">و {fa(alerts.length - 15)} هشدار دیگر در بخش گزارش‌ها</p>}
      </section>

      {/* ۴) بررسی صادرات به کشورها */}
      <section className="card p-4" aria-label="بررسی صادرات به کشورها">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-text">بررسی صادرات به کشورها</h2>
          <label className="flex items-center gap-1.5 text-xs text-text-muted"><input type="checkbox" checked={allCountries} onChange={(e) => setAllCountries(e.target.checked)} /> کشورهای بدون صادرکرد هم نمایش داده شود</label>
        </div>
        {!countries && <p className="text-xs text-text-muted">در حال بارگذاری…</p>}
        {countries && rows.length === 0 && <p className="text-xs text-text-muted">کشوری برای نمایش نیست.</p>}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  {["کشور", "واردات سالانه‌ی کشور", "صادرات ما (تن)", "میانگین ماهانه", "سهم از بازار", "میانگین قیمت ما", "آخرین سفارش", "روند ۹۰ روزه"].map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.country} className="border-b border-border last:border-0 hover:bg-canvas">
                    <td className="px-2 py-1.5"><Link href={`/sales/countries/${encodeURIComponent(r.country)}`} className="font-semibold text-primary-hover hover:underline">{r.country}</Link></td>
                    <td className="px-2 py-1.5">{r.market_imports_tons != null ? `${fa(r.market_imports_tons)} تن` : "—"}</td>
                    <td className="px-2 py-1.5 font-semibold">{r.has_sales ? fa(r.tons, 1) : "—"}</td>
                    <td className="px-2 py-1.5">{r.has_sales ? `${fa(r.monthly_avg_tons, 1)} تن` : "—"}</td>
                    <td className="px-2 py-1.5">{r.share_pct != null && r.has_sales ? `${fa(r.share_pct, 1)}٪` : "—"}</td>
                    <td className="px-2 py-1.5" dir="ltr" style={{ textAlign: "start" }}>{price(r.avg_price)}</td>
                    <td className="px-2 py-1.5">{fdate(r.last_date)}</td>
                    <td className="px-2 py-1.5">{r.trend_pct != null ? <Delta pct={r.trend_pct} /> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

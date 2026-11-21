"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PageHeader from "../../../components/PageHeader";
import { HBars, Kpi, MonthlyChart, PriceTrendChart, SalesNav, StackedBar, fa, faDigits, fdate, price, usd } from "../../salesUi";

const fmtTons = (v) => `${fa(v, 0)} تن`;

export default function CountryClient({ country }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/sales/countries?country=${encodeURIComponent(country)}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "خطا"); setD(j); })
      .catch((e) => setError(e.message));
  }, [country]);

  const s = d?.sales;
  const m = d?.market;
  const cmp = d?.comparison;

  const ours = s?.avg_fob_price ?? s?.avg_price;

  // ساختار تأمین بازار با سهم تخمینی ما
  const supplierBars = d
    ? [...d.suppliers.filter((x) => x.tons != null).map((x) => ({ label: x.name, value: x.tons })), ...(d.annualized_tons ? [{ label: "ما (برآورد سالانه‌شده)", value: d.annualized_tons, tone: "us" }] : [])].sort((a, b) => b.value - a.value)
    : [];

  return (
    <div className="space-y-6">
      <PageHeader title={`بررسی عملکرد صادرات: ${country}`} actions={m?.has_report ? <Link href={`/countries/${encodeURIComponent(country)}`} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs hover:bg-canvas">صفحه‌ی کشور و گزارش‌ها</Link> : null} />
      <SalesNav active="" />
      {error && <div className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      {!d && !error && <p className="text-sm text-text-muted">در حال بارگذاری…</p>}

      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Kpi label="واردات سالانه‌ی کشور" value={m.imports_tons != null ? fmtTons(m.imports_tons) : "—"} sub={m.source} />
            <Kpi label="صادرات ما تا امروز" value={fmtTons(s.tons)} sub={`${fa(s.deals)} سفارش · ${usd(s.revenue_usd)}`} />
            <Kpi label="میانگین ماهانه" value={s.monthly_avg_tons != null ? fmtTons(s.monthly_avg_tons) : "—"} sub={`روی ${fa(d.window_months, 1)} ماه داده`} />
            <Kpi label="سهم از بازار واردات" value={d.share_pct != null ? `${fa(d.share_pct, 1)}٪` : "—"} tone={d.market_unreliable ? "text-warning" : undefined} sub={d.market_unreliable ? "آمار بازار ناقص" : d.annualized_tons != null ? `${fmtTons(d.annualized_tons)} در سال` : undefined} />
            <Kpi label="میانگین قیمت ما" value={price(ours)} sub={s.avg_fob_price != null ? "FOB/FCA/EXW" : undefined} />
            <Kpi label="جایگاه قیمتی" value={d.position ? `${fa(d.position.cheaper_than)} از ${fa(d.position.of)}` : "—"} sub={d.position ? `رقیب گران‌تر از ما · میانه ${price(d.position.median_competitor)}` : undefined} />
          </div>

          {d.notes.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-2 text-sm font-bold text-text">جمع‌بندی عملکرد</h2>
              <ul className="space-y-1.5">
                {d.notes.map((n, i) => (
                  <li key={i} className={`flex gap-2 text-sm leading-7 ${n.level === "warn" ? "text-warning" : "text-text"}`}><span>{n.level === "warn" ? "⚠" : "•"}</span><span>{faDigits(n.text)}</span></li>
                ))}
              </ul>
            </section>
          )}

          {s.months.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-2 text-sm font-bold text-text">روند ماهانه‌ی صادرات (تن) و میانگین قیمت</h2>
              <MonthlyChart months={s.months} />
            </section>
          )}

          {/* ۱) سهم ما از صادرات ایران به این کشور و از کل واردات */}
          {cmp && (
            <section className="card space-y-4 p-5">
              <h2 className="text-sm font-bold text-text">سهم ما در صادرات ایران و در کل واردات {country}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi label="سهم ما از صادرات ایران (گمرک ایران)" value={cmp.iran.our_share_of_customs_pct != null ? `${fa(cmp.iran.our_share_of_customs_pct, 1)}٪` : "—"} tone={cmp.iran.our_share_of_customs_pct > 100 ? "text-warning" : undefined} sub={cmp.iran.customs_tons_annual != null ? `از ${fmtTons(cmp.iran.customs_tons_annual)} در سال (۱۴۰۴، ده‌ماهه سالانه‌شده)` : "آمار گمرک این کشور نیست"} />
                <Kpi label="سهم ما از صادرات ایران (آمار بازار)" value={cmp.iran.our_share_of_market_iran_pct != null ? `${fa(cmp.iran.our_share_of_market_iran_pct, 1)}٪` : "—"} tone={cmp.iran.our_share_of_market_iran_pct > 100 ? "text-warning" : undefined} sub={cmp.iran.market_tons != null ? `از ${fmtTons(cmp.iran.market_tons)} ایران در بازار` : "ایران در جدول بازار نیست"} />
                <Kpi label="سهم ایران از کل واردات کشور" value={cmp.iran.iran_share_of_market_pct != null ? `${fa(cmp.iran.iran_share_of_market_pct, 1)}٪` : "—"} />
                <Kpi label="سهم ما از کل واردات کشور" value={d.share_pct != null ? `${fa(d.share_pct, 1)}٪` : "—"} tone={d.market_unreliable ? "text-warning" : undefined} sub={d.market_unreliable ? "آمار بازار ناقص" : undefined} />
              </div>
              {cmp.iran.understated && <p className="text-xs text-warning">صادرات سالانه‌شده‌ی ما از رقم ثبت‌شده‌ی ایران بیشتر است؛ آمار گمرک یا بازار این کشور کم‌اظهار است.</p>}
              {cmp.composition.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-bold text-text-muted">ترکیب واردات سالانه‌ی کشور ({fa(cmp.composition_total)} تن)</h3>
                  <StackedBar parts={cmp.composition} />
                </div>
              )}
            </section>
          )}

          {/* ۲) صادرات ما در برابر رقبا */}
          {cmp && cmp.rivals.some((r) => r.tons != null) && (
            <section className="card space-y-4 p-5">
              <h2 className="text-sm font-bold text-text">صادرات ما در برابر ترکیه، چین، روسیه و هند به {country}</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                <HBars items={[{ label: "ما (سالانه‌شده)", value: cmp.our_tons || 0, tone: "us" }, ...cmp.rivals.filter((r) => r.tons != null).map((r) => ({ label: r.name, value: r.tons }))].sort((a, b) => b.value - a.value)} fmt={(v) => `${fa(v, 0)} تن`} />
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-border text-text-muted">{["صادرکننده", "تن در سال", "سهم از بازار", "نسبت ما به او"].map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium">{h}</th>)}</tr></thead>
                    <tbody>
                      <tr className="border-b border-border bg-canvas/60 font-semibold"><td className="px-2 py-1.5">ما</td><td className="px-2 py-1.5">{cmp.our_tons != null ? fa(cmp.our_tons) : "—"}</td><td className="px-2 py-1.5">{d.share_pct != null ? `${fa(d.share_pct, 1)}٪` : "—"}</td><td className="px-2 py-1.5">—</td></tr>
                      {cmp.rivals.map((r) => (
                        <tr key={r.name} className="border-b border-border last:border-0"><td className="px-2 py-1.5">{r.name}</td><td className="px-2 py-1.5">{r.tons != null ? fa(r.tons) : "—"}</td><td className="px-2 py-1.5">{r.share_pct != null ? `${fa(r.share_pct, 1)}٪` : "—"}</td><td className="px-2 py-1.5">{r.ours_vs_tons != null ? `${fa(r.ours_vs_tons, 2)}×` : "—"}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* ۳) قیمت ما در برابر رقبا */}
          {cmp && cmp.price_refs.length > 1 && (
            <section className="card space-y-4 p-5">
              <h2 className="text-sm font-bold text-text">قیمت ما در برابر قیمت صادراتی رقبا (دلار بر تن)</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                <HBars items={cmp.price_refs.map((r) => ({ label: r.label, value: r.value, tone: r.tone === "us" ? "us" : r.tone === "ref" ? "ref" : "muted" }))} fmt={(v) => `$${fa(v, 0)}`} />
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-border text-text-muted">{["صادرکننده", "قیمت در این بازار", "قیمت صادراتی جهانی", "فاصله‌ی ما با او"].map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium">{h}</th>)}</tr></thead>
                    <tbody>
                      {cmp.rivals.map((r) => {
                        const ref = r.market_price ?? r.global_price;
                        const gap = ours != null && ref ? Math.round(((ours - ref) / ref) * 100) : null;
                        return (
                          <tr key={r.name} className="border-b border-border last:border-0"><td className="px-2 py-1.5">{r.name}</td><td className="px-2 py-1.5" dir="ltr" style={{ textAlign: "start" }}>{r.market_price != null ? `$${fa(r.market_price, 0)}` : "—"}</td><td className="px-2 py-1.5" dir="ltr" style={{ textAlign: "start" }}>{r.global_price != null ? `$${fa(r.global_price, 0)}` : "—"}</td><td className={`px-2 py-1.5 ${gap != null && gap > 0 ? "text-warning" : "text-success"}`} dir="ltr" style={{ textAlign: "start" }}>{gap != null ? `${gap > 0 ? "+" : ""}${fa(gap)}٪` : "—"}</td></tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              {s.months.some((m) => m.avg_price != null) && (
                <div>
                  <h3 className="mb-2 text-xs font-bold text-text-muted">روند ماهانه‌ی قیمت ما در برابر خط‌های مرجع</h3>
                  <PriceTrendChart months={s.months} refs={cmp.price_refs.filter((r) => r.tone !== "us")} />
                </div>
              )}
            </section>
          )}

          {supplierBars.length > 1 && (
            <section className="card p-5">
              <h2 className="mb-3 text-sm font-bold text-text">تأمین‌کنندگان بازار{d.breakdown_year ? ` (${fa(d.breakdown_year)})` : ""} و سهم ما</h2>
              <HBars items={supplierBars} fmt={(v) => `${fa(v, 0)} تن`} />
            </section>
          )}

          {d.scenarios.length > 0 && <section className="card p-4">
            <h2 className="mb-2 text-sm font-bold text-text">پتانسیل صادرات در سناریوهای سهم بازار</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-border text-text-muted">{["سهم از بازار", "تناژ سالانه", "افزایش نسبت به وضع فعلی", "درآمد با قیمت فعلی ما"].map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  <tr className="border-b border-border bg-canvas/60 font-semibold"><td className="px-2 py-1.5">وضع فعلی ({d.share_pct != null ? `${fa(d.share_pct, 1)}٪` : "—"})</td><td className="px-2 py-1.5">{d.annualized_tons != null ? fmtTons(d.annualized_tons) : "—"}</td><td className="px-2 py-1.5">—</td><td className="px-2 py-1.5" dir="ltr" style={{ textAlign: "start" }}>{ours != null && d.annualized_tons != null ? usd(d.annualized_tons * ours) : "—"}</td></tr>
                  {d.scenarios.map((x) => (
                    <tr key={x.share_pct} className="border-b border-border last:border-0"><td className="px-2 py-1.5">{fa(x.share_pct)}٪</td><td className="px-2 py-1.5">{x.tons != null ? fmtTons(x.tons) : "—"}</td><td className="px-2 py-1.5">{x.extra_tons != null ? `+${fa(x.extra_tons)} تن` : "—"}</td><td className="px-2 py-1.5" dir="ltr" style={{ textAlign: "start" }}>{usd(x.revenue_usd)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>}

          {(m.consumption_tons != null || m.domestic_production_tons != null || m.tariff_note || d.port) && (
            <section className="card p-4">
              <h2 className="mb-2 text-sm font-bold text-text">شرایط بازار کشور</h2>
              <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {m.consumption_tons != null && <div className="flex justify-between gap-3"><dt className="text-text-muted">مصرف ظاهری</dt><dd>{fmtTons(m.consumption_tons)} در سال</dd></div>}
                {m.domestic_production_tons != null && <div className="flex justify-between gap-3"><dt className="text-text-muted">تولید داخلی</dt><dd>{fmtTons(m.domestic_production_tons)}</dd></div>}
                {m.import_unit_value_usd != null && <div className="flex justify-between gap-3"><dt className="text-text-muted">متوسط قیمت واردات</dt><dd dir="ltr">${fa(m.import_unit_value_usd, 0)}</dd></div>}
                {d.port && <div className="flex justify-between gap-3 sm:col-span-2"><dt className="shrink-0 text-text-muted">بندر ورودی</dt><dd className="text-end">{d.port}</dd></div>}
                {m.tariff_note && <div className="sm:col-span-2 leading-7"><dt className="text-text-muted">تعرفه</dt><dd>{m.tariff_note}</dd></div>}
              </dl>
            </section>
          )}

          {s.rows.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-2 text-sm font-bold text-text">سفارش‌های قطعی به {country}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-border text-text-muted">{["تاریخ", "خریدار", "تن", "قیمت", "شرایط تحویل", "شماره"].map((h) => <th key={h} className="px-2 py-1.5 text-start font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {[...s.rows].sort((a, b) => String(b.date).localeCompare(String(a.date))).map((r, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-2 py-1.5">{fdate(r.date)}</td><td className="px-2 py-1.5">{r.buyer}</td><td className="px-2 py-1.5">{fa(r.tons, 1)}</td>
                        <td className="px-2 py-1.5" dir="ltr" style={{ textAlign: "start" }}>{r.price != null ? `${r.currency === "USD" ? "$" : ""}${fa(r.price, 1)}${r.currency !== "USD" ? ` ${r.currency}` : ""}` : "—"}</td>
                        <td className="px-2 py-1.5">{r.incoterm || "—"}</td>
                        <td className="px-2 py-1.5">{r.file_no ? <Link href={`/sales/contracts/${encodeURIComponent(r.file_no)}`} className="text-primary-hover hover:underline" dir="ltr">{r.file_no}</Link> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

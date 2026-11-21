"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { faDigits, fdate } from "../sales/salesUi";

// عملکرد واقعی شرکت (فروش) کنار رتبه‌بندی و توصیه‌های مغز. داده از /api/sales/countries می‌آید که فقط نقش «بازرگانی» دارد؛
// برای بقیه (۴۰۳) یا وقتی گزارش فروش بارگذاری نشده، هیچ‌چیز نمایش داده نمی‌شود و صفحه مثل قبل می‌ماند.
// رتبه‌بندی و توصیه‌ی هفته‌ی مغز عمداً فقط از داده‌ی عمومی ساخته می‌شوند (آزمون کور)؛ این‌جا فقط کنارشان گذاشته می‌شود، نه داخلشان.

const PerfContext = createContext(null);

const n0 = (v) => (v == null ? "—" : faDigits(Math.round(v).toLocaleString("en-US")));
const n1 = (v) => (v == null ? "—" : faDigits(Number(v).toLocaleString("en-US", { maximumFractionDigits: 1 })));

export function PerfProvider({ children }) {
  const [state, setState] = useState({ rows: null, windowMonths: null, asOf: null });
  useEffect(() => {
    let alive = true;
    fetch("/api/sales/countries", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j || j.empty || !Array.isArray(j.table)) return;
        setState({ rows: Object.fromEntries(j.table.map((r) => [r.country, r])), windowMonths: j.window_months, asOf: j.as_of });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return <PerfContext.Provider value={state}>{children}</PerfContext.Provider>;
}

const usePerf = () => useContext(PerfContext) || { rows: null };

/** ارزیابی ترکیبی «رده‌ی مغز × عملکرد ما». tone: success | primary | warning | muted */
export function assess(row, tier) {
  const attractive = tier === "A" || tier === "B";
  if (!row || !row.has_sales) {
    if (row?.market_imports_tons > 0 && attractive) return { tone: "success", text: "فرصت: بازار جذاب و هنوز صادرات نداریم" };
    return { tone: "muted", text: "هنوز صادرات نداریم" };
  }
  const parts = [];
  let tone = "primary";
  if (row.market_unreliable) { parts.push("آمار بازار ناقص؛ سهم قابل‌اتکا نیست"); tone = "warning"; }
  else if (row.share_pct >= 50) parts.push("سهم بالا؛ رشد بیشتر فقط با بزرگ‌شدن بازار");
  else if (row.share_pct < 15) { parts.push(attractive ? "سهم کم در بازار جذاب؛ جای رشد جدی" : "سهم کم"); tone = attractive ? "success" : "primary"; }
  else parts.push("سهم متوسط؛ جای رشد دارد");
  if (row.trend_pct != null && row.trend_pct <= -10) { parts.push(`افت ${n0(Math.abs(row.trend_pct))}٪ در ۹۰ روز اخیر`); tone = "warning"; }
  else if (row.trend_pct != null && row.trend_pct >= 15) parts.push(`رشد ${n0(row.trend_pct)}٪ در ۹۰ روز اخیر`);
  if (tier === "C" && row.tons > 0) parts.push("با وجود رده‌ی پایین مغز فروش فعال داریم");
  return { tone, text: parts.join("؛ ") };
}

const TONE = {
  success: "bg-success-soft text-success",
  primary: "bg-primary-soft text-primary-hover",
  warning: "bg-warning-soft text-warning",
  muted: "bg-canvas text-text-muted",
};

/** یک خط «وضع ما» زیر هر کشورِ توصیه‌ی هفته */
export function PerfLine({ country, tier }) {
  const { rows } = usePerf();
  if (!rows) return null;
  const row = rows[country];
  const a = assess(row, tier);
  return (
    <div className="mt-3 rounded-lg border border-border bg-canvas p-2.5 text-sm leading-7">
      <div className="mb-0.5 text-[11px] font-bold text-text-muted">وضع ما در این کشور (داده‌ی فروش شرکت)</div>
      {row?.has_sales ? (
        <div className="text-text">
          صادرات {n0(row.tons)} تن (میانگین ماهانه {n1(row.monthly_avg_tons)})
          {row.share_pct != null ? ` · سهم از بازار ${n1(row.share_pct)}٪` : ""}
          {row.avg_price != null ? ` · قیمت ما ${n0(row.avg_price)} دلار` : ""}
          {row.last_date ? ` · آخرین سفارش ${fdate(row.last_date)}` : ""}
        </div>
      ) : null}
      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${TONE[a.tone]}`}>{a.text}</span>
    </div>
  );
}

/** جدول مقایسه‌ی رتبه‌ی مغز با عملکرد واقعی ما؛ scores: [{country, rank, tier, score}] */
export function PerfSummary({ scores }) {
  const { rows, windowMonths, asOf } = usePerf();
  if (!rows) return null;
  const list = scores.map((s) => ({ ...s, row: rows[s.country], a: assess(rows[s.country], s.tier) }));
  const opportunities = list.filter((x) => (x.tier === "A" || x.tier === "B") && !x.row?.has_sales && x.row?.market_imports_tons > 0);
  const lowShare = list.filter((x) => x.row?.has_sales && !x.row.market_unreliable && x.row.share_pct != null && x.row.share_pct < 15 && (x.tier === "A" || x.tier === "B"));
  const falling = list.filter((x) => x.row?.has_sales && x.row.trend_pct != null && x.row.trend_pct <= -10);
  const saturated = list.filter((x) => x.row?.has_sales && !x.row.market_unreliable && x.row.share_pct >= 50);
  const names = (arr) => arr.map((x) => x.country).join("، ");

  return (
    <section className="card border-primary p-5">
      <h2 className="mb-1 text-sm font-bold text-text">رتبه‌ی مغز در برابر عملکرد واقعی شرکت</h2>
      <p className="mb-3 text-xs leading-6 text-text-muted">
        رتبه‌بندی و توصیه‌ی مغز فقط از داده‌ی عمومی بازار ساخته می‌شود؛ این جدول آن را با فروش واقعی خودمان کنار هم می‌گذارد
        (پنجره‌ی داده {n1(windowMonths)} ماه تا {fdate(asOf)}؛ سهم = تن سالانه‌شده ÷ واردات سالانه‌ی کشور).
      </p>

      <ul className="mb-4 space-y-1 text-sm leading-7 text-text">
        {opportunities.length > 0 && (
          <li className="flex gap-1.5"><span className="shrink-0 text-success">◂</span><span><b>فرصت‌های بدون فروش</b> (رده‌ی A/B و هنوز صادرات نداریم): {names(opportunities)}.</span></li>
        )}
        {lowShare.length > 0 && (
          <li className="flex gap-1.5"><span className="shrink-0 text-success">◂</span><span><b>سهم کم در بازار جذاب:</b> {names(lowShare)}.</span></li>
        )}
        {saturated.length > 0 && (
          <li className="flex gap-1.5"><span className="shrink-0 text-primary">◂</span><span><b>سهم بالای ۵۰٪ (رشد محدود):</b> {names(saturated)}.</span></li>
        )}
        {falling.length > 0 && (
          <li className="flex gap-1.5"><span className="shrink-0 text-warning">◂</span><span><b>افت ۹۰ روزه:</b> {names(falling)}.</span></li>
        )}
      </ul>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-text-muted">
              <th className="px-2 py-2 text-start">کشور</th>
              <th className="px-2 py-2 text-start">رتبه / رده‌ی مغز</th>
              <th className="px-2 py-2 text-start">واردات بازار (تن/سال)</th>
              <th className="px-2 py-2 text-start">صادرات ما (تن)</th>
              <th className="px-2 py-2 text-start">سهم ما</th>
              <th className="px-2 py-2 text-start">قیمت ما ($)</th>
              <th className="px-2 py-2 text-start">روند ۹۰ روز</th>
              <th className="px-2 py-2 text-start">ارزیابی ترکیبی</th>
            </tr>
          </thead>
          <tbody>
            {list.map(({ country, rank, tier, row, a }) => (
              <tr key={country} className="border-b border-border align-top last:border-0">
                <td className="px-2 py-2 font-bold"><Link href={`/countries/${country}`} className="text-primary-hover hover:underline">{country}</Link></td>
                <td className="px-2 py-2 text-text-muted">{faDigits(rank)} · {tier}</td>
                <td className="px-2 py-2">{row?.market_imports_tons > 0 ? n0(row.market_imports_tons) : "—"}</td>
                <td className="px-2 py-2">{row?.has_sales ? n0(row.tons) : "—"}</td>
                <td className="px-2 py-2">
                  {row?.has_sales && row.share_pct != null ? (
                    <div className="min-w-[70px]">
                      <span>{n1(row.share_pct)}٪</span>
                      <div className="mt-0.5 h-1.5 rounded-full bg-canvas"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.min(100, row.share_pct)}%` }} /></div>
                    </div>
                  ) : row?.market_unreliable ? <span className="text-[11px] text-warning">آمار ناقص</span> : "—"}
                </td>
                <td className="px-2 py-2">{row?.has_sales ? n0(row.avg_price) : "—"}</td>
                <td className={`px-2 py-2 ${row?.trend_pct <= -10 ? "text-warning" : ""}`} dir="ltr" style={{ textAlign: "start" }}>{row?.has_sales && row.trend_pct != null ? `${row.trend_pct > 0 ? "+" : ""}${n0(row.trend_pct)}٪` : "—"}</td>
                <td className="px-2 py-2"><span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold leading-5 ${TONE[a.tone]}`}>{a.text}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

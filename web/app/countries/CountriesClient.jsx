"use client";

import Link from "next/link";
import ExportTrend from "../components/ExportTrend";
import { useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";

function formatUsdK(valueK) {
  if (valueK == null) return null;
  const usd = valueK * 1000;
  if (usd >= 1_000_000) return `${(usd / 1_000_000).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} میلیون دلار`;
  return `${Math.round(usd).toLocaleString("fa-IR")} دلار`;
}

function TradeBox({ trade }) {
  if (!trade) {
    return <p className="text-xs text-slate-400">داده‌ی تجاری ثبت‌نشده</p>;
  }
  const { exports_2025: exp, imports_2025: imp } = trade;
  const balanceK = exp?.trade_balance_usd_k ?? imp?.trade_balance_usd_k;

  return (
    <div className="space-y-1.5">
      {balanceK != null && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">تراز تجاری ۲۰۲۵</span>
          <span className={`font-bold font-tabular ${balanceK >= 0 ? "text-copper-800" : "text-slate-600"}`}>
            {balanceK >= 0 ? "+" : ""}
            {formatUsdK(balanceK)}
          </span>
        </div>
      )}
      {exp?.value_usd_k != null && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">صادرات · قیمت میانگین</span>
          <span className="font-medium font-tabular">
            {exp.unit_value_usd != null ? `${exp.unit_value_usd.toLocaleString("fa-IR")} $/تن` : "—"}
          </span>
        </div>
      )}
      {imp?.value_usd_k != null && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">واردات · قیمت میانگین</span>
          <span className="font-medium font-tabular">
            {imp.unit_value_usd != null ? `${imp.unit_value_usd.toLocaleString("fa-IR")} $/تن` : "—"}
          </span>
        </div>
      )}
      {!exp && !imp && <p className="text-xs text-slate-400">داده‌ی تجاری ثبت‌نشده</p>}
      {trade.export_trend && (
        <div className="pt-1.5 border-t border-slate-100">
          <ExportTrend trend={trade.export_trend} />
        </div>
      )}
    </div>
  );
}

export default function CountriesClient({ countries }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("relevance");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = countries;
    if (q) {
      list = list.filter(
        (c) => c.name.toLowerCase().includes(q) || c.trade?.name_en?.toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    if (sort === "exports") {
      sorted.sort((a, b) => (b.trade?.exports_2025?.value_usd_k ?? -1) - (a.trade?.exports_2025?.value_usd_k ?? -1));
    } else if (sort === "imports") {
      sorted.sort((a, b) => (b.trade?.imports_2025?.value_usd_k ?? -1) - (a.trade?.imports_2025?.value_usd_k ?? -1));
    } else if (sort === "alpha") {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "fa"));
    } else {
      // relevance: کشورهایی که داده‌ی واقعی سایت (شرکت/گزارش/نمایشگاه) دارن اول
      sorted.sort((a, b) => {
        const ra = a.companies + a.exhibitions + a.reports;
        const rb = b.companies + b.exhibitions + b.reports;
        if (ra !== rb) return rb - ra;
        return (b.trade?.imports_2025?.value_usd_k ?? 0) - (a.trade?.imports_2025?.value_usd_k ?? 0);
      });
    }
    return sorted;
  }, [countries, query, sort]);

  return (
    <div>
      <PageHeader
        title={`کشورها (${filtered.length.toLocaleString("fa-IR")})`}
        subtitle="پرونده‌ی بازارهای جهانی محصول — آمار تجارت، روند صادرات و محتوای اختصاصی هر کشور."
        actions={
          <>
            <input
              type="text"
              placeholder="جست‌وجوی کشور…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-petrol-700 border border-white/10 text-sm text-white placeholder:text-petrol-300 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-copper-500"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="bg-petrol-700 border border-white/10 text-sm text-white rounded-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-copper-500"
            >
              <option value="relevance">مرتبط‌ترین اول</option>
              <option value="imports">بیشترین واردات</option>
              <option value="exports">بیشترین صادرات</option>
              <option value="alpha">الفبایی</option>
            </select>
          </>
        }
      />

      <p className="text-xs text-petrol-300 mb-4 leading-6">
        آمار تراز/قیمت از ITC Trade Map (۲۰۲۵) — یک رتبه‌بندی جهانی کلی، نه لزوماً رابطه‌ی
        تجاری با ایران. «شریک تجاری» فقط برای کشورهایی که گزارش اختصاصی دارن (نشان کوچک
        روی کارت) واقعی و موجوده.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <Link
            key={c.name}
            href={`/countries/${encodeURIComponent(c.name)}`}
            className="group block card card-hover overflow-hidden"
          >
            <div
              className="relative h-24 flex items-end p-3"
              style={{
                backgroundImage: c.trade?.iso2
                  ? `linear-gradient(to top, rgba(11,32,39,.92), rgba(11,32,39,.35)), url(https://flagcdn.com/w640/${c.trade.iso2}.png)`
                  : "linear-gradient(135deg, #123742, #0B2027)",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <div className="relative z-10 flex items-center gap-1.5 flex-wrap">
                <h2 className="font-bold text-white text-sm drop-shadow">{c.name}</h2>
                {c.hasProfile && (
                  <span className="text-[9px] bg-copper-500 text-white rounded-full px-1.5 py-0.5 font-bold">
                    گزارش اختصاصی
                  </span>
                )}
              </div>
            </div>

            <div className="p-3 space-y-3">
              <div className="flex gap-3 text-[11px] text-slate-500">
                <span>{c.companies.toLocaleString("fa-IR")} شرکت</span>
                <span>{c.exhibitions.toLocaleString("fa-IR")} نمایشگاه</span>
                <span>{c.reports.toLocaleString("fa-IR")} گزارش</span>
              </div>
              <div className="pt-2 border-t border-slate-100">
                <TradeBox trade={c.trade} />
              </div>
              {c.partners?.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <div className="text-[10px] text-slate-400 mb-1">شرکای تجاری اصلی</div>
                  <ol className="text-xs space-y-0.5">
                    {c.partners.slice(0, 3).map((p, i) => (
                      <li key={i} className="text-slate-600">
                        {i + 1}. {p.country}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

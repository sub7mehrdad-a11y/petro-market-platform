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
    return <p className="text-xs text-text-muted">داده‌ی تجاری ثبت‌نشده</p>;
  }
  const { exports_2025: exp, imports_2025: imp } = trade;
  const balanceK = exp?.trade_balance_usd_k ?? imp?.trade_balance_usd_k;

  return (
    <div className="space-y-1.5">
      {balanceK != null && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">تراز تجاری ۲۰۲۵</span>
          <span className={`font-bold ${balanceK >= 0 ? "text-primary-hover" : "text-text"}`}>
            {balanceK >= 0 ? "+" : ""}
            {formatUsdK(balanceK)}
          </span>
        </div>
      )}
      {exp?.value_usd_k != null && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">صادرات · قیمت میانگین</span>
          <span className="font-medium">
            {exp.unit_value_usd != null ? `${exp.unit_value_usd.toLocaleString("fa-IR")} $/تن` : "—"}
          </span>
        </div>
      )}
      {imp?.value_usd_k != null && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">واردات · قیمت میانگین</span>
          <span className="font-medium">
            {imp.unit_value_usd != null ? `${imp.unit_value_usd.toLocaleString("fa-IR")} $/تن` : "—"}
          </span>
        </div>
      )}
      {!exp && !imp && <p className="text-xs text-text-muted">داده‌ی تجاری ثبت‌نشده</p>}
      {trade.export_trend && (
        <div className="pt-1.5 border-t border-border">
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
            <Link
              href="/unions"
              className="text-sm text-text hover:text-text border border-primary hover:border-primary rounded-full px-4 py-2 transition-colors"
            >
              اتحادیه‌ها ←
            </Link>
            <input
              type="text"
              placeholder="جست‌وجوی کشور…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="input"
            >
              <option value="relevance">مرتبط‌ترین اول</option>
              <option value="imports">بیشترین واردات</option>
              <option value="exports">بیشترین صادرات</option>
              <option value="alpha">الفبایی</option>
            </select>
          </>
        }
      />

      <p className="text-xs text-text-muted mb-4 leading-6">
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
            <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-soft p-3">
              <div className="min-w-0 flex flex-1 flex-wrap items-center gap-1.5">
                <h2 className="truncate text-sm font-bold text-text">{c.name}</h2>
                {c.hasProfile && (
                  <span className="badge badge-primary shrink-0 !min-h-0 !px-2 !py-0.5 text-[10px]">
                    گزارش اختصاصی
                  </span>
                )}
              </div>
              {c.trade?.iso2 && (
                <img
                  src={`https://flagcdn.com/w160/${c.trade.iso2}.png`}
                  alt=""
                  className="h-9 w-14 shrink-0 rounded-md border border-border object-cover"
                />
              )}
            </div>

            <div className="p-3 space-y-3">
              <div className="flex gap-3 text-[11px] text-text-muted">
                <span>{c.companies.toLocaleString("fa-IR")} شرکت</span>
                <span>{c.exhibitions.toLocaleString("fa-IR")} نمایشگاه</span>
                <span>{c.reports.toLocaleString("fa-IR")} گزارش</span>
              </div>
              <div className="pt-2 border-t border-border">
                <TradeBox trade={c.trade} />
              </div>
              {c.partners?.length > 0 && (
                <div className="pt-2 border-t border-border">
                  <div className="text-[10px] text-text-muted mb-1">شرکای تجاری اصلی</div>
                  <ol className="text-xs space-y-0.5">
                    {c.partners.slice(0, 3).map((p, i) => (
                      <li key={i} className="text-text">
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

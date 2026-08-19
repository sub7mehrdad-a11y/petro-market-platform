"use client";

import { useState } from "react";
import PriceChart from "./PriceChart";
import PriceHighlightCard from "./PriceHighlightCard";

const PRICE_TYPE_FA = { domestic: "داخلی", FOB: "FOB", CIF: "CIF" };

// برای هر spec، جدیدترین رکورد منطبق رو پیدا می‌کنه — ولی رکوردی که value ندارد
// (استخراج آن روز شکست خورده) رد می‌شود تا آخرین عدد واقعی موجود برگردد، نه یک
// خط «داده‌ای در دسترس نیست» به‌جای عددی که همین دیروز داشتیم.
function findLatest(rowsNewestFirst, product, country, priceType) {
  return rowsNewestFirst.find(
    (r) => r.product === product && r.country_or_region === country && r.price_type === priceType && r.value != null
  );
}

export default function PriceSection({ title, note, product, highlightSpecs, allRows }) {
  const [showMore, setShowMore] = useState(false);

  const productRows = allRows.filter((r) => r.product === product);
  const rowsNewestFirst = [...productRows].reverse();

  // جدیدترین تاریخ جمع‌آوری‌شده برای این محصول — برای تشخیص این‌که یک رکورد
  // هایلایت‌شده واقعاً مال «امروز» است یا یک روز عقب‌تره (fallback).
  const latestBatchDate = productRows.reduce(
    (max, r) => (r.batch_date && r.batch_date > max ? r.batch_date : max),
    ""
  );

  const highlights = highlightSpecs.map((spec) => {
    const record = findLatest(rowsNewestFirst, product, spec.country, spec.priceType);
    return {
      label: `${spec.country} · ${PRICE_TYPE_FA[spec.priceType] || spec.priceType}`,
      record,
      isStale: !!(record && latestBatchDate && record.batch_date !== latestBatchDate),
    };
  });

  const highlightKeys = new Set(highlightSpecs.map((s) => `${s.country}|${s.priceType}`));
  const restRows = productRows.filter((r) => !highlightKeys.has(`${r.country_or_region}|${r.price_type}`));

  // نمودار باید کل تاریخچه‌ی هر سری هایلایت‌شده رو نشون بده (روند)، نه فقط
  // آخرین عدد — قبلاً فقط h.record (تک‌رکورد جدیدترین) پاس داده می‌شد که باعث
  // می‌شد نمودار عملاً یک نقطه‌ی تنها برای هر سری بکشه (خط قابل‌رسم نبود).
  const chartRows = productRows.filter(
    (r) => r.value != null && highlightKeys.has(`${r.country_or_region}|${r.price_type}`)
  );

  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-lg font-bold">{title}</h2>
        {note && <p className="text-xs text-slate-500">{note}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        {highlights.map((h, i) => (
          <PriceHighlightCard key={i} label={h.label} record={h.record} isStale={h.isStale} />
        ))}
      </div>

      {chartRows.length > 0 && <PriceChart rows={chartRows} />}

      {restRows.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowMore((v) => !v)}
            className="text-sm text-copper-700 hover:underline"
          >
            {showMore ? "بستن جزئیات ▲" : `نمایش ${restRows.length} قیمت دیگر ▼`}
          </button>

          {showMore && (
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-slate-500 border-b border-slate-200">
                    <th className="py-2 pe-4">کشور/منطقه</th>
                    <th className="py-2 pe-4">نوع قیمت</th>
                    <th className="py-2 pe-4">مقدار</th>
                    <th className="py-2 pe-4">تاریخ منبع</th>
                    <th className="py-2 pe-4">منبع</th>
                    <th className="py-2">یادداشت</th>
                  </tr>
                </thead>
                <tbody>
                  {restRows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-100 align-top">
                      <td className="py-2 pe-4 whitespace-nowrap">{r.country_or_region}</td>
                      <td className="py-2 pe-4 whitespace-nowrap">
                        <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                          {PRICE_TYPE_FA[r.price_type] || r.price_type}
                        </span>
                      </td>
                      <td className="py-2 pe-4 whitespace-nowrap">
                        {r.value != null ? `${r.value} ${r.currency}/${r.unit}` : "—"}
                      </td>
                      <td className="py-2 pe-4 whitespace-nowrap text-slate-500">{r.source_reported_date || "—"}</td>
                      <td className="py-2 pe-4 whitespace-nowrap">
                        {r.source_url ? (
                          <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="text-copper-700 hover:underline">
                            {r.source_name}
                          </a>
                        ) : (
                          <span className="text-slate-400">بدون منبع رایگان</span>
                        )}
                      </td>
                      <td className="py-2 text-slate-500 max-w-xs">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

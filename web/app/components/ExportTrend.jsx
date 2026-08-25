// روند چندساله‌ی صادرات یک کشور — از data/trade_map_2025.json (کلید export_trend)
// که scripts/ingest_trade_map.py از فایل سری زمانی ITC می‌سازد.
//
// چرا یک کامپوننت مشترک: همین روند هم روی کارت‌های صفحه‌ی کشورها می‌آید و هم در
// سربرگ صفحه‌ی رقبا. اگر دو پیاده‌سازی جدا داشتیم، دیر یا زود فرمت درصدها یا
// معنی رنگ‌ها بین دو صفحه فرق می‌کرد.

// سال بدون جداکننده‌ی هزارگان — با toLocaleString ساده، ۲۰۲۱ به «۲٬۰۲۱» تبدیل می‌شد.
function faYear(year) {
  return Number(year).toLocaleString("fa-IR", { useGrouping: false });
}

function formatPct(value) {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("fa-IR")}٪`;
}

/** میله‌های کوچک روند — بدون کتابخانه‌ی نمودار، چون فقط ۵ عدد است. */
function Sparkline({ values, positive }) {
  const max = Math.max(...values);
  if (!max) return null;
  return (
    <div className="flex items-end gap-0.5 h-6" aria-hidden="true">
      {values.map((v, i) => (
        <div
          key={i}
          className={`w-1.5 rounded-t ${positive ? "bg-copper-400" : "bg-petrol-300"}`}
          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

/**
 * variant="card"  → فشرده، برای کارت‌های صفحه‌ی کشورها
 * variant="hero"  → روی پس‌زمینه‌ی تیره‌ی سربرگ صفحه‌ی رقبا
 */
export default function ExportTrend({ trend, variant = "card" }) {
  if (!trend || trend.cagr_pct == null) return null;

  const { years, values_usd_k: values, first_year, last_year, cagr_pct, total_change_pct } = trend;
  const positive = cagr_pct >= 0;
  const span = last_year - first_year;

  if (variant === "hero") {
    return (
      <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 border border-white/10">
        <div className="text-[11px] text-petrol-200 mb-1">
          رشد سالانه‌ی صادرات ({faYear(first_year)}–{faYear(last_year)})
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className={`font-black font-tabular text-lg ${positive ? "text-copper-300" : "text-rose-300"}`}>
            {formatPct(cagr_pct)}
            <span className="text-xs font-normal text-petrol-200"> در سال</span>
          </div>
          <Sparkline values={values} positive={positive} />
        </div>
        <div className="text-[10px] text-petrol-300 mt-1">
          مجموع {faYear(span)} سال: {formatPct(total_change_pct)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-[11px] text-slate-500">
        روند صادرات {faYear(first_year)}–{faYear(last_year)}
        <span className={`font-bold font-tabular ms-1 ${positive ? "text-copper-700" : "text-rose-700"}`}>
          {formatPct(cagr_pct)}
        </span>
        <span className="text-slate-400"> سالانه</span>
      </div>
      <Sparkline values={values} positive={positive} />
    </div>
  );
}

export { formatPct };

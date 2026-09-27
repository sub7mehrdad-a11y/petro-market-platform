// اطلاعات اقتصادی پایه‌ی کشور (جمعیت، درصد شهرنشینی، سرانه‌ی درآمد، تولید
// ناخالص داخلی) — از World Bank Open Data (scripts/ingest_country_population.py)،
// مستقل از داده‌ی محصول جوش شیرین. کارتی جدا از CountryStatStrip چون آن نوار
// مخصوص شناسنامه‌ی بازار محصول است، نه زمینه‌ی کلان اقتصادی کشور.
export default function CountryEconomicProfile({ profile }) {
  if (!profile) return null;

  const items = [
    profile.population != null && {
      label: "جمعیت",
      value: (profile.population / 1_000_000).toLocaleString("fa-IR", { maximumFractionDigits: 2 }),
      unit: "میلیون نفر",
    },
    profile.urban_pct != null && {
      label: "جمعیت شهرنشین",
      value: profile.urban_pct.toLocaleString("fa-IR", { maximumFractionDigits: 1 }),
      unit: "٪",
    },
    profile.gdp_per_capita_usd != null && {
      label: "سرانه‌ی درآمد (GDP سرانه)",
      value: Math.round(profile.gdp_per_capita_usd).toLocaleString("fa-IR"),
      unit: "دلار/سال",
    },
    profile.gdp_total_usd != null && {
      label: "تولید ناخالص داخلی",
      value: (profile.gdp_total_usd / 1_000_000_000).toLocaleString("fa-IR", { maximumFractionDigits: 2 }),
      unit: "میلیارد دلار",
    },
  ].filter(Boolean);

  if (items.length === 0) return null;

  return (
    <section className="card p-5">
      <h2 className="text-lg font-bold mb-1">اطلاعات اقتصادی پایه</h2>
      <p className="text-xs text-slate-500 mb-4">
        منبع: World Bank Open Data — آخرین سال آماری موجود برای هر شاخص (
        {(profile.year || profile.gdp_total_year || "").toString().replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d])}).
      </p>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {items.map((it) => (
          <div key={it.label} className="border border-slate-200 rounded-lg p-3">
            <div className="text-[11px] text-slate-500 mb-1.5 leading-5">{it.label}</div>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="font-black font-tabular text-lg text-petrol-900">{it.value}</span>
              <span className="text-[11px] text-slate-400">{it.unit}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

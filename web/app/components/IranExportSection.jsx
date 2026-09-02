/**
 * صادرات جوش شیرین ایران به تفکیک کشور مقصد — مستقیم از آمار رسمی گمرک
 * جمهوری اسلامی ایران (IRICA)، نه ITC Trade Map.
 *
 * چرا این بخش با SupplierBreakdown فرق داره: اون یکی «واردات یک کشور از
 * مبادی مختلف» رو نشون می‌ده (دیدگاه واردکننده، از داده‌ی ITC). این‌جا برعکسه:
 * «صادرات خودِ ایران به مقاصد مختلف» — دیدگاه صادرکننده، از آمار گمرک خودمون.
 * چون فقط برای ایران معناداره (نه هر کشوری)، یک کامپوننت جدا و مخصوص خودشه،
 * نه یک نسخه‌ی عمومی‌شده‌ی SupplierBreakdown.
 */

function usdK(value) {
  if (value == null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} م.د`;
  if (value >= 1000) return `${(value / 1000).toLocaleString("fa-IR", { maximumFractionDigits: 0 })} هـ.د`;
  return `${value.toLocaleString("fa-IR")} د`;
}

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function faDigits(n) {
  return String(n).replace(/\d/g, (d) => PERSIAN_DIGITS[d]);
}

function tons(value) {
  if (value == null) return "—";
  return `${value.toLocaleString("fa-IR", { maximumFractionDigits: 0 })} تن`;
}

export default function IranExportSection({ data }) {
  if (!data?.destinations_1404_10m?.length) return null;

  const maxTons = Math.max(...data.destinations_1404_10m.map((d) => d.tons || 0)) || 1;

  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1">
        <h2 className="text-lg font-bold">صادرات ایران به کشورهای دنیا</h2>
        <span className="text-xs text-slate-400">جوش شیرین — {data.hs_code}</span>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        منبع: {data.source}. {data.hs_description_fa}
      </p>

      {/* روند سالانه — عمداً سه ستون جدا (نه یک نمودار روند پیوسته)، چون ۱۴۰۴
          فقط ده‌ماهه است و کنار سال کامل گذاشتنش بدون برچسب گمراه‌کننده می‌شد. */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {data.annual_totals.map((y) => (
          <div key={y.year_fa} className="rounded-xl bg-petrol-50 border border-petrol-100 p-3 text-center">
            <div className="text-xs text-slate-500 mb-1">
              {faDigits(y.year_fa)}
              {y.is_partial_year && y.months_covered && (
                <span className="text-copper-600"> ({faDigits(y.months_covered)} ماهه)</span>
              )}
            </div>
            <div className="text-lg font-bold font-tabular text-petrol-900">{tons(y.tons)}</div>
            <div className="text-[11px] text-slate-400 font-tabular">{usdK(y.value_usd)}</div>
          </div>
        ))}
      </div>

      <h3 className="text-sm font-bold text-slate-700 mb-2">
        مقاصد صادراتی — {faDigits(data.annual_totals.find((y) => y.is_partial_year && y.months_covered)?.year_fa)} (
        {faDigits(data.annual_totals.find((y) => y.is_partial_year && y.months_covered)?.months_covered)} ماهه)
      </h3>
      <ul className="divide-y divide-slate-100">
        {data.destinations_1404_10m.map((d, i) => (
          <li key={i} className="py-2.5">
            <div className="flex items-center gap-3">
              {d.iso2 ? (
                <img
                  src={`https://flagcdn.com/w40/${d.iso2}.png`}
                  alt=""
                  className="h-4 w-6 rounded-sm object-cover shrink-0 ring-1 ring-black/5"
                />
              ) : (
                <span className="h-4 w-6 rounded-sm bg-slate-100 shrink-0" />
              )}

              <span className="text-sm font-medium shrink-0">{d.country_fa}</span>

              <span className="text-xs font-tabular text-slate-600 shrink-0">{tons(d.tons)}</span>

              <span className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden min-w-8">
                <span
                  className="block h-full rounded-full bg-copper-500"
                  style={{ width: `${Math.max(4, (d.tons / maxTons) * 100)}%` }}
                />
              </span>

              {d.unit_price_usd_per_ton != null && (
                <span className="text-[11px] font-tabular text-slate-400 shrink-0">
                  {d.unit_price_usd_per_ton.toLocaleString("fa-IR")} $/تن
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-slate-400 mt-4 leading-6">
        داده‌ی تفکیک‌شده به کشور فقط برای دوره‌ی ده‌ماهه‌ی ۱۴۰۴ در دسترس است؛ ارقام سال‌های ۱۴۰۲
        و ۱۴۰۳ بالا، جمع کل کشوری‌اند (بدون تفکیک مقصد).
      </p>
    </section>
  );
}

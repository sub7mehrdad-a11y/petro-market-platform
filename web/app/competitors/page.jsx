import Link from "next/link";
import { getCompetitors, getTradeMapForCountry } from "@/lib/data";
import PageHeader from "../components/PageHeader";

// کد دوحرفی کشور برای پرچم از همان جایی می‌آید که صفحه‌ی کشورها استفاده می‌کند
// (data/trade_map_2025.json) — تا اگر روزی اصلاح شد، هر دو صفحه با هم درست بمانند.
function flagStyle(countryName) {
  const iso2 = getTradeMapForCountry(countryName)?.iso2;
  return {
    backgroundImage: iso2
      ? `linear-gradient(to top, rgba(11,32,39,.92), rgba(11,32,39,.35)), url(https://flagcdn.com/w640/${iso2}.png)`
      : "linear-gradient(135deg, #123742, #0B2027)",
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}

// دو آمار روی کارت: ارزش و حجم صادرات از داده‌ی ITC (۲۰۲۵) — همان منبعی که
// صفحه‌ی جزئیات رقیب استفاده می‌کند، تا اعداد دو صفحه با هم نخوانند نشود.
// اگر کشوری در ITC نبود، به آمار دستی competitors.json برمی‌گردیم.
function cardStats(c) {
  const ex = getTradeMapForCountry(c.name)?.exports_2025;
  if (!ex) return (c.headline_stats || []).slice(0, 2);
  return [
    ex.value_usd_k != null && {
      label: "ارزش صادرات (۲۰۲۵)",
      value: (ex.value_usd_k / 1000).toLocaleString("fa-IR", { maximumFractionDigits: 1 }),
      unit: "میلیون دلار",
    },
    ex.quantity != null && {
      label: "حجم (۲۰۲۵)",
      value: ex.quantity.toLocaleString("fa-IR"),
      unit: "تن",
    },
  ].filter(Boolean);
}

export default function CompetitorsPage() {
  const competitors = Object.values(getCompetitors());

  return (
    <div className="space-y-6">
      <PageHeader
        title="تحلیل رقبا"
        subtitle="رصد مستمر رقبای صادراتی اصلی در بازار جوش شیرین. ترکیه (رقیب نزدیک لجستیکی) و چین (بزرگ‌ترین تولیدکننده‌ی جهان) هرکدام با یک ایجنت اختصاصی روزانه رصد می‌شوند؛ روسیه به‌زودی به این فهرست اضافه می‌شود."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {competitors.map((c) => (
          <Link
            key={c.id}
            href={`/competitors/${c.id}`}
            className="group block bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:border-copper-500 hover:shadow-md transition-all"
          >
            <div className="relative h-28 flex items-end p-4" style={flagStyle(c.name)}>
              <div className="relative z-10">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h2 className="text-lg font-black text-white drop-shadow">{c.name}</h2>
                  <span className="text-xs text-petrol-200">{c.name_en}</span>
                </div>
                <p className="text-xs text-copper-300 font-medium mt-0.5">{c.rank_note}</p>
              </div>
            </div>

            <div className="p-5">
            <p className="text-sm text-slate-600 leading-7 line-clamp-3">{c.summary}</p>

            <div className="flex flex-wrap gap-2 mt-4">
              {cardStats(c).map((s, i) => (
                <span key={i} className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
                  <span className="text-slate-500">{s.label}: </span>
                  <span className="font-bold text-petrol-900 font-tabular">{s.value}</span>
                  <span className="text-slate-500"> {s.unit}</span>
                </span>
              ))}
            </div>

            <span className="inline-block mt-4 text-sm text-copper-700 font-medium">
              مشاهده‌ی تحلیل کامل ←
            </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

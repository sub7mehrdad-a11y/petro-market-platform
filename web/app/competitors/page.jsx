import Link from "next/link";
import { getCompetitors, getTradeMapForCountry } from "@/lib/data";
import PageHeader from "../components/PageHeader";

// کد دوحرفی کشور برای پرچم از همان جایی می‌آید که صفحه‌ی کشورها استفاده می‌کند
// (data/trade_map_2025.json) — تا اگر روزی اصلاح شد، هر دو صفحه با هم درست بمانند.
function flagIso2(countryName) {
  return getTradeMapForCountry(countryName)?.iso2 || null;
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
        subtitle="رصد مستمر رقبای صادراتی اصلی در بازار جوش شیرین. ترکیه (رقیب نزدیک لجستیکی) و چین (بزرگ‌ترین تولیدکننده‌ی جهان) هرکدام با یک ایجنت اختصاصی روزانه رصد می‌شوند؛ روسیه و هند با پروفایل رقابتی و نقشه‌ی تعاملی در فهرست‌اند."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {competitors.map((c) => (
          <Link
            key={c.id}
            href={`/competitors/${c.id}`}
            className="group block card overflow-hidden card-hover"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-soft p-4">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h2 className="text-lg font-black text-text">{c.name}</h2>
                </div>
                <p className="text-xs text-primary font-medium mt-0.5">{c.rank_note}</p>
              </div>
              {flagIso2(c.name) && (
                <img
                  src={`https://flagcdn.com/w160/${flagIso2(c.name)}.png`}
                  alt=""
                  className="h-10 w-14 shrink-0 rounded-md border border-border object-cover"
                />
              )}
            </div>

            <div className="p-5">
            <p className="text-sm text-text leading-7 line-clamp-3">{c.summary}</p>

            <div className="flex flex-wrap gap-2 mt-4">
              {cardStats(c).map((s, i) => (
                <span key={i} className="text-xs bg-canvas border border-border rounded-md px-2 py-1">
                  <span className="text-text-muted">{s.label}: </span>
                  <span className="font-bold text-text">{s.value}</span>
                  <span className="text-text-muted"> {s.unit}</span>
                </span>
              ))}
            </div>

            <span className="inline-block mt-4 text-sm text-primary font-medium">
              مشاهده‌ی تحلیل کامل ←
            </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

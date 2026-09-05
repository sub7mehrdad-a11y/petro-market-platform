import Link from "next/link";
import { getFlatPriceRecords, getNewsAnalysis, getTradeMapForCountry, getIranExports } from "@/lib/data";
import PriceSection from "./components/PriceSection";
import NewsCard from "./components/NewsCard";
import KpiRow from "./components/KpiRow";
import PageHeader from "./components/PageHeader";
import IranExportSection from "./components/IranExportSection";

const BASE_FOB_USD = 250;

// ارقام لاتین سال را فارسی می‌کند؛ toLocaleString برای سال جداکننده‌ی
// هزارگان می‌گذارد (۲٬۰۲۱) که برای سال غلط است.
const faDigits = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
const BICARBONATE_HIGHLIGHTS = [
  { country: "China", priceType: "FOB" },
  { country: "Turkey", priceType: "FOB" },
  { country: "Brazil", priceType: "CIF" },
  { country: "India", priceType: "CIF" },
];

const SODA_ASH_HIGHLIGHTS = [
  { country: "China", priceType: "FOB" },
  { country: "India", priceType: "CIF" },
  { country: "USA", priceType: "CIF" },
];

export default function DashboardPage() {
  const rows = getFlatPriceRecords();
  const news = getNewsAnalysis();
  const latestNews = news.slice(0, 5);

  // آمار کلیدی — همه از داده‌ی واقعی؛ اگر منبعی نبود، کارتش ساخته نمی‌شود.
  const turkey = getTradeMapForCountry("ترکیه");
  const china = getTradeMapForCountry("چین");
  const iran = getTradeMapForCountry("ایران");
  const iranExports = getIranExports();

  const kpiCards = [
    {
      label: "قیمت پایه‌ی مرجع FOB ما",
      value: BASE_FOB_USD.toLocaleString("fa-IR"),
      unit: "دلار/تن",
      hint: "مبنای هزینه‌یابی صادراتی جوش شیرین پارس",
      accent: true,
    },
    ...[
      { c: turkey, name: "ترکیه", href: "/competitors/turkey", note: "رقیب نزدیک لجستیکی" },
      { c: china, name: "چین", href: "/competitors/china", note: "بزرگ‌ترین تولیدکننده‌ی جهان" },
      { c: iran, name: "ایران", href: "/countries/ایران", note: "جایگاه ما در بازار جهانی" },
    ]
      .filter(({ c }) => c?.export_trend?.cagr_pct != null && c?.exports_2025?.value_usd_k != null)
      .map(({ c, name, href, note }) => ({
        label: `صادرات ${name} (۲۰۲۵)`,
        // عدد اصلی: ارزش صادرات. درصد رشد به نشان بالای کارت می‌رود تا عدد
        // دوبار تکرار نشود (ایراد پاس قبلی).
        value: (c.exports_2025.value_usd_k / 1000).toLocaleString("fa-IR", {
          maximumFractionDigits: c.exports_2025.value_usd_k < 10000 ? 2 : 1,
        }),
        unit: "میلیون دلار",
        deltaPct: c.export_trend.cagr_pct,
        spark: c.export_trend.values_usd_k,
        hint: `${note} · رشد سالانه‌ی ${faDigits(c.export_trend.first_year)}–${faDigits(
          c.export_trend.last_year
        )}`,
        href,
      })),
  ].filter(Boolean);

  return (
    <div className="space-y-8">
      <PageHeader
        title="داشبورد بازار"
        subtitle="وضعیت قیمت جهانی، رقبا و روند بازار جوش شیرین — به‌روزرسانی خودکار روزانه"
      />

      <KpiRow cards={kpiCards} />

      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 inline-block">
        توجه: قیمت‌های «داخلی» (ارز محلی) و «CIF» با «FOB» دلاری قابل مقایسه‌ی مستقیم نیستن — نوع هر قیمت کنارش برچسب‌گذاری شده.
      </p>

      <PriceSection
        title="جوش شیرین (سدیم بی‌کربنات)"
        product="sodium bicarbonate"
        highlightSpecs={BICARBONATE_HIGHLIGHTS}
        allRows={rows}
      />

      <PriceSection
        title="سود اش (Soda Ash)"
        note="ماده‌ی اولیه‌ی مرتبط — سیگنال روند برای جوش شیرین"
        product="soda ash"
        highlightSpecs={SODA_ASH_HIGHLIGHTS}
        allRows={rows}
      />

      {iranExports && <IranExportSection data={iranExports} />}

      <section className="card p-5">
        <h2 className="text-lg font-bold mb-3">مهم‌ترین تحلیل‌های خبری</h2>
        {latestNews.length === 0 ? (
          <p className="text-sm text-slate-500">هنوز تحلیلی ثبت نشده.</p>
        ) : (
          <div>
            {latestNews.map((entry, i) => (
              <NewsCard key={i} entry={entry} compact />
            ))}
          </div>
        )}
        <Link href="/news" className="inline-block mt-4 text-sm text-copper-700 hover:underline">
          مشاهده‌ی همه‌ی اخبار تحلیلی ←
        </Link>
      </section>
    </div>
  );
}

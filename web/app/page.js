import Link from "next/link";
import { getFlatPriceRecords, getNewsAnalysis } from "@/lib/data";
import PriceSection from "./components/PriceSection";
import NewsCard from "./components/NewsCard";

const BASE_FOB_USD = 250;
const MAIN_COMPETITOR = "ترکیه";

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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold">داشبورد قیمت جهانی</h1>
        <p className="text-sm text-slate-500">
          قیمت پایه‌ی مرجع FOB شرکت: <span className="font-semibold text-copper-700">{BASE_FOB_USD} دلار/تن</span> ·
          رقیب اصلی: <span className="font-semibold">{MAIN_COMPETITOR}</span>
        </p>
      </div>
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 -mt-4 inline-block">
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

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
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

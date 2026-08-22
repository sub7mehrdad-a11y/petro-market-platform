import { getTransitPlaces, getTransitRateEstimate, getNewsAnalysis } from "@/lib/data";
import NewsCard from "@/app/components/NewsCard";
import TransitEstimator from "./TransitEstimator";

const TRANSIT_KEYWORDS = [
  "ترانزیت",
  "کرایه",
  "حمل",
  "بندر",
  "مرز",
  "کانتینر",
  "لجستیک",
  "کشتیرانی",
  "باربری",
  "فله",
  "کریدور",
  "راه‌آهن",
  "راه آهن",
  "تریلی",
  "کامیون",
  "Baltic",
  "BDI",
  "freight",
  "shipping",
];

function isTransitRelated(entry) {
  const text = `${entry.headline_fa || ""} ${entry.analysis_fa || ""}`;
  return TRANSIT_KEYWORDS.some((kw) => text.includes(kw));
}

export default function TransitPage() {
  const places = getTransitPlaces();
  const { avgRate, sampleSize } = getTransitRateEstimate();
  const transitNews = getNewsAnalysis().filter(isTransitRelated);

  return (
    <div className="space-y-6">
      <section className="bg-petrol-gradient text-white rounded-xl overflow-hidden relative p-6">
        <h1 className="text-xl font-bold">تحلیل ترانزیت و باربری</h1>
        <p className="text-sm leading-7 text-petrol-50 max-w-3xl mt-2">
          بر اساس نرخ‌های واقعی کرایه‌ی جاده‌ای که هر روز از کانال‌های اعلام‌بار جمع‌آوری می‌شود،
          هزینه‌ی حمل مسیرهای دیگر را تخمین بزنید و آخرین اخبار و تحلیل‌های حوزه‌ی ترانزیت را ببینید.
        </p>
      </section>

      <TransitEstimator places={places} avgRate={avgRate} sampleSize={sampleSize} />

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <h2 className="text-lg font-bold">آخرین اخبار و تحلیل‌های ترانزیت</h2>
          <span className="text-xs text-slate-400">ایران و بازارهای جهانی · با ذکر منبع</span>
        </div>

        {transitNews.length === 0 ? (
          <p className="text-sm text-slate-500">
            هنوز خبر تحلیلی مرتبط با حوزه‌ی ترانزیت/باربری ثبت نشده. با اجرای بعدی ایجنت رصد اخبار
            این بخش پر می‌شود.
          </p>
        ) : (
          <div>
            {transitNews.map((entry, i) => (
              <NewsCard key={i} entry={entry} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

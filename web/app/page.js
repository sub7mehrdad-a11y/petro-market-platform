import { getFlatPriceRecords, getNewsAnalysis } from "@/lib/data";
import PriceChart from "./components/PriceChart";

const PRICE_TYPE_FA = {
  domestic: "داخلی",
  FOB: "FOB",
  CIF: "CIF",
};

const BASE_FOB_USD = 250;
const MAIN_COMPETITOR = "ترکیه";

export default function DashboardPage() {
  const rows = getFlatPriceRecords();
  const news = getNewsAnalysis();
  const latestNews = news[0];

  return (
    <div className="space-y-8">
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
          <h1 className="text-xl font-bold">داشبورد قیمت جهانی</h1>
          <p className="text-sm text-slate-500">
            قیمت پایه‌ی مرجع FOB شرکت: <span className="font-semibold text-emerald-700">{BASE_FOB_USD} دلار/تن</span> ·
            رقیب اصلی: <span className="font-semibold">{MAIN_COMPETITOR}</span>
          </p>
        </div>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4 inline-block">
          توجه: قیمت‌های «داخلی» (ارز محلی) و «CIF» با «FOB» دلاری قابل مقایسه‌ی مستقیم نیستن — نوع هر قیمت کنارش برچسب‌گذاری شده.
        </p>
        <PriceChart rows={rows} />
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-lg font-bold mb-3">جدول آخرین قیمت‌ها</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">هنوز داده‌ای ثبت نشده.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-slate-500 border-b border-slate-200">
                  <th className="py-2 pe-4">محصول</th>
                  <th className="py-2 pe-4">کشور/منطقه</th>
                  <th className="py-2 pe-4">نوع قیمت</th>
                  <th className="py-2 pe-4">مقدار</th>
                  <th className="py-2 pe-4">تاریخ منبع</th>
                  <th className="py-2 pe-4">منبع</th>
                  <th className="py-2">یادداشت</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice()
                  .sort((a, b) => (a.batch_date < b.batch_date ? 1 : -1))
                  .map((r, i) => (
                    <tr key={i} className="border-b border-slate-100 align-top">
                      <td className="py-2 pe-4 whitespace-nowrap">{r.product}</td>
                      <td className="py-2 pe-4 whitespace-nowrap">{r.country_or_region}</td>
                      <td className="py-2 pe-4 whitespace-nowrap">
                        <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                          {PRICE_TYPE_FA[r.price_type] || r.price_type}
                        </span>
                      </td>
                      <td className="py-2 pe-4 whitespace-nowrap">
                        {r.value != null ? `${r.value} ${r.currency}/${r.unit}` : "—"}
                      </td>
                      <td className="py-2 pe-4 whitespace-nowrap text-slate-500">
                        {r.source_reported_date || "—"}
                      </td>
                      <td className="py-2 pe-4 whitespace-nowrap">
                        {r.source_url ? (
                          <a
                            href={r.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-700 hover:underline"
                          >
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
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-lg font-bold mb-3">آخرین یادداشت تحلیلی خبری</h2>
        {!latestNews ? (
          <p className="text-sm text-slate-500">هنوز تحلیلی ثبت نشده.</p>
        ) : (
          <article className="space-y-3">
            <p className="text-xs text-slate-400">{latestNews.date}</p>
            <p className="leading-7 whitespace-pre-line">{latestNews.analysis_fa}</p>
            {latestNews.sources?.length > 0 && (
              <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t border-slate-100">
                <span>منابع:</span>
                {latestNews.sources.map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-700 hover:underline"
                  >
                    {s.name}
                  </a>
                ))}
              </div>
            )}
          </article>
        )}

        {news.length > 1 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-slate-500">
              یادداشت‌های قبلی ({news.length - 1})
            </summary>
            <div className="mt-3 space-y-4">
              {news.slice(1).map((n, i) => (
                <article key={i} className="border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-400">{n.date}</p>
                  <p className="leading-7 whitespace-pre-line text-sm">{n.analysis_fa}</p>
                </article>
              ))}
            </div>
          </details>
        )}
      </section>
    </div>
  );
}

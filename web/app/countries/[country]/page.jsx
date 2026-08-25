import Link from "next/link";
import { notFound } from "next/navigation";
import { getCountries, getCountrySummary, getCountryProfile, getTradeMapForCountry } from "@/lib/data";
import CompanyTable from "../../components/CompanyTable";
import ExhibitionTable from "../../components/ExhibitionTable";
import WorldRouteMap from "../../components/WorldRouteMap";
import PageHeader from "../../components/PageHeader";
import ExportTrend from "../../components/ExportTrend";

const REPORT_TYPE_FA = { detailed: "گزارش مفصل", summary: "گزارش مدیریتی (خلاصه)" };

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function toAsciiDigits(str) {
  return String(str).replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)));
}

const MONTHS = {
  "ژانویه": 1, "فوریه": 2, "مارس": 3, "آوریل": 4, "مه": 5, "می": 5, "ژوئن": 6,
  "ژوئیه": 7, "جولای": 7, "اوت": 8, "آگوست": 8, "سپتامبر": 9, "اکتبر": 10,
  "نوامبر": 11, "دسامبر": 12,
};

// تاریخ‌های نمایشگاه‌ها متن آزادن (مثل "۱۵ تا ۱۷ جولای ۲۰۲۶")؛ این تابع فقط
// سال+ماه رو برای مرتب‌سازی تقریبی استخراج می‌کنه، نه یک تاریخ دقیق.
function approxSortKey(dateStr) {
  if (!dateStr) return null;
  const ascii = toAsciiDigits(dateStr);
  const yearMatch = ascii.match(/(20\d{2})/);
  if (!yearMatch) return null;
  const year = parseInt(yearMatch[1], 10);
  const monthEntry = Object.entries(MONTHS).find(([name]) => dateStr.includes(name));
  const month = monthEntry ? monthEntry[1] : 0;
  return year * 100 + month;
}

function sortExhibitionsByDate(exhibitions) {
  return [...exhibitions].sort((a, b) => {
    const ka = approxSortKey(a.date);
    const kb = approxSortKey(b.date);
    if (ka == null && kb == null) return 0;
    if (ka == null) return 1;
    if (kb == null) return -1;
    return ka - kb;
  });
}

export function generateStaticParams() {
  return getCountries().map((country) => ({ country }));
}

export default async function CountryPage({ params }) {
  const { country: rawCountry } = await params;
  const country = decodeURIComponent(rawCountry);

  if (!getCountries().includes(country)) {
    notFound();
  }

  const { companies, exhibitions, reports, prices } = getCountrySummary(country);
  const profile = getCountryProfile(country);
  const trade = getTradeMapForCountry(country);
  const sortedExhibitions = sortExhibitionsByDate(exhibitions);
  const smartReport = reports.find((r) => r.report_type === "summary");

  return (
    <div className="space-y-8">
      <PageHeader
        breadcrumb={[
          { label: "داشبورد", href: "/" },
          { label: "کشورها", href: "/countries" },
          { label: country },
        ]}
        title={country}
        subtitle="پرونده‌ی کشور — آمار تجارت جهانی، شرکای تأمین، شرکت‌ها، نمایشگاه‌ها و گزارش‌های مرتبط."
      />

      {trade && (trade.exports_2025 || trade.imports_2025) && (
        <section className="card p-5">
          <h2 className="text-lg font-bold mb-1">آمار تجارت جهانی محصول (۲۰۲۵)</h2>
          <p className="text-xs text-slate-500 mb-4">
            منبع: ITC Trade Map — رتبه‌بندی کلی جهانی این کشور، نه لزوماً رابطه‌ی تجاری با ایران.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {trade.exports_2025 && (
              <div className="rounded-lg border border-slate-200 border-s-4 border-s-copper-500 p-4">
                <div className="text-xs font-bold text-copper-800 mb-2">صادرات</div>
                <dl className="text-sm space-y-1.5">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">ارزش کل</dt>
                    <dd className="font-tabular font-medium">
                      {(trade.exports_2025.value_usd_k * 1000).toLocaleString("fa-IR")} دلار
                    </dd>
                  </div>
                  {trade.exports_2025.quantity != null && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">حجم</dt>
                      <dd className="font-tabular font-medium">
                        {trade.exports_2025.quantity.toLocaleString("fa-IR")} {trade.exports_2025.quantity_unit}
                      </dd>
                    </div>
                  )}
                  {trade.exports_2025.unit_value_usd != null && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">قیمت میانگین</dt>
                      <dd className="font-tabular font-bold text-copper-800">
                        {trade.exports_2025.unit_value_usd.toLocaleString("fa-IR")} دلار/تن
                      </dd>
                    </div>
                  )}
                  {trade.exports_2025.share_world_pct != null && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">سهم از صادرات جهانی</dt>
                      <dd className="font-tabular font-medium">
                        {trade.exports_2025.share_world_pct.toLocaleString("fa-IR")}٪
                      </dd>
                    </div>
                  )}
                  {trade.exports_2025.growth_value_1y_pct != null && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">رشد ارزش (۱ ساله)</dt>
                      <dd className="font-tabular font-medium">
                        {trade.exports_2025.growth_value_1y_pct > 0 ? "+" : ""}
                        {trade.exports_2025.growth_value_1y_pct.toLocaleString("fa-IR")}٪
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
            {trade.imports_2025 && (
              <div className="rounded-lg border border-slate-200 border-s-4 border-s-petrol-400 p-4">
                <div className="text-xs font-bold text-petrol-800 mb-2">واردات</div>
                <dl className="text-sm space-y-1.5">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">ارزش کل</dt>
                    <dd className="font-tabular font-medium">
                      {(trade.imports_2025.value_usd_k * 1000).toLocaleString("fa-IR")} دلار
                    </dd>
                  </div>
                  {trade.imports_2025.quantity != null && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">حجم</dt>
                      <dd className="font-tabular font-medium">
                        {trade.imports_2025.quantity.toLocaleString("fa-IR")} {trade.imports_2025.quantity_unit}
                      </dd>
                    </div>
                  )}
                  {trade.imports_2025.unit_value_usd != null && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">قیمت میانگین</dt>
                      <dd className="font-tabular font-bold text-petrol-800">
                        {trade.imports_2025.unit_value_usd.toLocaleString("fa-IR")} دلار/تن
                      </dd>
                    </div>
                  )}
                  {trade.imports_2025.avg_tariff_pct != null && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">تعرفه‌ی گمرکی میانگین</dt>
                      <dd className="font-tabular font-medium">
                        {trade.imports_2025.avg_tariff_pct.toLocaleString("fa-IR")}٪
                      </dd>
                    </div>
                  )}
                  {trade.imports_2025.growth_value_1y_pct != null && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">رشد ارزش (۱ ساله)</dt>
                      <dd className="font-tabular font-medium">
                        {trade.imports_2025.growth_value_1y_pct > 0 ? "+" : ""}
                        {trade.imports_2025.growth_value_1y_pct.toLocaleString("fa-IR")}٪
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}
          </div>

          {/* روند چندساله‌ی صادرات — یک عدد سالانه مهم‌تر از عدد یک سال است:
              نشان می‌دهد این مبدأ دارد سهم می‌گیرد یا از دست می‌دهد. */}
          {trade.export_trend?.cagr_pct != null && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <ExportTrend trend={trade.export_trend} />
              <p className="text-[11px] text-slate-400 mt-2">
                میانگین رشد سالانه‌ی مرکب ارزش صادرات بین {String(trade.export_trend.first_year).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d])} و{" "}
                {String(trade.export_trend.last_year).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d])} (ارقام هزار دلار، منبع ITC).
              </p>
            </div>
          )}
        </section>
      )}

      {profile?.port && (
        <section className="card p-5">
          <h2 className="text-lg font-bold mb-3">نقشه‌ی مسیر و اطلاعات بازار</h2>
          <WorldRouteMap destPort={profile.port} destCountry={profile.country} distances={profile.distances_km || {}} />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-4">
            {profile.total_import_volume?.value != null && (
              <div className="border border-slate-200 border-s-4 border-s-copper-500 rounded-lg p-3 bg-white shadow-sm">
                <div className="text-xs text-slate-500 mb-1">کل واردات ({profile.total_import_volume.period})</div>
                <div className="font-bold text-copper-800 font-tabular">
                  {profile.total_import_volume.value.toLocaleString("fa-IR")} {profile.total_import_volume.unit}
                </div>
              </div>
            )}
            {profile.top_trade_partners?.map((p, i) => (
              <div key={i} className="border border-slate-200 border-s-4 border-s-copper-500 rounded-lg p-3 bg-white shadow-sm">
                <div className="text-xs text-slate-500 mb-1">شریک تجاری #{i + 1}</div>
                <div className="font-bold">{p.country}</div>
                <div className="text-xs text-slate-500 mt-1">{p.note}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {smartReport && (
        <div>
          <Link
            href={`/reports/${smartReport.id}`}
            className="inline-block bg-copper-700 text-white text-sm font-medium rounded-lg px-4 py-2.5 shadow-sm hover:bg-copper-800 hover:shadow-md transition-all"
          >
            مشاهده‌ی گزارش هوشمند کامل ({country}) ←
          </Link>
        </div>
      )}

      {reports.length > 0 && (
        <section className="card p-5">
          <h2 className="text-lg font-bold mb-3">گزارش‌ها</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {reports.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/reports/${r.id}`}
                  className="block border border-slate-200 rounded-lg p-3 hover:border-copper-600 transition"
                >
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {REPORT_TYPE_FA[r.report_type] || "گزارش"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {prices.length > 0 && (
        <section className="card p-5">
          <h2 className="text-lg font-bold mb-3">قیمت‌ها</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-slate-500 border-b border-slate-200">
                  <th className="py-2 pe-4">محصول</th>
                  <th className="py-2 pe-4">نوع قیمت</th>
                  <th className="py-2 pe-4">مقدار</th>
                  <th className="py-2 pe-4">تاریخ منبع</th>
                  <th className="py-2">منبع</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((p, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-2 pe-4">{p.product}</td>
                    <td className="py-2 pe-4">{p.price_type}</td>
                    <td className="py-2 pe-4">
                      {p.value != null ? `${p.value} ${p.currency}/${p.unit}` : "—"}
                    </td>
                    <td className="py-2 pe-4 text-slate-500">{p.source_reported_date}</td>
                    <td className="py-2">
                      {p.source_url ? (
                        <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="text-copper-700 hover:underline">
                          {p.source_name}
                        </a>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card p-5">
        <h2 className="text-lg font-bold mb-3">شرکت‌ها ({companies.length})</h2>
        <CompanyTable companies={companies} />
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-bold mb-3">نمایشگاه‌ها ({sortedExhibitions.length}) — به ترتیب نزدیک‌ترین تاریخ</h2>
        <ExhibitionTable exhibitions={sortedExhibitions} />
      </section>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { getCountries, getCountrySummary, getCountryProfile } from "@/lib/data";
import CompanyTable from "../../components/CompanyTable";
import ExhibitionTable from "../../components/ExhibitionTable";
import WorldRouteMap from "../../components/WorldRouteMap";

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
  const sortedExhibitions = sortExhibitionsByDate(exhibitions);
  const smartReport = reports.find((r) => r.report_type === "summary");

  return (
    <div className="space-y-8">
      <div>
        <Link href="/countries" className="text-sm text-slate-500 hover:underline">
          ← همه‌ی کشورها
        </Link>
        <h1 className="text-2xl font-bold mt-1">{country}</h1>
      </div>

      {profile?.port && (
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-lg font-bold mb-3">نقشه‌ی مسیر و اطلاعات بازار</h2>
          <WorldRouteMap destPort={profile.port} destCountry={profile.country} distances={profile.distances_km || {}} />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-4">
            {profile.total_import_volume?.value != null && (
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                <div className="text-xs text-slate-500 mb-1">کل واردات ({profile.total_import_volume.period})</div>
                <div className="font-bold text-emerald-800">
                  {profile.total_import_volume.value.toLocaleString("fa-IR")} {profile.total_import_volume.unit}
                </div>
              </div>
            )}
            {profile.top_trade_partners?.map((p, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
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
            className="inline-block bg-emerald-700 text-white text-sm rounded-md px-4 py-2 hover:bg-emerald-800"
          >
            مشاهده‌ی گزارش هوشمند کامل ({country}) ←
          </Link>
        </div>
      )}

      {reports.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-lg font-bold mb-3">گزارش‌ها</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {reports.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/reports/${r.id}`}
                  className="block border border-slate-200 rounded-lg p-3 hover:border-emerald-600 transition"
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
        <section className="bg-white border border-slate-200 rounded-xl p-5">
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
                        <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:underline">
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

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-lg font-bold mb-3">شرکت‌ها ({companies.length})</h2>
        <CompanyTable companies={companies} />
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-lg font-bold mb-3">نمایشگاه‌ها ({sortedExhibitions.length}) — به ترتیب نزدیک‌ترین تاریخ</h2>
        <ExhibitionTable exhibitions={sortedExhibitions} />
      </section>
    </div>
  );
}

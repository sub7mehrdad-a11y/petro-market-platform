import Link from "next/link";
import { notFound } from "next/navigation";
import { getCountries, getCountrySummary } from "@/lib/data";
import CompanyTable from "../../components/CompanyTable";
import ExhibitionTable from "../../components/ExhibitionTable";

const REPORT_TYPE_FA = { detailed: "گزارش مفصل", summary: "گزارش مدیریتی (خلاصه)" };

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

  return (
    <div className="space-y-8">
      <div>
        <Link href="/countries" className="text-sm text-slate-500 hover:underline">
          ← همه‌ی کشورها
        </Link>
        <h1 className="text-2xl font-bold mt-1">{country}</h1>
      </div>

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
        <h2 className="text-lg font-bold mb-3">نمایشگاه‌ها ({exhibitions.length})</h2>
        <ExhibitionTable exhibitions={exhibitions} />
      </section>
    </div>
  );
}

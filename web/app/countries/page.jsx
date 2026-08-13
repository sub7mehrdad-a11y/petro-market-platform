import Link from "next/link";
import { getCountries, getCountrySummary } from "@/lib/data";

export default function CountriesPage() {
  const countries = getCountries();

  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
      <h1 className="text-xl font-bold mb-4">کشورها</h1>
      {countries.length === 0 ? (
        <p className="text-sm text-slate-500">هنوز داده‌ای برای هیچ کشوری ثبت نشده.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {countries.map((country) => {
            const { companies, exhibitions, reports } = getCountrySummary(country);
            return (
              <Link
                key={country}
                href={`/countries/${encodeURIComponent(country)}`}
                className="block border border-slate-200 rounded-lg p-4 hover:border-sky-600 hover:shadow-sm transition"
              >
                <div className="font-bold mb-2">{country}</div>
                <div className="text-xs text-slate-500 space-y-0.5">
                  <div>{companies.length} شرکت</div>
                  <div>{exhibitions.length} نمایشگاه</div>
                  <div>{reports.length} گزارش</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

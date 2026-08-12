"use client";

import { useMemo, useState } from "react";
import CompanyTable from "../components/CompanyTable";

export default function CompaniesClient({ companies }) {
  const countries = useMemo(
    () => Array.from(new Set(companies.map((c) => c.country))).sort(),
    [companies]
  );
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("همه");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter((c) => {
      if (country !== "همه" && c.country !== country) return false;
      if (!q) return true;
      return (
        c.english_name?.toLowerCase().includes(q) ||
        c.arabic_name?.toLowerCase().includes(q) ||
        c.industry?.toLowerCase().includes(q)
      );
    });
  }, [companies, query, country]);

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold">بانک شرکت‌ها ({filtered.length})</h1>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="جست‌وجو در نام/صنعت..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm"
          />
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="همه">همه‌ی کشورها</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <CompanyTable companies={filtered} />
    </section>
  );
}

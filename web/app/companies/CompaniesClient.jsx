"use client";

import { useMemo, useState } from "react";
import CompanyTable from "../components/CompanyTable";
import PageHeader from "../components/PageHeader";

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
    <div>
      <PageHeader
        title="بانک شرکت‌ها"
        subtitle="فهرست یکدست‌شده‌ی شرکت‌های هدف در بازارهای تحت بررسی — با صنعت، گرید هدف، پتانسیل خرید و راه تماس."
        actions={
          <>
            <input
              type="text"
              placeholder="جست‌وجو در نام/صنعت..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-petrol-700 border border-white/10 text-sm text-white placeholder:text-petrol-300 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-copper-500"
            />
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="bg-petrol-700 border border-white/10 text-sm text-white rounded-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-copper-500"
            >
              <option value="همه">همه‌ی کشورها</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </>
        }
      />

      <section className="card p-5">
        <p className="text-xs text-slate-500 mb-4">
          {filtered.length.toLocaleString("fa-IR")} شرکت مطابق فیلتر فعلی
        </p>
        <CompanyTable companies={filtered} />
      </section>
    </div>
  );
}

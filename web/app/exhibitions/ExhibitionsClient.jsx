"use client";

import { useMemo, useState } from "react";
import ExhibitionTable from "../components/ExhibitionTable";

export default function ExhibitionsClient({ exhibitions }) {
  const countries = useMemo(
    () => Array.from(new Set(exhibitions.map((e) => e.country).filter(Boolean))).sort(),
    [exhibitions]
  );
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("همه");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exhibitions.filter((e) => {
      if (country !== "همه" && e.country !== country) return false;
      if (!q) return true;
      return (
        e.name?.toLowerCase().includes(q) ||
        e.location?.toLowerCase().includes(q) ||
        e.focus?.toLowerCase().includes(q)
      );
    });
  }, [exhibitions, query, country]);

  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold">بانک نمایشگاه‌ها ({filtered.length})</h1>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="جست‌وجو در نام/محل/تمرکز..."
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
      <ExhibitionTable exhibitions={filtered} />
    </section>
  );
}

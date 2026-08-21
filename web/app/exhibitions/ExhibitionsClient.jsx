"use client";

import { useEffect, useMemo, useState } from "react";
import ExhibitionTable from "../components/ExhibitionTable";
import { parseExhibitionStartDate, daysUntil } from "@/lib/exhibitionDate";

// نزدیک‌ترین نمایشگاه‌های آینده اول؛ گذشته‌ها آخر؛ تاریخ نامشخص همیشه ته لیست.
function sortByUpcoming(list) {
  return [...list].sort((a, b) => {
    const da = daysUntil(parseExhibitionStartDate(a.date));
    const db = daysUntil(parseExhibitionStartDate(b.date));
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    if (da < 0 && db >= 0) return 1;
    if (db < 0 && da >= 0) return -1;
    return da - db;
  });
}

export default function ExhibitionsClient({ exhibitions }) {
  const countries = useMemo(
    () => Array.from(new Set(exhibitions.map((e) => e.country).filter(Boolean))).sort(),
    [exhibitions]
  );
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("همه");

  // مرتب‌سازی بر اساس «امروز» فقط بعد از mount انجام می‌شه — قبلش (رندر سرور
  // موقع build) با همون ترتیب خام دیتا نمایش داده می‌شه، وگرنه بین HTML سرور
  // و هیدریشن کلاینت (که روزها بعد از build با تاریخ واقعی اجرا می‌شه) تفاوت
  // می‌افته.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = exhibitions.filter((e) => {
      if (country !== "همه" && e.country !== country) return false;
      if (!q) return true;
      return (
        e.name?.toLowerCase().includes(q) ||
        e.location?.toLowerCase().includes(q) ||
        e.focus?.toLowerCase().includes(q)
      );
    });
    return mounted ? sortByUpcoming(matched) : matched;
  }, [exhibitions, query, country, mounted]);

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

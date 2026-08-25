"use client";

import { useEffect, useMemo, useState } from "react";
import ExhibitionTable from "../components/ExhibitionTable";
import { parseExhibitionStartDate, daysUntil } from "@/lib/exhibitionDate";
import PageHeader from "../components/PageHeader";

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
    <div>
      <PageHeader
        title="بانک نمایشگاه‌ها"
        subtitle="نمایشگاه‌های تخصصی بازارهای هدف، مرتب‌شده بر اساس نزدیک‌ترین تاریخ برگزاری."
        actions={
          <>
            <input
              type="text"
              placeholder="جست‌وجو در نام/محل/تمرکز..."
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
          {filtered.length.toLocaleString("fa-IR")} نمایشگاه مطابق فیلتر فعلی
        </p>
        <ExhibitionTable exhibitions={filtered} />
      </section>
    </div>
  );
}

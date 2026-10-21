"use client";

import { useEffect, useMemo, useState } from "react";
import ExhibitionTable from "../components/ExhibitionTable";
import { parseExhibitionStartDate, daysUntil } from "@/lib/exhibitionDate";
import PageHeader from "../components/PageHeader";
import Pagination from "../components/Pagination";

const PAGE_SIZE = 12;

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
  const [page, setPage] = useState(0);

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

  useEffect(() => setPage(0), [query, country]);
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div>
      <PageHeader
        title="بانک نمایشگاه‌ها"
        subtitle={`${exhibitions.length.toLocaleString("fa-IR")} رویداد در سامانه · نزدیک‌ترین نمایشگاه‌ها در ابتدای فهرست`}
        breadcrumb={[{ label: "داشبورد", href: "/" }, { label: "بانک نمایشگاه‌ها" }]}
      />

      <section className="card mb-5 p-5" aria-label="فیلترها">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            جست‌وجوی نمایشگاه
            <input
              type="search"
              placeholder="جست‌وجو در نام، محل یا تمرکز"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input font-normal"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            کشور
            <select value={country} onChange={(e) => setCountry(e.target.value)} className="input font-normal">
              <option value="همه">همه</option>
              {countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="card p-5">
        <p className="mb-4 text-xs text-text-muted">
          {filtered.length.toLocaleString("fa-IR")} نمایشگاه مطابق فیلتر فعلی
        </p>
        <ExhibitionTable exhibitions={pageItems} />
        {filtered.length > PAGE_SIZE && (
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} label="نمایشگاه" />
        )}
      </section>
    </div>
  );
}

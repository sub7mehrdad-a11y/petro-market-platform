"use client";

import { useEffect, useMemo, useState } from "react";
import CompanyTable from "../components/CompanyTable";
import PageHeader from "../components/PageHeader";
import Pagination from "../components/Pagination";

const PAGE_SIZE = 25;

function uniqueSorted(list, pick) {
  return Array.from(new Set(list.map(pick).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), "fa"));
}

export default function CompaniesClient({ companies }) {
  const countries = useMemo(() => uniqueSorted(companies, (c) => c.country), [companies]);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("همه");
  const [page, setPage] = useState(0);

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

  // هر تغییر فیلتر به صفحه‌ی اول برمی‌گرداند. (فیلتر گرید/پتانسیل عمداً نیست: این دو فیلد در دادهٔ فعلی
  // متن آزاد و ناهمگن‌اند؛ تا یکدست‌شدن داده، فیلتر روی آن‌ها گمراه‌کننده است.)
  useEffect(() => setPage(0), [query, country]);

  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div>
      <PageHeader
        title="بانک شرکت‌ها"
        subtitle={`${companies.length.toLocaleString("fa-IR")} شرکت در سامانه · فهرست یکدست‌شده‌ی شرکت‌های هدف با صنعت، گرید هدف، پتانسیل خرید و راه تماس.`}
        breadcrumb={[{ label: "داشبورد", href: "/" }, { label: "بانک شرکت‌ها" }]}
      />

      <section className="card mb-5 p-5" aria-label="فیلترها">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            جست‌وجوی نام یا صنعت
            <input
              type="search"
              placeholder="جست‌وجوی نام یا صنعت"
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
          {filtered.length.toLocaleString("fa-IR")} شرکت مطابق فیلتر فعلی
        </p>
        <CompanyTable companies={pageItems} />
        {filtered.length > PAGE_SIZE && (
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} label="شرکت" />
        )}
      </section>
    </div>
  );
}

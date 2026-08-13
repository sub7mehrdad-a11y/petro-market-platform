"use client";

import { useMemo, useState } from "react";
import NewsCard from "../components/NewsCard";

const QUICK_KEYWORDS = ["جوش شیرین", "سودا اش", "تعرفه گمرک", "حمل و نقل و کشتیرانی"];

export default function NewsClient({ entries }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const haystack = [e.headline_fa, e.analysis_fa, ...(e.sources || []).map((s) => s.name)]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, query]);

  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h1 className="text-xl font-bold">اخبار تحلیلی ({filtered.length})</h1>
        <input
          type="text"
          placeholder="جست‌وجو در تیتر/متن/منبع..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="border border-slate-300 rounded-md px-3 py-1.5 text-sm w-full sm:w-64"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {QUICK_KEYWORDS.map((k) => (
          <button
            key={k}
            onClick={() => setQuery(k)}
            className="text-xs border border-slate-200 rounded-full px-3 py-1 hover:border-copper-600 hover:text-copper-700"
          >
            {k}
          </button>
        ))}
        {query && (
          <button onClick={() => setQuery("")} className="text-xs text-slate-400 hover:underline">
            پاک کردن فیلتر
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500">خبری مطابق جست‌وجو پیدا نشد.</p>
      ) : (
        <div>
          {filtered.map((entry, i) => (
            <NewsCard key={i} entry={entry} />
          ))}
        </div>
      )}
    </section>
  );
}

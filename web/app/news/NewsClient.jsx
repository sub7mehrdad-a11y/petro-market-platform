"use client";

import { useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";

/**
 * صفحه‌ی اخبار — گرید سه‌ستونی کارت، طبق طرح مرجع (ui/03-news.png).
 *
 * ساختار هر کارت: چیپ موضوع + زمان · تیتر · خلاصه · حقایق کلیدی · منابع.
 *
 * یک انحراف عمدی از طرح مرجع: آن‌جا داخل هر کارت یک نمودار میله‌ای کوچک هست،
 * ولی داده‌ی نمونه‌ی خودش را می‌کشد. خبرهای ما سری زمانی ندارند (هر خبر یک
 * رویداد است، نه یک روند)، پس به‌جای نمودار تزئینی، «حقایق کلیدی» همان خبر —
 * که ربات واقعاً استخراج کرده — نمایش داده می‌شود.
 */

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const then = new Date(dateStr);
  if (Number.isNaN(then.getTime())) return dateStr;
  const days = Math.round((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return "امروز";
  if (days === 1) return "دیروز";
  if (days < 7) return `${days.toLocaleString("fa-IR")} روز پیش`;
  return dateStr;
}

function NewsGridCard({ entry }) {
  const facts = (entry.key_facts || []).slice(0, 3);

  return (
    <article className="card p-5 flex flex-col h-full">
      <div className="flex items-start justify-between gap-2 mb-3">
        {entry.topic ? (
          <span className="text-[11px] font-semibold text-copper-800 bg-copper-50 rounded-full px-2.5 py-1">
            {entry.topic}
          </span>
        ) : (
          <span />
        )}
        <span className="text-[11px] text-slate-400 shrink-0">{timeAgo(entry.date)}</span>
      </div>

      <h3 className="font-bold leading-7 text-petrol-900 mb-2">
        {entry.headline_fa || "یادداشت تحلیلی"}
      </h3>

      <p className="text-sm text-slate-600 leading-7 line-clamp-5">{entry.analysis_fa}</p>

      {facts.length > 0 && (
        <ul className="mt-4 bg-petrol-50/60 rounded-lg p-3 space-y-1.5">
          {facts.map((f, i) => (
            <li key={i} className="text-[11px] text-slate-600 leading-5 flex gap-1.5">
              <span className="text-copper-500 shrink-0">◂</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      {entry.sources?.length > 0 && (
        <div className="mt-auto pt-3 border-t border-slate-100 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
          {entry.sources.map((s, i) => (
            <a
              key={i}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-copper-700 hover:underline"
            >
              {s.name} ↗
            </a>
          ))}
        </div>
      )}
    </article>
  );
}

export default function NewsClient({ entries }) {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState(null);

  const topics = useMemo(
    () => [...new Set(entries.map((e) => e.topic).filter(Boolean))],
    [entries]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (topic && e.topic !== topic) return false;
      if (!q) return true;
      const haystack = [
        e.headline_fa,
        e.analysis_fa,
        e.topic,
        ...(e.key_facts || []),
        ...(e.sources || []).map((s) => s.name),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, query, topic]);

  return (
    <div>
      <PageHeader
        title="اخبار تحلیلی"
        subtitle="رصد روزانه‌ی منابع تخصصی بازار و حمل‌ونقل — هر خبر با زبان خودمان خلاصه شده و به منبع اصلی‌اش لینک است."
        actions={
          <input
            type="text"
            placeholder="جست‌وجو در اخبار…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-petrol-700 border border-white/10 text-sm text-white placeholder:text-petrol-300 rounded-full px-4 py-2.5 w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-copper-500"
          />
        }
      />

      {/* چیپ‌های فیلتر موضوعی — روی بوم تیره، فعال مسی */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          type="button"
          onClick={() => setTopic(null)}
          className={`chip ${topic === null ? "chip-active" : ""}`}
        >
          همه ({entries.length.toLocaleString("fa-IR")})
        </button>
        {topics.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTopic(t === topic ? null : t)}
            className={`chip ${topic === t ? "chip-active" : ""}`}
          >
            {t}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card p-6 text-sm text-slate-500">خبری مطابق این فیلتر پیدا نشد.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((entry, i) => (
            <NewsGridCard key={i} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

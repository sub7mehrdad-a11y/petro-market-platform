"use client";

import { useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import ImpactBadge from "../components/ImpactBadge";

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

// رنگ کادر کارت بر اساس فرصت/تهدیدبودن خبر برای ما — impact را
// news_analysis_bot.py می‌سازد؛ رکوردهای قدیمی‌تر این فیلد را ندارند و
// عمداً به‌عنوان خنثی (بدون کلاس اضافه، همون کادر خاکستری پیش‌فرض) درنظر
// گرفته می‌شوند.
const IMPACT_CARD_CLASS = {
  opportunity: "card-impact-opportunity",
  threat: "card-impact-threat",
};

const IMPACT_LABEL = {
  opportunity: { text: "فرصت", className: "text-success bg-success-soft" },
  threat: { text: "تهدید", className: "text-danger bg-danger-soft" },
};

function NewsGridCard({ entry }) {
  const facts = (entry.key_facts || []).slice(0, 3);
  const impactClass = IMPACT_CARD_CLASS[entry.impact] || "";
  const impactLabel = IMPACT_LABEL[entry.impact];

  return (
    <article className={`card p-5 flex flex-col h-full ${impactClass}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {entry.topic ? (
            <span className="text-[11px] font-semibold text-primary-hover bg-primary-soft rounded-full px-2.5 py-1">
              {entry.topic}
            </span>
          ) : null}
          {impactLabel && <ImpactBadge impact={entry.impact} />}
        </div>
        <span className="text-[11px] text-text-muted shrink-0">{timeAgo(entry.date)}</span>
      </div>

      <h3 className="font-bold leading-7 text-text mb-2">
        {entry.headline_fa || "یادداشت تحلیلی"}
      </h3>

      <p className="text-sm text-text leading-7 line-clamp-5">{entry.analysis_fa}</p>

      {facts.length > 0 && (
        <ul className="mt-4 bg-canvas/60 rounded-lg p-3 space-y-1.5">
          {facts.map((f, i) => (
            <li key={i} className="text-[11px] text-text leading-5 flex gap-1.5">
              <span className="text-primary shrink-0">◂</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      {entry.sources?.length > 0 && (
        <div className="mt-auto pt-3 border-t border-border flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted">
          {entry.sources.map((s, i) => (
            <a
              key={i}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
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
        subtitle="رصد روزانه‌ی منابع تخصصی بازار و حمل‌ونقل — هر خبر خلاصه شده و به منبع اصلی لینک است."
        actions={
          <input
            type="text"
            placeholder="جست‌وجو در اخبار…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input w-full sm:w-64"
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
        <div className="card p-6 text-sm text-text-muted">خبری مطابق این فیلتر پیدا نشد.</div>
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

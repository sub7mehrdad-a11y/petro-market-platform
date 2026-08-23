function fallbackHeadline(analysisFa) {
  const firstLine = (analysisFa || "").split("\n")[0];
  return firstLine.length > 80 ? firstLine.slice(0, 80) + "…" : firstLine;
}

export default function NewsCard({ entry, compact = false }) {
  const primarySource = entry.sources?.[0]?.name;
  const headline = entry.headline_fa || fallbackHeadline(entry.analysis_fa);

  return (
    <article className="border-b border-slate-100 last:border-0 py-4 first:pt-0">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h3 className="font-semibold leading-6">
          {primarySource && <span className="text-copper-700">{primarySource}</span>}
          {primarySource && " — "}
          {headline}
        </h3>
        <span className="text-xs text-slate-400 shrink-0">{entry.date}</span>
      </div>

      {/* موضوع فقط روی رکوردهای بعد از ۲۰۲۶-۰۸-۲۳ وجود داره (نسخه‌ی چندموضوعی ربات خبر) */}
      {entry.topic && (
        <span className="inline-block text-[11px] text-petrol-700 bg-petrol-50 border border-petrol-100 rounded-full px-2 py-0.5 mb-2">
          {entry.topic}
        </span>
      )}

      <p className={`text-sm text-slate-600 leading-7 whitespace-pre-line ${compact ? "line-clamp-3" : ""}`}>
        {entry.analysis_fa}
      </p>

      {entry.sources?.length > 0 && (
        <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1 mt-2">
          <span>منابع:</span>
          {entry.sources.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="text-copper-700 hover:underline">
              {s.name}
            </a>
          ))}
        </div>
      )}
    </article>
  );
}

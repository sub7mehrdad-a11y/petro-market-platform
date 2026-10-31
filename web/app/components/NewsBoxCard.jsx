import ImpactBadge, { IMPACT_META, impactOf } from "./ImpactBadge";
import { gregorianFa } from "@/lib/dateFormat";
import ExpandableText from "./ExpandableText";

// باکس خبر برای صفحه‌ی اصلی: کادر و پس‌زمینه‌ی سبز (خبر خوب) / قرمز (خبر بد) / خنثی + آیکون و برچسب متنی.
export default function NewsBoxCard({ entry }) {
  const kind = impactOf(entry);
  const m = IMPACT_META[kind];
  const primarySource = entry.sources?.[0]?.name;
  const headline = entry.headline_fa || (entry.analysis_fa || "").split("\n")[0].slice(0, 90);

  return (
    <article className={`flex h-full flex-col rounded-2xl border p-4 ${m.box}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <ImpactBadge impact={kind} />
        <span className="shrink-0 text-[11px] text-text-muted">{gregorianFa(entry.date)}</span>
      </div>

      {entry.topic && (
        <span className="mb-2 inline-block self-start rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-text">{entry.topic}</span>
      )}

      <h3 className="mb-2 font-bold leading-7 text-text">{headline}</h3>
      <ExpandableText text={entry.analysis_fa} lines={4} className="text-sm leading-7 text-text" />

      {entry.sources?.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-3 text-[11px] text-text-muted">
          {primarySource && <span>منبع:</span>}
          {entry.sources.slice(0, 3).map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {s.name} ↗
            </a>
          ))}
        </div>
      )}
    </article>
  );
}

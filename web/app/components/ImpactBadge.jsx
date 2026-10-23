// علامت «خبر خوب / خبر بد» برای ما (فیلد impact که news_analysis_bot.py می‌سازد: opportunity | threat | neutral).
// رنگ تنها حامل معنا نیست: هم‌زمان آیکون و متن هم هست (برای چاپ سیاه‌وسفید و کم‌بینایی).

function Icon({ kind }) {
  const common = { viewBox: "0 0 20 20", width: 16, height: 16, "aria-hidden": true, className: "shrink-0", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  if (kind === "opportunity") {
    return (
      <svg {...common}>
        <circle cx="10" cy="10" r="8" />
        <path d="M6.2 10.4l2.5 2.4 5-5.4" />
      </svg>
    );
  }
  if (kind === "threat") {
    return (
      <svg {...common}>
        <path d="M10 2.8l7.4 13H2.6L10 2.8z" />
        <path d="M10 8v3.6M10 14.3v.1" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="10" cy="10" r="8" />
      <path d="M6.5 10h7" />
    </svg>
  );
}

export const IMPACT_META = {
  opportunity: {
    label: "خبر خوب",
    hint: "فرصت برای ما",
    badge: "bg-success text-white",
    box: "border-success bg-success-soft",
    accent: "text-success",
  },
  threat: {
    label: "خبر بد",
    hint: "تهدید برای ما",
    badge: "bg-danger text-white",
    box: "border-danger bg-danger-soft",
    accent: "text-danger",
  },
  neutral: {
    label: "خنثی",
    hint: "اثر مشخصی ندارد",
    badge: "bg-canvas text-text-muted border border-border",
    box: "border-border bg-surface",
    accent: "text-text-muted",
  },
};

export const impactOf = (entry) => (IMPACT_META[entry?.impact] ? entry.impact : "neutral");

export default function ImpactBadge({ impact, withHint = true }) {
  const kind = IMPACT_META[impact] ? impact : "neutral";
  const m = IMPACT_META[kind];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${m.badge}`}
      title="برآورد اثر این خبر بر جایگاه رقابتی ما"
    >
      <Icon kind={kind} />
      {m.label}
      {withHint && kind !== "neutral" && <span className="font-medium opacity-90">· {m.hint}</span>}
    </span>
  );
}

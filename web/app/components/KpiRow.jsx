import Link from "next/link";

/**
 * ردیف آمار کلیدی بالای داشبورد.
 *
 * هدف: کسی که صفحه را باز می‌کند، قبل از هر جدولی، وضعیت را در یک نگاه بفهمد —
 * قیمت پایه‌ی خودمان، رشد دو رقیب اصلی، و جایگاه ایران. هر کارت به صفحه‌ی
 * مربوطه‌اش لینک است تا نقطه‌ی شروع ناوبری هم باشد، نه فقط تزئین.
 *
 * همه‌ی اعداد از داده‌ی واقعی می‌آیند؛ اگر داده‌ای نبود، کارتش اصلاً ساخته
 * نمی‌شود (به‌جای نمایش صفر یا خط تیره‌ی بی‌معنی).
 */

/** فقط فلش جهت — خودِ عدد در مقدار اصلی کارت آمده و تکرارش نویز است. */
function TrendArrow({ tone }) {
  if (!tone) return null;
  return (
    <svg
      className={`h-4 w-4 shrink-0 ${tone === "down" ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function KpiCard({ label, value, unit, hint, tone, href, accent = false }) {
  const valueColor = accent
    ? "text-copper-700"
    : tone === "up"
    ? "text-emerald-700"
    : tone === "down"
    ? "text-rose-700"
    : "text-petrol-900";

  const body = (
    <>
      <div className="text-xs text-slate-500 mb-1.5">{label}</div>
      <div className={`flex items-center gap-1.5 flex-wrap ${valueColor}`}>
        <TrendArrow tone={tone} />
        <span className="font-black font-tabular text-2xl leading-none">{value}</span>
        {unit && <span className="text-xs text-slate-500">{unit}</span>}
      </div>
      {hint && <div className="text-[11px] text-slate-400 mt-1.5 leading-5">{hint}</div>}
    </>
  );

  const className =
    "block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all " +
    (href ? "hover:border-copper-400 hover:shadow-md" : "");

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export default function KpiRow({ cards }) {
  if (!cards?.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c, i) => (
        <KpiCard key={i} {...c} />
      ))}
    </div>
  );
}

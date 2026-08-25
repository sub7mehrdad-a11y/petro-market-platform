import Link from "next/link";

/**
 * ردیف آمار کلیدی — ساختار کارت عیناً از طرح مرجع (ui/01-dashboard.png):
 *
 *   برچسب (راست)  ·············  نشان درصد تغییر (چپ)
 *   عدد خیلی درشت + واحد
 *   ─────────── خط جداکننده ───────────
 *   یادداشت (راست)  ············  نمودار کوچک (چپ)
 *
 * هدف: کسی که صفحه را باز می‌کند قبل از هر جدولی وضعیت را در یک نگاه بفهمد.
 * هر کارت به صفحه‌ی مربوطه‌اش لینک است تا نقطه‌ی شروع ناوبری هم باشد.
 * اگر داده‌ای نبود، کارتش اصلاً ساخته نمی‌شود — نه صفر، نه خط تیره‌ی بی‌معنی.
 */

/** نشان درصد تغییر — قرص کوچک با فلش مورب، مثل طرح. */
function DeltaBadge({ pct }) {
  if (pct == null) return null;
  const up = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
        up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
      }`}
    >
      {up ? "+" : "−"}
      {Math.abs(pct).toLocaleString("fa-IR")}٪
      <svg
        className={`h-3 w-3 ${up ? "" : "rotate-90"}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M7 17L17 7M17 7H9M17 7v8" />
      </svg>
    </span>
  );
}

/**
 * نمودار خطی کوچک داخل کارت.
 *
 * چرا SVG دستی و نه Recharts: این‌جا فقط یک خط بدون محور و راهنماست؛ آوردن
 * موتور نمودار برای پنج نقطه، هم حجم می‌آورد هم در چیدمان راست‌به‌چپ دردسر
 * محور دارد (تجربه‌ی ثبت‌شده‌ی ۲۵ اوت).
 */
function Sparkline({ values, up }) {
  if (!values || values.length < 2) return null;

  const w = 88;
  const h = 30;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    // ۳ پیکسل حاشیه‌ی بالا و پایین تا خط به لبه نچسبد
    const y = h - 3 - ((v - min) / span) * (h - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden="true">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={up ? "#DA8C42" : "#7FA3A9"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function KpiCard({ label, value, unit, hint, deltaPct, spark, href, accent }) {
  const up = deltaPct == null ? true : deltaPct >= 0;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-slate-500 leading-5">{label}</span>
        <DeltaBadge pct={deltaPct} />
      </div>

      <div className="mt-3 flex items-baseline gap-1.5 flex-wrap">
        <span
          className={`font-black font-tabular text-3xl leading-none ${
            accent ? "text-copper-700" : "text-petrol-900"
          }`}
        >
          {value}
        </span>
        {unit && <span className="text-xs text-slate-500">{unit}</span>}
      </div>

      {(hint || spark) && (
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-end justify-between gap-3">
          <span className="text-[11px] text-slate-400 leading-5">{hint}</span>
          <Sparkline values={spark} up={up} />
        </div>
      )}
    </>
  );

  const className = `card p-4 block ${href ? "card-hover" : ""}`;

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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c, i) => (
        <KpiCard key={i} {...c} />
      ))}
    </div>
  );
}

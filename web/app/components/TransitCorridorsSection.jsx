const MODE_LABELS = { rail: "ریلی", road: "جاده‌ای", sea: "دریایی" };
const MODE_ORDER = ["rail", "road", "sea"];

function faDigits(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("fa-IR");
}

function CorridorRow({ c }) {
  const servesIran = c.countries_served?.includes("ایران");
  const isEstimate = c.source === "estimate-needs-verification";

  return (
    <tr className="border-b border-slate-100 align-top">
      <td className="py-2 pe-4">
        <div className="font-medium text-petrol-900">{c.name_fa}</div>
        <div className="text-[11px] text-slate-400 mt-0.5">
          {c.countries_served?.join(" · ")}
        </div>
        {!servesIran && (
          <span className="inline-block mt-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
            کریدور رقیب — ایران را دور می‌زند
          </span>
        )}
      </td>
      <td className="py-2 pe-4 font-tabular whitespace-nowrap">{faDigits(c.distance_km)} کیلومتر</td>
      <td className="py-2 pe-4 font-tabular whitespace-nowrap">
        {c.transit_days_est != null ? `${faDigits(c.transit_days_est)} روز` : "—"}
      </td>
      <td className="py-2 pe-4 font-tabular whitespace-nowrap">
        {c.cost_usd_per_teu != null ? `${faDigits(c.cost_usd_per_teu)} دلار/TEU` : "نامشخص"}
      </td>
      <td className="py-2 text-slate-500 max-w-sm">
        {c.gauge_break_points?.length > 0 && (
          <div className="text-[11px] text-copper-700 mb-1">
            تعویض گیج: {c.gauge_break_points.join("، ")}
          </div>
        )}
        {c.notes && <div>{c.notes}</div>}
        <span
          className={`inline-block mt-1 text-[10px] rounded-full px-2 py-0.5 border ${
            isEstimate
              ? "text-slate-500 bg-slate-50 border-slate-200"
              : "text-emerald-700 bg-emerald-50 border-emerald-200"
          }`}
        >
          منبع: {isEstimate ? "برآورد، نیازمند تأیید" : c.source}
        </span>
      </td>
    </tr>
  );
}

export default function TransitCorridorsSection({ data }) {
  if (!data?.corridors?.length) return null;

  const byMode = MODE_ORDER.map((mode) => ({
    mode,
    label: MODE_LABELS[mode],
    rows: data.corridors.filter((c) => c.mode === mode),
  })).filter((g) => g.rows.length > 0);

  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between gap-2 mb-1 flex-wrap">
        <h2 className="text-lg font-bold">کریدورهای بین‌المللی ترانزیت</h2>
        <span className="text-xs text-slate-400">{data.corridors.length.toLocaleString("fa-IR")} مسیر</span>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        طول مسیر، زمان تخمینی و هزینه‌ی هر TEU (وقتی منبع مستند داشت) برای کریدورهای بزرگ اوراسیا،
        مسیرهای دریایی صادراتی و دروازه‌های مرزی ایران.
      </p>

      {byMode.map((group) => (
        <div key={group.mode} className="mb-6 last:mb-0">
          <h3 className="text-sm font-bold text-petrol-800 mb-2">{group.label}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-slate-500 border-b border-slate-200">
                  <th className="py-2 pe-4">مسیر</th>
                  <th className="py-2 pe-4">طول</th>
                  <th className="py-2 pe-4">زمان تخمینی</th>
                  <th className="py-2 pe-4">هزینه/TEU</th>
                  <th className="py-2">توضیح و منبع</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((c) => (
                  <CorridorRow key={c.id} c={c} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {data.methodology_note_fa && (
        <p className="text-[11px] text-slate-400 leading-6 mt-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
          {data.methodology_note_fa}
        </p>
      )}
    </section>
  );
}

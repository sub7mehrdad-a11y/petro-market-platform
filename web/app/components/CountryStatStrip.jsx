/**
 * نوار آمار بالای صفحه‌ی کشور — الگوی طرح مرجع (ui/03-country.png).
 *
 * این نوار «شناسنامه»ی کشور است؛ زمینه‌ی soft آن را از کارت‌های زیرش جدا می‌کند.
 *
 * آمارها از داده‌ی واقعی ساخته می‌شوند؛ هر کدام که نبود، ستونش حذف می‌شود.
 */
export default function CountryStatStrip({ country, iso2, stats, note }) {
  const shown = (stats || []).filter((s) => s && s.value != null && s.value !== "");
  if (shown.length === 0) return null;

  return (
    <section className="rounded-2xl bg-surface-soft border border-border overflow-hidden mb-6">
      <div className="flex flex-col lg:flex-row">
        {/* شناسه‌ی کشور — پرچم + نام */}
        <div className="flex items-center gap-3 border-b lg:border-b-0 lg:border-e border-border px-5 py-4 lg:w-64 shrink-0">
          {iso2 && (
            <img
              src={`https://flagcdn.com/w80/${iso2}.png`}
              alt=""
              className="h-9 w-9 rounded-full object-cover shrink-0 border border-border"
            />
          )}
          <div className="min-w-0">
            <div className="font-black text-text leading-tight truncate">{country}</div>
            {note && <div className="text-[11px] text-text-muted mt-0.5">{note}</div>}
          </div>
        </div>

        {/* ستون‌های آمار */}
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 divide-x divide-x-reverse divide-border">
          {shown.map((s, i) => (
            <div key={i} className="px-5 py-4">
              <div className="text-[11px] text-text-muted mb-1.5 leading-5">{s.label}</div>
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="font-black text-xl text-text leading-none">
                  {s.value}
                </span>
                {s.unit && <span className="text-[11px] text-text-muted">{s.unit}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

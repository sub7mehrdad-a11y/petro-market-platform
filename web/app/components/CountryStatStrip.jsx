/**
 * نوار آمار تیره‌ی بالای صفحه‌ی کشور — الگوی طرح مرجع (ui/03-country.png).
 *
 * چرا تیره و نه کارت سفید مثل بقیه: این نوار «شناسنامه»ی کشور است، نه یکی از
 * بخش‌های محتوا. تیره‌بودنش آن را از کارت‌های زیرش جدا می‌کند و پرچم را هم
 * می‌شود بدون تداخل رنگی داخلش نشاند.
 *
 * آمارها از داده‌ی واقعی ساخته می‌شوند؛ هر کدام که نبود، ستونش حذف می‌شود.
 */
export default function CountryStatStrip({ country, iso2, stats, note }) {
  const shown = (stats || []).filter((s) => s && s.value != null && s.value !== "");
  if (shown.length === 0) return null;

  return (
    <section className="rounded-2xl bg-petrol-700 border border-white/10 overflow-hidden mb-6">
      <div className="flex flex-col lg:flex-row">
        {/* شناسه‌ی کشور — پرچم + نام */}
        <div className="flex items-center gap-3 bg-petrol-600/60 px-5 py-4 lg:w-64 shrink-0">
          {iso2 && (
            <img
              src={`https://flagcdn.com/w80/${iso2}.png`}
              alt=""
              className="h-9 w-9 rounded-full object-cover shrink-0 ring-2 ring-white/15"
            />
          )}
          <div className="min-w-0">
            <div className="font-black text-white leading-tight truncate">{country}</div>
            {note && <div className="text-[11px] text-petrol-200 mt-0.5">{note}</div>}
          </div>
        </div>

        {/* ستون‌های آمار */}
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 divide-x divide-x-reverse divide-white/10">
          {shown.map((s, i) => (
            <div key={i} className="px-5 py-4">
              <div className="text-[11px] text-petrol-300 mb-1.5 leading-5">{s.label}</div>
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="font-black font-tabular text-xl text-white leading-none">
                  {s.value}
                </span>
                {s.unit && <span className="text-[11px] text-petrol-200">{s.unit}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

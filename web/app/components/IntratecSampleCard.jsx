// قیمت ماهانه‌ی نمونه‌ی رایگان Intratec — خروجی «روتین ماهانه‌ی Intratec» که
// روی claude.ai اجرا می‌شه و رکورد جدید رو توی data/intratec_monthly.json
// کامیت می‌کنه. این کارت همیشه جدیدترین رکورد همون فایل رو نشون می‌ده؛ پس با
// هر ماه جدیدی که روتین ثبت کنه (و دیپلوی بعدی) خودکار به‌روز می‌شه.
//
// نکته: Intratec صفحه‌ی رایگانش رو ماهانه عوض نمی‌کنه (در ۲۰۲۶-۱۰ هنوز نوامبر
// ۲۰۲۵ بود) — پس «ماه گزارش‌شده» رو صریح نشون می‌دیم تا کهنه‌بودن پنهان نمونه.

const MARKETS = [
  { key: "us_fob_export", label: "آمریکا", type: "FOB صادراتی" },
  { key: "europe_germany_fob_export", label: "اروپا (آلمان)", type: "FOB صادراتی" },
  { key: "china_food_grade_domestic_spot_exw", label: "چین (گرید خوراکی)", type: "اسپات داخلی، EXW" },
  { key: "middle_east_turkey_fob_export", label: "خاورمیانه/ترکیه", type: "FOB صادراتی" },
];

function ChangeBadge({ pct }) {
  if (pct == null) return null;
  const up = pct > 0;
  const flat = pct === 0;
  const cls = flat
    ? "bg-slate-100 text-slate-600"
    : up
      ? "bg-emerald-50 text-emerald-700"
      : "bg-rose-50 text-rose-700";
  const sign = up ? "+" : "";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium font-tabular ${cls}`} dir="ltr">
      {sign}
      {pct.toLocaleString("fa-IR")}٪
    </span>
  );
}

export default function IntratecSampleCard({ records }) {
  const latest = Array.isArray(records) && records.length ? records[records.length - 1] : null;
  if (!latest) return null;

  const prices = latest.prices_usd_per_mt || {};
  const changes = latest.mom_change_pct || {};
  const shown = MARKETS.filter((m) => prices[m.key] != null);
  if (shown.length === 0) return null;

  return (
    <section className="card p-5">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-petrol-900">قیمت ماهانه‌ی Intratec (نمونه‌ی رایگان)</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          جوش شیرین در ۴ بازار — جدیدترین ماه منتشرشده: <span className="font-semibold">{latest.reported_month}</span>
          {" "}· ثبت‌شده توسط روتین ماهانه ·{" "}
          {latest.source_url && (
            <a href={latest.source_url} target="_blank" rel="noopener noreferrer" className="text-copper-700 hover:underline">
              منبع
            </a>
          )}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((m) => (
          <div key={m.key} className="border border-slate-200 rounded-xl p-4 bg-white border-s-4 border-s-copper-400">
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <span className="text-xs text-slate-500">{m.label}</span>
              <ChangeBadge pct={changes[m.key]} />
            </div>
            <div className="text-xl font-bold text-slate-900 font-tabular">
              {prices[m.key].toLocaleString("fa-IR")}{" "}
              <span className="text-sm font-normal text-slate-500">دلار/تن</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">{m.type} · تغییر نسبت به ماه قبل</div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-3">
        این‌ها نمونه‌ی رایگان و محدود Intratec‌اند (نه سری کامل) و ممکن است ماه‌ها بدون تغییر بمانند؛ برای
        قیمت روزانه، بخش‌های بالا را ببینید.
      </p>
    </section>
  );
}

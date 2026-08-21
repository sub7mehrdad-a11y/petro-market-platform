import { getTransitEntries } from "@/lib/data";

const CURRENCY_FA = { IRR: "تومان", USD: "دلار" };

function formatMoney(amount, currency) {
  if (amount == null) return "—";
  return `${amount.toLocaleString("fa-IR")} ${CURRENCY_FA[currency] || currency || ""}`;
}

export default function TransitPage() {
  const entries = getTransitEntries().sort((a, b) => (a.batch_date < b.batch_date ? 1 : -1));
  const withRate = entries.filter((e) => e.rate_per_ton_km != null && e.price_currency === "IRR");
  const avgRate =
    withRate.length > 0
      ? withRate.reduce((s, e) => s + e.rate_per_ton_km, 0) / withRate.length
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">تحلیل ترانزیت و باربری</h1>
        <p className="text-sm text-slate-500 mt-1">
          نمونه‌ی واقعی نرخ‌های کرایه‌ی جاده‌ای/ترانزیتی که هر روز از کانال‌های تلگرامی اعلام‌بار
          استخراج می‌شود — برای تخمین هزینه‌ی حمل زمینی در مسیرهایی که نرخ مستقیمشان در دسترس نیست.
        </p>
      </div>

      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 inline-block">
        توجه: این نرخ‌ها به <b>تومان</b> (ارز داخلی) هستند و مستقیماً با قیمت‌های FOB/CIF دلاری
        قابل‌مقایسه نیستند — فقط برای برآورد هزینه‌ی حمل داخلی/منطقه‌ای کاربرد دارند.
      </p>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
        <h2 className="text-lg font-bold mb-2">روش تخمین</h2>
        {avgRate == null ? (
          <p className="text-sm text-slate-500">
            هنوز پستی با هم‌زمان قیمت، تناژ و مبدأ/مقصدِ شناخته‌شده جمع نشده تا نرخ پایه محاسبه شود.
            با اجرای بعدی ایجنت رصد، این بخش پر می‌شود.
          </p>
        ) : (
          <>
            <p className="text-sm leading-7 text-slate-700">
              بر اساس <b className="font-tabular">{withRate.length}</b> مشاهده‌ی واقعی (پستی که هم
              کرایه، هم تناژ، هم مبدأ/مقصدِ قابل‌محاسبه داشت)، نرخ پایه‌ی مشاهده‌شده حدود{" "}
              <b className="text-copper-800 font-tabular">
                {Math.round(avgRate).toLocaleString("fa-IR")}
              </b>{" "}
              تومان به ازای هر تن-کیلومتر است.
            </p>
            <p className="text-xs text-slate-500 mt-2">
              برای تخمین هزینه‌ی یک مسیر دیگر: نرخ پایه × فاصله (کیلومتر) × تناژ محموله. این فقط یک
              تخمین بر اساس میانگین چند مسیر واقعی است، نه استعلام مستقیم همان مسیر — هرچه نمونه‌ی
              بیشتری جمع شود (با اجرای روزانه‌ی ایجنت رصد)، این تخمین دقیق‌تر می‌شود.
            </p>
          </>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
        <div className="flex items-baseline justify-between gap-2 mb-4">
          <h2 className="text-lg font-bold">پست‌های رصدشده ({entries.length})</h2>
          <span className="text-xs text-slate-400">
            منابع: کانال‌های تلگرامی اعلام‌بار — رصد خودکار روزانه
          </span>
        </div>

        {entries.length === 0 ? (
          <p className="text-sm text-slate-500">
            هنوز پستی ثبت نشده. اسکریپت <code className="text-xs">scripts/transit_watch_bot.py</code> را
            اجرا کنید.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-slate-500 border-b border-slate-200">
                  <th className="py-2 pe-4">مسیر</th>
                  <th className="py-2 pe-4">نوع بار / وسیله</th>
                  <th className="py-2 pe-4">تناژ</th>
                  <th className="py-2 pe-4">کرایه</th>
                  <th className="py-2 pe-4">فاصله</th>
                  <th className="py-2 pe-4">نرخ/تن-کیلومتر</th>
                  <th className="py-2">منبع · تاریخ</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i} className="border-b border-slate-100 align-top">
                    <td className="py-2 pe-4 whitespace-nowrap font-medium">
                      {e.origin} ← {e.destination}
                    </td>
                    <td className="py-2 pe-4 text-slate-600 max-w-xs">
                      {[e.cargo_type, e.vehicle_type].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="py-2 pe-4 font-tabular whitespace-nowrap">
                      {e.tonnage ? `${e.tonnage.toLocaleString("fa-IR")} تن` : "—"}
                    </td>
                    <td className="py-2 pe-4 font-tabular font-bold text-copper-800 whitespace-nowrap">
                      {formatMoney(e.price_amount, e.price_currency)}
                    </td>
                    <td className="py-2 pe-4 font-tabular text-slate-500 whitespace-nowrap">
                      {e.distance_km ? `~${e.distance_km.toLocaleString("fa-IR")} کیلومتر` : "—"}
                    </td>
                    <td className="py-2 pe-4 font-tabular whitespace-nowrap">
                      {e.rate_per_ton_km ? Math.round(e.rate_per_ton_km).toLocaleString("fa-IR") : "—"}
                    </td>
                    <td className="py-2 text-xs text-slate-400 whitespace-nowrap">
                      {e.source_channel_name} · {e.batch_date}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

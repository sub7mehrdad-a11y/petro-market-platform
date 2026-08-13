const PRICE_TYPE_FA = { domestic: "داخلی", FOB: "FOB", CIF: "CIF" };

// این باکس همیشه از price_history.json فعلی خونده می‌شه (هر بار صفحه لود بشه)،
// نه از عددی که موقع ساخت گزارش هوشمند ثابت ذخیره شده — پس با هر آپدیت روزانه‌ی
// ایجنت قیمت، خودکار به‌روز می‌مونه.
export default function LivePriceBox({ prices }) {
  if (!prices || prices.length === 0) return null;

  return (
    <div className="border border-sky-200 bg-sky-50 rounded-lg p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-block w-2 h-2 rounded-full bg-sky-600 animate-pulse" />
        <h4 className="text-sm font-semibold text-sky-900">قیمت‌های زنده‌ی این کشور (آخرین به‌روزرسانی خودکار)</h4>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {prices.map((p, i) => (
          <div key={i} className="text-sm bg-white rounded-md px-3 py-2 border border-sky-100">
            <div className="text-xs text-slate-500">
              {p.product} · {PRICE_TYPE_FA[p.price_type] || p.price_type}
            </div>
            <div className="font-bold text-sky-800 font-tabular">
              {p.value} {p.currency}/{p.unit}
            </div>
            <div className="text-[11px] text-slate-400">{p.source_reported_date}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// نمایش قیمت‌های رصدشده در صفحه‌ی کشور/رقیب: ارقام و واحد فارسی، و فقط «آخرین» قیمت هر (محصول، نوع قیمت، منبع).
// چرا: price_history.json هر روز یک batch می‌گیره و بدون این تجمیع، یک قیمت یکسان ده‌ها بار در جدول تکرار می‌شد.

const CURRENCY_FA = { USD: "دلار", CNY: "یوان", RUB: "روبل", EUR: "یورو", TRY: "لیر", INR: "روپیه" };
const UNIT_FA = { mt: "تن", MT: "تن", ton: "تن", tons: "تن" };

export function formatPrice(p) {
  if (p?.value == null || typeof p.value !== "number") return "—";
  const v = p.value.toLocaleString("fa-IR", { maximumFractionDigits: 2 });
  const cur = CURRENCY_FA[p.currency] || p.currency || "";
  const unit = UNIT_FA[p.unit] || p.unit || "";
  return `${v} ${cur}${unit ? `/${unit}` : ""}`.trim();
}

// آخرین رکورد هر (product, price_type, source_name)؛ رکورد دارای مقدار بر رکورد بی‌مقدار اولویت دارد.
export function latestPricePerSource(rows) {
  const best = new Map();
  for (const r of rows) {
    const key = [r.product, r.price_type, r.source_name].join("|");
    const cur = best.get(key);
    const rank = (x) => `${x.value != null ? "1" : "0"}|${x.batch_date || ""}`;
    if (!cur || rank(r) > rank(cur)) best.set(key, r);
  }
  return [...best.values()].sort((a, b) => `${a.product}${a.price_type}`.localeCompare(`${b.product}${b.price_type}`));
}

// واحد حجم ITC («Tons») → فارسی
export const unitFa = (u) => (u === "Tons" || u === "Ton" ? "تن" : u);

// برای کشورهایی که (برخلاف ترکیه) یک مرز SVG واقعی و از‌قبل‌ترسیم‌شده ندارن —
// به‌جای پروجکشن با محدوده‌ی ثابت ترکیه (که نقطه‌های روسیه/هر کشور دیگه رو
// کاملاً بیرون از viewBox می‌انداخت و نقشه خالی به نظر می‌رسید)، محدوده‌ی
// جغرافیایی رو خودکار از روی خودِ نقطه‌ها (کارخانه/بندر/مرز) می‌سازیم.
export const GENERIC_VIEWBOX = "0 0 1000 560";

export function computeAutoBounds(points) {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const latMin = Math.min(...lats);
  const latMax = Math.max(...lats);
  const lonMin = Math.min(...lons);
  const lonMax = Math.max(...lons);

  // پدینگ نسبی تا نقطه‌ها به لبه‌ی نقشه نچسبن؛ اگر همه‌ی نقطه‌ها روی یک
  // نصف‌النهار/مدار باشن (بازه صفر)، یک بازه‌ی حداقلی فرض می‌شه تا تقسیم بر صفر نشه.
  const latSpan = Math.max(latMax - latMin, 2);
  const lonSpan = Math.max(lonMax - lonMin, 2);
  const pad = 0.25;

  return {
    latMin: latMin - latSpan * pad,
    latMax: latMax + latSpan * pad,
    lonMin: lonMin - lonSpan * pad,
    lonMax: lonMax + lonSpan * pad,
    width: 1000,
    height: 560,
  };
}

export function projectGeneric(lat, lon, bounds) {
  const { lonMin, lonMax, latMin, latMax, width, height } = bounds;
  const x = ((lon - lonMin) / (lonMax - lonMin)) * width;
  const y = ((latMax - lat) / (latMax - latMin)) * height;
  return [x, y];
}

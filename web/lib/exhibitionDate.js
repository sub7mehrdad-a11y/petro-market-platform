// استخراج تاریخ شروع نمایشگاه از رشته‌ی آزاد فارسی («۱۵ تا ۱۷ جولای ۲۰۲۶»، «اوت (۴–۶ اوت ۲۰۲۶)»، ...).
// عمداً یک محاسبه‌ی قطعی (نه هوش مصنوعی) — چون این یک تجزیه‌ی متنی ساده‌ست،
// نه چیزی که نیاز به استنتاج داشته باشه؛ اگه تاریخ قابل‌تشخیص نبود، null
// برمی‌گردونه (چیزی حدس نمی‌زنه)، مثل رویکرد geo_data.py برای فاصله‌ها.

const FA_MONTHS = {
  "ژانویه": 1, "فوریه": 2, "مارس": 3, "آوریل": 4, "مه": 5, "ژوئن": 6,
  "ژوئیه": 7, "جولای": 7, "اوت": 8, "آگوست": 8, "سپتامبر": 9,
  "اکتبر": 10, "نوامبر": 11, "دسامبر": 12,
};

function faDigitsToEn(str) {
  return str.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
}

export function parseExhibitionStartDate(dateStr) {
  if (!dateStr) return null;
  const normalized = faDigitsToEn(dateStr);

  let month = null;
  for (const [name, num] of Object.entries(FA_MONTHS)) {
    if (dateStr.includes(name)) {
      month = num;
      break;
    }
  }
  const yearMatch = normalized.match(/\b(20\d{2})\b/);
  if (!month || !yearMatch) return null;

  const dayMatch = normalized.match(/\b(\d{1,2})\b/);
  const day = dayMatch ? parseInt(dayMatch[1], 10) : 1;
  const year = parseInt(yearMatch[1], 10);

  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

// روزهای مانده تا تاریخ شروع، نسبت به الان. منفی یعنی گذشته.
export function daysUntil(date) {
  if (!date) return null;
  const now = new Date();
  const startOfToday = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((date.getTime() - startOfToday) / (1000 * 60 * 60 * 24));
}

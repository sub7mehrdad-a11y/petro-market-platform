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

// همه‌ی تاریخ‌های داخل یک رشته‌ی آزاد (مثل «دوره ۲۰۲۶ بمبئی: ۱۷ تا ۱۹ سپتامبر؛ دوره ۲۰۲۷ دهلی‌نو: ۱۳ تا ۱۵ مارس»).
// جداکننده‌ی «؛» یا «;» یک بخش جدید می‌سازه؛ در هر بخش اولین ماه (به ترتیب موقعیت در متن، نه ترتیب فهرست) با
// نزدیک‌ترین سالِ همان بخش (یا بخش قبلی) و روز شروع (عدد چسبیده به ماه، مثل «۱۰ تا ۱۴ مارس» ← ۱۰) جفت می‌شه.
function allExhibitionDates(dateStr) {
  const monthNames = Object.keys(FA_MONTHS).sort((a, b) => b.length - a.length);
  const monthRe = new RegExp(monthNames.join("|"));
  const dayMonthRe = new RegExp("([۰-۹0-9]{1,2})(?:\\s*(?:تا|و|–|-)\\s*[۰-۹0-9]{1,2})?\\s*(" + monthNames.join("|") + ")");
  const dates = [];
  let lastYear = null;
  for (const seg of String(dateStr).split(/[؛;]/)) {
    const ascii = faDigitsToEn(seg);
    const yearMatch = ascii.match(/\b(20\d{2})\b/);
    if (yearMatch) lastYear = parseInt(yearMatch[1], 10);
    // ترجیح: «روز [تا روز] ماه» (مثل «۱۰ تا ۱۴ مارس»)؛ اگه نبود، اولین ماهِ متن با روز ۱.
    const dm = seg.match(dayMonthRe);
    const m = dm ? [dm[2]] : seg.match(monthRe);
    if (!m || lastYear == null) continue;
    const month = FA_MONTHS[m[0]];
    let day = dm ? parseInt(faDigitsToEn(dm[1]), 10) : 1;
    if (day < 1 || day > 31) day = 1;
    const date = new Date(Date.UTC(lastYear, month - 1, day));
    if (!Number.isNaN(date.getTime())) dates.push(date);
  }
  return dates;
}

// تاریخِ مرتبط با «الان»: نزدیک‌ترین تاریخ آینده؛ اگه همه گذشته‌ان، آخرین تاریخ گذشته. تاریخ قابل‌تشخیص نبود: null.
export function parseExhibitionStartDate(dateStr) {
  if (!dateStr) return null;
  const dates = allExhibitionDates(dateStr).sort((a, b) => a - b);
  if (dates.length === 0) return null;
  const now = new Date();
  const startOfToday = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return dates.find((d) => d.getTime() >= startOfToday) || dates[dates.length - 1];
}

// روزهای مانده تا تاریخ شروع، نسبت به الان. منفی یعنی گذشته.
export function daysUntil(date) {
  if (!date) return null;
  const now = new Date();
  const startOfToday = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((date.getTime() - startOfToday) / (1000 * 60 * 60 * 24));
}

// نمایشگاه‌های آینده (نزدیک‌ترین اول)، بعد گذشته‌ها (جدیدترین اول)، و تاریخ نامشخص همیشه ته لیست.
export function sortExhibitionsUpcomingFirst(list) {
  return [...list].sort((a, b) => {
    const da = daysUntil(parseExhibitionStartDate(a.date));
    const db = daysUntil(parseExhibitionStartDate(b.date));
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    if (da < 0 && db >= 0) return 1;
    if (db < 0 && da >= 0) return -1;
    return da < 0 ? db - da : da - db;
  });
}

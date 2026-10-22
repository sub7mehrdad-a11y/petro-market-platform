// نمایش تاریخ‌ها طبق قاعده‌ی طرح: تاریخ منبع/قیمت/خبر = میلادی با نام ماه فارسی («۱۱ اکتبر ۲۰۲۶»)،
// تاریخ سامانه/بارگذاری = شمسی با نام ماه. ISO خام هیچ‌جا نمایش داده نمی‌شود.
// تجزیه‌ی دستی (نه new Date) تا اختلاف منطقه‌ی زمانی روز را عوض نکند.

const MONTHS_GREGORIAN_FA = ["ژانویه", "فوریه", "مارس", "آوریل", "مه", "ژوئن", "ژوئیه", "اوت", "سپتامبر", "اکتبر", "نوامبر", "دسامبر"];
const faDigits = (s) => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

/** «2026-10-11» (یا با پسوند زمان) → «۱۱ اکتبر ۲۰۲۶»؛ اگر ISO نبود همان رشته برمی‌گردد. short=true → «۱۱ اکتبر». */
export function gregorianFa(value, { short = false } = {}) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  if (!m) return value ?? "";
  const month = MONTHS_GREGORIAN_FA[Number(m[2]) - 1];
  if (!month) return value;
  const day = faDigits(Number(m[3]));
  return short ? `${day} ${month}` : `${day} ${month} ${faDigits(m[1])}`;
}

/** تاریخ سامانه (ISO یا Date) → شمسی با نام ماه، مثل «۱۹ مهر ۱۴۰۵». */
export function jalaliFa(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return value ?? "";
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Tehran" }).format(d);
}

const EN_MONTHS = {
  january: "ژانویه", february: "فوریه", march: "مارس", april: "آوریل", may: "مه", june: "ژوئن",
  july: "ژوئیه", august: "اوت", september: "سپتامبر", october: "اکتبر", november: "نوامبر", december: "دسامبر",
};

/** برچسب آزاد تاریخ منبع («August 2026»، «Q2 2026») → ماه فارسی + ارقام فارسی؛ بقیه‌ی متن دست‌نخورده. */
export function sourceDateFa(value) {
  if (value == null || value === "") return value ?? "";
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return gregorianFa(s);
  return faDigits(s.replace(/[A-Za-z]+/g, (w) => EN_MONTHS[w.toLowerCase()] || w));
}

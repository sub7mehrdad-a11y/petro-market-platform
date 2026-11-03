// تاریخ و ستون‌های قالب گزارش فروش — مشترک بین قالب اکسل، تجزیه‌گر و تحلیل.

export const COLUMNS = [
  { key: "date", header: "تاریخ", width: 14, note: "تاریخ قرارداد/فاکتور؛ شمسی (۱۴۰۵/۰۸/۱۲) یا میلادی (2026-11-03) هر دو قبول است" },
  { key: "doc_no", header: "شماره قرارداد/فاکتور", width: 20, note: "اختیاری" },
  { key: "buyer", header: "شرکت طرف قرارداد", width: 30, note: "نام شرکت خریدار (الزامی)" },
  { key: "country", header: "کشور مقصد", width: 16, note: "فارسی (عراق) یا انگلیسی (Iraq)" },
  { key: "grade", header: "گرید", width: 14, note: "خوراکی / دامی / صنعتی / دارویی / سایر" },
  { key: "tons", header: "تناژ (تن)", width: 12, note: "عدد؛ بزرگ‌تر از صفر (الزامی)" },
  { key: "price", header: "قیمت واحد (بر تن)", width: 16, note: "عدد؛ به همان ارزِ ستون ارز (الزامی)" },
  { key: "incoterm", header: "اینکوترمز", width: 12, note: "FOB / CIF / CFR / EXW / FCA / DAP / DDP" },
  { key: "currency", header: "ارز", width: 9, note: "USD پیش‌فرض" },
  { key: "amount", header: "مبلغ کل", width: 14, note: "اختیاری؛ خالی باشد = تناژ × قیمت" },
  { key: "status", header: "وضعیت", width: 14, note: "پیش‌فاکتور / قرارداد / ارسال‌شده / تحویل‌شده / تسویه‌شده" },
  { key: "payment_terms", header: "شرایط پرداخت", width: 22, note: "اختیاری، مثلاً LC یا ۳۰٪ پیش‌پرداخت" },
  { key: "notes", header: "توضیحات", width: 30, note: "اختیاری" },
];

export const GRADES = ["خوراکی", "دامی", "صنعتی", "دارویی", "سایر"];
export const INCOTERMS = ["FOB", "CIF", "CFR", "EXW", "FCA", "DAP", "DDP"];
export const STATUSES = ["پیش‌فاکتور", "قرارداد", "ارسال‌شده", "تحویل‌شده", "تسویه‌شده"];
export const FOB_LIKE = ["FOB", "EXW", "FCA"]; // قیمت‌هایی که با «قیمت مرجع ۲۵۰ دلار FOB» قابل‌مقایسه‌اند

const P2A = "۰۱۲۳۴۵۶۷۸۹";
const A2A = "٠١٢٣٤٥٦٧٨٩";

export function digitsToLatin(s) {
  return String(s ?? "")
    .replace(/[۰-۹]/g, (d) => String(P2A.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(A2A.indexOf(d)))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
}

export function normalizeText(s) {
  return String(s ?? "")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[‌‏‎]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// تبدیل جلالی به میلادی (الگوریتم استاندارد jalaali) — مثال: ۱۴۰۵/۰۸/۱۲ → 2026-11-03
export function jalaliToGregorian(jy, jm, jd) {
  jy += 1595;
  let days = -355668 + 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const mdays = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  while (gm < 13 && gd > mdays[gm]) gd -= mdays[gm++];
  return [gy, gm, gd];
}

const pad = (n) => String(n).padStart(2, "0");
export const isoDate = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** مقدار سلول (Date | عدد سریال اکسل | متن شمسی/میلادی) → "YYYY-MM-DD" یا null */
export function parseDateCell(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return isoDate(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const m = digitsToLatin(v).trim().match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (!m) return null;
  let [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (y < 1700) [y, mo, d] = jalaliToGregorian(y, mo, d);
  return isoDate(y, mo, d);
}

// هفته‌ی ایرانی: شنبه تا جمعه. شروع هفته (شنبه) به‌صورت "YYYY-MM-DD".
export function weekStartOf(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const back = (dt.getUTCDay() + 1) % 7; // یکشنبه=0 … شنبه=6 → شنبه=0 عقب
  dt.setUTCDate(dt.getUTCDate() - back);
  return isoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return isoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function normalizeGrade(v) {
  const t = normalizeText(v).toLowerCase();
  if (!t) return "";
  if (/دام|طیور|feed|لبنیات|مرغ/.test(t)) return "دامی";
  if (/دارو|pharma/.test(t)) return "دارویی";
  if (/صنعت|industrial|tech/.test(t)) return "صنعتی";
  if (/خوراک|غذا|food/.test(t)) return "خوراکی";
  return "سایر";
}

export function normalizeStatus(v) {
  const t = normalizeText(v);
  if (!t) return "";
  const hit = STATUSES.find((s) => t.replace(/[\s‌]/g, "").includes(s.replace(/[\s‌]/g, "")));
  return hit || t;
}

// تاریخ، نرمال‌سازی و ثابت‌های گزارش فروش — مشترک بین تجزیه‌گر، قالب و تحلیل.
// فرمت مرجع: فایل «Sales Report 2026» تیم بازرگانی (سرستون‌های انگلیسی، فایل تجمعی از اول سال).

export const FOB_LIKE = ["FOB", "EXW", "FCA"]; // قیمت‌هایی که با «قیمت مرجع ۲۵۰ دلار FOB» قابل‌مقایسه‌اند
export const INCOTERMS = ["FOB", "EXW", "FCA", "CIF", "CFR", "CPT", "DAP", "DDP"];

export const STAGE_LABEL = { firm: "سفارش قطعی (PI صادرشده)", quote: "پیشنهاد/استعلام (هنوز سفارش نیست)", unknown: "نامشخص" };
export const PAYMENT_LABEL = { paid: "پرداخت‌شده", unpaid: "منتظر پرداخت", partial: "پیش‌پرداخت دریافت‌شد", unknown: "نامشخص" };

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

export function daysBetween(aIso, bIso) {
  const t = (s) => Date.UTC(...s.split("-").map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))));
  return Math.round((t(bIso) - t(aIso)) / 86400000);
}

export function todayIso() {
  const d = new Date();
  return isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function normalizeGrade(v) {
  const t = normalizeText(v).toLowerCase();
  if (!t) return "";
  if (/دام|طیور|feed|لبنیات|مرغ|poultry|dairy/.test(t)) return "دامی";
  if (/دارو|pharma/.test(t)) return "دارویی";
  if (/صنعت|industrial|tech/.test(t)) return "صنعتی";
  if (/خوراک|غذا|food/.test(t)) return "خوراکی";
  return "سایر";
}

/** «PI issued» = سفارش قطعی؛ «Just quoted» = فقط پیشنهاد؛ خالی = نامشخص */
export function normalizeStage(v) {
  const t = normalizeText(v).toLowerCase();
  if (!t) return "unknown";
  if (/pi\s*issued|issued|صادر|قطعی|قرارداد|contract/.test(t)) return "firm";
  if (/quot|offer|proposal|استعلام|پیشنهاد/.test(t)) return "quote";
  return "unknown";
}

export function normalizePayment(v) {
  const t = normalizeText(v).toLowerCase();
  if (!t) return "unknown";
  if (/yet\s*to\s*pay|unpaid|not paid|منتظر|پرداخت نشده/.test(t)) return "unpaid";
  if (/prepay|partial|advance received|پیش.?پرداخت/.test(t)) return "partial";
  if (/^done|paid|received|تسویه|پرداخت شده|پرداخت‌شده/.test(t)) return "paid";
  return "unknown";
}

export function extractIncoterm(v) {
  const m = String(v ?? "").toUpperCase().match(/\b(FCA|FOB|CIF|CFR|CPT|DAP|DDP|EXW)\b/);
  return m ? m[1] : "";
}

// فاصله‌ی ویرایشی (برای تصحیح غلط‌های املایی نام کشور مثل Aremenai → Armenia)
export function editDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return dp[m][n];
}

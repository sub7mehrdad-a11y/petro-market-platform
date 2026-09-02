import fs from "fs";
import path from "path";

// data/ و reports/ کنار web/ هستن (خواهر پوشه)، نه داخلش — چون هم اسکریپت‌های
// پایتون و هم سایت باید بهشون دسترسی داشته باشن.
const ROOT = path.join(process.cwd(), "..");
const DATA_DIR = path.join(ROOT, "data");
const REPORTS_DIR = path.join(ROOT, "reports");
const MANIFEST_FILE = path.join(REPORTS_DIR, "manifest.json");

function readJsonSafe(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function getPriceHistory() {
  return readJsonSafe(path.join(DATA_DIR, "price_history.json"), []);
}

// خروجی روتین ماهانه‌ی بررسی Intratec (نمونه‌ی رایگان محدود) — همون ارقام
// توی price_history.json هم منعکس شده (برای دیده‌شدن توی داشبورد اصلی)،
// این تابع فقط برای دسترسی مستقیم به تاریخچه‌ی کامل رکوردهاست.
export function getIntratecMonthly() {
  return readJsonSafe(path.join(DATA_DIR, "intratec_monthly.json"), []);
}

export function getFlatPriceRecords() {
  const batches = getPriceHistory();
  const rows = [];
  for (const batch of batches) {
    for (const r of batch.records || []) {
      rows.push({ ...r, batch_date: batch.date });
    }
  }
  return rows;
}

export function getNewsAnalysis() {
  const log = readJsonSafe(path.join(DATA_DIR, "news_analysis_log.json"), []);
  return [...log].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getReportsManifest() {
  return readJsonSafe(MANIFEST_FILE, []);
}

export function getReportsDir() {
  return REPORTS_DIR;
}

export function getManifestFile() {
  return MANIFEST_FILE;
}

export function getCompanies() {
  return readJsonSafe(path.join(DATA_DIR, "companies.json"), []);
}

export function getExhibitions() {
  return readJsonSafe(path.join(DATA_DIR, "exhibitions.json"), []);
}

export function getExhibition(id) {
  return getExhibitions().find((e) => e.id === id) || null;
}

// خروجی scripts/enrich_exhibitions.py — صنایع حاضر + خلاصه‌ی عملکرد دوره‌های قبل.
export function getExhibitionReport(id) {
  const reports = readJsonSafe(path.join(DATA_DIR, "exhibition_reports.json"), {});
  return reports[id] || null;
}

export function getParsedReport(id) {
  const manifest = getReportsManifest();
  const entry = manifest.find((r) => r.id === id);
  if (!entry || !entry.parsed_path) return null;
  const parsed = readJsonSafe(path.join(REPORTS_DIR, entry.parsed_path), null);
  return parsed ? { ...parsed, manifest: entry } : null;
}

// فهرست همه‌ی کشورهایی که حداقل توی یکی از منابع (شرکت/نمایشگاه/گزارش/قیمت) هستن.
// «جهانی» یک کشور واقعی نیست — برچسب گزارش‌های پس‌زمینه‌ی سراسری (مثل بازار
// جهانی سودا اش) که به هیچ کشور خاصی مربوط نمی‌شن؛ نباید توی صفحه‌ی
// /countries یا محاسبات فاصله/شریک‌تجاری ظاهر بشه.
const NON_COUNTRY_LABELS = new Set(["جهانی"]);

export function getCountries() {
  const set = new Set();
  for (const c of getCompanies()) if (c.country) set.add(c.country);
  for (const e of getExhibitions()) if (e.country) set.add(e.country);
  for (const r of getReportsManifest()) if (r.country) set.add(r.country);
  for (const name of Object.keys(getTradeMap())) set.add(name);
  for (const label of NON_COUNTRY_LABELS) set.delete(label);
  return Array.from(set).sort();
}

// خروجی scripts/ingest_trade_map.py — آمار جهانی صادرات/واردات محصول (ITC
// Trade Map، ۲۰۲۵) به تفکیک کشور. توجه: این داده دوطرفه نیست (نمی‌گه کدام
// کشور از کدام کشور می‌خره)، فقط رتبه‌بندی کلی جهانی هر کشوره.
export function getTradeMap() {
  return readJsonSafe(path.join(DATA_DIR, "trade_map_2025.json"), {});
}

export function getTradeMapForCountry(country) {
  return getTradeMap()[country] || null;
}

export function getCountrySummary(country) {
  const companies = getCompanies().filter((c) => c.country === country);
  const exhibitions = getExhibitions().filter((e) => e.country === country);
  const reports = getReportsManifest().filter((r) => r.country === country);
  const prices = getFlatPriceRecords().filter((p) => p.country_or_region === country);
  return { companies, exhibitions, reports, prices };
}

export function getCompetitors() {
  return readJsonSafe(path.join(DATA_DIR, "competitors.json"), {});
}

export function getCompetitor(id) {
  return getCompetitors()[id] || null;
}

// خروجی ایجنت‌های رصد اختصاصی رقبا (scripts/turkey_watch_bot.py, scripts/china_watch_bot.py) — جدیدترین اول.
function readWatchLog(fileName) {
  const log = readJsonSafe(path.join(DATA_DIR, fileName), []);
  return [...log].sort((a, b) => (a.generated_at < b.generated_at ? 1 : -1));
}

export function getTurkeyWatchLog() {
  return readWatchLog("turkey_watch_log.json");
}

export function getChinaWatchLog() {
  return readWatchLog("china_watch_log.json");
}

// نگاشت شناسه‌ی رقیب → گیرنده‌ی لاگ رصد روزانه‌اش (برای صفحه‌ی [id] و ایندکس جست‌وجو).
export const COMPETITOR_WATCH_LOG_GETTERS = {
  turkey: getTurkeyWatchLog,
  china: getChinaWatchLog,
};

// خروجی scripts/transit_watch_bot.py — پست‌های اعلام‌بار/کرایه از کانال‌های
// تلگرامی، برای بخش «تحلیل ترانزیت».
export function getTransitLog() {
  return readWatchLog("transit_log.json");
}

// همه‌ی پست‌های همه‌ی روزها را مسطح می‌کند (نه دسته‌بندی‌شده بر اساس روز اجرا)
// چون برای نمایش/تحلیل، خود پست‌ها مهم‌ان نه دسته‌ی روزانه‌شان.
//
// حذف تکراری‌ها ضروری است: یک پست اعلام‌بار چند روز روی کانال می‌ماند و در هر
// اجرای روزانه دوباره برداشت می‌شود. بدون این کار، یک محموله‌ی واحد چند بار در
// میانگین نرخ شمرده می‌شد و نمونه را بزرگ‌تر از چیزی که هست نشان می‌داد.
export function getTransitEntries() {
  const seen = new Set();
  const out = [];
  for (const batch of getTransitLog()) {
    for (const e of batch.entries || []) {
      // عمداً بدون note: مدل هر روز همان پست را با جمله‌بندی متفاوت خلاصه می‌کند،
      // پس note پایدار نیست. مسیر + تناژ + مبلغ، اثرانگشت پایدار یک محموله است.
      const key = [e.origin, e.destination, e.tonnage, e.price_amount]
        .map((v) => String(v ?? ""))
        .join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...e, batch_date: batch.date });
    }
  }
  return out;
}

// مختصات شهرها/مرزهایی که مسیرشون توی داده‌ی رصدشده دیده شده — منبع مشترک
// با scripts/transit_geo.py (همون فایل، دو مصرف‌کننده) تا دِریفت نکنن.
export function getTransitPlaces() {
  return readJsonSafe(path.join(DATA_DIR, "transit_places.json"), {});
}

// میانه (نه میانگین) — چون نمونه کوچک است و یک پست پرت (مثل یک مسیر خیلی کوتاه
// با کرایه‌ی مقطوع) میانگین را کاملاً جابه‌جا می‌کند.
function median(nums) {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function summarize(values) {
  if (values.length === 0) return { median: null, sampleSize: 0, min: null, max: null };
  return {
    median: median(values),
    sampleSize: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

// نرخ‌های مشاهده‌شده از پست‌های واقعی اعلام‌بار (فقط ریالی/تومانی).
//
// دو نرخ جدا برمی‌گردد چون بیشتر پست‌ها تناژ نمی‌نویسند و فقط کرایه‌ی کل ماشین
// را اعلام می‌کنند:
//   perKm    — تومان به ازای هر کیلومتر برای یک کامیون (نمونه‌ی بزرگ‌تر)
//   perTonKm — تومان به ازای هر تن-کیلومتر (فقط پست‌هایی که تناژ هم داشتند)
export function getTransitRateEstimate() {
  const entries = getTransitEntries().filter((e) => e.price_currency === "IRR");
  return {
    perKm: summarize(entries.filter((e) => e.rate_per_km != null).map((e) => e.rate_per_km)),
    perTonKm: summarize(
      entries.filter((e) => e.rate_per_ton_km != null).map((e) => e.rate_per_ton_km)
    ),
  };
}

// خروجی scripts/ingest_import_suppliers.py — واردات یک کشور به تفکیک مبدأ.
// برخلاف top_trade_partners در country_profiles.json (که هوش مصنوعی از متن
// گزارش‌ها بیرون کشیده)، این داده مستقیم از ITC می‌آید و عدد دقیق دارد.
export function getImportSuppliers(country) {
  const all = readJsonSafe(path.join(DATA_DIR, "import_suppliers.json"), {});
  return all[country] || null;
}

// خروجی scripts/ingest_iran_exports.py — صادرات واقعی ایران (نه واردات جهانی)
// به تفکیک کشور مقصد، مستقیم از آمار رسمی گمرک جمهوری اسلامی ایران (IRICA).
// فقط برای صفحه‌ی خودِ ایران معنا داره؛ برخلاف بقیه‌ی داده‌های تجاری سایت که
// از ITC Trade Map میان (دیدگاه واردکننده)، این یکی دیدگاه خودِ صادرکننده‌ست.
export function getIranExports() {
  return readJsonSafe(path.join(DATA_DIR, "iran_exports.json"), null);
}

export function getCountryProfile(country) {
  const profiles = readJsonSafe(path.join(DATA_DIR, "country_profiles.json"), {});
  return profiles[country] || null;
}

// برای «زنده‌سازی» گزارش‌های هوشمند: جدیدترین قیمت واقعی این کشور رو از
// price_history.json برمی‌گردونه (همیشه تازه، چون هر بار از روی داده‌ی فعلی
// محاسبه می‌شه، نه یک عدد ثابت که موقع ساخت گزارش ذخیره شده باشه).
export function getLatestPricesForCountry(country) {
  const rows = getFlatPriceRecords().filter((r) => r.country_or_region === country && r.value != null);
  const newestFirst = [...rows].reverse();
  const seen = new Set();
  const latest = [];
  for (const r of newestFirst) {
    const key = `${r.product}|${r.price_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(r);
  }
  return latest;
}

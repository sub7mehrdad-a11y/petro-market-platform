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

// price_history.json کشورها رو به انگلیسی ساده ثبت می‌کنه ("Turkey"، "China")،
// نه اسم رسمی country_name_map.json ("Türkiye") و نه فارسی سایت ("ترکیه"). دو
// جا (قیمت‌های زنده‌ی گزارش‌های هوشمند و جدول قیمت صفحه‌ی هر کشور) با اسم فارسی
// جست‌وجو می‌کردن و همیشه، برای همه‌ی کشورها، خالی برمی‌گشتن — این alias همون
// چندتا استثنا رو به نام رسمی country_name_map.json وصل می‌کنه.
const PRICE_COUNTRY_EN_ALIASES = { Turkey: "Türkiye", USA: "United States of America" };

function priceCountryToFa(enName, nameMap) {
  if (!enName) return null;
  const base = enName.replace(/\s*\(.*?\)\s*$/, "").trim(); // "Turkey (Intratec)" -> "Turkey"
  const key = PRICE_COUNTRY_EN_ALIASES[base] || base;
  return nameMap[key]?.fa || null;
}

export function getFlatPriceRecords() {
  const batches = getPriceHistory();
  const nameMap = readJsonSafe(path.join(ROOT, "scripts", "country_name_map.json"), {});
  const rows = [];
  for (const batch of batches) {
    for (const r of batch.records || []) {
      rows.push({ ...r, batch_date: batch.date, country_fa: priceCountryToFa(r.country_or_region, nameMap) });
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
  const prices = getFlatPriceRecords().filter((p) => p.country_fa === country);
  return { companies, exhibitions, reports, prices };
}

export function getCompetitors() {
  return readJsonSafe(path.join(DATA_DIR, "competitors.json"), {});
}

export function getCompetitor(id) {
  return getCompetitors()[id] || null;
}

// آیا این کشور یک پروفایل رقیب اختصاصی داره (ترکیه/چین/روسیه)؟ برای نشان
// «گزارش اختصاصی» روی کارت صفحه‌ی کشورها — قبلاً فقط country_profiles.json
// (داده‌ی جغرافیایی/فاصله، بی‌ربط به عمق تحقیق) رو چک می‌کرد و چین/روسیه رو
// جا می‌نداخت با اینکه پروفایل رقیب کامل دارن.
export function getCompetitorForCountry(country) {
  const competitors = getCompetitors();
  return Object.values(competitors).find((c) => c.name === country) || null;
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

// برای نمایش «صادرات ایران به این کشور» بالای صفحه‌ی هر کشور مقصد (نه فقط
// صفحه‌ی خودِ ایران) — همون دیتای iran_exports.json، فقط یک ردیف پیدا می‌شه.
export function getIranExportToCountry(country) {
  const data = getIranExports();
  if (!data) return null;
  return data.destinations_1404_10m.find((d) => d.country_fa === country) || null;
}

// خروجی scripts/ingest_country_population.py (World Bank Open Data، آخرین سال موجود هر کشور).
export function getCountryPopulation(country) {
  const data = readJsonSafe(path.join(DATA_DIR, "country_population.json"), {});
  return data[country] || null;
}

// مصرف سرانه + برآورد بازار مصرف هر کشور (تن در سال).
//
// برای ۱۱ کشوری که رقم سرانه‌ی واقعی/برآوردی مستقیم دارن (از گزارش «مصرف
// جهانی جوش شیرین»)، همون رقم استفاده می‌شه. برای بقیه‌ی کشورها، به‌جای یک
// میانگین جهانی ثابت (که کاربر درست گفت تلورانسش خیلی زیاده — یک کشور اروپایی
// و یک کشور کم‌درآمد آفریقایی نباید عدد یکسان بگیرن)، بر اساس سطح توسعه‌ی
// کشور (developed / developing / least_developed — از سطح درآمد World Bank،
// در ingest_country_population.py) یکی از سه میانگین tier_averages استفاده
// می‌شه. اگه تیر کشور نامشخص بود (چند مورد خیلی کوچیک/بدون طبقه‌بندی)، به
// میانگین جهانی برمی‌گردیم — نه اینکه چیزی نشون ندیم.
//
// همیشه با is_population_based=true مشخص می‌شه که این یک برآورده، نه رقم
// گزارش‌شده‌ی واقعی آن کشور.
export function getPerCapitaConsumption(country) {
  const data = readJsonSafe(path.join(DATA_DIR, "per_capita_consumption.json"), null);
  if (!data) return null;

  const explicit = data.countries.find((c) => c.country_fa === country);
  const popInfo = getCountryPopulation(country);
  const population = popInfo?.population ?? null;

  if (explicit) {
    return {
      ...explicit,
      is_population_based: false,
      population,
      estimated_tons: population != null ? Math.round((population * explicit.kg_per_capita) / 1000) : null,
    };
  }

  // بدون رقم مستقیم: فقط اگه جمعیت داشته باشیم برآورد می‌سازیم؛ وگرنه چیزی
  // نداریم که نشون بدیم (نه یک عدد بی‌پایه).
  if (population == null) return null;

  const tierInfo = popInfo?.tier ? data.tier_averages?.[popInfo.tier] : null;
  const kgPerCapita = tierInfo?.kg_per_capita ?? data.world_average_kg_per_capita;

  return {
    country_fa: country,
    kg_per_capita: kgPerCapita,
    tier: popInfo?.tier || null,
    is_estimated: true,
    is_population_based: true,
    population,
    estimated_tons: Math.round((population * kgPerCapita) / 1000),
  };
}

export function getCountryProfile(country) {
  const profiles = readJsonSafe(path.join(DATA_DIR, "country_profiles.json"), {});
  return profiles[country] || null;
}

// برای «زنده‌سازی» گزارش‌های هوشمند: جدیدترین قیمت واقعی این کشور رو از
// price_history.json برمی‌گردونه (همیشه تازه، چون هر بار از روی داده‌ی فعلی
// محاسبه می‌شه، نه یک عدد ثابت که موقع ساخت گزارش ذخیره شده باشه).
export function getLatestPricesForCountry(country) {
  const rows = getFlatPriceRecords().filter((r) => r.country_fa === country && r.value != null);
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

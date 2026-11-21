import { FOB_LIKE, addDays, daysBetween } from "./salesFormat";

// بررسی عملکرد صادرات به هر کشور — توابع خالص (بدون خواندن فایل). ورودی: ردیف‌های سفارش قطعی آخرین عکس مؤثر فروش + «بازار» همان کشور
// (از پروفایل/Trade Map، نگاه کن salesCountryServer.js). هیچ عددی حدسی نیست؛ هرجا داده نباشد null می‌ماند و رابط «—» نشان می‌دهد.

const round = (n, d = 0) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const sum = (rows, f) => rows.reduce((s, r) => s + (f(r) || 0), 0);
const median = (xs) => {
  const a = xs.filter((x) => x != null).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

function wavg(rows) {
  const priced = rows.filter((r) => r.currency === "USD" && r.price != null && r.tons > 0);
  const t = sum(priced, (r) => r.tons);
  return t > 0 ? round(sum(priced, (r) => r.price * r.tons) / t, 1) : null;
}

/** نمای فروش ما به یک کشور از ردیف‌های قطعی. window = تعداد ماه‌های پنجره‌ی داده (از اولین سفارش کل گزارش تا تاریخ گزارش). */
export function salesToCountry(firmRows, country, asOf, windowMonths) {
  const rows = firmRows.filter((r) => r.country === country);
  const dated = rows.filter((r) => r.date);
  const tons = round(sum(rows, (r) => r.tons), 1);
  const usdRows = rows.filter((r) => r.currency === "USD" && r.amount != null);
  const fob = rows.filter((r) => FOB_LIKE.includes(r.incoterm));
  const byMonthMap = new Map();
  for (const r of dated) {
    const k = r.date.slice(0, 7);
    if (!byMonthMap.has(k)) byMonthMap.set(k, []);
    byMonthMap.get(k).push(r);
  }
  // ماه‌های بدون سفارش هم با صفر می‌آیند تا روند درست دیده شود
  const months = [];
  if (byMonthMap.size) {
    const keys = [...byMonthMap.keys()].sort();
    const end = asOf.slice(0, 7);
    for (let k = keys[0]; k <= end; ) {
      const rs = byMonthMap.get(k) || [];
      months.push({ month: k, tons: round(sum(rs, (r) => r.tons), 1), avg_price: wavg(rs), deals: rs.length });
      const [y, m] = k.split("-").map(Number);
      k = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    }
  }
  const inWin = (r, from, to) => r.date && r.date > addDays(asOf, -from) && r.date <= addDays(asOf, -to);
  const last90 = round(sum(dated.filter((r) => inWin(r, 90, 0)), (r) => r.tons), 1);
  const prev90 = round(sum(dated.filter((r) => inWin(r, 180, 90)), (r) => r.tons), 1);
  const lastDate = dated.map((r) => r.date).sort().pop() || null;
  return {
    country, deals: rows.length, buyers: new Set(rows.map((r) => r.buyer.toLowerCase())).size, tons,
    revenue_usd: round(sum(usdRows, (r) => r.amount)), avg_price: wavg(rows), avg_fob_price: wavg(fob),
    monthly_avg_tons: windowMonths > 0 ? round(sum(rows, (r) => r.tons) / windowMonths, 1) : null,
    first_date: dated.map((r) => r.date).sort()[0] || null, last_date: lastDate, days_since_last: lastDate ? daysBetween(lastDate, asOf) : null,
    last90_tons: last90, prev90_tons: prev90, trend_pct: prev90 > 0 ? round(((last90 - prev90) / prev90) * 100, 0) : null,
    months, rows,
  };
}

/** بازار واردات یک کشور از پروفایل/Trade Map. اولویت: گزارش اختصاصی (real_trade_stats) ← جدول واردات گزارش ← حجم کل پروفایل ← ITC. */
export function marketOf(profile, tradeMap, breakdownTons = null) {
  const itc = tradeMap?.imports_2025 || null;
  const itcTons = itc?.quantity != null && /ton/i.test(itc.quantity_unit || "") ? itc.quantity : null;
  let imports = null, source = null;
  if (profile?.real_trade_stats?.imports_tons != null) { imports = profile.real_trade_stats.imports_tons; source = "گزارش تحلیلی اختصاصی"; }
  else if (profile?.report_import_breakdown?.total_tons != null) { imports = profile.report_import_breakdown.total_tons; source = "گزارش تحلیلی اختصاصی"; }
  else if (profile?.total_import_volume?.value != null) { imports = profile.total_import_volume.value; source = "پروفایل کشور"; }
  else if (itcTons != null) { imports = itcTons; source = "ITC Trade Map ۲۰۲۵"; }
  // آمار ITC برای کشورهای کم‌گزارش‌دهنده (روسیه، افغانستان…) به‌شدت ناقص است؛ اگر مجموع تناژ تأمین‌کنندگان ثبت‌شده بیشتر بود همان بازار حساب می‌شود.
  if (source === "ITC Trade Map ۲۰۲۵" && breakdownTons > (imports || 0)) { imports = breakdownTons; source = "مجموع تأمین‌کنندگان ثبت‌شده (آمار ITC ناقص)"; }
  const unitValue = itc?.unit_value_usd ?? (itc?.value_usd_k != null && itcTons ? round((itc.value_usd_k * 1000) / itcTons) : null);
  return {
    imports_tons: imports, source, itc_imports_tons: itcTons, import_unit_value_usd: unitValue ?? null,
    consumption_tons: profile?.supply_stats?.apparent_consumption_tons ?? profile?.real_trade_stats?.apparent_consumption_max_tons ?? null,
    domestic_production_tons: profile?.supply_stats?.production_tons ?? profile?.real_trade_stats?.domestic_production_tons ?? null,
    tariff_note: profile?.tariff_note || null, has_report: !!(profile?.report_import_breakdown || profile?.real_trade_stats || profile?.supply_stats),
  };
}

/** جدول خلاصه‌ی کشورها (صفحه‌ی اول پلتفرم). countryNames: کشورهای دارای فروش + کشورهای دارای پروفایل. */
export function buildCountryTable(firmRows, asOf, windowMonths, countryNames, marketFor) {
  return countryNames.map((country) => {
    const s = salesToCountry(firmRows, country, asOf, windowMonths);
    const m = marketFor(country);
    const annualized = windowMonths > 0 ? round((s.tons / windowMonths) * 12, 0) : null;
    const unreliable = m.imports_tons > 0 && annualized != null && annualized > m.imports_tons;
    return {
      country, market_unreliable: unreliable, market_imports_tons: m.imports_tons, market_source: m.source, import_unit_value_usd: m.import_unit_value_usd,
      tons: s.tons, deals: s.deals, monthly_avg_tons: s.monthly_avg_tons, avg_price: s.avg_price, last_date: s.last_date, trend_pct: s.trend_pct,
      share_pct: m.imports_tons > 0 && annualized != null && !unreliable ? round((annualized / m.imports_tons) * 100, 1) : null, has_sales: s.deals > 0, has_report: m.has_report,
    };
  }).sort((a, b) => (b.tons || 0) - (a.tons || 0) || (b.market_imports_tons || 0) - (a.market_imports_tons || 0));
}

/**
 * جزئیات یک کشور. ctx: { windowMonths, market, suppliers:[{name,tons,unit_value}], competitors:[{name,unit_value,tons}] }
 *  - suppliers: تأمین‌کنندگان همین بازار (حجم/ارزش واحد، هر جا موجود)
 *  - competitors: صادرکنندگان بزرگ جهان (ارزش واحد صادراتی FOB ITC) برای جایگاه قیمتی
 */
export function buildCountryDetail(firmRows, asOf, country, ctx) {
  const s = salesToCountry(firmRows, country, asOf, ctx.windowMonths);
  const m = ctx.market;
  const annualized = ctx.windowMonths > 0 ? round((s.tons / ctx.windowMonths) * 12, 0) : null;
  // اگر صادرات سالانه‌شده‌ی ما از کل واردات ثبت‌شده‌ی کشور بیشتر است، آمار بازار ناقص است و سهم محاسبه نمی‌شود
  const unreliable = m.imports_tons > 0 && annualized != null && annualized > m.imports_tons;
  const share = m.imports_tons > 0 && annualized != null && !unreliable ? round((annualized / m.imports_tons) * 100, 1) : null;
  const shareToDate = m.imports_tons > 0 && !unreliable ? round((s.tons / m.imports_tons) * 100, 1) : null;

  // جایگاه قیمتی: قیمت FOB/FCA ما در برابر ارزش واحد صادراتی رقبا (و قیمت متوسط واردات خود کشور)
  const ours = s.avg_fob_price ?? s.avg_price;
  const comp = (ctx.competitors || []).filter((c) => c.unit_value != null);
  const prices = comp.map((c) => c.unit_value);
  const med = median(prices);
  const position = ours != null && prices.length
    ? { ours, median_competitor: round(med, 0), cheaper_than: prices.filter((p) => p > ours).length, of: prices.length, gap_pct: med ? round(((ours - med) / med) * 100, 1) : null }
    : null;

  // فقط سناریوهایی بالاتر از سهم فعلی (حداکثر سه تا)؛ با آمار ناقص بازار سناریو نمی‌آید
  const scenarioPcts = unreliable || !(m.imports_tons > 0) ? [] : [5, 10, 20, 30, 50].filter((x) => share == null || x > share).slice(0, 3);
  const scenarios = scenarioPcts.map((pct) => {
    const tons = m.imports_tons > 0 ? round((m.imports_tons * pct) / 100, 0) : null;
    return { share_pct: pct, tons, extra_tons: tons != null && annualized != null ? Math.max(0, round(tons - annualized, 0)) : null, revenue_usd: tons != null && ours != null ? round(tons * ours, 0) : null };
  });

  // نتیجه‌گیری قطعی (قاعده‌محور، بدون مدل): سهم، روند، قیمت، فاصله تا پتانسیل
  const notes = [];
  if (!s.deals) notes.push({ level: "info", text: "تاکنون سفارش قطعی به این کشور ثبت نشده است." });
  if (s.deals && unreliable) notes.push({ level: "warn", text: `واردات ثبت‌شده‌ی کشور (${m.imports_tons} تن) از صادرات سالانه‌شده‌ی ما (${annualized} تن) کمتر است؛ آمار بازار ناقص و سهم قابل‌محاسبه نیست.` });
  if (s.deals && share != null) notes.push({ level: "info", text: `سهم سالانه‌شده از واردات کشور حدود ${share}٪ (${annualized} تن در برابر ${m.imports_tons} تن).` });
  if (s.trend_pct != null) notes.push({ level: s.trend_pct < -20 ? "warn" : "info", text: `تناژ ۹۰ روز اخیر ${s.trend_pct > 0 ? "+" : ""}${s.trend_pct}٪ نسبت به ۹۰ روز قبل (${s.last90_tons} در برابر ${s.prev90_tons} تن).` });
  if (s.days_since_last != null && s.days_since_last > 45) notes.push({ level: "warn", text: `${s.days_since_last} روز از آخرین سفارش گذشته است.` });
  if (position?.gap_pct != null) notes.push({ level: position.gap_pct > 15 ? "warn" : "info", text: `میانگین قیمت ما ${Math.abs(position.gap_pct)}٪ ${position.gap_pct >= 0 ? "بالاتر" : "پایین‌تر"} از میانه‌ی قیمت صادراتی رقبا (${position.median_competitor} دلار).` });
  if (ours != null && m.import_unit_value_usd != null) {
    const d = round(((ours - m.import_unit_value_usd) / m.import_unit_value_usd) * 100, 0);
    notes.push({ level: "info", text: `قیمت ما ${Math.abs(d)}٪ ${d >= 0 ? "بالاتر" : "پایین‌تر"} از متوسط قیمت واردات کشور (${m.import_unit_value_usd} دلار؛ شامل کرایه و بیمه).` });
  }
  if (m.imports_tons > 0 && annualized != null && share != null && share < 5 && m.imports_tons >= 1000) notes.push({ level: "info", text: `بازار ${m.imports_tons} تن در سال است؛ رسیدن به سهم ۱۰٪ حدود ${Math.max(0, round(m.imports_tons * 0.1 - annualized, 0))} تن در سال افزایش می‌خواهد.` });

  return { country, sales: s, market: m, market_unreliable: unreliable, annualized_tons: annualized, share_pct: share, share_to_date_pct: shareToDate, position, scenarios, suppliers: ctx.suppliers || [], competitors: comp, notes };
}

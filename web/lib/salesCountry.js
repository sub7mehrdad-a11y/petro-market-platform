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

/**
 * اصلاح اندازه‌ی بازار با آمار صادرات گمرک ایران (سالانه‌شده). گمرک ایران صادرات واقعی ایران را می‌دهد؛ جدول تأمین‌کنندگان بازار گاهی کمتر می‌گیرد (آمار ناقص کشور مقصد، برآورد میدانی).
 *  - ردیف «ایران» با تناژ هست و گمرک بیش از ۱۵٪ بزرگ‌تر است ⇒ تناژ ایران = گمرک و کل بازار به‌اندازه‌ی اختلاف بزرگ‌تر می‌شود؛
 *  - ردیف ایران نیست و کل بازار از گمرک کوچک‌تر است ⇒ بازار دست‌کم برابر گمرک (کف).
 * خروجی: { market, suppliers } جدید؛ market.customs_adjusted = "iran_row" | "floor" | undefined.
 */
export function adjustMarketByCustoms(market, suppliers, customsAnnual) {
  if (!(customsAnnual > 0) || !(market?.imports_tons > 0)) return { market, suppliers };
  const iran = (suppliers || []).find((s) => s.name === "ایران");
  const iranTons = Number(iran?.tons) || 0;
  const tag = (m, kind, total) => ({ ...m, imports_tons: total, customs_adjusted: kind, customs_iran_annual: customsAnnual, source: `${m.source || "آمار بازار"} · اصلاح با گمرک ایران` });
  if (iranTons > 0 && customsAnnual > iranTons * 1.15) {
    const total = round(market.imports_tons - iranTons + customsAnnual, 0);
    const sup = suppliers.map((s) => (s.name === "ایران" ? { ...s, tons: customsAnnual } : s)).map((s) => ({ ...s, share_pct: s.tons != null ? round((s.tons / total) * 100, 1) : s.share_pct }));
    return { market: tag(market, "iran_row", total), suppliers: sup };
  }
  if (!iranTons && customsAnnual > market.imports_tons) return { market: tag(market, "floor", customsAnnual), suppliers };
  return { market, suppliers };
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

export const MAIN_RIVALS = ["ترکیه", "چین", "روسیه", "هند"];

/**
 * گزارش مقایسه‌ای یک کشور: سهم ما از صادرات ایران، ترکیب بازار، صادرات ما در برابر رقبا، قیمت ما در برابر رقبا.
 * in: { ours (تن سالانه‌شده), ourPrice, market:{imports_tons,import_unit_value_usd}, suppliers:[{name,tons,unit_value}], rivalGlobal:{[name]:unit_value}, customs:{tons_10m,unit_price}|null }
 */
export function buildComparison({ ours, ourPrice, market, suppliers, rivalGlobal = {}, customs = null, ourPeriod = null }) {
  const find = (name) => (suppliers || []).find((x) => x.name === name) || null;
  const iranRow = find("ایران");
  const iranMarket = iranRow?.tons ?? null;
  const customsAnnual = customs?.tons_10m != null ? round((customs.tons_10m * 12) / 10, 0) : null;
  const share = (a, b) => (a != null && b > 0 ? round((a / b) * 100, 1) : null);
  // دوره‌ی آمار گمرک (مثلاً ۱۰ ماهه‌ی ۱۴۰۴ = مارس ۲۰۲۵ تا ژانویه ۲۰۲۶) با دوره‌ی فروش ما (از اولین قرارداد این کشور تا تاریخ گزارش) هم‌پوشانی دارد؟
  // بدون هم‌پوشانی، «فروش ما > گمرک» کم‌اظهاری ثابت نمی‌کند (تغییر مسیر/بازار، قرارداد در برابر ارسال، خریدار در برابر مقصد).
  const cp = customs?.period || null;
  let overlapDays = null;
  if (cp && ourPeriod?.from && ourPeriod?.to) {
    const ms = (d) => Date.parse(`${d}T00:00:00Z`);
    overlapDays = Math.max(0, Math.round((Math.min(ms(cp.to), ms(ourPeriod.to)) - Math.max(ms(cp.from), ms(ourPeriod.from))) / 86400000));
  }
  const periodsDiffer = overlapDays != null && overlapDays < 30;
  const exceeds = (iranMarket != null && ours > iranMarket) || (customsAnnual != null && ours > customsAnnual);
  const iran = {
    customs_period: cp, our_period: ourPeriod, period_overlap_days: overlapDays, periods_differ: periodsDiffer, exceeds,
    market_tons: iranMarket, customs_tons_10m: customs?.tons_10m ?? null, customs_tons_annual: customsAnnual, customs_unit_price: customs?.unit_price ?? null,
    our_share_of_market_iran_pct: share(ours, iranMarket), our_share_of_customs_pct: share(ours, customsAnnual),
    iran_share_of_market_pct: share(iranMarket, market?.imports_tons),
    understated: exceeds && !periodsDiffer,
  };
  const rivals = MAIN_RIVALS.map((name) => {
    const r = find(name);
    return {
      name, tons: r?.tons ?? null, share_pct: share(r?.tons, market?.imports_tons), market_price: r?.unit_value ?? null, global_price: rivalGlobal[name] ?? null,
      ours_vs_tons: r?.tons > 0 && ours != null ? round(ours / r.tons, 2) : null,
    };
  });
  // ترکیب بازار (برای نمودار انباشته): ما، سایر ایران، رقبای اصلی، بقیه
  const T = market?.imports_tons > 0 ? market.imports_tons : null;
  const parts = [];
  if (ours > 0) parts.push({ label: "ما", tons: ours, tone: "us" });
  const iranOther = iranMarket != null ? Math.max(0, iranMarket - (ours || 0)) : null;
  if (iranOther > 0) parts.push({ label: "سایر ایران", tons: iranOther, tone: "iran" });
  for (const r of rivals) if (r.tons > 0) parts.push({ label: r.name, tons: r.tons, tone: "rival" });
  const used = parts.reduce((a, x) => a + x.tons, 0);
  const total = T != null ? Math.max(T, used) : used || null;
  if (total && total - used > 0.5) parts.push({ label: "سایر مبدأها", tons: round(total - used, 0), tone: "other" });
  const composition = total ? parts.map((x) => ({ ...x, tons: round(x.tons, 0), pct: round((x.tons / total) * 100, 1) })) : [];

  // مرجع‌های قیمتی
  const refs = [];
  if (ourPrice != null) refs.push({ label: "میانگین قیمت ما", value: ourPrice, tone: "us" });
  if (customs?.unit_price != null) refs.push({ label: "قیمت اظهاری گمرک ایران به این کشور", value: customs.unit_price, tone: "muted" });
  if (market?.import_unit_value_usd != null) refs.push({ label: "متوسط قیمت واردات کشور (CIF)", value: market.import_unit_value_usd, tone: "ref" });
  for (const r of rivals) {
    if (r.market_price != null) refs.push({ label: `${r.name} در این بازار`, value: r.market_price, tone: "muted" });
    else if (r.global_price != null) refs.push({ label: `${r.name} (قیمت صادراتی جهانی)`, value: r.global_price, tone: "muted" });
  }
  return { iran, rivals, composition, composition_total: total, price_refs: refs.sort((a, b) => b.value - a.value), our_tons: ours };
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

  const comparison = buildComparison({ ours: annualized, ourPrice: ours, market: m, suppliers: ctx.suppliers || [], rivalGlobal: ctx.rivalGlobal || {}, customs: ctx.customs || null, ourPeriod: s.first_date ? { from: s.first_date, to: asOf } : null });
  return { country, comparison, sales: s, market: m, market_unreliable: unreliable, annualized_tons: annualized, share_pct: share, share_to_date_pct: shareToDate, position, scenarios, suppliers: ctx.suppliers || [], competitors: comp, notes };
}

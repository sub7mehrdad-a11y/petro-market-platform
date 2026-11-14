import fs from "fs";
import path from "path";

// آزمون بازپخش کشورها — بخش دامنه‌ی جوش‌شیرین: هدف‌های قابل‌پیش‌بینی، استخراج «مقدار واقعی» از پروفایل کشورِ پژوهش‌شده،
// شاخص‌های عمومی کشور و خط مبنای «میانه‌ی کشورهای دیگر». موتور اجرا و سنجش در هسته است (learning/countryBacktest.js).
// داده‌ی خودِ کشور هدف (تفکیک مبدأ، Trade Map، گزارش) هیچ‌وقت به ورودی مدل نمی‌رود؛ فقط شاخص‌های عمومی و کشورهای دیگر.

const dataDir = () => process.env.BRAIN_DATA_DIR || path.join(process.cwd(), "..", "data");
const readJson = (name, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ dataDir(), name), "utf-8"));
  } catch {
    return fallback;
  }
};

/** توضیح کالا/بازار برای دستور مدل (هسته نمی‌داند محصول چیست). */
export const COUNTRY_INTRO = "بازار واردات بیکربنات سدیم (جوش‌شیرین، HS ۲۸۳۶۳۰) در یک کشور؛ فروشنده یک تولیدکننده‌ی ایرانی است که می‌خواهد به آن کشور صادر کند.";

export const COUNTRY_TARGETS = [
  { id: "imports_tons", label: "واردات ناخالص سالانه (آخرین سال پژوهش)", unit: "تن", kind: "number" },
  { id: "consumption_tons", label: "مصرف ظاهری سالانه", unit: "تن", kind: "number" },
  { id: "per_capita_kg", label: "مصرف سرانه", unit: "کیلوگرم برای هر نفر در سال", kind: "number" },
  { id: "top_supplier_share_pct", label: "سهم بزرگ‌ترین تأمین‌کننده از حجم واردات", unit: "درصد", kind: "number" },
  { id: "iran_share_pct", label: "سهم ایران از حجم واردات", unit: "درصد", kind: "number" },
  { id: "domestic_production", label: "وجود تولید تجاری داخلی (احتمال بله)", unit: "احتمال", kind: "probability" },
  { id: "tariff_pct", label: "نرخ تعرفه‌ی گمرکی رایج بر واردات", unit: "درصد", kind: "number" },
];

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const median = (xs) => {
  const v = xs.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const mode = (xs) => {
  const c = new Map();
  for (const x of xs) if (x !== null && x !== undefined) c.set(x, (c.get(x) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

function truthOf(profile, pop, suppliers) {
  const ss = profile.supply_stats || {};
  const rb = profile.report_import_breakdown || {};
  const rt = profile.real_trade_stats || {};
  const imports = num(rt.imports_tons) ?? num(rb.total_tons) ?? num(profile.total_import_volume?.value);
  const consumption = num(ss.apparent_consumption_tons) ?? (num(rt.apparent_consumption_min_tons) !== null && num(rt.apparent_consumption_max_tons) !== null ? (rt.apparent_consumption_min_tons + rt.apparent_consumption_max_tons) / 2 : null);
  const perCapita = num(ss.per_capita_kg) ?? (consumption !== null && num(pop?.population) ? Math.round((consumption * 1000 * 100) / pop.population) / 100 : null);
  const list = (rb.suppliers || []).filter((s) => s.country !== "سایر" && num(s.tons));
  const total = num(rb.total_tons) ?? (list.length ? (rb.suppliers || []).reduce((a, s) => a + (num(s.tons) || 0), 0) : null);
  const top = list.length && total ? Math.round((Math.max(...list.map((s) => s.tons)) / total) * 1000) / 10 : null;
  const iran = list.find((s) => s.country === "ایران");
  const iranShare = iran && total ? Math.round((iran.tons / total) * 1000) / 10 : null;
  const production = num(ss.production_tons);
  const tariff = mode((suppliers?.suppliers || []).map((s) => num(s.tariff_pct)));
  return {
    imports_tons: imports, consumption_tons: consumption, per_capita_kg: perCapita, top_supplier_share_pct: top, iran_share_pct: iranShare,
    domestic_production: production === null ? null : production > 0 ? 1 : 0, tariff_pct: tariff,
  };
}

/** ردیف هر کشورِ پروفایل‌دار: شاخص‌های عمومی + مقدارهای واقعیِ قابل‌استخراج (null = موجود نیست). کشوری که هیچ مقداری ندارد (مثل رقیب صادرکننده) نمی‌آید. */
export function loadCountryTable() {
  const profiles = readJson("country_profiles.json", {});
  const pops = readJson("country_population.json", {});
  const sup = readJson("import_suppliers.json", {});
  const rows = [];
  for (const [country, profile] of Object.entries(profiles)) {
    const pop = pops[country] || null;
    const truth = truthOf(profile, pop, sup[country] || sup.countries?.[country]);
    if (Object.values(truth).every((v) => v === null)) continue;
    rows.push({
      country,
      indicators: pop ? { population: pop.population ?? null, income_level: pop.income_level ?? null, tier: pop.tier ?? null, urban_pct: num(pop.urban_pct) !== null ? Math.round(pop.urban_pct * 10) / 10 : null, gdp_per_capita_usd: num(pop.gdp_per_capita_usd) !== null ? Math.round(pop.gdp_per_capita_usd) : null } : {},
      truth,
    });
  }
  return rows;
}

/** خط مبنا (میانه‌ی کشورهای دیگرِ دارای مقدار) برای هر هدف؛ null اگر محاسبه‌شدنی نیست. others بدون کشور هدف است. */
export function baselineFor(targetId, row, others) {
  const med = (id) => median(others.map((o) => o.truth[id]));
  const pcMed = med("per_capita_kg");
  const pop = row.indicators?.population;
  if (targetId === "per_capita_kg") return pcMed;
  if (targetId === "consumption_tons" || targetId === "imports_tons") return pcMed !== null && pop ? Math.round((pcMed * pop) / 1000) : null;
  if (targetId === "domestic_production") {
    const v = others.map((o) => o.truth.domestic_production).filter((x) => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }
  return med(targetId);
}

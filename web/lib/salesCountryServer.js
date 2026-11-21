import fs from "fs";
import path from "path";
import { getCountryImportBreakdown, getCountryProfile, getTradeMap, getTradeMapForCountry } from "./data";
import { readEffectiveSnapshots } from "./salesContractsStore";
import { daysBetween } from "./salesFormat";
import { buildCountryDetail, buildCountryTable, marketOf } from "./salesCountry";

// بارگذاری داده برای بررسی عملکرد صادرات به کشورها: ردیف‌های فروش + بازار هر کشور از پروفایل/Trade Map.

function profileCountries() {
  try {
    return Object.keys(JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data", "country_profiles.json"), "utf-8")));
  } catch {
    return [];
  }
}

export function loadSalesBase() {
  const snaps = readEffectiveSnapshots();
  const latest = snaps[snaps.length - 1];
  if (!latest) return null;
  const firm = latest.rows.filter((r) => r.stage === "firm");
  const dates = firm.map((r) => r.date).filter(Boolean).sort();
  const windowMonths = dates.length ? Math.max(1, Math.round((daysBetween(dates[0], latest.as_of) / 30.44) * 10) / 10) : 0;
  return { asOf: latest.as_of, firm, windowMonths };
}

const marketFor = (country) => {
  const br = getCountryImportBreakdown(country);
  const tons = (br?.suppliers || []).reduce((sum, x) => sum + (Number(x.tons) || 0), 0);
  return marketOf(getCountryProfile(country), getTradeMapForCountry(country), tons || null);
};

export function countryTable() {
  const base = loadSalesBase();
  if (!base) return { empty: true, table: [] };
  const names = [...new Set([...base.firm.map((r) => r.country), ...profileCountries()])].filter(Boolean);
  return { empty: false, as_of: base.asOf, window_months: base.windowMonths, table: buildCountryTable(base.firm, base.asOf, base.windowMonths, names, marketFor) };
}

// رقبای اصلی صادراتی محصول (ارزش واحد صادراتی ۲۰۲۵ ITC؛ FOB). فقط رقبای تعریف‌شده‌ی پلتفرم، نه همه‌ی صادرکنندگان بزرگ (که بسته‌بندی خرده‌فروشی و گرید دارویی قیمت میانه را بالا می‌برند).
const MAIN_COMPETITORS = ["ترکیه", "چین", "روسیه", "هند"];
function mainCompetitors() {
  const tm = getTradeMap();
  const out = [];
  for (const name of MAIN_COMPETITORS) {
    const e = tm[name]?.exports_2025;
    if (e?.unit_value_usd != null) out.push({ name, unit_value: e.unit_value_usd, tons: e.quantity ?? null, src: "export" });
  }
  return out;
}

/** مبنای قیمت رقبا: تأمین‌کنندگان خودِ این بازار (ارزش واحد ثبت‌شده‌ی واردات) اگر ≥۳ مورد؛ وگرنه رقبای اصلی. */
function competitorsFor(suppliers) {
  const own = suppliers.filter((s) => s.unit_value != null && s.name !== "ایران").map((s) => ({ name: s.name, unit_value: s.unit_value, tons: s.tons, src: "market" }));
  if (own.length >= 3) return own;
  const seen = new Set(own.map((c) => c.name));
  return [...own, ...mainCompetitors().filter((c) => !seen.has(c.name))];
}

export function countryDetail(country) {
  const base = loadSalesBase();
  if (!base) return null;
  const br = getCountryImportBreakdown(country);
  const suppliers = (br?.suppliers || []).map((s) => ({
    name: s.country, tons: s.tons ?? null, share_pct: s.share_pct ?? null,
    unit_value: s.tons && s.value_usd_k != null ? Math.round((s.value_usd_k * 1000) / s.tons) : null,
  }));
  const d = buildCountryDetail(base.firm, base.asOf, country, { windowMonths: base.windowMonths, market: marketFor(country), suppliers, competitors: competitorsFor(suppliers) });
  const profile = getCountryProfile(country);
  return { ...d, as_of: base.asOf, window_months: base.windowMonths, breakdown_year: br?.year ?? null, port: profile?.port?.name || null, report_note: profile?.supply_stats?.note || null };
}

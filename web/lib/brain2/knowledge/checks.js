import { stable } from "../memory";
import { asciiDigits, periodEnd } from "./config";

// بررسی‌های ساده (کد) و مقایسه با حافظه (پروتکل ۶-۱ گام‌های ۲ و ۴): دامنه‌ی منطقی عدد، واحد، سال؛ و تناقض بین منابع مستقل.

const TONS_METRICS = /^(total_import_volume|import_total_tons|import_supplier_tons|iran_export_tons|iran_export_destination_tons|trade_map\.(imports|exports)\.quantity)$/;
const SHARE_METRICS = /^(import_supplier_share_pct|mirror\.supplier_share_pct|trade_map\.(imports|exports)\.share_world_pct)$/;

/** دلیل مشکوک‌بودن یک ادعا (رشته) یا null. */
export function sanityProblem(c, cfg) {
  const s = cfg.sanity;
  const v = c.value;
  const inR = (x, [lo, hi]) => x >= lo && x <= hi;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "مقدار عدد معتبر نیست";
    if (c.metric === "price") {
      const unit = String(c.unit || "");
      if (unit.startsWith("USD") && !inR(v, s.price_usd)) return `قیمت ${v} دلار خارج از دامنه‌ی منطقی ${s.price_usd.join(" تا ")} است`;
      if (unit.startsWith("CNY") && !inR(v, s.price_cny)) return `قیمت ${v} یوان خارج از دامنه‌ی منطقی ${s.price_cny.join(" تا ")} است`;
    }
    if (SHARE_METRICS.test(c.metric) && !inR(v, s.share_pct)) return `سهم ${v}٪ خارج از ۰ تا ۱۰۰ است`;
    if (TONS_METRICS.test(c.metric) && !inR(v, s.tons)) return `تناژ ${v} خارج از دامنه‌ی منطقی است`;
    if (c.metric === "distance_km" && !inR(v, s.distance_km)) return `فاصله ${v} کیلومتر خارج از دامنه‌ی منطقی است`;
    if (/avg_tariff_pct$/.test(c.metric) && !inR(v, s.tariff_pct)) return `تعرفه ${v}٪ خارج از دامنه‌ی منطقی است`;
    if (/^trade_map.imports.unit_value_usd$/.test(c.metric) && !inR(v, s.unit_value_usd)) return `ارزش واحد ${v} دلار خارج از دامنه‌ی منطقی است`;
  }
  const p = asciiDigits(c.period);
  if (/^\d{4}$/.test(p) && c.qualifiers?.calendar !== "شمسی" && !inR(+p, s.year)) return `سال ${p} خارج از دامنه‌ی منطقی است`;
  return null;
}

const toNum = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const normPeriod = (c) => {
  const e = periodEnd(c);
  return e ? e.slice(0, 4) : asciiDigits(c.period).trim();
};

/**
 * تناقض بین منابع مستقل. claims: ادعاهای باز؛ sourceKeyOf(claim) → کلید طبیعی منبع.
 * فقط جفت‌هایی که از «منبع‌های متفاوت» می‌آیند مقایسه می‌شوند (دو عدد از یک سند، تناقض نیستند).
 * برمی‌گرداند آرایه‌ی آیتم‌ها: {natural_key, group, label, subject, period, members:[{claim_key,metric,source,value,unit,period}], spread}
 */
export function findContradictions(claims, cfg, sourceKeyOf) {
  const out = [];
  const c = cfg.contradiction;
  // ۱) گروه‌های هم‌معنا (مثلاً حجم واردات: گزارش اختصاصی در برابر Trade Map)
  for (const g of c.groups) {
    const unitRe = new RegExp(g.unit_regex, "i");
    const by = new Map();
    for (const cl of claims) {
      if (!g.metrics.includes(cl.metric) || toNum(cl.value) === null || !unitRe.test(String(cl.unit || ""))) continue;
      const k = `${cl.subject}|${normPeriod(cl)}`;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(cl);
    }
    for (const [k, list] of by) {
      // از هر منبع یک نماینده (اولین)؛ دست‌کم دو منبع مستقل لازم است
      const perSource = new Map();
      for (const cl of [...list].sort((a, b) => a.natural_key.localeCompare(b.natural_key))) if (!perSource.has(sourceKeyOf(cl))) perSource.set(sourceKeyOf(cl), cl); // نماینده‌ی قطعی (ترتیب فایل اثر ندارد)
      const members = [...perSource.values()];
      if (members.length < 2) continue;
      const vals = members.map((m) => m.value).filter((x) => x > 0);
      if (vals.length < 2) continue;
      const spread = Math.max(...vals) / Math.min(...vals);
      if (spread <= 1 + g.tolerance) continue;
      const [subject, period] = k.split("|");
      out.push({ natural_key: `contradiction|${g.key}|${subject}|${period}`, kind: "contradiction", group: g.key, label: g.label, subject, period, spread: Math.round(spread * 100) / 100, members: members.map((m) => ({ claim_key: m.natural_key, metric: m.metric, source: sourceKeyOf(m), value: m.value, unit: m.unit, period: m.period })) });
    }
  }
  // ۲) آمار صادرات ایران در برابر آمار واردکننده (قاعده‌ی «آمار واردکننده معتبرتر»)
  const ir = c.iran_to_importer;
  const exporters = new Map();
  const importers = new Map();
  for (const cl of claims) {
    if (cl.metric === ir.exporter_metric && toNum(cl.value) !== null) exporters.set(cl.subject, cl);
    else if (cl.metric === ir.importer_metric && cl.qualifiers?.supplier === ir.supplier && toNum(cl.value) !== null) importers.set(cl.subject, cl);
  }
  for (const [country, e] of exporters) {
    const i = importers.get(country);
    if (!i || !(i.value > 0) || !(e.value > 0)) continue;
    const ratio = e.value / i.value;
    if (ratio >= ir.ratio_band[0] && ratio <= ir.ratio_band[1]) continue;
    out.push({ natural_key: `contradiction|iran_to_importer|${country}|2025`, kind: "contradiction", group: "iran_to_importer", label: ir.label, subject: country, period: "2025", spread: Math.round(Math.max(ratio, 1 / ratio) * 100) / 100, members: [e, i].map((m) => ({ claim_key: m.natural_key, metric: m.metric, source: sourceKeyOf(m), value: m.value, unit: m.unit, period: m.period })) });
  }
  return out;
}

/** امضای محتوای یک آیتم صف: اگر مقدارها عوض نشده باشند همان تناقض قبلی است (و تصمیم انسان معتبر می‌ماند). */
export const itemSignature = (item) => stable(item.members.map((m) => [m.claim_key, m.value]).sort());

import fs from "fs";
import path from "path";
import { flagStaleAnalyses, loadIndex, upsertAnalysis, upsertClaim, upsertSource } from "./memory";
import { periodOf } from "./periods";
import { ensureRepos } from "./schema";

// انتقال داده‌های فعلی پلتفرم (data/*.json) به «منبع» و «ادعا» (مرحله‌ی ۲؛ دستور ساخت و برنامه‌ی R1 بخش ۶).
// idempotent است: کلید طبیعی از دوباره‌نویسی جلوگیری می‌کند؛ مقدار تغییرکرده = بستن ردیف قدیمی + ردیف تازه با دلیل.
// بدون هیچ فراخوانی مدل. فروش/حسابداری/تجار وارد نمی‌شوند (محرمانه)، شرکت‌ها و نمایشگاه‌ها هم ادعا نیستند (موجودیت‌اند).
// برای داده‌ای که تاریخ ثبت واقعی ندارد (پروفایل‌های ثابت)، زمان باور سیستم = لحظه‌ی انتقال است؛ برای لاگ‌های روزانه
// (قیمت، اخبار، ترانزیت) زمان جمع‌آوری (collected_at) به‌کار می‌رود.

const DATA_DIR = () => process.env.BRAIN_DATA_DIR || path.join(process.cwd(), "..", "data");

function load(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ DATA_DIR(), name), "utf-8"));
  } catch {
    return fallback;
  }
}
const firstList = (x) => (Array.isArray(x) ? x : Object.values(x || {}).find(Array.isArray) || []);
const isScalar = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);
const numeric = (v) => typeof v === "number" && Number.isFinite(v);
const dayOf = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null);

/** نام‌های سنجه‌ها (واژگان ثابت؛ بخش ۴-۳) */
export const METRIC = {
  IMPORT_VOLUME: "total_import_volume",
  SUPPLIER_TONS: "import_supplier_tons",
  SUPPLIER_SHARE: "import_supplier_share_pct",
  PORT: "port_name",
  DISTANCE: "distance_km",
  TARIFF_NOTE: "tariff_note",
  PARTNER_NOTE: "trade_partner_note",
  UNION: "union_membership",
  PRICE: "price",
  IRAN_TONS: "iran_export_tons",
  IRAN_VALUE: "iran_export_value_usd",
};

export function runMigration({ now = new Date() } = {}) {
  ensureRepos();
  const idx = loadIndex();
  const nowIso = now.toISOString();
  const report = { started_at: nowIso, files: {} };

  /** ثبت منبع و برگرداندن کلید طبیعی‌اش (برای ادعاها). */
  const src = (key, spec, at = nowIso) => {
    upsertSource(idx, { key, ...spec }, { at });
    return key;
  };
  const claim = (spec, at = nowIso) => upsertClaim(idx, spec, { at });
  const count = (name, fn) => {
    const before = { ...idx.stats };
    fn();
    report.files[name] = { claims_new: idx.stats.claims_new - before.claims_new, claims_changed: idx.stats.claims_changed - before.claims_changed, claims_unchanged: idx.stats.claims_unchanged - before.claims_unchanged };
  };

  const profiles = load("country_profiles.json", {});
  const competitors = load("competitors.json", {});

  // ---------------------------------------------------------------- پروفایل کشورها (و بازارهای فقط‌-رقیب مثل روسیه)
  function profileClaims(country, prof, sourceKey, confidence) {
    const c = (metric, value, extra = {}) => {
      if (value === undefined || value === null || value === "") return;
      claim({ subject: country, metric, value, source_key: sourceKey, confidence, ...extra });
    };
    const tiv = prof.total_import_volume;
    if (tiv && numeric(tiv.value)) c(METRIC.IMPORT_VOLUME, tiv.value, { unit: tiv.unit, period: String(tiv.period ?? "") || null });
    if (prof.port?.name) c(METRIC.PORT, prof.port.name, { qualifiers: { kind: prof.port.kind || null } });
    (prof.top_trade_partners || []).forEach((p, i) => c(METRIC.PARTNER_NOTE, p.note, { qualifiers: { partner: p.country, order: i } }));
    for (const [to, km] of Object.entries(prof.distances_km || {})) if (numeric(km)) c(METRIC.DISTANCE, km, { unit: "km", qualifiers: { to } });
    const rb = prof.report_import_breakdown;
    if (rb) {
      if (numeric(rb.total_tons)) c("import_total_tons", rb.total_tons, { unit: "تن", period: String(rb.year ?? "") || null });
      (rb.suppliers || []).forEach((s, i) => {
        const q = { supplier: s.country, order: i };
        if (numeric(s.tons)) c(METRIC.SUPPLIER_TONS, s.tons, { unit: "تن", period: String(rb.year ?? "") || null, qualifiers: q });
        else if (numeric(s.share_pct)) c(METRIC.SUPPLIER_SHARE, s.share_pct, { unit: "%", period: String(rb.year ?? "") || null, qualifiers: q });
      });
      if (rb.note) c("import_breakdown_note", rb.note, { period: String(rb.year ?? "") || null });
    }
    Object.entries(prof.supply_stats || {}).forEach(([k, v], i) => {
      if (isScalar(v)) c(`supply_stats.${k}`, v, { qualifiers: { order: i } });
    });
    Object.entries(prof.real_trade_stats || {}).forEach(([k, v], i) => {
      if (isScalar(v)) c(`real_trade_stats.${k}`, v, { qualifiers: { order: i } });
    });
    if (prof.tariff_note) c(METRIC.TARIFF_NOTE, prof.tariff_note);
  }

  count("country_profiles", () => {
    for (const [country, prof] of Object.entries(profiles)) {
      const k = src(`profile:${country}`, { kind: "گزارش پژوهشی", origin: `پروفایل کشور (${country})`, url_or_ref: `data/country_profiles.json#${country}`, agent: "گزارش اختصاصی" });
      profileClaims(country, prof, k, 0.8);
    }
  });

  count("competitors", () => {
    for (const [cid, c] of Object.entries(competitors)) {
      const k = src(`competitor:${cid}`, { kind: "گزارش پژوهشی", origin: `تحلیل رقیب (${c.name || cid})`, url_or_ref: `data/competitors.json#${cid}`, agent: "گزارش اختصاصی" });
      const name = c.name || cid;
      for (const f of ["rank_note", "summary"]) if (c[f]) claim({ subject: name, metric: `competitor.${f}`, value: c[f], source_key: k, confidence: 0.7 });
      for (const h of c.headline_stats || []) if (h && h.label && (h.value !== undefined)) claim({ subject: name, metric: "competitor.headline_stat", value: h.value, source_key: k, qualifiers: { label: h.label }, confidence: 0.7 });
      // بازارِ فقط‌-رقیب (مثل روسیه): پرونده‌ی واردات از سند رقیب، مثل منطق build_brain.market_profiles
      if (c.name && !(c.name in profiles) && c.real_trade_stats?.imports_tons && c.report_import_breakdown?.suppliers) {
        profileClaims(c.name, { real_trade_stats: c.real_trade_stats, report_import_breakdown: c.report_import_breakdown }, k, 0.7);
      }
    }
  });

  // ---------------------------------------------------------------- Trade Map ۲۰۲۵
  count("trade_map_2025", () => {
    const tm = load("trade_map_2025.json", {});
    const k = src("trade_map_2025", { kind: "جدول آماری", origin: "ITC Trade Map", url_or_ref: "data/trade_map_2025.json", data_as_of: "2025", agent: "ingest" });
    const unitOf = (key, row) => (key.endsWith("_usd_k") ? "USD k" : key === "quantity" ? row.quantity_unit || null : key.endsWith("_pct") ? "%" : key.startsWith("unit_value") ? "USD/ton" : null);
    for (const [country, d] of Object.entries(tm)) {
      for (const dir of ["imports", "exports"]) {
        const row = d[`${dir}_2025`];
        if (!row) continue;
        for (const [key, v] of Object.entries(row)) {
          if (!numeric(v)) continue;
          claim({ subject: country, metric: `trade_map.${dir}.${key}`, value: v, unit: unitOf(key, row), period: "2025", source_key: k, confidence: 0.9 });
        }
      }
      const et = d.export_trend;
      if (et) for (const key of ["cagr_pct", "total_change_pct"]) if (numeric(et[key])) claim({ subject: country, metric: `trade_map.export_trend.${key}`, value: et[key], unit: "%", period: `${et.first_year}-${et.last_year}`, source_key: k, confidence: 0.9 });
    }
  });

  // ---------------------------------------------------------------- آمار آینه (WITS)
  count("market_share_history", () => {
    const m = load("market_share_history.json", {});
    const k = src("wits_mirror", { kind: "جدول آماری", origin: "WITS (آینه‌ی UN Comtrade)", url_or_ref: "data/market_share_history.json", agent: "ingest" });
    for (const mk of Object.values(m.markets || {})) {
      const importer = mk.importer_fa;
      if (!importer) continue;
      for (const y of mk.years || []) {
        if (numeric(y.total_usd_k)) claim({ subject: importer, metric: "mirror.import_total_usd_k", value: y.total_usd_k, unit: "USD k", period: String(y.year), source_key: k, confidence: 0.7 });
        for (const s of y.suppliers || []) {
          if (numeric(s.share_pct)) claim({ subject: importer, metric: "mirror.supplier_share_pct", value: s.share_pct, unit: "%", period: String(y.year), qualifiers: { supplier: s.country_fa || s.country_en }, source_key: k, confidence: 0.7 });
        }
      }
    }
  });

  // ---------------------------------------------------------------- سرانه‌ی مصرف، اتحادیه‌ها
  count("per_capita", () => {
    const pc = load("per_capita_consumption.json", {});
    const k = src("per_capita", { kind: "گزارش پژوهشی", origin: "گزارش مصرف جهانی جوش شیرین (IndexBox)", url_or_ref: "data/per_capita_consumption.json", agent: "گزارش اختصاصی" });
    for (const [country, v] of Object.entries(pc.countries || {})) {
      if (numeric(v.kg_per_capita)) claim({ subject: country, metric: "per_capita_kg", value: v.kg_per_capita, unit: "kg/person", qualifiers: { estimated: !!v.is_estimated }, source_key: k, confidence: v.is_estimated ? 0.4 : 0.7 });
    }
  });
  count("trade_unions", () => {
    const tu = load("trade_unions.json", {});
    const k = src("trade_unions", { kind: "گزارش پژوهشی", origin: "اتحادیه‌ها و توافق‌های تجاری", url_or_ref: "data/trade_unions.json", agent: "گزارش اختصاصی" });
    Object.values(tu.unions || {}).forEach((u, i) => {
      for (const member of u.members || []) {
        claim({ subject: member, metric: METRIC.UNION, value: u.short_fa, source_key: k, qualifiers: { union_id: u.id, iran_status_fa: u.iran_status_fa || null, order: i }, confidence: 0.8 });
      }
    });
  });

  // ---------------------------------------------------------------- قیمت‌ها (لاگ روزانه؛ هر دوره‌ی استاندارد = یک ادعا)
  count("price_history", () => {
    for (const day of firstList(load("price_history.json", []))) {
      const at = day.collected_at || `${day.date}T00:00:00.000Z`;
      for (const r of day.records || []) {
        if (r.value === null || r.value === undefined) continue;
        const p = periodOf(r.source_reported_date);
        if (!p.end) continue;
        const k = src(`price:${r.source_name}:${r.source_url || ""}`, { kind: "جدول آماری", origin: r.source_name || "نامشخص", url_or_ref: r.source_url || null, agent: "price_agent" }, at);
        claim({
          subject: r.country_or_region, metric: METRIC.PRICE, value: r.value, unit: `${r.currency || ""}/${r.unit || ""}`, period: p.label,
          qualifiers: { product: r.product, price_type: r.price_type, period_kind: p.kind }, source_key: k, confidence: 0.7, valid_from: p.end,
        }, at);
      }
    }
  });

  // ---------------------------------------------------------------- صادرات ایران (گمرک)؛ برچسب‌های کم‌اظهار/شمسی در مرحله‌ی ۳ قاعده می‌شود
  count("iran_exports", () => {
    const ie = load("iran_exports.json", {});
    const k = src("iran_customs", { kind: "جدول آماری", origin: ie.source || "گمرک جمهوری اسلامی ایران", url_or_ref: "data/iran_exports.json", agent: "ingest" });
    for (const y of ie.annual_totals || []) {
      const q = { is_partial_year: !!y.is_partial_year, months_covered: y.months_covered || null, calendar: "شمسی" };
      if (numeric(y.tons)) claim({ subject: "ایران", metric: METRIC.IRAN_TONS, value: y.tons, unit: "تن", period: String(y.year_fa), qualifiers: q, source_key: k, confidence: 0.5 });
      if (numeric(y.value_usd)) claim({ subject: "ایران", metric: METRIC.IRAN_VALUE, value: y.value_usd, unit: "USD", period: String(y.year_fa), qualifiers: q, source_key: k, confidence: 0.5 });
    }
  });

  // ---------------------------------------------------------------- خبر و رصد: منبع + سیگنال با اعتماد پایین، بدون مدل
  count("news", () => {
    for (const n of firstList(load("news_analysis_log.json", []))) {
      if (!n.headline_fa) continue;
      const s0 = (n.sources || [])[0] || {};
      const at = n.generated_at || `${n.date}T00:00:00.000Z`;
      const k = src(`news:${n.date}:${n.headline_fa.slice(0, 80)}`, { kind: "خبر", origin: s0.name || "خبر تحلیلی", url_or_ref: s0.url || null, published_at: n.date, data_as_of: n.date, agent: "news_agent" }, at);
      (n.key_facts || []).forEach((f, i) => claim({ subject: n.topic || "بازار", metric: "signal", value: f, period: n.date, qualifiers: { impact: n.impact || null, headline: n.headline_fa, i }, source_key: k, confidence: 0.3 }, at));
    }
  });
  count("watch_logs", () => {
    for (const [file, who] of [["turkey_watch_log.json", "ترکیه"], ["china_watch_log.json", "چین"]]) {
      for (const w of firstList(load(file, []))) {
        if (!w.headline_fa) continue;
        const at = w.generated_at || `${w.date}T00:00:00.000Z`;
        const k = src(`watch:${who}:${w.date}`, { kind: "خبر", origin: `رصد ${who}`, published_at: w.date, data_as_of: w.date, agent: "watch_agent" }, at);
        claim({ subject: who, metric: "signal", value: w.headline_fa, period: w.date, qualifiers: { kind: "watch", i: 0 }, source_key: k, confidence: 0.3 }, at);
        [...(w.company_updates || []), ...(w.logistics_updates || [])].forEach((u, i) => {
          const text = u.headline || u.summary;
          if (text) claim({ subject: who, metric: "signal", value: text, period: w.date, qualifiers: { kind: "watch_item", i: i + 1 }, source_key: k, confidence: 0.3 }, at);
        });
      }
    }
  });
  count("transit", () => {
    for (const day of firstList(load("transit_log.json", []))) {
      const at = day.generated_at || `${day.date}T00:00:00.000Z`;
      (day.entries || []).forEach((e, i) => {
        if (!e.price_amount) return;
        const k = src(`transit:${e.source_channel || "?"}`, { kind: "گزارش تاجر", origin: e.source_channel_name || e.source_channel || "کانال حمل", agent: "transit_agent" }, at);
        claim({ subject: `${e.origin}→${e.destination}`, metric: "freight_rate", value: e.price_amount, unit: e.price_currency || null, period: day.date, qualifiers: { cargo_type: e.cargo_type || null, i }, source_key: k, confidence: 0.4 }, at);
      });
    }
  });

  // ---------------------------------------------------------------- تحلیل: رتبه‌بندی قطعی‌ی کشورها (خروجی build_brain.py)
  const scores = load("brain/country_scores.json", null);
  const KEEP = new Set([METRIC.IMPORT_VOLUME, METRIC.SUPPLIER_TONS, METRIC.SUPPLIER_SHARE, METRIC.DISTANCE, METRIC.UNION, "trade_map.imports.quantity", "trade_map.imports.unit_value_usd", "trade_map.imports.growth_qty_5y_pct", "trade_map.imports.avg_tariff_pct", "mirror.supplier_share_pct"]);
  const claimsBySubject = new Map();
  for (const c of idx.claims.values()) {
    if (!KEEP.has(c.metric)) continue;
    if (!claimsBySubject.has(c.subject)) claimsBySubject.set(c.subject, []);
    claimsBySubject.get(c.subject).push(c.id);
  }
  if (scores?.countries) {
    for (const r of scores.countries) {
      upsertAnalysis(idx, {
        key: `scoring-v1:${r.country}`, analyst: "scoring-v1", method_version: scores.digest_version || null, model: null,
        statement: `${r.rank}. ${r.country} — ${r.score} (ردهٔ ${r.tier})`,
        claim_ids: (claimsBySubject.get(r.country) || []).sort(), payload: r,
      }, { at: nowIso });
    }
  }
  flagStaleAnalyses(idx, { at: nowIso });
  // پس از علامت کهنگی، تحلیل‌هایی که همین حالا بازسازی شدند تازه‌اند (بالا با claim_ids جدید upsert شده)

  report.finished_at = new Date().toISOString();
  report.stats = idx.stats;
  return report;
}

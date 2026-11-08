import fs from "fs";
import path from "path";
import { currentRows } from "../store";
import { listRules, RULES } from "../rules";
import { asciiDigits, daysBetween, loadKnowledgeConfig, metricClass, periodEnd } from "./config";
import { periodOf } from "../periods";

// بازیابی انتخابی (پروتکل ۶-۴): برای هر پیش‌بینی فقط بخشی از حافظه «به یاد آورده» می‌شود.
//   امتیاز = و۱×ارتباط + و۲×اهمیت + و۳×تازگی + و۴×اعتماد (ضرایب در analysts_config.json)
//   قاعده‌های «پذیرفته» همیشه می‌آیند؛ فهرست مواردِ بازیابی‌شده برای ثبت در پیش‌بینی (retrieved_ids) برمی‌گردد؛ آنچه بازیابی نشد پاک نمی‌شود.
// ورودی فقط حافظه‌ی عمومی است: هیچ داده‌ی فروش/مشتری و هیچ پیش‌بینی انسانی هرگز اینجا نیست.

let cache = null;
export function loadAnalystsConfig() {
  const file = path.join(process.env.BRAIN_DATA_DIR || path.join(process.cwd(), "..", "data"), "brain", "analysts_config.json");
  const st = fs.statSync(/* turbopackIgnore: true */ file);
  if (cache && cache.file === file && cache.mtime === st.mtimeMs) return cache.cfg;
  const cfg = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ file, "utf-8"));
  cache = { file, mtime: st.mtimeMs, cfg };
  return cfg;
}

const FLAG_LABEL = Object.fromEntries(RULES.map((r) => [r.key, r.label]));
const recency = (claim, today, kcfg) => {
  const end = periodEnd(claim);
  if (!end) return 1;
  const age = Math.max(0, daysBetween(end, today));
  return 0.5 ** (age / (kcfg.half_life_days[metricClass(claim.metric, kcfg)] || kcfg.half_life_days.annual));
};
const fmtVal = (v) => (typeof v === "number" ? (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : String(Math.round(v * 100) / 100)) : String(v).replace(/\s+/g, " ").slice(0, 220));

/** موضوع‌ها و واژه‌های مرتبط با یک پرسش (از تعریف خودِ پرسش، نه از متن آزاد). */
export function questionContext(question) {
  const t = question.target || {};
  const series = t.truth_source?.series || null;
  const subjects = [...new Set([t.region_fa, series?.country_or_region].filter(Boolean))];
  return { subjects, series, region: t.region_fa || "", month: t.target_month };
}

/**
 * pack: «statistical» | «event». برمی‌گرداند {text, items, retrieved_ids, claim_ids, rule_ids, series, stats}.
 * series: نقطه‌های همان سری قیمتِ پرسش (قدیمی→جدید) برای محاسبه‌ی روند توسط کد.
 */
export function retrieve({ question, pack, now = new Date(), asOf = null }) {
  // asOf: بازگشت زمانی حافظه (آزمون روی سابقه در حلقه‌ی ۳): فقط ردیف‌هایی که سیستم در آن لحظه باور داشت
  if (asOf) now = new Date(asOf);
  const acfg = loadAnalystsConfig();
  const kcfg = loadKnowledgeConfig();
  const pcfg = acfg.retrieval.packs[pack];
  if (!pcfg) throw new Error(`بسته‌ی بازیابی ناشناخته: ${pack}`);
  const w = acfg.retrieval.weights;
  const today = now.toISOString().slice(0, 10);
  const ctx = questionContext(question);
  const sources = new Map([...currentRows("sources").values()].map((s) => [s.id, s]));
  const keywords = [...acfg.retrieval.keywords_base, ctx.region].filter(Boolean).map((k) => k.toLowerCase());
  const regionKw = [ctx.region, ...ctx.subjects].filter(Boolean).map((k) => k.toLowerCase());

  const asMs = asOf ? new Date(asOf).getTime() : null;
  const claims = [...currentRows("claims").values()].filter((c) => (asMs === null ? !c.recorded_to && c.status !== "بسته‌شده" : new Date(c.recorded_from).getTime() <= asMs && (!c.recorded_to || new Date(c.recorded_to).getTime() > asMs) && c.status !== "بسته‌شده"));
  const cand = [];
  const seriesPts = [];
  for (const c of claims) {
    const isSeries = ctx.series && c.metric === "price" && c.subject === ctx.series.country_or_region && c.qualifiers?.product === ctx.series.product && c.qualifiers?.price_type === ctx.series.price_type;
    if (isSeries) { seriesPts.push(c); continue; }
    if (c.metric === "price" && ctx.series) continue; // قیمت با نوع/محصول دیگر (مثلاً سی‌آی‌اف) با این پرسش قابل‌مقایسه نیست (قاعده‌ی نوع قیمت)
    const related = ctx.subjects.includes(c.subject);
    if (c.metric === "signal") {
      if (!pcfg.include.includes("signals")) continue;
      const text = String(c.value).toLowerCase();
      const rel = regionKw.some((k) => text.includes(k)) ? 0.8 : keywords.some((k) => text.includes(k)) ? 0.4 : 0;
      if (rel > 0) cand.push({ c, rel, kind: "signal" });
    } else if (related && pcfg.include.includes("annual_claims") && typeof c.value === "number" && ["annual", "price"].includes(metricClass(c.metric, kcfg))) { // فقط عددهای سنجه‌ای (نه متن/ایستا مثل عضویت اتحادیه)
      cand.push({ c, rel: c.metric === "price" ? 0.9 : 0.7, kind: "claim" });
    } else if (related && pcfg.include.includes("signals") && c.metric === "price") {
      cand.push({ c, rel: 0.6, kind: "claim" });
    }
  }
  for (const x of cand) x.score = w.relevance * x.rel + w.importance * (x.c.importance ?? 0.5) + w.recency * recency(x.c, today, kcfg) + w.confidence * (x.c.confidence ?? 0.5);
  cand.sort((a, b) => b.score - a.score || a.c.natural_key.localeCompare(b.c.natural_key));

  // سری همان پرسش: همیشه (آخرین N نقطه)، قدیمی→جدید
  const ordered = seriesPts
    .map((c) => ({ c, end: periodOf(asciiDigits(c.period)).end || "" }))
    .sort((a, b) => a.end.localeCompare(b.end) || a.c.natural_key.localeCompare(b.c.natural_key));
  const seriesTail = ordered.slice(-pcfg.series_points).map((x) => x.c);
  const series = ordered.map((x) => ({ period: x.c.period, value: x.c.value, unit: x.c.unit, source: sources.get(x.c.source_ids?.[0])?.origin || null }));

  const lineOf = (c, tag) => {
    const flags = (c.rule_flags || []).map((k) => FLAG_LABEL[k]).filter(Boolean);
    const q = c.qualifiers && Object.keys(c.qualifiers).length && c.metric !== "signal" ? ` {${Object.entries(c.qualifiers).filter(([k]) => ["price_type", "product", "supplier", "to"].includes(k)).map(([k, v]) => `${k}=${v}`).join(",")}}` : "";
    const src = sources.get(c.source_ids?.[0])?.origin || "";
    return c.metric === "signal"
      ? `- [${tag}:${c.id.slice(-6)}] ${c.period}: ${fmtVal(c.value)}${src ? ` (${src})` : ""} [اعتماد ${c.confidence}]`
      : `- [${tag}:${c.id.slice(-6)}] ${c.subject} | ${c.metric}${q} | ${c.period ?? "—"}: ${fmtVal(c.value)} ${c.unit || ""} [اعتماد ${c.confidence}${flags.length ? `؛ ${flags.join("، ")}` : ""}]`;
  };

  const items = [];
  const lines = [];
  let used = 0;
  const push = (it) => {
    if (used + it.line.length + 1 > pcfg.budget_chars && items.length) return false;
    items.push(it); lines.push(it.line); used += it.line.length + 1;
    return true;
  };
  for (const c of seriesTail) push({ kind: "series", id: c.id, score: 1, line: lineOf(c, "c") });
  const rulesAccepted = listRules().filter((r) => r.status === "پذیرفته");
  for (const r of rulesAccepted) push({ kind: "rule", id: r.id, score: 1, line: `- [r:${r.id.slice(-6)}] قاعده‌ی پذیرفته: ${r.text}` });
  let n = 0;
  for (const x of cand) {
    if (n >= pcfg.max_items) break;
    if (push({ kind: x.kind, id: x.c.id, score: Math.round(x.score * 1000) / 1000, line: lineOf(x.c, x.kind === "signal" ? "s" : "c") })) n += 1;
  }
  if (pcfg.include.includes("open_contradictions") && !asOf) {
    for (const q of currentRows("queue").values()) {
      if (q.recorded_to || q.status !== "open" || q.kind !== "contradiction" || !ctx.subjects.includes(q.subject)) continue;
      push({ kind: "contradiction", id: q.id, score: 1, line: `- [x:${q.id.slice(-6)}] هشدار: ${q.label} (${q.subject}، ${q.period}) — منبع‌ها اختلاف دارند: ${q.members.map((m) => `${m.source}=${m.value}`).join(" در برابر ")}` });
    }
  }
  const claim_ids = items.filter((i) => ["series", "claim", "signal"].includes(i.kind)).map((i) => i.id);
  const rule_ids = items.filter((i) => i.kind === "rule").map((i) => i.id);
  const retrieved_ids = items.map((i) => i.id);
  return { text: lines.join("\n"), items, retrieved_ids, claim_ids, rule_ids, series, stats: { candidates: cand.length + seriesPts.length, selected: items.length, chars: used } };
}

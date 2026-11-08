import fs from "fs";
import path from "path";
import { BRAIN_MODEL, resolveBrainKey } from "../brain";
import { generateContent } from "../geminiFetch";
import { currentRows } from "./store";
import { currentVersion, getRound } from "./forecast";
import { raiseItem } from "./knowledge/queue";
import { daysBetween, periodEnd } from "./knowledge/config";
import { loadIndex, upsertAnalysis } from "./memory";
import { readScores } from "./scoring/read";

// کالبدشکافی خطا (پروتکل ۹-۱، حلقه‌ی ۲) به ترتیب غافلگیری (۹-۵). فقط وقتی شروع می‌شود که خطای «سنجیده‌شده در برابر واقعیت» باشد (۹-۴).
// حافظه به وضع خودش در زمان ثبت پیش‌بینی (made_at) برگردانده می‌شود: سیستم در آن زمان چه می‌دانست؟ علت را کد با نشانه‌های قطعی در یکی از
// شش دسته می‌گذارد؛ مدل (اختیاری) فقط روایت و پیشنهاد می‌نویسد و اگر دسته‌ی دیگری بگوید «اختلاف» ثبت می‌شود، نه تغییر. هیچ قاعده‌ای
// خودکار عوض نمی‌شود؛ هر اقدام به صف بازبینی انسانی می‌رود.

let cache = null;
export function loadAutopsyConfig() {
  const file = path.join(process.env.BRAIN_DATA_DIR || path.join(process.cwd(), "..", "data"), "brain", "autopsy_config.json");
  const st = fs.statSync(/* turbopackIgnore: true */ file);
  if (cache && cache.file === file && cache.mtime === `${st.mtimeMs}:${st.size}`) return cache.cfg;
  const cfg = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ file, "utf-8"));
  cache = { file, mtime: `${st.mtimeMs}:${st.size}`, cfg };
  return cfg;
}

const isSystem = (f) => f.startsWith("machine:") || f.startsWith("brain:"); // کالبدشکافی برای خروجی‌های سیستم؛ خطای انسان‌ها در اعتبارشان می‌آید
const monthOf = (r) => String(r.outcome_as_of || "").slice(0, 7);

/** کاندیدهای ماه به ترتیب غافلگیری (نزولی): مهارت منفی یا خطای بزرگ. سقف per_month. */
export function selectForAutopsy({ scoreRows = readScores(), cfg = loadAutopsyConfig() } = {}) {
  const rows = scoreRows.filter((r) => r.kind === "time_avg" && isSystem(r.forecaster));
  const bad = rows.filter((r) => (typeof r.skill_vs_baseline === "number" && r.skill_vs_baseline < 0) || r.abs_rel_err >= cfg.large_error);
  const byMonth = new Map();
  for (const r of bad) { const m = monthOf(r); (byMonth.get(m) || byMonth.set(m, []).get(m)).push(r); }
  const out = [];
  for (const [m, list] of [...byMonth].sort()) {
    list.sort((a, b) => b.surprise - a.surprise || b.abs_rel_err - a.abs_rel_err || a.forecaster.localeCompare(b.forecaster));
    list.slice(0, cfg.per_month).forEach((r, i) => out.push({ row: r, month: m, rank: i + 1 }));
  }
  return out;
}

/** غافلگیری معکوس (۹-۵): بازه‌ی بسیار پهن (کم‌اطمینان) ولی درست درآمد؛ شاید بی‌دلیل کم‌اعتماد بوده. */
export function reverseSurprises({ scoreRows = readScores(), cfg = loadAutopsyConfig() } = {}) {
  const rows = scoreRows.filter((r) => r.kind === "version" && isSystem(r.forecaster) && r.inside && r.width_ratio >= cfg.reverse.width_ratio && r.abs_rel_err <= cfg.reverse.max_error);
  const byMonth = new Map();
  for (const r of rows) { const m = monthOf(r); (byMonth.get(m) || byMonth.set(m, []).get(m)).push(r); }
  const out = [];
  for (const [m, list] of [...byMonth].sort()) list.sort((a, b) => b.width_ratio - a.width_ratio).slice(0, cfg.reverse.per_month).forEach((r) => out.push({ row: r, month: m }));
  return out;
}

/** آخرین مقدار سری قیمتِ پرسش که سیستم در لحظه‌ی madeAt «باور داشت» (بازگشت زمانی حافظه با recorded_from/recorded_to). */
export function knownSeriesAt(question, madeAt, claimsAll) {
  const s = question.target?.truth_source?.series;
  if (!s) return { points: [], last: null };
  const t = new Date(madeAt).getTime();
  const believed = (r) => new Date(r.recorded_from).getTime() <= t && (!r.recorded_to || new Date(r.recorded_to).getTime() > t);
  const byPeriod = new Map();
  for (const r of claimsAll) {
    if (r.metric !== "price" || r.subject !== s.country_or_region || r.qualifiers?.product !== s.product || r.qualifiers?.price_type !== s.price_type || !believed(r)) continue;
    byPeriod.set(r.period, r);
  }
  const points = [...byPeriod.values()].map((r) => ({ row: r, end: periodEnd(r) })).filter((p) => p.end).sort((a, b) => a.end.localeCompare(b.end));
  return { points, last: points.at(-1) || null };
}

/**
 * علت خطا با نشانه‌های قطعی (کد). ترتیب بررسی: داده‌ی غلط ← داده‌ی کهنه/ناکافی ← قاعده‌ی غلط ← بازیابی ناقص ← رویداد پیش‌بینی‌ناپذیر ← (باقی‌مانده) روش غلط.
 * ورودی: pred (آخرین نسخه‌ی پیش‌بین)، question، actual، claimsAll (همه‌ی نسخه‌های ادعاها)، others (ردیف‌های نمره‌ی بقیه‌ی پیش‌بین‌ها برای همان پرسش)، ruleCritiqueKeys.
 */
export function classify({ pred, question, actual, claimsAll, others = [], ruleCritiqueKeys = new Set(), ruleKeyOf = () => null, cfg = loadAutopsyConfig() }) {
  const evidence = [];
  const known = knownSeriesAt(question, pred.made_at, claimsAll);
  const base = known.last ? Math.abs(known.last.row.value - actual) / actual : null;
  // ۱) داده‌ی غلط: ادعای پایه‌ی پیش‌بینی بعد از ثبتش با مقدار دیگر جایگزین شد
  const byId = new Map(claimsAll.map((c) => [c.id, c]));
  const successors = new Map();
  for (const c of claimsAll) if (c.supersedes) successors.set(c.supersedes, c);
  const implicated = [];
  for (const id of pred.claim_ids || []) {
    const c = byId.get(id);
    if (!c || !c.recorded_to || new Date(c.recorded_to) <= new Date(pred.made_at)) continue;
    const next = successors.get(id);
    if (next && typeof c.value === "number" && Math.abs(next.value - c.value) / Math.abs(c.value) >= cfg.data_wrong_min_change) {
      evidence.push({ type: "claim_corrected", claim_key: c.natural_key, old_value: c.value, new_value: next.value, corrected_at: c.recorded_to });
      implicated.push(c.source_ids?.[0] || null);
    } else if (c.status === "بسته‌شده" || next?.status === "بسته‌شده") {
      evidence.push({ type: "claim_rejected", claim_key: c.natural_key, value: c.value, rejected_at: c.recorded_to });
      implicated.push(c.source_ids?.[0] || null);
    }
  }
  if (evidence.length) return { category: "data_wrong", evidence, implicated_source_ids: implicated.filter(Boolean), known_last: known.last && { period: known.last.row.period, value: known.last.row.value }, baseline_error: base };
  // ۲) داده‌ی کهنه یا ناکافی
  const age = known.last ? daysBetween(known.last.end, pred.made_at) : null;
  if (!known.last || age > cfg.stale_days || known.points.length < cfg.min_series_points) {
    evidence.push({ type: !known.last ? "no_series" : age > cfg.stale_days ? "stale_series" : "short_series", age_days: age, points: known.points.length });
    return { category: "data_stale", evidence, known_last: known.last && { period: known.last.row.period, value: known.last.row.value }, baseline_error: base };
  }
  // ۳) قاعده‌ی غلط
  const ruleHits = (pred.rule_ids || []).map(ruleKeyOf).filter((k) => k && ruleCritiqueKeys.has(k));
  if (ruleHits.length) {
    evidence.push(...ruleHits.map((k) => ({ type: "rule_under_critique", rule: k })));
    return { category: "rule_wrong", evidence, rules: ruleHits, known_last: { period: known.last.row.period, value: known.last.row.value }, baseline_error: base };
  }
  // ۴) بازیابی ناقص: آخرین مقدار سری در حافظه بود ولی به پیش‌بین نرسید
  if (Array.isArray(pred.retrieved_ids) && pred.retrieved_ids.length && !pred.retrieved_ids.includes(known.last.row.id)) {
    evidence.push({ type: "latest_point_not_retrieved", claim_key: known.last.row.natural_key, period: known.last.row.period });
    return { category: "retrieval_gap", evidence, known_last: { period: known.last.row.period, value: known.last.row.value }, baseline_error: base };
  }
  // ۵) رویداد پیش‌بینی‌ناپذیر: خودِ خط مبنا هم بزرگ خطا کرد و بیشتر پیش‌بین‌ها هم
  const wrongOthers = others.filter((o) => o.abs_rel_err >= cfg.large_error).length;
  if (base !== null && base >= cfg.shock_baseline_error && others.length && wrongOthers / others.length >= 0.5) {
    evidence.push({ type: "shock", baseline_error: Math.round(base * 1000) / 1000, wrong_forecasters: `${wrongOthers}/${others.length}` });
    return { category: "unpredictable", evidence, known_last: { period: known.last.row.period, value: known.last.row.value }, baseline_error: base };
  }
  // ۶) باقی‌مانده: داده و قاعده درست و در دسترس بود، استدلال غلط بود
  evidence.push({ type: "reasoning", note: "داده‌ی لازم (آخرین مقدار سری) بازیابی شد، قاعده‌ی مشکوک نبود، شوک بیرونی هم نبود" });
  return { category: "method_wrong", evidence, known_last: { period: known.last.row.period, value: known.last.row.value }, baseline_error: base };
}

const SYSTEM_PROMPT = `تو کالبدشکاف خطای پیش‌بینی قیمت هستی. یک پیش‌بینی با خطای بزرگ، شواهد قطعیِ جمع‌آوری‌شده با کد، و دسته‌ی پیشنهادیِ کد را می‌بینی.
خروجی فقط یک JSON: {"category": یکی از data_wrong|data_stale|rule_wrong|method_wrong|retrieval_gap|unpredictable, "narrative": "حداکثر ۳۰۰ نویسه: چه شد و چرا", "proposal": "حداکثر ۲۰۰ نویسه: یک اقدام مشخص"}
قانون: عدد تازه نساز؛ فقط از شواهد بنویس. پیشنهاد تو فقط پیشنهاد است و چیزی را خودکار تغییر نمی‌دهد.`;

async function defaultGenerate({ system, input }) {
  const key = resolveBrainKey();
  if (!key) throw new Error("کلید مغز تنظیم نشده.");
  return generateContent({ apiKey: key, model: BRAIN_MODEL, systemInstruction: system, input, generationConfig: { temperature: 0.2, maxOutputTokens: 2048, responseMimeType: "application/json" } });
}
const parseJson = (t) => { const m = String(t).match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } };

function template(cat, cfg, d) {
  const lastTxt = d.known_last ? `آخرین مقدار شناخته‌شده در زمان ثبت ${d.known_last.value} (${d.known_last.period})` : "مقدار شناخته‌شده‌ای نبود";
  return `${cfg.categories[cat]}: ${lastTxt}؛ مقدار واقعی ${d.actual}، پیش‌بینی ${d.point}. ${cfg.actions[cat]}`;
}

/**
 * کالبدشکافی‌های ماه‌های سنجیده‌شده را (idempotent) می‌سازد. generate قابل‌تزریق؛ بدون مدل هم روایت قالبی ثبت می‌شود.
 * اقدام‌های نیازمند انسان به صف بازبینی می‌روند؛ خود دسته و روایت در مخزن «تحلیل‌ها» (analyst = autopsy) می‌مانند.
 */
export async function runAutopsies({ now = new Date(), generate = null, useModel = true } = {}) {
  const cfg = loadAutopsyConfig();
  const at = now.toISOString();
  const scoreRows = readScores();
  const idx = loadIndex();
  const claimsAll = [...currentRows("claims").values()];
  const srcKey = new Map([...currentRows("sources").values()].map((s) => [s.id, s.natural_key]));
  const existing = new Set([...currentRows("analyses").values()].filter((a) => !a.recorded_to && a.analyst === "autopsy").map((a) => a.natural_key));
  const ruleRows = [...currentRows("rules").values()].filter((r) => !r.recorded_to);
  const ruleKeyById = new Map([...currentRows("rules").values()].map((r) => [r.id, r.natural_key]));
  const critiqueKeys = new Set();
  for (const q of currentRows("queue").values()) if (!q.recorded_to && q.kind === "rule_critique") for (const m of q.members || []) if (String(m.claim_key).startsWith("rule:")) critiqueKeys.add(String(m.claim_key).slice(5));
  void ruleRows;
  const results = { new: 0, unchanged: 0, queued: 0, by_category: {}, skipped: [] };
  for (const { row, month, rank } of selectForAutopsy({ scoreRows, cfg })) {
    const key = `autopsy|${row.round_id}|${row.question_id}|${row.forecaster}`;
    if (existing.has(key)) { results.unchanged += 1; continue; }
    const round = getRound(row.round_id);
    const question = round?.questions.find((q) => q.id === row.question_id);
    const pred = currentVersion(row.round_id, row.question_id, (p) => p.forecaster === row.forecaster);
    if (!question || !pred) { results.skipped.push(key); continue; }
    const others = scoreRows.filter((r) => r.kind === "time_avg" && r.question_id === row.question_id && r.forecaster !== row.forecaster);
    const c = classify({ pred, question, actual: row.outcome, claimsAll, others, ruleCritiqueKeys: critiqueKeys, ruleKeyOf: (id) => ruleKeyById.get(id) || null, cfg });
    const detail = { ...c, actual: row.outcome, point: pred.forecast.point };
    let narrative = template(c.category, cfg, detail);
    let modelCategory = null, proposal = cfg.actions[c.category], source = "template";
    if (useModel) {
      try {
        const j = parseJson(await (generate || defaultGenerate)({
          system: SYSTEM_PROMPT,
          input: `پرسش: ${question.text}\nپیش‌بینی ${pred.forecast.point} (بازه‌ی ${pred.forecast.lo} تا ${pred.forecast.hi})؛ مقدار واقعی ${row.outcome}؛ غافلگیری ${row.surprise}؛ مهارت ${row.skill_vs_baseline}\nدسته‌ی پیشنهادی کد: ${c.category}\nشواهد: ${JSON.stringify(c.evidence).slice(0, 1500)}\nآخرین مقدار شناخته‌شده در زمان ثبت: ${JSON.stringify(c.known_last)}`,
        }));
        if (j && cfg.categories[j.category]) {
          narrative = String(j.narrative || narrative).slice(0, 400);
          proposal = String(j.proposal || proposal).slice(0, 300);
          modelCategory = j.category;
          source = "model";
        }
      } catch { /* بدون مدل: روایت قالبی */ }
    }
    const disputed = modelCategory !== null && modelCategory !== c.category;
    upsertAnalysis(idx, {
      key, analyst: "autopsy", method_version: "autopsy-v1", model: source === "model" ? BRAIN_MODEL : null, statement: narrative, claim_ids: pred.claim_ids || [],
      payload: {
        round_id: row.round_id, question_id: row.question_id, forecaster: row.forecaster, prediction_id: pred.id, month, surprise_rank: rank, surprise: row.surprise,
        abs_rel_err: row.abs_rel_err, skill: row.skill_vs_baseline, category: c.category, category_fa: cfg.categories[c.category], evidence: c.evidence,
        baseline_error: c.baseline_error === null ? null : Math.round(c.baseline_error * 10000) / 10000, known_last: c.known_last, model_category: modelCategory, disputed, proposal, narrative_source: source,
      },
    }, { at });
    results.new += 1;
    results.by_category[c.category] = (results.by_category[c.category] || 0) + 1;
    // اقدام نیازمند انسان (حلقه‌ی ۲ فقط پیشنهاد می‌دهد): صف بازبینی
    if (cfg.actionable_for_human.includes(c.category) || disputed) {
      raiseItem({
        natural_key: `autopsy|${pred.id}`, kind: "autopsy", group: "autopsy", label: `کالبدشکافی (${month}، رتبه‌ی غافلگیری ${rank}): ${cfg.categories[c.category]}${disputed ? ` — مدل «${cfg.categories[modelCategory]}» پیشنهاد کرد` : ""}. ${proposal}`,
        subject: question.target.region_fa, period: question.target.target_month, spread: row.surprise, category: c.category,
        implicated_sources: (c.implicated_source_ids || []).map((id) => srcKey.get(id)).filter(Boolean),
        members: [{ claim_key: `autopsy:${pred.id}`, metric: c.category, source: row.forecaster, value: row.surprise, unit: null, period: month }],
      }, { at });
      results.queued += 1;
    }
    // قاعده‌ی مشکوک ← صف بررسی قاعده (۹-۱)
    for (const rk of c.rules || []) raiseItem({ natural_key: `rule_critique|rule:${rk}|autopsy`, kind: "rule_critique", group: "autopsy", label: `کالبدشکافی: قاعده‌ی ${rk} در خطای بزرگ نقش داشت`, subject: rk, period: month, spread: null, members: [{ claim_key: `rule:${rk}`, metric: "rule", source: "autopsy", value: row.surprise }] }, { at });
  }
  // غافلگیری معکوس: فقط ثبت (بدون مدل)
  for (const { row, month } of reverseSurprises({ scoreRows, cfg })) {
    const key = `autopsy-reverse|${row.prediction_id}`;
    if (existing.has(key)) continue;
    upsertAnalysis(idx, {
      key, analyst: "autopsy", method_version: "autopsy-reverse-v1", model: null,
      statement: `غافلگیری معکوس: بازه‌ی بسیار پهن (${Math.round(row.width_ratio * 100)}٪ نقطه) ولی مقدار واقعی نزدیک بود (خطا ${Math.round(row.abs_rel_err * 1000) / 10}٪)؛ شاید سیستم بی‌دلیل کم‌اعتماد بوده.`,
      claim_ids: [], payload: { kind: "reverse", month, forecaster: row.forecaster, prediction_id: row.prediction_id, question_id: row.question_id, width_ratio: row.width_ratio, abs_rel_err: row.abs_rel_err },
    }, { at });
    results.reverse = (results.reverse || 0) + 1;
  }
  return results;
}

/** پوشش کالبدشکافی (شاخص ۱۷: ۱۰ مورد پرغافلگیریِ هر ماه، ۱۰۰٪). */
export function autopsyCoverage({ scoreRows = readScores(), cfg = loadAutopsyConfig() } = {}) {
  const done = new Set([...currentRows("analyses").values()].filter((a) => !a.recorded_to && a.analyst === "autopsy" && a.payload?.category).map((a) => a.natural_key));
  const by = new Map();
  for (const { row, month } of selectForAutopsy({ scoreRows, cfg })) {
    const e = by.get(month) || { month, selected: 0, done: 0 };
    e.selected += 1;
    if (done.has(`autopsy|${row.round_id}|${row.question_id}|${row.forecaster}`)) e.done += 1;
    by.set(month, e);
  }
  return [...by.values()].map((e) => ({ ...e, coverage: e.selected ? e.done / e.selected : 1 }));
}

/** فهرست کالبدشکافی‌ها برای مدیر (جدیدترین اول). */
export function listAutopsies() {
  return [...currentRows("analyses").values()].filter((a) => !a.recorded_to && a.analyst === "autopsy").map((a) => ({ key: a.natural_key, statement: a.statement, ...a.payload })).sort((x, y) => String(y.month).localeCompare(String(x.month)) || (x.surprise_rank || 99) - (y.surprise_rank || 99));
}

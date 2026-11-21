import { BRAIN_MODEL, resolveBrainKey } from "../../brain";
import { generateContent } from "../../geminiFetch";
import { getDomain } from "../domain/index";
import { currentRows, putRow } from "../store";
import { makeRow } from "../schema";
import { compareLessonEffect, lessonsPromptFor } from "./countryLessons";
import { activeCountryMethod, methodPromptText, selectComparables } from "./countryMethod";
import { closeRow } from "../store";
import { brier, inInterval, relErr, round4, skill, surpriseInterval, surpriseProbability } from "../scoring/math";

// آزمون بازپخش کشورها (مرحله‌ی ۱۰-ب): مغز برای کشوری که «هنوز پژوهش نشده» چند کمیت را پیش‌بینی می‌کند و بعد با نتیجه‌ی واقعیِ پژوهش
// همان کشور (از پروفایل) سنجیده می‌شود. برای اینکه جواب نشت نکند:
//   • ورودی مدل فقط شاخص‌های عمومی کشور هدف (جمعیت، درآمد، شهرنشینی) + جدول «کشورهای دیگرِ پژوهش‌شده» است؛ هیچ ردیفی از خود کشور هدف
//     (تفکیک مبدأ، گزارش، آمار تجاری، پروفایل) به مدل نمی‌رسد؛ مقدار واقعی هم فقط بعد از دریافت پیش‌بینی خوانده می‌شود.
//   • خط مبنا = میانه‌ی کشورهای دیگر (leave-one-out).
//   • نتیجه در مخزن جدای «backtests» می‌ماند و وارد نمره‌ی زنده، اعتبار پیش‌بین‌ها و وزن داور نمی‌شود (پیش‌بین «…@bt»).
// محتوای دامنه (هدف‌ها، استخراج مقدار واقعی، متن معرفی) از getDomain().countryBacktest می‌آید.

export const BACKTEST_SUFFIX = "@bt";
export const LESSONS_SUFFIX = "+lessons";
const fmtNum = (v) => (v === null || v === undefined ? "؟" : typeof v === "number" ? Number(v.toLocaleString("en-US", { maximumFractionDigits: 2 }).replace(/,/g, "")) : String(v));

const dom = () => getDomain().countryBacktest;
export const backtestTargets = () => dom().targets;
export const backtestCountries = () => dom().loadCountryTable().map((r) => r.country);

function systemPrompt() {
  return `تو تحلیل‌گر بازاری. ${dom().intro}
برای کشوری که هنوز درباره‌اش پژوهش نشده، چند کمیت را پیش‌بینی می‌کنی. فقط این‌ها را داری: شاخص‌های عمومی همان کشور و جدول کشورهای مشابهِ پژوهش‌شده (که آن‌ها را کامل می‌شناسیم). از دانش عمومی خودت هم می‌توانی کمک بگیری، ولی عدد از خودت نساز و اگر مطمئن نیستی بازه را پهن بگیر.
برای هر هدف عددی: "point" (بهترین حدس)، "lo" و "hi" (بازه‌ای که ۸۰٪ احتمال دارد مقدار واقعی داخلش باشد؛ نه خیلی باریک، نه بی‌معنی پهن)، "reason" (حداکثر ۱۵۰ نویسه‌ی فارسی؛ از کدام کشور مشابه یا چه استدلالی).
برای هدف احتمالی: "p" (عدد بین ۰ و ۱) و "reason".
خروجی فقط یک JSON معتبر: {"targets": {"<id>": {...}, ...}} با همان شناسه‌هایی که پرسیده‌ام و هیچ متن دیگری.`;
}

function buildInput(row, others, allTargets, askTargets) {
  const ind = row.indicators || {};
  const head = [
    `کشور هدف: ${row.country}`,
    `جمعیت: ${fmtNum(ind.population)}؛ سطح درآمد: ${ind.income_level || "؟"}؛ رده‌ی توسعه: ${ind.tier || "؟"}؛ شهرنشینی: ${fmtNum(ind.urban_pct)}٪؛ تولید ناخالص سرانه (دلار): ${fmtNum(ind.gdp_per_capita_usd)}`,
  ].join("\n");
  const cols = allTargets.map((t) => t.id);
  const lines = others.map((o) => `${o.country} | جمعیت ${fmtNum(o.indicators?.population)} | درآمد ${o.indicators?.income_level || "؟"} | ${cols.map((c) => `${c}=${fmtNum(o.truth[c])}`).join(" | ")}`);
  const ask = askTargets.map((t) => `- ${t.id}: ${t.label} (${t.unit})${t.kind === "probability" ? " ← خروجی p و reason" : ""}`).join("\n");
  return `${head}\n\n===== کشورهای مشابهِ پژوهش‌شده (؟ = موجود نیست) =====\n${lines.join("\n")}\n\n===== اهداف پیش‌بینی برای «${row.country}» =====\n${ask}`;
}

function parseJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function checkForecast(t, f) {
  if (!f || typeof f !== "object") return "پیش‌بینی نیامد";
  if (t.kind === "probability") return Number.isFinite(Number(f.p)) && f.p >= 0 && f.p <= 1 ? null : "p بین ۰ و ۱ نیست";
  const [p, lo, hi] = [Number(f.point), Number(f.lo), Number(f.hi)];
  if (![p, lo, hi].every(Number.isFinite)) return "point/lo/hi عدد نیست";
  if (lo > p || p > hi || lo < 0) return "ترتیب lo ≤ point ≤ hi یا نامنفی بودن رعایت نشده";
  if (t.unit === "درصد" && hi > 100) return "درصد بیش از ۱۰۰";
  return null;
}

/** سنجش یک هدف. truth و baseline عدد (یا برای احتمالی ۰/۱ و نسبت). */
export function scoreBacktestTarget(t, f, truth, baseline) {
  if (truth === null || truth === undefined) return { scored: false, reason: "مقدار واقعی موجود نیست" };
  if (t.kind === "probability") {
    const p = Number(f.p);
    const b = brier(p, truth);
    const bb = baseline === null || baseline === undefined ? null : brier(baseline, truth);
    return { scored: true, brier: round4(b), baseline_brier: bb === null ? null : round4(bb), skill: bb === null ? null : round4(skill(b, bb)), surprise: round4(surpriseProbability(p, truth)) };
  }
  if (!(truth > 0)) return { scored: false, reason: "مقدار واقعی صفر است؛ خطای نسبی تعریف نمی‌شود" };
  const [point, lo, hi] = [Number(f.point), Number(f.lo), Number(f.hi)];
  const err = relErr(point, truth);
  const baseErr = baseline === null || baseline === undefined ? null : relErr(baseline, truth);
  return {
    scored: true, abs_rel_err: round4(err), inside: inInterval(truth, lo, hi), surprise: round4(surpriseInterval(truth, lo, hi)),
    width_ratio: point > 0 ? round4((hi - lo) / point) : null, baseline_err: baseErr === null ? null : round4(baseErr), skill: baseErr === null ? null : round4(skill(err, baseErr)),
  };
}

async function defaultGenerate({ system, input }) {
  const key = resolveBrainKey();
  if (!key) throw new Error("کلید مغز تنظیم نشده.");
  return generateContent({ retries: 3, apiKey: key, model: BRAIN_MODEL, systemInstruction: system, input, generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json" } });
}

/**
 * یک کشور را پیش‌بینی و بلافاصله می‌سنجد. generate({system,input}) قابل‌تزریق؛ model نام برای ثبت.
 * برمی‌گرداند {ok, country, run_id, rows:[{target, forecast, truth, baseline, result}], error?}.
 */
export async function runCountryBacktest(country, { generate = defaultGenerate, model = BRAIN_MODEL, now = new Date(), runId = null, lessons = false, method } = {}) {
  const m = method === undefined ? activeCountryMethod() : method; // نسخه‌ی روش (قاعده‌های استدلال + شیوه‌ی انتخاب مقایسه‌ای)؛ null = دستور پایه
  const d = dom();
  const table = d.loadCountryTable();
  const row = table.find((r) => r.country === country);
  if (!row) return { ok: false, country, error: "کشور در جدول پژوهش‌شده‌ها نیست." };
  const others = table.filter((r) => r.country !== country);
  const targets = d.targets.filter((t) => row.truth[t.id] !== null && row.truth[t.id] !== undefined);
  if (!targets.length) return { ok: false, country, error: "برای این کشور مقدار واقعیِ قابل‌سنجش نیست." };
  const run = runId || `bt_${now.getTime().toString(36)}`;
  const at = now.toISOString();
  const les = lessons ? lessonsPromptFor(country) : { ids: [], text: "" }; // درس‌های پذیرفته‌شده (به‌جز آنچه از خود همین کشور آمده؛ leave-one-out)
  let parsed;
  try {
    parsed = parseJson(await generate({ system: systemPrompt() + methodPromptText(m) + les.text, input: buildInput({ country: row.country, indicators: row.indicators }, selectComparables(row, others, m?.comparables), d.targets, targets) }));
  } catch (err) {
    return { ok: false, country, error: String(err?.message || err).slice(0, 200) };
  }
  const tg = parsed?.targets;
  if (!tg || typeof tg !== "object") return { ok: false, country, error: "خروجی مدل JSON هدف‌ها نبود." };
  const forecaster = `machine:country:${model}${BACKTEST_SUFFIX}${lessons ? LESSONS_SUFFIX : ""}`;
  const rows = [];
  for (const t of targets) {
    const f = tg[t.id];
    const bad = checkForecast(t, f);
    const truth = row.truth[t.id];
    const baseline = d.baselineFor(t.id, row, others);
    const result = bad ? { scored: false, reason: `پیش‌بینی نامعتبر: ${bad}` } : scoreBacktestTarget(t, f, truth, baseline);
    const forecast = bad ? null : t.kind === "probability" ? { p: Number(f.p) } : { point: Number(f.point), lo: Number(f.lo), hi: Number(f.hi) };
    const stored = putRow("backtests", makeRow("backtests", {
      run_id: run, country, target: t.id, kind: t.kind, forecaster, model, made_at: at, forecast, truth, baseline, result, reason: String(f?.reason || "").slice(0, 200) || null,
      with_lessons: !!lessons, lesson_ids: les.ids, method_version: m?.version || null, natural_key: `bt|${run}|${country}|${t.id}|${model}|${lessons ? "L" : "B"}|${m?.version || "-"}`, created_at: at,
    }, at));
    rows.push({ id: stored.id, with_lessons: !!lessons, method_version: m?.version || null, target: t.id, forecast, truth, baseline, result, reason: stored.reason });
  }
  return { ok: true, country, run_id: run, forecaster, with_lessons: !!lessons, lessons_used: les.ids.length, rows };
}

/** آخرین ردیفِ هر (کشور، هدف، پیش‌بین). */
export function latestBacktestRows() {
  const best = new Map();
  for (const r of currentRows("backtests").values()) {
    if (r.recorded_to || !r.natural_key) continue;
    const k = `${r.country}|${r.target}|${r.forecaster}|${r.method_version || ""}|${r.forward ? "fw" : ""}`;
    if (!best.has(k) || String(r.made_at) > String(best.get(k).made_at)) best.set(k, r);
  }
  return [...best.values()];
}

const mean = (xs) => { const v = xs.filter((x) => x !== null && x !== undefined); return v.length ? round4(v.reduce((a, b) => a + b, 0) / v.length) : null; };

function agg(rows) {
  const scored = rows.filter((r) => r.result?.scored);
  const numeric = scored.filter((r) => r.kind !== "probability");
  const withSkill = scored.filter((r) => r.result.skill !== null && r.result.skill !== undefined);
  return {
    n: scored.length, n_skipped: rows.length - scored.length,
    mean_skill: mean(withSkill.map((r) => r.result.skill)), beats_baseline_pct: withSkill.length ? Math.round((withSkill.filter((r) => r.result.skill > 0).length / withSkill.length) * 100) : null,
    coverage: numeric.length ? round4(numeric.filter((r) => r.result.inside).length / numeric.length) : null,
    mean_abs_rel_err: mean(numeric.map((r) => r.result.abs_rel_err)), mean_surprise: mean(scored.map((r) => r.result.surprise)),
  };
}

/** خلاصه‌ی آخرین اجراها: کل، به‌تفکیک هدف و به‌تفکیک کشور. coverage = سهم هدف‌های عددی که واقعی داخل بازه‌ی ۸۰٪ بود (هدف ≈ ۰٫۸). */
export function summarizeBacktests(allRows = latestBacktestRows()) {
  // آمار اصلی: اجرای «بدون درس» با روش فعال (اگر ردیفی با آن نسخه هست)، وگرنه ردیف‌های بدون نسخه؛ اثر درس‌ها جدا (lessons_effect)
  const act = activeCountryMethod()?.version || null;
  const hasActive = act && allRows.some((r) => r.method_version === act && !r.with_lessons);
  const fwRows = allRows.filter((r) => r.forward);
  const rows = allRows.filter((r) => !r.forward && !r.with_lessons && (hasActive ? r.method_version === act : !r.method_version));
  const labels = new Map(backtestTargets().map((t) => [t.id, t.label]));
  const by = (key) => [...new Set(rows.map((r) => r[key]))];
  const view = (r) => ({ country: r.country, target: r.target, label: labels.get(r.target) || r.target, forecast: r.forecast, truth: r.truth, baseline: r.baseline, result: r.result, reason: r.reason, made_at: r.made_at, resolved_at: r.resolved_at || null, model: r.model, method_version: r.method_version || null, forward: !!r.forward, pending: !!r.forward && !r.result?.scored });
  return {
    overall: agg(rows),
    lessons_effect: compareLessonEffect(allRows.filter((r) => !r.forward)),
    forward: { pending: fwRows.filter((r) => !r.result?.scored).length, ...agg(fwRows), countries: [...new Set(fwRows.map((r) => r.country))] },
    by_target: by("target").map((id) => ({ id, label: labels.get(id) || id, ...agg(rows.filter((r) => r.target === id)) })),
    by_country: by("country").map((c) => ({ country: c, ...agg(rows.filter((r) => r.country === c)) })).sort((a, b) => String(a.country).localeCompare(String(b.country), "fa")),
    rows: rows.map(view),
    forward_rows: fwRows.map(view),
  };
}

/**
 * پیش‌بینی «پیش از پژوهش» برای کشوری که هنوز پروفایل ندارد (پیش‌ثبت): فقط شاخص‌های عمومی کشور + جدول همه‌ی کشورهای پژوهش‌شده.
 * ثبت‌شده «تغییرناپذیر» است: برای کشوری که پیش‌بینی قبلی دارد، دوباره پیش‌بینی نمی‌شود (وگرنه می‌شد بعد از دیدن جواب عوضش کرد).
 * وقتی پژوهش آن کشور وارد پروفایل‌ها شد، resolveForwardPredictions آن را می‌سنجد.
 */
export async function predictNewCountry(country, { generate = defaultGenerate, model = BRAIN_MODEL, now = new Date(), method } = {}) {
  const d = dom();
  const table = d.loadCountryTable();
  if (table.some((r) => r.country === country)) return { ok: false, country, error: "این کشور قبلاً پژوهش شده؛ برای آن از «آزمون بازپخش» استفاده کنید." };
  if (latestBacktestRows().some((r) => r.forward && r.country === country)) return { ok: false, country, error: "برای این کشور پیش‌بینی پیش‌ثبت‌شده هست و تغییر نمی‌کند." };
  const indicators = d.indicatorsFor(country);
  if (!indicators) return { ok: false, country, error: "شاخص‌های عمومی (جمعیت، درآمد) این کشور در داده‌ی جهانی نیست." };
  const m = method === undefined ? activeCountryMethod() : method;
  const row = { country, indicators };
  const at = now.toISOString();
  const run = `fw_${now.getTime().toString(36)}`;
  let parsed;
  try {
    parsed = parseJson(await generate({ system: systemPrompt() + methodPromptText(m), input: buildInput(row, selectComparables(row, table, m?.comparables), d.targets, d.targets) }));
  } catch (err) {
    return { ok: false, country, error: String(err?.message || err).slice(0, 200) };
  }
  const tg = parsed?.targets;
  if (!tg || typeof tg !== "object") return { ok: false, country, error: "خروجی مدل JSON هدف‌ها نبود." };
  const forecaster = `machine:country:${model}${BACKTEST_SUFFIX}`;
  const rows = [];
  for (const t of d.targets) {
    const f = tg[t.id];
    const bad = checkForecast(t, f);
    const forecast = bad ? null : t.kind === "probability" ? { p: Number(f.p) } : { point: Number(f.point), lo: Number(f.lo), hi: Number(f.hi) };
    const baseline = d.baselineFor(t.id, row, table);
    const stored = putRow("backtests", makeRow("backtests", {
      run_id: run, country, target: t.id, kind: t.kind, forecaster, model, made_at: at, forecast, truth: null, baseline, forward: true, method_version: m?.version || null,
      result: { scored: false, reason: bad ? `پیش‌بینی نامعتبر: ${bad}` : "منتظر پژوهش کشور", pending: !bad }, reason: String(f?.reason || "").slice(0, 200) || null,
      natural_key: `fw|${country}|${t.id}|${model}|${m?.version || "-"}`, created_at: at,
    }, at));
    rows.push({ id: stored.id, target: t.id, forecast, baseline, reason: stored.reason, invalid: bad || null });
  }
  return { ok: true, country, run_id: run, forecaster, method_version: m?.version || null, rows };
}

/** پیش‌بینی‌های پیش‌ثبت‌شده‌ای که مقدار واقعی‌شان حالا (پژوهش وارد پروفایل شده) در دسترس است سنجیده می‌شوند. برمی‌گرداند تعداد سنجیده‌شده. */
export function resolveForwardPredictions({ now = new Date() } = {}) {
  const d = dom();
  const table = d.loadCountryTable();
  const at = now.toISOString();
  let n = 0;
  for (const r of latestBacktestRows()) {
    if (!r.forward || r.result?.scored || !r.forecast) continue;
    const t = d.targets.find((x) => x.id === r.target);
    const row = table.find((x) => x.country === r.country);
    const truth = row?.truth?.[r.target];
    if (!t || truth === null || truth === undefined) continue;
    const result = scoreBacktestTarget(t, r.forecast, truth, r.baseline);
    const { id, created_at, recorded_from, recorded_to, closed_reason, ...keep } = r;
    putRow("backtests", makeRow("backtests", { ...keep, truth, result, resolved_at: at, supersedes: id, change_reason: "مقدار واقعی از پژوهش کشور رسید", created_at: at }, at));
    closeRow("backtests", id, { reason: "سنجیده شد", by: "country-backtest", at });
    n += 1;
  }
  return n;
}

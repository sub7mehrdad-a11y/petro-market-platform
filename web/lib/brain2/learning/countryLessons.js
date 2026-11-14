import crypto from "crypto";
import { BRAIN_MODEL, resolveBrainKey } from "../../brain";
import { generateContent } from "../../geminiFetch";
import { getDomain } from "../domain/index";
import { loadIndex, upsertAnalysis } from "../memory";
import { raiseItem } from "../knowledge/queue";
import { currentRows, putRow } from "../store";
import { makeRow } from "../schema";
import { latestBacktestRows } from "./countryBacktest";

// یادگیری از اشتباه‌های آزمون بازپخش کشورها (مرحله‌ی ۱۰-ب):
//   ۱) کالبدشکافی هر خطای بزرگ: «دسته» را کد از نشانه‌ی قطعی تعیین می‌کند؛ مدل فقط روایت می‌نویسد و یک «درس کلی» پیشنهاد می‌دهد (دسته را عوض نمی‌کند).
//   ۲) سوگیری تجمعی: اگر پیش‌بینی‌های یک هدف در چند کشور مدام به یک سو خطا دارند، کد یک درسِ کالیبراسیون می‌سازد (بدون مدل).
//   ۳) درس‌ها فقط پیشنهادند ← صف بازبینی (country_lesson) ← با تأیید مدیر «پذیرفته» می‌شوند و به دستور پیش‌بین کشور افزوده می‌شوند.
//   ۴) اثر درس‌ها سنجیده می‌شود: اجرای «با درس» روی کشورهایی که درس از آن‌ها نیامده (leave-one-out)، در برابر اجرای بدون درس.

export const LESSON_STATUS = { proposed: "پیشنهادی", accepted: "پذیرفته", rejected: "ردشده" };
const AUTOPSY_ANALYST = "autopsy-country";
const CFG = { min_err: 0.25, min_brier: 0.25, bias_min_n: 3, bias_threshold: 0.15, min_comparables: 4 };

const lessonRows = () => [...currentRows("lessons").values()].filter((r) => !r.recorded_to && r.natural_key);
export const acceptedLessons = () => lessonRows().filter((l) => l.status === LESSON_STATUS.accepted);
const hashOf = (t) => crypto.createHash("sha1").update(String(t).replace(/\s+/g, " ").trim()).digest("hex").slice(0, 10);

/** دسته‌ی خطا از نشانه‌ی قطعی (به‌ترتیب اولویت). others = مقدارهای عددیِ سایر کشورها برای همان هدف. */
export function classifyCountryError(row, othersValues) {
  const r = row.result;
  if (!r?.scored) return null;
  const bad = row.kind === "probability" ? r.brier >= CFG.min_brier : r.abs_rel_err >= CFG.min_err || r.inside === false;
  if (!bad && !(r.skill !== null && r.skill !== undefined && r.skill < 0)) return null;
  const vals = othersValues.filter((v) => v !== null && v !== undefined);
  const outside = vals.length >= 2 && (row.truth > Math.max(...vals) || row.truth < Math.min(...vals));
  if (vals.length < CFG.min_comparables) return { category: "few_comparables", label: "کشور مقایسه‌ای کم بود", evidence: { comparables: vals.length } };
  if (outside) return { category: "outside_range", label: "مقدار واقعی بیرون از دامنه‌ی همه‌ی کشورهای مقایسه‌ای بود", evidence: { min: Math.min(...vals), max: Math.max(...vals), comparables: vals.length } };
  if (r.skill !== null && r.skill !== undefined && r.skill < 0) return { category: "worse_than_baseline", label: "حدس مدل از میانه‌ی کشورهای مشابه بدتر بود (روش غلط)", evidence: { skill: r.skill, baseline: row.baseline } };
  return { category: "estimation_error", label: "خطای برآورد با وجود مقایسه‌ی کافی", evidence: {} };
}

const SYSTEM = `تو بازبین خطاهای یک پیش‌بین هستی. یک پیش‌بینیِ بد را با مقدار واقعی، حدس قبلی و دلیلی که خودِ پیش‌بین داده، می‌بینی. «دسته‌ی خطا» را کد تعیین کرده و تو عوضش نمی‌کنی.
خروجی فقط یک JSON: {"narrative": "حداکثر ۳۰۰ نویسه‌ی فارسی: چرا اشتباه شد؛ فقط از داده‌های همین پیام نتیجه بگیر", "lesson": "یک جمله‌ی کلی و قابل‌استفاده برای کشورهای بعدی، بدون ذکر نام این کشور و بدون عدد همین کشور؛ یا null اگر درس کلی نیست"}`;

async function defaultGenerate({ system, input }) {
  const key = resolveBrainKey();
  if (!key) throw new Error("کلید مغز تنظیم نشده.");
  return generateContent({ apiKey: key, model: BRAIN_MODEL, systemInstruction: system, input, generationConfig: { temperature: 0.2, maxOutputTokens: 1024, responseMimeType: "application/json" } });
}
const parseJson = (t) => { const m = String(t).match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } };
const fmtN = (v) => (typeof v === "number" ? Number(v.toLocaleString("en-US", { maximumFractionDigits: 2 }).replace(/,/g, "")) : v);

/** کالبدشکافی همه‌ی خطاهای بزرگِ آخرین اجرای بدون درس. generate قابل‌تزریق؛ useModel=false → روایت قالبی. */
export async function runCountryAutopsies({ now = new Date(), generate = defaultGenerate, useModel = true, rows = latestBacktestRows().filter((r) => !r.with_lessons) } = {}) {
  const at = now.toISOString();
  const idx = loadIndex();
  const table = getDomain().countryBacktest.loadCountryTable();
  const existing = new Set([...currentRows("analyses").values()].filter((a) => !a.recorded_to && a.analyst === AUTOPSY_ANALYST).map((a) => a.natural_key));
  const out = { new: 0, unchanged: 0, lessons_proposed: 0, by_category: {} };
  for (const row of rows) {
    const others = table.filter((t) => t.country !== row.country).map((t) => t.truth[row.target]);
    const c = classifyCountryError(row, others);
    if (!c) continue;
    const key = `${AUTOPSY_ANALYST}|${row.id}`;
    if (existing.has(key)) { out.unchanged += 1; continue; }
    const side = row.kind === "probability" ? null : row.forecast?.point > row.truth ? "بیش‌برآورد" : "کم‌برآورد";
    let narrative = `${c.label}. پیش‌بینی ${fmtN(row.forecast?.point ?? row.forecast?.p)} در برابر واقعی ${fmtN(row.truth)}${side ? ` (${side})` : ""}.`;
    let lesson = null, source = "template";
    if (useModel) {
      try {
        const j = parseJson(await generate({ system: SYSTEM, input: `کشور: ${row.country}؛ هدف: ${row.target}\nدسته‌ی خطا (کد): ${c.label}\nپیش‌بینی: ${JSON.stringify(row.forecast)}؛ واقعی: ${row.truth}؛ خط مبنا: ${row.baseline}\nدلیل خودِ پیش‌بین: ${row.reason || "—"}\nشاهد: ${JSON.stringify(c.evidence)}` }));
        if (j?.narrative) { narrative = String(j.narrative).slice(0, 400); source = "model"; }
        if (j?.lesson && typeof j.lesson === "string" && j.lesson.length > 12 && ["worse_than_baseline", "estimation_error"].includes(c.category)) lesson = j.lesson.trim().slice(0, 300);
      } catch { /* بدون مدل: روایت قالبی */ }
    }
    upsertAnalysis(idx, {
      key, analyst: AUTOPSY_ANALYST, method_version: "country-autopsy-v1", model: source === "model" ? BRAIN_MODEL : null, statement: narrative, claim_ids: [],
      payload: { country: row.country, target: row.target, run_id: row.run_id, forecaster: row.forecaster, category: c.category, category_fa: c.label, evidence: c.evidence, forecast: row.forecast, truth: row.truth, baseline: row.baseline, result: row.result, lesson, narrative_source: source },
    }, { at });
    out.new += 1;
    out.by_category[c.category] = (out.by_category[c.category] || 0) + 1;
    if (lesson && proposeLesson({ text: lesson, kind: "model", derived_from: [row.country], target: row.target, category: c.category }, { at })) out.lessons_proposed += 1;
  }
  out.lessons_proposed += proposeBiasLessons({ rows, at });
  return out;
}

/** درسِ پیشنهادی را (idempotent) به صف می‌آورد؛ برمی‌گرداند true اگر تازه بود. */
export function proposeLesson({ text, kind, derived_from, target, category, evidence = null }, { at }) {
  const key = `lesson|${hashOf(text)}`;
  if (lessonRows().some((l) => l.natural_key === key)) return false;
  const itemKey = `country_lesson|${hashOf(text)}`;
  const status = raiseItem({
    natural_key: itemKey, kind: "country_lesson", group: "country_lessons", subject: target, period: null, spread: null, lesson_text: text, lesson_kind: kind, derived_from, category,
    label: `درس پیشنهادی از آزمون کشورها (${kind === "bias" ? "سوگیری تجمعی" : `از خطای ${derived_from.join("، ")}`}): «${text}»`,
    members: [{ claim_key: `lesson:${hashOf(text)}`, metric: "lesson", source: "country-backtest", value: null }],
  }, { at });
  void evidence;
  return status === "new";
}

/** سوگیری تجمعی هر هدف: اگر در ≥ bias_min_n کشور میانگین خطای علامت‌دار از آستانه بیشتر بود، درس کالیبراسیون (بدون مدل). */
export function proposeBiasLessons({ rows = latestBacktestRows().filter((r) => !r.with_lessons), at = new Date().toISOString() } = {}) {
  const labels = new Map(getDomain().countryBacktest.targets.map((t) => [t.id, t.label]));
  const byTarget = new Map();
  for (const r of rows) {
    if (r.kind === "probability" || !r.result?.scored || !r.forecast || !(r.truth > 0)) continue;
    if (!byTarget.has(r.target)) byTarget.set(r.target, []);
    byTarget.get(r.target).push({ country: r.country, err: (r.forecast.point - r.truth) / r.truth });
  }
  let n = 0;
  for (const [target, list] of byTarget) {
    if (list.length < CFG.bias_min_n) continue;
    const mean = list.reduce((a, b) => a + b.err, 0) / list.length;
    const sameSide = list.filter((x) => Math.sign(x.err) === Math.sign(mean)).length / list.length;
    if (Math.abs(mean) < CFG.bias_threshold || sameSide < 0.7) continue;
    const text = `پیش‌بینی «${labels.get(target) || target}» در ${list.length} کشور به‌طور میانگین ${Math.round(Math.abs(mean) * 100)}٪ ${mean > 0 ? "بیش‌برآورد" : "کم‌برآورد"} بوده؛ حدس اولیه را ${Math.round(Math.abs(mean) * 100 / 2)}٪ تا ${Math.round(Math.abs(mean) * 100)}٪ ${mean > 0 ? "پایین‌تر" : "بالاتر"} بگیر.`;
    if (proposeLesson({ text, kind: "bias", derived_from: list.map((x) => x.country), target, category: "bias" }, { at })) n += 1;
  }
  return n;
}

/** تصمیم مدیر روی درس‌ها را اجرا می‌کند (idempotent): پذیرش ← ردیف درس «پذیرفته»؛ رد ← ردیف «ردشده» (برای اینکه دوباره پیشنهاد نشود). */
export function syncLessonDecisions({ now = new Date() } = {}) {
  const at = now.toISOString();
  const applied = [];
  for (const q of currentRows("queue").values()) {
    if (q.recorded_to || q.kind !== "country_lesson" || q.status !== "resolved") continue;
    const key = `lesson|${hashOf(q.lesson_text)}`;
    if (lessonRows().some((l) => l.natural_key === key)) continue;
    const accepted = q.resolution?.decision === "accept";
    putRow("lessons", makeRow("lessons", {
      text: q.lesson_text, status: accepted ? LESSON_STATUS.accepted : LESSON_STATUS.rejected, lesson_kind: q.lesson_kind, derived_from: q.derived_from || [], target: q.subject, category: q.category,
      decided_by: q.resolution?.by || null, decided_at: at, natural_key: key, created_at: at,
    }, at));
    applied.push(`${accepted ? "پذیرفته" : "ردشده"}: ${q.lesson_text.slice(0, 40)}`);
  }
  return applied;
}

/** دستور اضافه برای پیش‌بین کشور: درس‌های پذیرفته (به‌جز آن‌هایی که از خود این کشور آمده‌اند). */
export function lessonsPromptFor(country) {
  const ls = acceptedLessons().filter((l) => !(l.derived_from || []).includes(country));
  return { ids: ls.map((l) => l.id), text: ls.length ? `\n\n===== درس‌های آموخته‌شده از اشتباه‌های قبلی (رعایت کن) =====\n${ls.map((l, i) => `${i + 1}) ${l.text}`).join("\n")}` : "" };
}

const mean = (xs) => { const v = xs.filter((x) => x !== null && x !== undefined); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10000) / 10000 : null; };

/** مقایسه‌ی «با درس» و «بدون درس» روی جفت‌های مشترک (کشور، هدف). */
export function compareLessonEffect(rows = latestBacktestRows()) {
  const by = new Map();
  for (const r of rows) {
    if (!r.result?.scored) continue;
    const k = `${r.country}|${r.target}`;
    if (!by.has(k)) by.set(k, {});
    by.get(k)[r.with_lessons ? "with" : "without"] = r;
  }
  const pairs = [...by.values()].filter((p) => p.with && p.without);
  const metric = (r) => (r.kind === "probability" ? r.result.brier : r.result.abs_rel_err);
  const better = pairs.filter((p) => metric(p.with) < metric(p.without)).length;
  const worse = pairs.filter((p) => metric(p.with) > metric(p.without)).length;
  return {
    pairs: pairs.length, better, worse, same: pairs.length - better - worse,
    mean_skill_with: mean(pairs.map((p) => p.with.result.skill)), mean_skill_without: mean(pairs.map((p) => p.without.result.skill)),
    mean_err_with: mean(pairs.filter((p) => p.with.kind !== "probability").map((p) => p.with.result.abs_rel_err)), mean_err_without: mean(pairs.filter((p) => p.without.kind !== "probability").map((p) => p.without.result.abs_rel_err)),
  };
}

export function lessonsOverview() {
  return {
    lessons: lessonRows().map((l) => ({ id: l.id, text: l.text, status: l.status, kind: l.lesson_kind, derived_from: l.derived_from, target: l.target })).sort((a, b) => String(a.status).localeCompare(String(b.status))),
    autopsies: [...currentRows("analyses").values()].filter((a) => !a.recorded_to && a.analyst === AUTOPSY_ANALYST).map((a) => ({ key: a.natural_key, statement: a.statement, ...a.payload })).sort((a, b) => String(a.country).localeCompare(String(b.country), "fa")),
    effect: compareLessonEffect(),
    open_proposals: [...currentRows("queue").values()].filter((q) => !q.recorded_to && q.kind === "country_lesson" && q.status === "open").length,
  };
}

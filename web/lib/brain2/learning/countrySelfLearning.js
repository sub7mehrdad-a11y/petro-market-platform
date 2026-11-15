import { BRAIN_MODEL, resolveBrainKey } from "../../brain";
import { generateContent } from "../../geminiFetch";
import { getDomain } from "../domain/index";
import { loadIndex, upsertAnalysis } from "../memory";
import { currentRows } from "../store";
import { loadLearningConfig } from "./config";
import { readLearningState, writeLearningState } from "./consolidation";
import { classifyCountryError } from "./countryLessons";
import { backtestCountries, latestBacktestRows, runCountryBacktest } from "./countryBacktest";
import { activeCountryMethod, addCountryMethod, countryMethodRows, ensureCountryMethod, promoteCountryMethod, setCountryMethodStatus } from "./countryMethod";

// یادگیری خودکار پیش‌بین کشور (۱۰-ب)، بدون بازبینی انسانی. هر دور:
//   ۱) خطاهای بزرگِ نیمه‌ی «آموزش» کشورها از چند زاویه کالبدشکافی می‌شود (اطلاعات اولیه، قاعده، روش، عامل ویژه‌ی کشور، کالیبراسیون) و علت ریشه‌ای
//      + یک «قاعده‌ی استدلال کلی» پیشنهاد می‌شود. قاعده‌ی کلی = نه جابه‌جایی درصدیِ کور («۲۴٪ پایین‌تر بگیر»)، نه نام کشور، نه عدد.
//   ۲) مدل یک نسخه‌ی تازه‌ی روش (فهرست قاعده‌ها + شیوه‌ی انتخاب کشورهای مقایسه‌ای) می‌نویسد.
//   ۳) نسخه‌ی تازه روی نیمه‌ی «آزمون» (کشورهایی که از خطایشان درس نگرفته) در برابر نسخه‌ی فعلی سنجیده می‌شود؛ فقط اگر واقعاً بهتر بود فعال می‌شود،
//      وگرنه بایگانی (پاک نمی‌شود). دور بعد نقش دو نیمه عوض می‌شود. با دو دور بی‌بهبود پیاپی (plateau) یا سقف دور، تمام می‌شود.
// تأیید انسان لازم نیست؛ جایش را «بهتر بودن روی کشورهای دیده‌نشده» گرفته است (اصل پروتکل: یادگیری یعنی بهتر از خط مبنا/نسخه‌ی قبل روی داده‌ی تازه).

const DEFAULTS = { min_pairs: 6, min_gain_err: 0.02, max_iterations: 4, plateau: 2, max_rules: 6, bad_err: 0.25, max_fix_chars: 260 };
export const countryLearningConfig = () => {
  try { return { ...DEFAULTS, ...(loadLearningConfig().country_learning || {}) }; } catch { return { ...DEFAULTS }; }
};

export const ROOT_CAUSES = {
  data_input: "اطلاعات اولیه (جدول/شاخص یا انتخاب کشورهای مقایسه‌ای) کافی یا مناسب نبود",
  reasoning_rule: "قاعده‌ی استدلالِ به‌کاررفته برای این کشور معتبر نبود",
  method_structure: "ساختار روش (از کجا شروع شد و چه تعدیل‌هایی) اشتباه بود",
  unknowable_country_factor: "عامل ویژه‌ی کشور که از داده‌های موجود قابل‌دانستن نبود",
  calibration: "بازه/اطمینان با عدم‌قطعیت واقعی نمی‌خواند",
};
const ANALYST = "autopsy-country";
const DIAG_SYSTEM = `تو بازبین روش‌شناسی یک پیش‌بین هستی. چند پیش‌بینیِ بدِ یک کشور را با مقدار واقعی، حدس قبلی و دلیلی که خودِ پیش‌بین داده می‌بینی. «سرنخ کد» فقط کمک است.
برای هر مورد خودت از چند زاویه بپرس و جواب بده (هر جواب یک تا دو جمله‌ی فارسی، مستند به همین پیام):
۱) info — اطلاعات اولیه: شاخص‌ها و جدول کشورهای مقایسه‌ای برای این هدف مرتبط و کافی بود؟ کدام کشورِ شبیه‌تر را نادیده گرفتم؟
۲) rule — قاعده: از چه قاعده یا میان‌بُری استفاده کردم و چرا اینجا معتبر نبود؟
۳) method — روش: ترتیب استدلال (شروع از کجا، چه تعدیل‌هایی) کجا اشتباه بود؟
۴) country_factor — آیا عاملی ویژه‌ی این کشور بود که از داده‌ها قابل‌دانستن نبود؟
۵) calibration — بازه‌ام با عدم‌قطعیت واقعی جور بود؟
سپس "root_cause" را دقیقاً یکی از data_input | reasoning_rule | method_structure | unknowable_country_factor | calibration بگذار.
"general_fix": یک قاعده‌ی استدلال کلی و قابل‌استفاده برای کشورهای بعدی که اگر در دستور بود این نوع خطا کم می‌شد. ممنوع: جابه‌جایی درصدیِ کور (مثلاً «۲۰٪ پایین‌تر بگیر»)، نام هر کشور، هر عدد/رقم. اگر خطا از عامل ناشناختنی بود null بگذار.
خروجی فقط JSON: {"items":[{"target":"<id>","answers":{"info":"","rule":"","method":"","country_factor":"","calibration":""},"root_cause":"","general_fix":null}]} با یک آیتم برای هر target پرسیده‌شده.`;
const REVISE_SYSTEM = `تو روش یک پیش‌بین کشور را بازنویسی می‌کنی. روش = فهرست کوتاهی از «قاعده‌های استدلال» (کلی، قابل‌اجرا، بدون نام کشور و بدون هیچ رقم) + شیوه‌ی انتخاب کشورهای مقایسه‌ای.
قاعده‌های فعلی و چند اصلاح پیشنهادی (از کالبدشکافی‌ی اشتباه‌ها) را می‌بینی. قاعده‌های فعلی‌ای که با اشتباه‌ها نمی‌خواند اصلاح یا حذف کن، اصلاح‌های پیشنهادی را ادغام و تکراری‌ها را یکی کن. ممنوع: جابه‌جایی درصدیِ کور، نام کشور، هر رقم.
"comparables": {"mode":"all"} (همه‌ی کشورهای پژوهش‌شده) یا {"mode":"nearest","k":6} (فقط k کشور نزدیک از نظر درآمد سرانه) — فقط اگر کالبدشکافی‌ها نشان می‌دهند مقایسه با کشورهای نامرتبط آسیب زده.
خروجی فقط JSON: {"rules":["..."],"comparables":{"mode":"all"},"rationale":"حداکثر ۳۰۰ نویسه: چه چیزی و چرا عوض شد"}`;

async function defaultGenerate({ system, input }) {
  const key = resolveBrainKey();
  if (!key) throw new Error("کلید مغز تنظیم نشده.");
  return generateContent({ apiKey: key, model: BRAIN_MODEL, systemInstruction: system, input, generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json" } });
}
const parseJson = (t) => { const m = String(t).match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } };
const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();

// جابه‌جایی درصدیِ کور یا ضرب در ضریب (ممنوع)
const BLANKET = /[0-9۰-۹][0-9۰-۹.,٫]*\s*(٪|درصد)|(٪|درصد).{0,25}(بالاتر|پایین‌تر|کمتر|بیشتر|کاهش|افزایش)|(بالاتر|پایین‌تر|کمتر|بیشتر|کاهش|افزایش).{0,25}(٪|درصد)|ضرب\s*(کن|کردن|در)|ضریب\s*[0-9۰-۹]/;
const DIGIT = /[0-9۰-۹]/;

/** قاعده‌ی کلی معتبر؟ برمی‌گرداند null (معتبر) یا دلیل رد. countryNames برای رد نام کشور. */
export function badRule(text, countryNames = [], maxChars = DEFAULTS.max_fix_chars) {
  const t = norm(text);
  if (t.length < 15) return "خیلی کوتاه";
  if (t.length > maxChars) return "خیلی بلند";
  if (BLANKET.test(t)) return "جابه‌جایی درصدیِ کور";
  if (DIGIT.test(t)) return "حاوی رقم";
  const hit = countryNames.find((c) => c && t.includes(c));
  if (hit) return `حاوی نام کشور (${hit})`;
  return null;
}

/** نیمه‌ی کشور: ترتیب الفبایی، شماره‌ی زوج ← ۰، فرد ← ۱ (ثابت و بدون تصادف). */
export const foldOf = (country, countries) => [...countries].sort((a, b) => a.localeCompare(b, "fa")).indexOf(country) % 2;

// ردیف‌های بدون نسخه (پیش از وجود نسخه‌ها) همان دستور پایه‌اند = v1؛ برای هر (کشور، هدف) فقط تازه‌ترین نگه داشته می‌شود
function rowsOfMethod(version) {
  const best = new Map();
  for (const r of latestBacktestRows()) {
    if (r.forward || r.with_lessons || (r.method_version || "v1") !== version) continue;
    const k = `${r.country}|${r.target}`;
    if (!best.has(k) || String(r.made_at) > String(best.get(k).made_at)) best.set(k, r);
  }
  return [...best.values()];
}
const labelOf = (id) => getDomain().countryBacktest.targets.find((t) => t.id === id)?.label || id;

/** برای کشورهایی که با این نسخه‌ی روش اجرا ندارند، اجرا می‌کند. خطاها را برمی‌گرداند. */
export async function ensureMethodRows(countries, method, { generate, model, now, log = () => {} }) {
  const have = new Set(rowsOfMethod(method.version).map((r) => r.country));
  const failed = [];
  for (const c of countries) {
    if (have.has(c)) continue;
    log(`اجرای ${method.method_version} روی ${c}…`);
    let r = await runCountryBacktest(c, { generate, model, now, method });
    if (!r.ok) r = await runCountryBacktest(c, { generate, model, now, method }); // یک تلاش دوباره (قطع شبکه)
    if (!r.ok) { failed.push(c); log(`  ✗ ${c}: ${r.error}`); }
  }
  return failed;
}

const mean = (xs) => { const v = xs.filter((x) => x !== null && x !== undefined); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10000) / 10000 : null; };
const errOf = (r) => (r.kind === "probability" ? r.result.brier : r.result.abs_rel_err);

/** خلاصه‌ی عملکرد یک نسخه روی فهرستی از کشورها. */
export function scoreMethod(version, countries) {
  const rows = rowsOfMethod(version).filter((r) => countries.includes(r.country) && r.result?.scored);
  const num = rows.filter((r) => r.kind !== "probability");
  return { n: rows.length, mean_abs_rel_err: mean(num.map((r) => r.result.abs_rel_err)), mean_skill: mean(rows.map((r) => r.result.skill)), coverage: num.length ? Math.round((num.filter((r) => r.result.inside).length / num.length) * 100) / 100 : null };
}

/** مقایسه‌ی دو نسخه روی جفت‌های مشترک (کشور، هدف). */
export function comparePair(curVersion, candVersion, countries) {
  const idx = (v) => new Map(rowsOfMethod(v).filter((r) => countries.includes(r.country) && r.result?.scored).map((r) => [`${r.country}|${r.target}`, r]));
  const a = idx(curVersion), b = idx(candVersion);
  const pairs = [...b.keys()].filter((k) => a.has(k)).map((k) => ({ cur: a.get(k), cand: b.get(k) }));
  const num = pairs.filter((p) => p.cur.kind !== "probability");
  return {
    pairs: pairs.length, better: pairs.filter((p) => errOf(p.cand) < errOf(p.cur)).length, worse: pairs.filter((p) => errOf(p.cand) > errOf(p.cur)).length,
    err_current: mean(num.map((p) => p.cur.result.abs_rel_err)), err_candidate: mean(num.map((p) => p.cand.result.abs_rel_err)),
    skill_current: mean(pairs.map((p) => p.cur.result.skill)), skill_candidate: mean(pairs.map((p) => p.cand.result.skill)),
  };
}

/** تصمیم پذیرش از مقایسه‌ی روی کشورهای دیده‌نشده. */
export function decide(cmp, cfg = countryLearningConfig()) {
  if (cmp.pairs < cfg.min_pairs) return { accept: false, reason: `نمونه‌ی مقایسه کم است (${cmp.pairs} از ${cfg.min_pairs})` };
  if (cmp.err_candidate === null || cmp.err_current === null) return { accept: false, reason: "خطای قابل‌مقایسه‌ای نبود" };
  const gain = cmp.err_current - cmp.err_candidate;
  if (gain < cfg.min_gain_err) return { accept: false, reason: `بهبود خطای نسبی (${Math.round(gain * 1000) / 10}٪ امتیاز) از حداقل ${Math.round(cfg.min_gain_err * 100)}٪ کمتر است` };
  if (cmp.worse > cmp.better) return { accept: false, reason: `در موارد بدتر (${cmp.worse}) بیش از بهتر (${cmp.better}) شد` };
  return { accept: true, reason: `خطای نسبی روی ${cmp.pairs} هدفِ کشورهای دیده‌نشده از ${Math.round(cmp.err_current * 1000) / 10}٪ به ${Math.round(cmp.err_candidate * 1000) / 10}٪ رسید (بهتر ${cmp.better}، بدتر ${cmp.worse})` };
}

/** کالبدشکافیِ چندزاویه‌ی خطاهای بزرگ یک کشور. برمی‌گرداند آیتم‌های معتبر {target, root_cause, answers, general_fix, rejected}. */
export async function diagnoseCountry(country, rows, { generate, now, cfg }) {
  const table = getDomain().countryBacktest.loadCountryTable();
  const names = table.map((t) => t.country);
  const bad = [];
  for (const r of rows.filter((x) => x.country === country && x.result?.scored)) {
    const others = table.filter((t) => t.country !== country).map((t) => t.truth[r.target]);
    const clue = classifyCountryError(r, others);
    if (clue) bad.push({ r, clue });
  }
  if (!bad.length) return [];
  const bias = new Map();
  for (const r of latestBacktestRows().filter((x) => !x.with_lessons && x.kind !== "probability" && x.result?.scored && x.truth > 0 && x.forecast)) {
    (bias.get(r.target) || bias.set(r.target, []).get(r.target)).push((r.forecast.point - r.truth) / r.truth);
  }
  const input = `کشور: ${country}\n` + bad.map(({ r, clue }) => {
    const b = bias.get(r.target);
    const sys = b && b.length >= 3 ? `؛ سرنخ تجمعی: در ${b.length} کشورِ دیگر هم میانگین خطای علامت‌دار این هدف ${Math.round((b.reduce((x, y) => x + y, 0) / b.length) * 100)}٪ بوده` : "";
    return `--- target: ${r.target} (${labelOf(r.target)})\nحدس: ${JSON.stringify(r.forecast)}؛ واقعی: ${r.truth}؛ خط مبنا: ${r.baseline}\nدلیل خودِ پیش‌بین: ${r.reason || "—"}\nسرنخ کد: ${clue.label}${sys}\nمقدار این هدف در کشورهای مقایسه‌ای: ${table.filter((t) => t.country !== country).map((t) => `${t.country}=${t.truth[r.target] ?? "؟"}`).join("، ")}`;
  }).join("\n\n");
  let j;
  try { j = parseJson(await generate({ system: DIAG_SYSTEM, input })); } catch { return []; }
  const idx = loadIndex();
  const out = [];
  for (const it of Array.isArray(j?.items) ? j.items : []) {
    const hit = bad.find((b) => b.r.target === it?.target);
    if (!hit) continue;
    const root = ROOT_CAUSES[it.root_cause] ? it.root_cause : null;
    let fix = root && root !== "unknowable_country_factor" && it.general_fix ? norm(it.general_fix) : null;
    let rejected = null;
    if (fix) { rejected = badRule(fix, names, cfg.max_fix_chars); if (rejected) fix = null; }
    const answers = Object.fromEntries(["info", "rule", "method", "country_factor", "calibration"].map((k) => [k, norm(it.answers?.[k]).slice(0, 300)]));
    upsertAnalysis(idx, {
      key: `${ANALYST}-v2|${hit.r.id}`, analyst: ANALYST, method_version: "country-autopsy-v2", model: BRAIN_MODEL, claim_ids: [],
      statement: `${country} / ${it.target}: ${root ? ROOT_CAUSES[root] : "علت نامعلوم"}${fix ? ` ← قاعده: ${fix}` : ""}`,
      payload: { country, target: it.target, run_id: hit.r.run_id, method_version: hit.r.method_version, category: hit.clue.category, category_fa: hit.clue.label, root_cause: root, root_cause_fa: root ? ROOT_CAUSES[root] : null, answers, general_fix: fix, fix_rejected: rejected, forecast: hit.r.forecast, truth: hit.r.truth, baseline: hit.r.baseline },
    }, { at: now.toISOString() });
    out.push({ target: it.target, root_cause: root, answers, general_fix: fix, rejected });
  }
  return out;
}

/** مدل نسخه‌ی تازه‌ی روش را از روی اصلاح‌های کلی می‌نویسد. null اگر چیزی معتبر نبود یا تغییری نکرد. */
export async function proposeCountryRevision(current, fixes, { generate, cfg }) {
  const names = getDomain().countryBacktest.loadCountryTable().map((t) => t.country);
  const uniq = [...new Map(fixes.map((f) => [norm(f.general_fix), f])).values()];
  if (!uniq.length) return null;
  const input = `قاعده‌های فعلی (${current.rules?.length || 0}):\n${(current.rules || []).map((r, i) => `${i + 1}) ${r}`).join("\n") || "(هیچ)"}\nشیوه‌ی مقایسه‌ای فعلی: ${JSON.stringify(current.comparables)}\n\nاصلاح‌های پیشنهادیِ کالبدشکافی‌ها (علت ریشه‌ای):\n${uniq.map((f, i) => `${i + 1}) [${f.root_cause}] ${f.general_fix}`).join("\n")}`;
  let j;
  try { j = parseJson(await generate({ system: REVISE_SYSTEM, input })); } catch { return null; }
  if (!j || !Array.isArray(j.rules)) return null;
  const rules = [];
  for (const r of j.rules) {
    const t = norm(r);
    if (!badRule(t, names, cfg.max_fix_chars) && !rules.includes(t)) rules.push(t);
  }
  const trimmed = rules.slice(0, cfg.max_rules);
  const c = j.comparables?.mode === "nearest" ? { mode: "nearest", k: Math.max(3, Math.min(Number(j.comparables.k) || 6, 12)) } : { mode: "all", k: 6 };
  const same = JSON.stringify(trimmed) === JSON.stringify(current.rules || []) && c.mode === (current.comparables?.mode || "all");
  if (same || (!trimmed.length && !(current.rules || []).length)) return null;
  return { rules: trimmed, comparables: c, rationale: String(j.rationale || "").slice(0, 400) };
}

/**
 * حلقه‌ی کامل. generate قابل‌تزریق. onLog برای پیشرفت. برمی‌گرداند خلاصه‌ی اجرا.
 */
export async function runSelfImprovement({ generate = defaultGenerate, model = BRAIN_MODEL, now = new Date(), log = () => {}, maxIterations } = {}) {
  const cfg = countryLearningConfig();
  const maxIt = maxIterations ?? cfg.max_iterations;
  const at = () => new Date(now.getTime()).toISOString();
  ensureCountryMethod({ at: at() });
  const countries = backtestCountries();
  const summary = { started_with: activeCountryMethod().version, iterations: [], failed_runs: [], countries: countries.length };
  let active = activeCountryMethod();
  summary.initial = { version: active.version };
  let noGain = 0;
  for (let it = 1; it <= maxIt; it++) {
    active = activeCountryMethod();
    const failed = await ensureMethodRows(countries, active, { generate, model, now, log });
    summary.failed_runs.push(...failed);
    const usable = countries.filter((c) => !failed.includes(c));
    if (it === 1) summary.initial = { version: active.version, ...scoreMethod(active.version, usable) };
    const fold = it % 2;
    const train = usable.filter((c) => foldOf(c, countries) === fold);
    const test = usable.filter((c) => foldOf(c, countries) !== fold);
    log(`دور ${it}: آموزش روی ${train.length} کشور، آزمون روی ${test.length} کشور دیده‌نشده (روش فعال ${active.version})`);
    const rows = rowsOfMethod(active.version);
    const fixes = [];
    let diagnosed = 0;
    for (const c of train) {
      const items = await diagnoseCountry(c, rows, { generate, now, cfg });
      diagnosed += items.length;
      for (const x of items) if (x.general_fix) fixes.push(x);
    }
    log(`  ${diagnosed} خطا کالبدشکافی شد؛ ${fixes.length} اصلاح کلی معتبر`);
    const rec = { iteration: it, train, test, diagnosed, fixes: fixes.length, from: active.version };
    summary.iterations.push(rec);
    if (!fixes.length) { rec.outcome = "no_fixes"; noGain += 1; log("  اصلاح قابل‌اجرایی پیدا نشد"); if (noGain >= cfg.plateau) break; continue; }
    const proposal = await proposeCountryRevision(active, fixes, { generate, cfg });
    if (!proposal) { rec.outcome = "no_valid_proposal"; noGain += 1; log("  مدل نسخه‌ی معتبر و متفاوتی ننوشت"); if (noGain >= cfg.plateau) break; continue; }
    const cand = addCountryMethod({ parent: active, rules: proposal.rules, comparables: proposal.comparables, rationale: proposal.rationale, derivedFrom: train, at: at() });
    log(`  نسخه‌ی ${cand.version}: ${proposal.rules.length} قاعده؛ ${proposal.rationale}`);
    const f2 = await ensureMethodRows(test, cand, { generate, model, now, log });
    summary.failed_runs.push(...f2);
    const cmpCountries = test.filter((c) => !f2.includes(c));
    const cmp = comparePair(active.version, cand.version, cmpCountries);
    const d = decide(cmp, cfg);
    Object.assign(rec, { candidate: cand.version, comparison: cmp, accepted: d.accept, reason: d.reason, outcome: d.accept ? "promoted" : "archived" });
    if (d.accept) {
      promoteCountryMethod(cand, d.reason, { at: at(), score: { ...cmp, held_out_countries: cmpCountries } });
      noGain = 0;
      log(`  ✓ پذیرفته شد و فعال شد: ${d.reason}`);
    } else {
      setCountryMethodStatus(cand, "بایگانی", `رد شد: ${d.reason}`, { at: at(), extra: { backtest_score: { ...cmp, held_out_countries: cmpCountries } } });
      noGain += 1;
      log(`  ✗ بایگانی شد: ${d.reason}`);
      if (noGain >= cfg.plateau) { log("  دو دور پیاپی بی‌بهبود؛ توقف"); break; }
    }
  }
  const fin = activeCountryMethod();
  await ensureMethodRows(countries, fin, { generate, model, now, log });
  summary.final = { version: fin.version, ...scoreMethod(fin.version, countries.filter((c) => !summary.failed_runs.includes(c))) };
  summary.promoted = summary.iterations.filter((i) => i.accepted).length;
  return summary;
}

// -------------------------------------------------------------------------------- اجرای پس‌زمینه با وضعیت پایدار (برای صفحه‌ی مدیر)
const STALE_MS = 20 * 60 * 1000;
export function countryLearningStatus() {
  const s = readLearningState().country_learning || null;
  const alive = !!globalThis.__countryLearning?.running;
  const stale = s?.running && !alive && Date.now() - new Date(s.updated_at || 0).getTime() > STALE_MS;
  return s ? { ...s, running: !!s.running && (alive || !stale) } : { running: false, log: [] };
}

function persist(patch) {
  const prev = readLearningState().country_learning || { log: [] };
  writeLearningState({ country_learning: { ...prev, ...patch, updated_at: new Date().toISOString() } });
}

/** شروع در پس‌زمینه (برنمی‌گردد تا تمام شود؛ ولی صدازننده await نمی‌کند). اگر در حال اجراست {started:false}. */
export function startSelfImprovement(opts = {}) {
  if (globalThis.__countryLearning?.running || countryLearningStatus().running) return { started: false, reason: "در حال اجراست" };
  globalThis.__countryLearning = { running: true };
  const lines = [];
  const log = (m) => { lines.push(`${new Date().toISOString().slice(11, 19)} ${m}`); persist({ log: lines.slice(-150) }); };
  persist({ running: true, started_at: new Date().toISOString(), log: [], summary: null, error: null });
  (async () => {
    try {
      const summary = await runSelfImprovement({ ...opts, log });
      persist({ running: false, finished_at: new Date().toISOString(), summary, log: lines.slice(-150) });
    } catch (err) {
      persist({ running: false, error: String(err?.message || err).slice(0, 300), log: lines.slice(-150) });
    } finally {
      globalThis.__countryLearning = { running: false };
    }
  })();
  return { started: true };
}

export function countryLearningOverview() {
  return {
    status: countryLearningStatus(),
    methods: countryMethodRows().map((m) => ({ version: m.version, status: m.status, rules: m.rules || [], comparables: m.comparables, parent: m.parent_version, rationale: (m.steps || [])[0] || null, validation: m.backtest_score, reason: m.change_reason, since: m.status_since })).sort((a, b) => Number(a.version.slice(1)) - Number(b.version.slice(1))),
    autopsies: [...currentRows("analyses").values()].filter((a) => !a.recorded_to && a.analyst === ANALYST && a.method_version === "country-autopsy-v2").map((a) => ({ country: a.payload.country, target: a.payload.target, target_label: labelOf(a.payload.target), root_cause: a.payload.root_cause, root_cause_fa: a.payload.root_cause_fa, category_fa: a.payload.category_fa, fix: a.payload.general_fix, rejected: a.payload.fix_rejected, answers: a.payload.answers, method_version: a.payload.method_version })).slice(-80),
    scores: countryMethodRows().map((m) => ({ version: m.version, status: m.status, ...scoreMethod(m.version, backtestCountries()) })),
  };
}

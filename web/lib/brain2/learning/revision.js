import { BRAIN_MODEL, resolveBrainKey } from "../../brain";
import { generateContent } from "../../geminiFetch";
import { ANALYSTS, SYSTEM, forecasterName, runAnalyst } from "../analysts";
import { currentVersion, getRound } from "../forecast";
import { raiseItem } from "../knowledge/queue";
import { currentRows } from "../store";
import { readScores } from "../scoring/read";
import { DAY, loadLearningConfig } from "./config";
import { METHOD_ROLES, activeMethod, addMethodVersion, experimentalMethods, methodObject, methodsOf, pendingMethods, setMethodStatus, versionsCreatedInLast } from "./methods";

// بازبینی روش (حلقه‌ی ۳، پروتکل ۹-۲ و ۹-۳):
//   ۱) با جمع شدن دست‌کم min_method_errors خطای «روش غلط» (کالبدشکافی) برای یک تحلیل‌گر شروع می‌شود (حداکثر یک تغییر در ماه).
//   ۲) مدل با دیدن خطاها نسخه‌ی تازه‌ی دستور روش را پیشنهاد می‌دهد.
//   ۳) نسخه‌ی تازه روی «همه‌ی» پیش‌بینی‌های سررسیدشده‌ی گذشته با حافظه‌ی همان زمان (asOf) اجرا می‌شود.
//   ۴) اگر بهبود از نوسان تصادفی (چند برابر خطای معیار) بزرگ‌تر بود ← آیتم صف بازبینی؛ با تأیید مدیر «آزمایشی» و موازی با فعال.
//   ۵) اگر در اجرای واقعی موازی هم بهتر بود ← آیتم ارتقا؛ با تأیید مدیر «فعال» و نسخه‌ی قبلی «بایگانی» (نه حذف).
// هیچ‌چیز خودکار عوض نمی‌شود. بدون مدل، فقط وضعیت و شمارش گزارش می‌شود.

const roleOf = (forecaster) => (/^machine:(stat|event):/.exec(forecaster) || [])[1] || null;

/** خطاهای «روش غلط»ِ پیش‌بین فعالِ یک تحلیل‌گر (از کالبدشکافی‌ها). */
export function methodErrors(role) {
  return [...currentRows("analyses").values()]
    .filter((a) => !a.recorded_to && a.analyst === "autopsy" && a.payload?.category === "method_wrong" && roleOf(a.payload.forecaster) === role && !String(a.payload.forecaster).includes("@"))
    .map((a) => ({ key: a.natural_key, ...a.payload, statement: a.statement }))
    .sort((x, y) => (y.surprise || 0) - (x.surprise || 0));
}

export function revisionState(role, now = new Date()) {
  const cfg = loadLearningConfig().methods;
  const errors = methodErrors(role);
  const open = [...pendingMethods(role), ...experimentalMethods(role)];
  let blocked = null;
  if (errors.length < cfg.min_method_errors) blocked = `خطای «روش غلط» کافی نیست (${errors.length} از ${cfg.min_method_errors})`;
  else if (open.length) blocked = `نسخه‌ی ${open[0].version} هنوز در جریان است (${open[0].status})`;
  else if (versionsCreatedInLast(role, 30, now) >= cfg.max_changes_per_month) blocked = "سقف تغییر روش در ماه رسیده است";
  return { role, errors: errors.length, needed: cfg.min_method_errors, needs: !blocked, blocked_reason: blocked };
}

const PROPOSE_SYSTEM = `تو بهبوددهنده‌ی دستور روش یک تحلیل‌گر پیش‌بین قیمت هستی. دستور سیستمیِ فعلی و چند خطای سنجیده‌شده‌ی «روش غلط» (داده و قاعده درست بودند، استدلال غلط بود) را می‌بینی.
خروجی فقط یک JSON: {"system": "متن کامل دستور سیستمی تازه (فارسی؛ باید همان قالب خروجی JSON با point/lo/hi/rationale را حفظ کند)", "rationale": "حداکثر ۳۰۰ نویسه: چه چیزی و چرا عوض شد"}
قانون: تغییر کوچک و مشخص باشد، نه بازنویسی کلی؛ فقط از الگوی تکرارشونده‌ی خطاها نتیجه بگیر؛ هیچ داده‌ی تازه یا عددی اضافه نکن.`;

async function defaultGenerate({ system, input }) {
  const key = resolveBrainKey();
  if (!key) throw new Error("کلید مغز تنظیم نشده.");
  return generateContent({ apiKey: key, model: BRAIN_MODEL, systemInstruction: system, input, generationConfig: { temperature: 0.3, maxOutputTokens: 4096, responseMimeType: "application/json" } });
}
const parseJson = (t) => { const m = String(t).match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } };

/** آزمون روی همه‌ی سابقه‌ی سررسیدشده (۹-۲ گام ۳) با حافظه‌ی همان زمان. generate برای اجرای تحلیل‌گر با روش نامزد. */
export async function backtest(role, candidateRow, { generate = null, now = new Date() } = {}) {
  const cfg = loadLearningConfig().methods.backtest;
  const active = activeMethod(role);
  const activeName = (rows) => rows.filter((r) => r.kind === "version" && r.forecaster.startsWith(`machine:${role}:`) && !r.forecaster.includes("@"));
  const scoreRows = readScores();
  const cases = [];
  const seen = new Set();
  for (const r of activeName(scoreRows).sort((a, b) => b.made_at.localeCompare(a.made_at))) {
    const k = `${r.round_id}|${r.question_id}`;
    if (seen.has(k)) continue; // هر پرسش یک‌بار: آخرین نسخه‌ی فعال
    seen.add(k);
    cases.push(r);
    if (cases.length >= cfg.max_cases) break;
  }
  const diffs = [];
  const detail = [];
  for (const r of cases) {
    const round = getRound(r.round_id);
    const q = round?.questions.find((x) => x.id === r.question_id);
    if (!q) continue;
    const out = await runAnalyst(role, { question: q, limits: round.limits, now: new Date(r.made_at), asOf: r.made_at, generate, method: methodObject(candidateRow) });
    if (!out.ok) continue;
    const errC = Math.abs(out.point - r.outcome) / r.outcome;
    const errA = r.abs_rel_err;
    diffs.push(errA - errC); // مثبت = نامزد بهتر
    detail.push({ question_id: r.question_id, active_err: Math.round(errA * 10000) / 10000, candidate_err: Math.round(errC * 10000) / 10000 });
  }
  const n = diffs.length;
  const mean = n ? diffs.reduce((a, b) => a + b, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const se = n > 1 ? sd / Math.sqrt(n) : Infinity;
  const passes = n >= cfg.min_cases && mean > 0 && mean > cfg.improvement_se_multiple * se;
  return { role, candidate: candidateRow.version, against: active?.version || null, n, mean_improvement: Math.round(mean * 10000) / 10000, se: se === Infinity ? null : Math.round(se * 10000) / 10000, passes, reason: n < cfg.min_cases ? `نمونه‌ی سررسیدشده کم است (${n} از ${cfg.min_cases})` : !(mean > 0) ? "بهبودی نبود" : !passes ? "بهبود از نوسان تصادفی بزرگ‌تر نیست" : null, detail };
}

/**
 * یک چرخه‌ی کامل پیشنهاد برای یک تحلیل‌گر: شرط شروع ← نسخه‌ی تازه از مدل ← آزمون روی سابقه ← (در صورت موفقیت) آیتم صف.
 * generate: {propose, analyst} قابل‌تزریق. برمی‌گرداند {status, ...}.
 */
export async function proposeRevision(role, { generate = {}, now = new Date() } = {}) {
  const st = revisionState(role, now);
  if (!st.needs) return { status: "not_needed", ...st };
  const at = now.toISOString();
  const active = activeMethod(role);
  const errs = methodErrors(role).slice(0, 12);
  let j;
  try {
    j = parseJson(await (generate.propose || defaultGenerate)({ system: PROPOSE_SYSTEM, input: `دستور سیستمی فعلی:\n${active?.system || SYSTEM[role]}\n\nخطاهای «روش غلط» (${st.errors} مورد؛ ${errs.length} مورد پرغافلگیری):\n${errs.map((e, i) => `${i + 1}) ${e.statement} [غافلگیری ${e.surprise}، خطا ${e.abs_rel_err}]`).join("\n")}` }));
  } catch (err) {
    return { status: "model_failed", error: String(err?.message || err).slice(0, 160) };
  }
  const cfg = loadLearningConfig().methods;
  if (!j || typeof j.system !== "string" || j.system.length < 200 || j.system.length > cfg.max_system_chars || !/"point"/.test(j.system) || !/"lo"/.test(j.system) || !/"hi"/.test(j.system)) return { status: "invalid_proposal" };
  const row = addMethodVersion(role, { system: j.system, rationale: j.rationale, parent: active?.version || "v1", at });
  const bt = await backtest(role, row, { generate: generate.analyst, now });
  const rowWithScore = setMethodStatus(row, "پیشنهادی", "نتیجه‌ی آزمون روی سابقه ثبت شد", { at, extra: { backtest_score: bt } });
  if (!bt.passes) {
    setMethodStatus(rowWithScore, "بایگانی", `آزمون روی سابقه رد شد: ${bt.reason}`, { at });
    return { status: "rejected_by_backtest", backtest: bt, version: row.version };
  }
  raiseItem({
    natural_key: `method_proposal|${role}|${row.version}`, kind: "method_proposal", group: "methods", label: `نسخه‌ی تازه‌ی روش ${ANALYSTS[role].method} (${row.version}): بهبود ${Math.round(bt.mean_improvement * 1000) / 10}٪ خطای نسبی روی ${bt.n} پیش‌بینی گذشته (خطای معیار ${bt.se}). ${String(j.rationale || "").slice(0, 160)}`,
    subject: role, period: null, spread: bt.mean_improvement, role, version: row.version,
    members: [{ claim_key: `method:${role}:${row.version}`, metric: "method", source: forecasterName(role, ANALYSTS[role].model()), value: bt.mean_improvement }],
  }, { at });
  return { status: "proposed", backtest: bt, version: row.version };
}

/** ارزیابی اجرای موازی: نسخه‌ی آزمایشی در برابر فعال روی پرسش‌های سررسیدشده‌ی مشترک (۹-۲ گام ۵). */
export function evaluatePromotion(role, { now = new Date() } = {}) {
  const cfg = loadLearningConfig().methods.parallel;
  const out = [];
  const scoreRows = readScores().filter((r) => r.kind === "time_avg");
  for (const exp of experimentalMethods(role)) {
    const weeks = (now.getTime() - new Date(exp.status_since).getTime()) / (7 * DAY);
    const expName = (r) => r.forecaster.startsWith(`machine:${role}:`) && r.forecaster.endsWith(`@${exp.version}`);
    const actName = (r) => r.forecaster.startsWith(`machine:${role}:`) && !r.forecaster.includes("@");
    const exps = scoreRows.filter(expName);
    const diffs = exps.map((e) => { const a = scoreRows.find((r) => actName(r) && r.question_id === e.question_id); return a ? a.abs_rel_err - e.abs_rel_err : null; }).filter((x) => x !== null);
    const n = diffs.length;
    const mean = n ? diffs.reduce((a, b) => a + b, 0) / n : 0;
    const ok = weeks >= cfg.min_weeks && n >= cfg.min_resolved && mean >= cfg.margin;
    out.push({ role, version: exp.version, weeks: Math.round(weeks * 10) / 10, resolved: n, mean_improvement: Math.round(mean * 10000) / 10000, ready: ok });
    if (ok) {
      raiseItem({
        natural_key: `method_promotion|${role}|${exp.version}`, kind: "method_promotion", group: "methods", label: `ارتقای روش ${exp.method_version} به «فعال»: در اجرای واقعی موازی (${n} پرسش، ${Math.round(weeks)} هفته) ${Math.round(mean * 1000) / 10}٪ خطای نسبی کمتر از نسخه‌ی فعلی.`,
        subject: role, period: null, spread: mean, role, version: exp.version, members: [{ claim_key: `method:${role}:${exp.version}`, metric: "method", source: `machine:${role}`, value: mean }],
      }, { at: now.toISOString() });
    }
  }
  return out;
}

/** تصمیم‌های مدیر روی آیتم‌های روش را اجرا می‌کند (idempotent): پیشنهاد پذیرفته ← آزمایشی؛ رد ← بایگانی؛ ارتقا ← فعال و قبلی بایگانی. */
export function syncMethodDecisions({ now = new Date() } = {}) {
  const at = now.toISOString();
  const applied = [];
  for (const q of currentRows("queue").values()) {
    if (q.recorded_to || q.status !== "resolved" || !["method_proposal", "method_promotion"].includes(q.kind)) continue;
    const row = methodsOf(q.role).find((r) => r.version === q.version);
    if (!row) continue;
    const d = q.resolution?.decision;
    if (q.kind === "method_proposal" && row.status === "پیشنهادی") {
      if (d === "accept") { setMethodStatus(row, "آزمایشی", `تأیید مدیر (${q.resolution.by})؛ اجرای موازی شروع شد`, { at }); applied.push(`${q.role}-${q.version}: آزمایشی`); }
      else { setMethodStatus(row, "بایگانی", `رد مدیر (${q.resolution?.by || "?"})`, { at }); applied.push(`${q.role}-${q.version}: بایگانی`); }
    } else if (q.kind === "method_promotion" && row.status === "آزمایشی") {
      if (d === "accept") {
        const old = activeMethod(q.role);
        if (old) setMethodStatus(old, "بایگانی", `جایگزین‌شده با ${q.version} (تأیید ${q.resolution.by})`, { at });
        setMethodStatus(row, "فعال", `ارتقا با تأیید مدیر (${q.resolution.by})`, { at });
        applied.push(`${q.role}-${q.version}: فعال`);
      } else { setMethodStatus(row, "بایگانی", `ارتقا رد شد (${q.resolution?.by || "?"})`, { at }); applied.push(`${q.role}-${q.version}: بایگانی`); }
    }
  }
  return applied;
}

/** وضعیت روش‌ها برای مدیر. */
export function methodsOverview(now = new Date()) {
  return METHOD_ROLES.map((role) => ({
    role, state: revisionState(role, now),
    versions: [...currentRows("methods").values()].filter((r) => !r.recorded_to && r.analyst === role).map((r) => ({ version: r.version, status: r.status, method_version: r.method_version, parent: r.parent_version, backtest: r.backtest_score && { n: r.backtest_score.n, mean_improvement: r.backtest_score.mean_improvement, passes: r.backtest_score.passes }, reason: r.change_reason, since: r.status_since })).sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true })),
  }));
}

export { currentVersion };

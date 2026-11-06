import fs from "fs";
import path from "path";
import { currentRows, putRow, stampRow } from "./store";

// دفتر پیش‌بینی (مرحله‌ی ۰ مغز): هر ماه یک «دور» باز می‌شود؛ هر کارشناس (و مغز) برای هر پرسش یک پیش‌بینی ثبت می‌کند.
// قانون‌ها (طبق سند بخش ۸، ۱۰ و دستور ساخت):
//  - پیش‌بینی بدون پرسش دقیق + تعریف هدف و منبع واقعیت + سررسید ثبت نمی‌شود (۸-۱).
//  - پیش‌بینی کاربر **پیش از دیدن** پیش‌بینی مغز ثبت می‌شود؛ مغز فقط بعد از ثبت همان کاربر برای همان پرسش دیده می‌شود (سمت سرور).
//  - بعد از ثبت ویرایش‌پذیر نیست (هیچ مسیری برای تغییر/حذف وجود ندارد؛ تکرار رد می‌شود).
//  - پیش‌بینی همکاران تا بسته شدن دور برای هیچ‌کس (جز خودش) دیده نمی‌شود؛ بعد از بسته شدن فقط مدیر می‌بیند (استقلال پیش از تجمیع).
//  - فیلدهای outcome/score اینجا هرگز نوشته نمی‌شوند؛ فقط جزء سنجش (مرحله‌ی ۴) آن‌ها را در فایل جدا می‌نویسد.

const CONFIG_FILE = path.join(process.cwd(), "..", "data", "brain", "forecast_config.json");
let cfgCache = null;

export function loadConfig() {
  const st = fs.statSync(CONFIG_FILE);
  if (cfgCache && cfgCache.mtime === st.mtimeMs) return cfgCache.cfg;
  const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  validateConfig(cfg);
  cfgCache = { mtime: st.mtimeMs, cfg };
  return cfg;
}

/** پرسشی که تعریف هدف، منبع واقعیت، کهنگی یا نوع قیمت ندارد نباید اصلاً ساخته شود (۸-۱ و ۸-۲). */
export function validateConfig(cfg) {
  const errs = [];
  if (!Array.isArray(cfg.questions) || !cfg.questions.length) errs.push("فهرست پرسش‌ها خالی است");
  for (const q of cfg.questions || []) {
    for (const f of ["key", "region_fa", "grade_fa", "price_type", "package_fa", "unit"]) if (!q[f]) errs.push(`${q.key || "؟"}: فیلد ${f} خالی است`);
    if (!["FOB", "CIF"].includes(q.price_type)) errs.push(`${q.key}: نوع قیمت باید FOB یا CIF باشد`);
    const t = q.truth || {};
    if (!t.source_id || !t.kind) errs.push(`${q.key}: منبع واقعیت تعریف نشده`);
    if (!Number.isFinite(t.max_staleness_days) || !Number.isFinite(t.lag_days)) errs.push(`${q.key}: lag_days و max_staleness_days لازم است`);
  }
  if (!cfg.cycle || !(cfg.cycle.submit_days > 0) || !(cfg.cycle.horizon_months >= 1)) errs.push("چرخه‌ی دور نامعتبر است");
  if (errs.length) throw new Error("forecast_config.json نامعتبر: " + errs.join("؛ "));
}

// -------------------------------------------------------------------------------- زمان
const pad = (n) => String(n).padStart(2, "0");

/** زمان فعلی به وقت تهران: {date:"YYYY-MM-DD", hour, month:"YYYY-MM"}. now قابل‌تزریق برای آزمون. */
export function tehranClock(now = new Date()) {
  const s = now.toLocaleString("sv-SE", { timeZone: "Asia/Tehran" }); // "2026-11-06 10:32:00"
  const [date, time] = s.split(" ");
  return { date, hour: Number(time.slice(0, 2)), month: date.slice(0, 7) };
}

export function addMonths(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

export function endOfMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}

export function addDaysIso(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

// -------------------------------------------------------------------------------- دورها
export function getRound(roundId) {
  for (const r of currentRows("rounds").values()) if (r.round_id === roundId) return r;
  return null;
}

export function listRounds() {
  return [...currentRows("rounds").values()].sort((a, b) => b.round_id.localeCompare(a.round_id));
}

/** دور ماه را (اگر نبود) باز می‌کند. پرسش‌ها با تعریف همان لحظه در خود دور ذخیره می‌شوند، پس تغییر بعدی تنظیمات دورهای قبل را عوض نمی‌کند. */
export function ensureRound(roundId, { by = "system", now = new Date() } = {}) {
  const existing = getRound(roundId);
  if (existing) return { round: existing, created: false };
  const cfg = loadConfig();
  const target_month = addMonths(roundId, cfg.cycle.horizon_months);
  const opened_at = now.toISOString();
  const closes_at = new Date(now.getTime() + cfg.cycle.submit_days * 86400000).toISOString();
  const questions = cfg.questions.map((q) => ({
    id: `${roundId}:${q.key}`,
    key: q.key,
    text: `قیمت ${q.price_type === "FOB" ? "فوب (FOB)" : "سی‌آی‌اف (CIF)"} ${q.region_fa} — گرید: ${q.grade_fa} — برای ماه ${target_month} (${q.unit})`,
    target: {
      product: "سدیم بی‌کربنات (جوش‌شیرین، HS 283630)",
      region_fa: q.region_fa, grade_fa: q.grade_fa, price_type: q.price_type, package_fa: q.package_fa,
      port_or_region_fa: q.port_or_region_fa, unit: q.unit, target_month,
      definition_fa: cfg.price_definition_fa,
      truth_source: q.truth,
    },
    resolves_at: addDaysIso(endOfMonth(target_month), q.truth.lag_days),
  }));
  const round = putRow("rounds", stampRow("round", {
    round_id: roundId, target_month, opened_at, closes_at, opened_by: by, config_version: cfg.version, interval_level: cfg.interval_level, limits: cfg.limits, questions,
    valid_from: opened_at,
  }, opened_at));
  return { round, created: true };
}

export const isRoundOpen = (round, now = new Date()) => now.getTime() <= new Date(round.closes_at).getTime();

// -------------------------------------------------------------------------------- پیش‌بینی‌ها
export function predictionsOf(roundId) {
  return [...currentRows("predictions").values()].filter((p) => p.round_id === roundId);
}

/** اعتبارسنجی مشترک بین انسان و مغز. */
export function checkForecastNumbers({ point, lo, hi }, limits) {
  const n = [point, lo, hi].map(Number);
  if (n.some((x) => !Number.isFinite(x))) return "عدد، کف و سقف بازه همه باید عدد باشند.";
  const [p, l, h] = n;
  if ([p, l, h].some((x) => x < limits.min_price || x > limits.max_price)) return `مقدار باید بین ${limits.min_price} و ${limits.max_price} دلار بر تن باشد.`;
  if (!(l <= p && p <= h)) return "باید کف ≤ عدد پیش‌بینی ≤ سقف باشد.";
  if (l === h) return "بازه‌ی ۸۰٪ نباید صفر باشد (هیچ پیش‌بینی‌ای صددرصد قطعی نیست).";
  if (h / l > limits.max_interval_ratio) return `بازه خیلی پهن است (سقف ÷ کف بیشتر از ${limits.max_interval_ratio}).`;
  return null;
}

function buildPrediction({ round, question, forecaster, point, lo, hi, rationale, made_at, method_version = null, model = null, blind }) {
  return stampRow("pred", {
    round_id: round.round_id,
    question_id: question.id,
    question: question.text,
    target: question.target,
    forecaster,
    forecast: { type: "level", unit: question.target.unit, point: Number(point), lo: Number(lo), hi: Number(hi), level: round.interval_level },
    rationale: rationale || null,
    made_at,
    resolves_at: question.resolves_at,
    method_version, model,
    claim_ids: [], rule_ids: [],
    blind,
    valid_from: made_at,
  }, made_at);
}

/** ثبت پیش‌بینی انسان. همگام؛ بین بررسی تکراری و نوشتن هیچ await نیست، پس دو درخواست هم‌زمان هم تکراری نمی‌سازند. */
export function submitForecast({ username, roundId, questionId, point, lo, hi, rationale }, { now = new Date() } = {}) {
  const round = getRound(roundId);
  if (!round) return { ok: false, code: "no_round", error: "این دور پیدا نشد." };
  if (!isRoundOpen(round, now)) return { ok: false, code: "closed", error: "مهلت ثبت این دور تمام شده است." };
  const question = round.questions.find((q) => q.id === questionId);
  if (!question) return { ok: false, code: "no_question", error: "پرسش پیدا نشد." };
  if (!question.target?.truth_source?.source_id || !question.resolves_at) return { ok: false, code: "bad_question", error: "پرسش تعریف کامل ندارد." };
  const forecaster = `human:${String(username || "").toLowerCase()}`;
  if (!username) return { ok: false, code: "no_user", error: "کاربر مشخص نیست." };
  if (predictionsOf(roundId).some((p) => p.question_id === questionId && p.forecaster === forecaster)) {
    return { ok: false, code: "duplicate", error: "برای این پرسش قبلاً پیش‌بینی ثبت کرده‌اید و ویرایش ممکن نیست." };
  }
  const bad = checkForecastNumbers({ point, lo, hi }, round.limits);
  if (bad) return { ok: false, code: "invalid", error: bad };
  const text = String(rationale || "").trim();
  if (text.length > round.limits.rationale_max_chars) return { ok: false, code: "invalid", error: `توضیح بیش از ${round.limits.rationale_max_chars} نویسه است.` };
  const pred = putRow("predictions", buildPrediction({ round, question, forecaster, point, lo, hi, rationale: text, made_at: now.toISOString(), blind: true }));
  return { ok: true, prediction: pred };
}

/** ثبت پیش‌بینی مغز (از forecaster جدا؛ فقط یک‌بار برای هر پرسش). */
export function recordBrainForecast({ roundId, questionId, point, lo, hi, rationale, model, method_version }, { now = new Date() } = {}) {
  const round = getRound(roundId);
  if (!round) return { ok: false, error: "دور پیدا نشد." };
  const question = round.questions.find((q) => q.id === questionId);
  if (!question) return { ok: false, error: "پرسش پیدا نشد." };
  const forecaster = `brain:${model}`;
  if (predictionsOf(roundId).some((p) => p.question_id === questionId && p.forecaster.startsWith("brain:"))) return { ok: false, duplicate: true, error: "پیش‌بینی مغز برای این پرسش ثبت شده است." };
  const bad = checkForecastNumbers({ point, lo, hi }, round.limits);
  if (bad) return { ok: false, error: `خروجی مغز نامعتبر: ${bad}` };
  const pred = putRow("predictions", buildPrediction({
    round, question, forecaster, point, lo, hi, rationale: String(rationale || "").slice(0, round.limits.rationale_max_chars), made_at: now.toISOString(),
    method_version, model, blind: true, // مغز نظر انسان‌ها را ندیده است (ورودی‌اش فقط خلاصه‌ی جامع عمومی است)
  }));
  return { ok: true, prediction: pred };
}

// -------------------------------------------------------------------------------- نمای هر کاربر (قانون دید کور اینجاست)
const publicPred = (p) => ({
  id: p.id, forecaster: p.forecaster, made_at: p.made_at, rationale: p.rationale,
  forecast: p.forecast, model: p.model, method_version: p.method_version,
});

/**
 * آنچه یک کاربر اجازه دارد ببیند:
 *  - پیش‌بینی خودش؛
 *  - پیش‌بینی مغز برای هر پرسش، **فقط اگر خودش برای همان پرسش ثبت کرده باشد**؛
 *  - پیش‌بینی بقیه: فقط مدیر و فقط بعد از بسته شدن دور.
 * سرور خودش فیلتر می‌کند؛ پنهان‌سازی صرفاً در رابط نیست.
 */
export function viewRound({ username, isAdmin, roundId, now = new Date() }) {
  const round = getRound(roundId);
  if (!round) return null;
  const me = `human:${String(username || "").toLowerCase()}`;
  const open = isRoundOpen(round, now);
  const preds = predictionsOf(roundId);
  const questions = round.questions.map((q) => {
    const mine = preds.find((p) => p.question_id === q.id && p.forecaster === me) || null;
    const brain = preds.find((p) => p.question_id === q.id && p.forecaster.startsWith("brain:")) || null;
    const others = !open && isAdmin ? preds.filter((p) => p.question_id === q.id && p.forecaster.startsWith("human:") && p.forecaster !== me) : [];
    return {
      id: q.id, key: q.key, text: q.text, target: q.target, resolves_at: q.resolves_at,
      mine: mine ? publicPred(mine) : null,
      brain: mine && brain ? publicPred(brain) : null, // کور: بدون ثبت خودِ کاربر نمایش داده نمی‌شود
      brain_ready: !!brain, // فقط «هست/نیست»، بدون مقدار
      others: others.map(publicPred),
      status: "بدون داوری", // نمره‌دهی در مرحله‌ی ۴
    };
  });
  return {
    round_id: round.round_id, target_month: round.target_month, opened_at: round.opened_at, closes_at: round.closes_at,
    open, can_submit: open, interval_level: round.interval_level, limits: round.limits, questions,
  };
}

/** شمارش پیش‌بینی هر شرکت‌کننده (برای مدیر؛ بدون مقدار) */
export function participationOf(roundId) {
  const out = {};
  for (const p of predictionsOf(roundId)) out[p.forecaster] = (out[p.forecaster] || 0) + 1;
  return out;
}

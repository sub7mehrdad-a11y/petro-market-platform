import fs from "fs";
import path from "path";
import { closeRow, currentRows, putRow, stampRow } from "./store";

// دفتر پیش‌بینی (مغز جدید، مرحله‌ی ۰؛ سند پروتکل ۰٫۲). هر ماه یک «دور» باز می‌شود؛ هر کارشناس (و مغز) برای هر پرسش پیش‌بینی ثبت می‌کند.
// قانون‌ها (سند بخش ۸، ۸-۶، ۱۰ و دستور ساخت):
//  - پیش‌بینی بدون پرسش دقیق + تعریف هدف و منبع واقعیت + سررسید ثبت نمی‌شود (۸-۱).
//  - هیچ پیش‌بینیِ ثبت‌شده‌ای ویرایش یا پاک نمی‌شود. «به‌روزرسانی» یعنی ردیف تازه با revision_of و revision_reason؛ ردیف قبلی بسته می‌شود (۸-۶).
//    به‌روزرسانی تا «مهلت قفل» ممکن است (پایان ماه هدف منهای lock_days_before_target_end).
//  - کاربر پیش‌بینی (یا نسخه‌ی تازه‌ی) خودش را **پیش از دیدن** پیش‌بینی (یا نسخه‌ی تازه‌ی) مغز ثبت می‌کند: نسخه‌ای از مغز که
//    بعد از آخرین ثبتِ کاربر ساخته شده تا ثبت دوباره‌ی همان کاربر (نسخه‌ی تازه یا «تأیید بدون تغییر») نشان داده نمی‌شود (سمت سرور).
//  - پیش‌بینی همکاران تا مهلت قفل برای هیچ‌کس (جز خودش) دیده نمی‌شود؛ بعد از آن فقط مدیر می‌بیند (استقلال پیش از تجمیع).
//  - outcome/score/surprise اینجا هرگز نوشته نمی‌شوند؛ فقط جزء سنجش (مرحله‌ی ۴) آن‌ها را در فایل جدا می‌نویسد.

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
  const c = cfg.cycle || {};
  if (!(c.horizon_months >= 1)) errs.push("horizon_months نامعتبر است");
  if (!(c.lock_days_before_target_end >= 0)) errs.push("lock_days_before_target_end (مهلت قفل) لازم است");
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

/** پایان روزِ تهران (۲۴:۰۰) برای یک تاریخ → لحظه‌ی UTC */
const endOfTehranDay = (iso) => `${iso}T20:30:00.000Z`;

/** مهلت قفل یک ماه هدف: lockDays روز پیش از پایان ماه هدف، تا پایان آن روز به وقت تهران. */
export function lockAtFor(targetMonth, lockDays) {
  return endOfTehranDay(addDaysIso(endOfMonth(targetMonth), -lockDays));
}

// -------------------------------------------------------------------------------- دورها
export function getRound(roundId) {
  for (const r of currentRows("rounds").values()) if (r.round_id === roundId) return r;
  return null;
}

export function listRounds() {
  return [...currentRows("rounds").values()].sort((a, b) => b.round_id.localeCompare(a.round_id));
}

/** مهلت قفل یک دور. دورهای قدیمی (ساخته‌شده پیش از نسخه‌ی ۲ تنظیمات) lock_at ندارند و از ماه هدف محاسبه می‌شوند. */
export function roundLockAt(round) {
  if (round.lock_at) return round.lock_at;
  return lockAtFor(round.target_month, loadConfig().cycle.lock_days_before_target_end);
}

export const isRoundOpen = (round, now = new Date()) => now.getTime() <= new Date(roundLockAt(round)).getTime();

/** دور را (اگر نبود) باز می‌کند. پرسش‌ها با تعریف همان لحظه در خود دور ذخیره می‌شوند، پس تغییر بعدی تنظیمات دورهای قبل را عوض نمی‌کند. */
export function ensureRound(roundId, { by = "system", now = new Date() } = {}) {
  const existing = getRound(roundId);
  if (existing) return { round: existing, created: false };
  const cfg = loadConfig();
  const target_month = addMonths(roundId, cfg.cycle.horizon_months);
  const opened_at = now.toISOString();
  const lock_at = lockAtFor(target_month, cfg.cycle.lock_days_before_target_end);
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
    lock_at,
    resolves_at: addDaysIso(endOfMonth(target_month), q.truth.lag_days),
  }));
  const round = putRow("rounds", stampRow("round", {
    round_id: roundId, target_month, opened_at, lock_at, closes_at: lock_at, opened_by: by, config_version: cfg.version,
    interval_level: cfg.interval_level, limits: cfg.limits, questions, valid_from: opened_at,
  }, opened_at));
  return { round, created: true };
}

// -------------------------------------------------------------------------------- نسخه‌های پیش‌بینی
/** همه‌ی نسخه‌های (باز و بسته) یک دور، قدیمی→جدید */
export function predictionsOf(roundId) {
  return [...currentRows("predictions").values()].filter((p) => p.round_id === roundId).sort((a, b) => a.made_at.localeCompare(b.made_at));
}

export const isBrain = (p) => p.forecaster.startsWith("brain:");

/** همه‌ی نسخه‌های یک پیش‌بین برای یک پرسش، قدیمی→جدید */
export function versionsOf(roundId, questionId, match) {
  return predictionsOf(roundId).filter((p) => p.question_id === questionId && match(p));
}

/** نسخه‌ی جاری (باز و تازه‌ترین) */
export function currentVersion(roundId, questionId, match) {
  const open = versionsOf(roundId, questionId, match).filter((p) => !p.recorded_to);
  return open[open.length - 1] || null;
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

function buildPrediction({ round, question, forecaster, point, lo, hi, rationale, made_at, method_version = null, model = null, blind, revision_of = null, revision_reason = null, revision_no = 1, no_change = false }) {
  return stampRow("pred", {
    round_id: round.round_id,
    question_id: question.id,
    question: question.text,
    target: question.target,
    kind: "forecast", // «forecast» یا «experiment» (آزمایش فعال، سند ۹-۶؛ هنوز ساخته نشده)
    forecaster,
    forecast: { type: "level", unit: question.target.unit, point: Number(point), lo: Number(lo), hi: Number(hi), level: round.interval_level },
    rationale: rationale || null,
    made_at,
    resolves_at: question.resolves_at,
    lock_at: question.lock_at || roundLockAt(round),
    method_version, model,
    claim_ids: [], rule_ids: [], retrieved_ids: [],
    revision_of, revision_reason, revision_no, no_change,
    blind,
    valid_from: made_at,
  }, made_at);
}

/** نسخه‌ی تازه را می‌نویسد و نسخه‌ی قبلی را می‌بندد (هیچ‌چیز پاک نمی‌شود). */
function writeVersion(row, prev, by) {
  const saved = putRow("predictions", row);
  if (prev) closeRow("predictions", prev.id, { reason: `نسخه‌ی تازه: ${row.revision_reason || "به‌روزرسانی"}`, by });
  return saved;
}

/**
 * ثبت یا به‌روزرسانی پیش‌بینی انسان. همگام؛ بین بررسی و نوشتن هیچ await نیست، پس درخواست‌های هم‌زمان تکراری نمی‌سازند.
 *  - بار اول: نسخه‌ی ۱.
 *  - دفعه‌های بعد: revisionReason (دست‌کم ۳ نویسه) لازم است، یا confirm=true برای «تأیید بدون تغییر» (همان اعداد، تا کاربر
 *    نسخه‌ی تازه‌ی مغز را ببیند). اعداد بدون تغییر و بدون confirm رد می‌شوند تا نسخه‌ی بی‌معنی ساخته نشود.
 */
export function submitForecast({ username, roundId, questionId, point, lo, hi, rationale, revisionReason, confirm }, { now = new Date() } = {}) {
  const round = getRound(roundId);
  if (!round) return { ok: false, code: "no_round", error: "این دور پیدا نشد." };
  if (!isRoundOpen(round, now)) return { ok: false, code: "closed", error: "مهلت قفل گذشته است؛ دیگر نمی‌شود پیش‌بینی ثبت یا به‌روز کرد." };
  const question = round.questions.find((q) => q.id === questionId);
  if (!question) return { ok: false, code: "no_question", error: "پرسش پیدا نشد." };
  if (!question.target?.truth_source?.source_id || !question.resolves_at) return { ok: false, code: "bad_question", error: "پرسش تعریف کامل ندارد." };
  if (!username) return { ok: false, code: "no_user", error: "کاربر مشخص نیست." };
  const forecaster = `human:${String(username).toLowerCase()}`;
  const mine = (p) => p.forecaster === forecaster;
  const prev = currentVersion(roundId, questionId, mine);

  let vals = { point, lo, hi };
  let reason = null;
  let noChange = false;
  if (prev) {
    if (confirm) {
      vals = { point: prev.forecast.point, lo: prev.forecast.lo, hi: prev.forecast.hi };
      reason = String(revisionReason || "").trim() || "تأیید بدون تغییر";
      noChange = true;
    } else {
      reason = String(revisionReason || "").trim();
      if (reason.length < 3) return { ok: false, code: "need_reason", error: "برای به‌روزرسانی دلیل (دست‌کم ۳ نویسه) لازم است." };
      if (Number(point) === prev.forecast.point && Number(lo) === prev.forecast.lo && Number(hi) === prev.forecast.hi) {
        return { ok: false, code: "unchanged", error: "اعداد با نسخه‌ی قبلی یکی است؛ اگر می‌خواهید فقط تأیید کنید «تأیید بدون تغییر» را بزنید." };
      }
    }
  }
  const bad = checkForecastNumbers(vals, round.limits);
  if (bad) return { ok: false, code: "invalid", error: bad };
  const text = String(rationale ?? prev?.rationale ?? "").trim();
  if (text.length > round.limits.rationale_max_chars) return { ok: false, code: "invalid", error: `توضیح بیش از ${round.limits.rationale_max_chars} نویسه است.` };
  const row = buildPrediction({
    round, question, forecaster, ...vals, rationale: text, made_at: now.toISOString(), blind: true,
    revision_of: prev?.id || null, revision_reason: reason, revision_no: (prev?.revision_no || 0) + 1, no_change: noChange,
  });
  return { ok: true, prediction: writeVersion(row, prev, forecaster), revision: !!prev };
}

/** ثبت نخستین پیش‌بینی مغز برای یک پرسش (فقط یک‌بار). نسخه‌های بعدی با reviseBrainForecast. */
export function recordBrainForecast({ roundId, questionId, point, lo, hi, rationale, model, method_version }, { now = new Date() } = {}) {
  const round = getRound(roundId);
  if (!round) return { ok: false, error: "دور پیدا نشد." };
  const question = round.questions.find((q) => q.id === questionId);
  if (!question) return { ok: false, error: "پرسش پیدا نشد." };
  if (versionsOf(roundId, questionId, isBrain).length) return { ok: false, duplicate: true, error: "پیش‌بینی مغز برای این پرسش ثبت شده است." };
  const bad = checkForecastNumbers({ point, lo, hi }, round.limits);
  if (bad) return { ok: false, error: `خروجی مغز نامعتبر: ${bad}` };
  const pred = putRow("predictions", buildPrediction({
    round, question, forecaster: `brain:${model}`, point, lo, hi, rationale: String(rationale || "").slice(0, round.limits.rationale_max_chars), made_at: now.toISOString(),
    method_version, model, blind: true, // مغز نظر انسان‌ها را ندیده است (ورودی‌اش فقط خلاصه‌ی جامع عمومی است)
  }));
  return { ok: true, prediction: pred };
}

/** نسخه‌ی تازه‌ی پیش‌بینی مغز (پیش از مهلت قفل). نسخه‌ی قبلی بسته می‌شود. */
export function reviseBrainForecast({ roundId, questionId, point, lo, hi, reason, rationale, model, method_version }, { now = new Date() } = {}) {
  const round = getRound(roundId);
  if (!round) return { ok: false, error: "دور پیدا نشد." };
  if (!isRoundOpen(round, now)) return { ok: false, error: "مهلت قفل گذشته است." };
  const question = round.questions.find((q) => q.id === questionId);
  if (!question) return { ok: false, error: "پرسش پیدا نشد." };
  const prev = currentVersion(roundId, questionId, isBrain);
  if (!prev) return { ok: false, error: "ابتدا باید پیش‌بینی اولیه‌ی مغز ثبت شود." };
  const why = String(reason || "").trim();
  if (why.length < 3) return { ok: false, error: "دلیل به‌روزرسانی لازم است." };
  const bad = checkForecastNumbers({ point, lo, hi }, round.limits);
  if (bad) return { ok: false, error: `خروجی مغز نامعتبر: ${bad}` };
  const row = buildPrediction({
    round, question, forecaster: prev.forecaster, point, lo, hi, rationale: String(rationale || prev.rationale || "").slice(0, round.limits.rationale_max_chars),
    made_at: now.toISOString(), method_version, model, blind: true, revision_of: prev.id, revision_reason: why, revision_no: (prev.revision_no || 1) + 1,
  });
  return { ok: true, prediction: writeVersion(row, prev, prev.forecaster) };
}

// -------------------------------------------------------------------------------- پیش‌بین‌های ماشینی (مرحله‌ی ۶)
// تحلیل‌گر آماری، تحلیل‌گر رویدادمحور و داور هرکدام یک «پیش‌بین» جدا با سابقه‌ی جدا هستند (forecaster = machine:<نقش>:<مدل>) و کنار «مغز
// فعلی» (brain:*، روش ۰) ثبت می‌شوند. هیچ‌کدام پیش‌بینی انسان‌ها را نمی‌بینند. به کاربران عادی نشان داده نمی‌شوند (فقط مدیر، بعد از قفل).
export const isMachine = (p) => p.forecaster.startsWith("machine:");

/** ثبت یا نسخه‌ی تازه‌ی یک پیش‌بین ماشینی. نخستین بار نسخه‌ی ۱؛ بعد از آن دلیل (reason) لازم است. */
export function recordMachineForecast({ roundId, questionId, forecaster, point, lo, hi, rationale, reason, model, method_version, retrieved_ids = [], claim_ids = [], rule_ids = [] }, { now = new Date() } = {}) {
  const round = getRound(roundId);
  if (!round) return { ok: false, error: "دور پیدا نشد." };
  if (!isRoundOpen(round, now)) return { ok: false, error: "مهلت قفل گذشته است." };
  const question = round.questions.find((q) => q.id === questionId);
  if (!question) return { ok: false, error: "پرسش پیدا نشد." };
  if (!String(forecaster || "").startsWith("machine:")) return { ok: false, error: "نام پیش‌بین ماشینی باید با machine: شروع شود." };
  const bad = checkForecastNumbers({ point, lo, hi }, round.limits);
  if (bad) return { ok: false, error: `خروجی نامعتبر: ${bad}` };
  const prev = currentVersion(roundId, questionId, (p) => p.forecaster === forecaster);
  const why = String(reason || "").trim();
  if (prev && why.length < 3) return { ok: false, error: "دلیل به‌روزرسانی لازم است." };
  const row = buildPrediction({
    round, question, forecaster, point, lo, hi, rationale: String(rationale || prev?.rationale || "").slice(0, round.limits.rationale_max_chars), made_at: now.toISOString(),
    method_version, model, blind: true, revision_of: prev?.id || null, revision_reason: prev ? why : null, revision_no: (prev?.revision_no || 0) + 1,
  });
  row.retrieved_ids = retrieved_ids; row.claim_ids = claim_ids; row.rule_ids = rule_ids;
  return { ok: true, prediction: writeVersion(row, prev, forecaster), revision: !!prev };
}

// -------------------------------------------------------------------------------- نمای هر کاربر (قانون دید کور اینجاست)
const publicPred = (p) => ({
  id: p.id, forecaster: p.forecaster, made_at: p.made_at, rationale: p.rationale, forecast: p.forecast, model: p.model, method_version: p.method_version,
  revision_no: p.revision_no || 1, revision_reason: p.revision_reason || null, no_change: !!p.no_change,
});

/**
 * آنچه یک کاربر اجازه دارد ببیند:
 *  - نسخه‌های خودش (جاری و تاریخچه)؛
 *  - مغز برای هر پرسش، **فقط اگر خودش برای همان پرسش ثبت کرده باشد** و فقط تازه‌ترین نسخه‌ی مغز که **پیش از آخرین ثبتِ او** ساخته شده؛
 *    نسخه‌ی تازه‌تر مغز فقط به‌صورت «brain_updated» (بدون مقدار) اعلام می‌شود تا کاربر ثبت دوباره یا «تأیید بدون تغییر» بزند؛
 *  - پیش‌بینی بقیه: فقط مدیر و فقط بعد از مهلت قفل.
 * سرور خودش فیلتر می‌کند؛ پنهان‌سازی صرفاً در رابط نیست.
 */
export function viewRound({ username, isAdmin, roundId, now = new Date() }) {
  const round = getRound(roundId);
  if (!round) return null;
  const me = `human:${String(username || "").toLowerCase()}`;
  const open = isRoundOpen(round, now);
  const lock_at = roundLockAt(round);
  const questions = round.questions.map((q) => {
    const mineVersions = versionsOf(roundId, q.id, (p) => p.forecaster === me);
    const mine = currentVersion(roundId, q.id, (p) => p.forecaster === me);
    const brainVersions = versionsOf(roundId, q.id, isBrain);
    const visibleBrain = mine ? [...brainVersions].reverse().find((b) => b.made_at <= mine.made_at) || null : null;
    const brain_updated = !!(mine && brainVersions.some((b) => b.made_at > mine.made_at));
    const others = !open && isAdmin
      ? [...new Set(predictionsOf(roundId).filter((p) => p.question_id === q.id && p.forecaster.startsWith("human:") && p.forecaster !== me).map((p) => p.forecaster))]
          .map((f) => {
            const cur = currentVersion(roundId, q.id, (p) => p.forecaster === f);
            return cur ? { ...publicPred(cur), revisions: versionsOf(roundId, q.id, (p) => p.forecaster === f).length - 1 } : null;
          }).filter(Boolean)
      : [];
    // پیش‌بین‌های ماشینی (تحلیل‌گرها و داور): فقط مدیر و فقط بعد از مهلت قفل (استقلال پیش از تجمیع)
    const machines = !open && isAdmin
      ? [...new Set(predictionsOf(roundId).filter((p) => p.question_id === q.id && isMachine(p)).map((p) => p.forecaster))].sort()
          .map((f) => {
            const cur = currentVersion(roundId, q.id, (p) => p.forecaster === f);
            return cur ? { ...publicPred(cur), retrieved: (cur.retrieved_ids || []).length, revisions: versionsOf(roundId, q.id, (p) => p.forecaster === f).length - 1 } : null;
          }).filter(Boolean)
      : [];
    return {
      id: q.id, key: q.key, text: q.text, target: q.target, resolves_at: q.resolves_at, lock_at: q.lock_at || lock_at,
      machines,
      mine: mine ? publicPred(mine) : null,
      history: mineVersions.filter((p) => !mine || p.id !== mine.id).map(publicPred),
      brain: visibleBrain ? publicPred(visibleBrain) : null, // کور: بدون ثبت خودِ کاربر نمایش داده نمی‌شود
      brain_ready: brainVersions.length > 0, // فقط «هست/نیست»، بدون مقدار
      brain_updated,
      others,
      status: "بدون داوری", // نمره‌دهی در مرحله‌ی ۴
    };
  });
  return {
    round_id: round.round_id, target_month: round.target_month, opened_at: round.opened_at, lock_at, closes_at: lock_at,
    open, can_submit: open, interval_level: round.interval_level, limits: round.limits, questions,
  };
}

/** شمارش پیش‌بینی (جاری) و تعداد به‌روزرسانی هر شرکت‌کننده (برای مدیر؛ بدون مقدار) */
export function participationOf(roundId) {
  const out = {};
  for (const p of predictionsOf(roundId)) {
    const e = (out[p.forecaster] ||= { forecasts: 0, revisions: 0 });
    if (!p.revision_of) e.forecasts += 1;
    else e.revisions += 1;
  }
  return out;
}

import fs from "fs";
import path from "path";
import { generateContent } from "../../../geminiFetch";
import { BRAIN_MODEL, getBrainDigest, resolveBrainKey } from "../../../brain";
import { checkForecastNumbers, currentVersion, getRound, isBrain, isRoundOpen, loadConfig, predictionsOf, recordBrainForecast, reviseBrainForecast } from "../../forecast";
import { currentRows, putRow, stampRow } from "../../store";

// پیش‌بینی ماهانه‌ی «مغز فعلی» برای همان پرسش‌های دفتر (مرحله‌ی ۰). روش ۰: خلاصه‌ی جامع عمومی + آخرین مقدار سری قیمت.
// ⚠ قید محرمانگی: ورودی مدل فقط داده‌ی عمومی است (خلاصه‌ی جامع و price_history). هیچ داده‌ی فروش/تجار/قرارداد و
// هیچ پیش‌بینی انسانی به آن داده نمی‌شود (پس «کور» است).

export const METHOD_VERSION = "brain-v0-digest-1";

const PRICE_FILE = path.join(process.cwd(), "..", "data", "price_history.json");

/** آخرین مقدار غیرخالی یک سری قیمت (فقط سری‌های عمومی). null اگر نبود یا سری محرمانه است. */
export function latestSeriesValue(truth, priceDays) {
  if (!truth || truth.kind !== "price_history" || !truth.series) return null;
  let days = priceDays;
  if (!days) {
    try {
      const raw = JSON.parse(fs.readFileSync(PRICE_FILE, "utf-8"));
      days = Array.isArray(raw) ? raw : Object.values(raw).find(Array.isArray) || [];
    } catch {
      return null;
    }
  }
  for (let i = days.length - 1; i >= 0; i--) {
    for (const r of days[i].records || []) {
      const s = truth.series;
      if (r.value != null && r.product === s.product && r.country_or_region === s.country_or_region && r.price_type === s.price_type) {
        return { value: r.value, currency: r.currency, unit: r.unit, reported: r.source_reported_date, source: r.source_name, collected: days[i].date };
      }
    }
  }
  return null;
}

const SYSTEM = `
تو پیش‌بین قیمت کالاهای شیمیایی در تیم تحقیق و توسعه‌ی یک شرکت تولیدکننده‌ی جوش‌شیرین هستی. فقط یک پرسش قیمتی داری.
روش (به همین ترتیب):
1) از «آخرین مقدار ثبت‌شده‌ی سری» یا قیمت مرجع به‌عنوان نقطه‌ی شروع (نرخ پایه) برو؛ بدون آن، از قیمت‌های نزدیک در خلاصه‌ی جامع.
2) فقط با رویدادهایی که در خلاصه‌ی جامع آمده تعدیل کن؛ تعدیل بدون رویداد ثبت‌شده ممنوع.
3) قیمت فوب با سی‌آی‌اف و ارزش واحد واردات قاطی نمی‌شود.
4) point بهترین حدس؛ lo و hi بازه‌ای که ۸۰٪ احتمال دارد مقدار واقعی در آن بیفتد (نه خیلی باریک، نه بی‌معنی پهن).
خروجی فقط یک JSON معتبر: {"point": عدد, "lo": عدد, "hi": عدد, "rationale": "حداکثر ۴۰۰ نویسه فارسی: نقطه‌ی شروع و هر تعدیل با دلیل؛ اگر داده نبود همین را بگو"}
`.trim();

function parseJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

async function defaultGenerate({ system, input }) {
  const apiKey = resolveBrainKey();
  if (!apiKey) throw new Error("کلید مغز (GEMINI_API_KEY_BRAIN) تنظیم نشده.");
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await generateContent({
        apiKey, model: BRAIN_MODEL, systemInstruction: system, input,
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048, responseMimeType: "application/json" },
      });
    } catch (err) {
      last = err;
      if (!/\b(429|500|502|503|504)\b/.test(String(err?.message || err)) || attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  throw last;
}

const REVIEW_SYSTEM = `
تو همان پیش‌بین قیمت هستی که پیش‌تر برای این پرسش پیش‌بینی ثبت کرده‌ای. حالا «بازبینی دوره‌ای» است: خلاصه‌ی جامع تازه را بخوان و
فقط اگر **رویداد یا داده‌ی تازه و مشخصی** (نه حدس) دلیلی برای تغییر می‌دهد، پیش‌بینی را به‌روز کن. تغییر بدون دلیلِ مستند ممنوع است؛
اگر چیزی عوض نشده، همان عددها را با changed=false برگردان.
خروجی فقط یک JSON معتبر: {"changed": true|false, "point": عدد, "lo": عدد, "hi": عدد, "reason": "حداکثر ۳۰۰ نویسه: کدام رویداد/داده‌ی تازه و چقدر اثر داد؛ اگر changed=false بنویس چه چیزی بررسی شد"}
قانون‌ها مثل قبل: نقطه‌ی شروع نرخ پایه، تعدیل فقط با رویداد ثبت‌شده، فوب با سی‌آی‌اف و ارزش واحد واردات قاطی نمی‌شود، کف/سقف بازه‌ی ۸۰٪.
`.trim();

const changedEnough = (prev, next, pct) =>
  ["point", "lo", "hi"].some((k) => Math.abs(Number(next[k]) - prev[k]) / prev[k] * 100 >= pct);

/**
 * بازبینی دوره‌ای پیش‌بینی مغز (سند ۸-۶): برای هر پرسشِ دورِ باز، اگر آخرین نسخه یا آخرین بازبینی از brain_review_every_days
 * روز قدیمی‌تر است، مدل با خلاصه‌ی جامع تازه و پیش‌بینی قبلی خودش دوباره می‌پرسد. فقط تغییر بیش از brain_min_change_pct درصد
 * (عدد یا کف/سقف) و با دلیل، نسخه‌ی تازه می‌سازد؛ در هر حال «بازبینی» در reviews.jsonl ثبت می‌شود تا هر ساعت دوباره مدل صدا نشود.
 * ورودی مدل فقط خلاصه‌ی جامع عمومی و پیش‌بینی خودِ مغز است (هیچ پیش‌بینی انسانی/داده‌ی فروش).
 */
export async function runBrainReviews(roundId, { generate = defaultGenerate, digest, now = new Date(), force = false } = {}) {
  const round = getRound(roundId);
  if (!round) return { ok: false, error: "دور پیدا نشد.", results: [] };
  if (!isRoundOpen(round, now)) return { ok: true, results: [], skipped: "locked" };
  const cfg = loadConfig().cycle;
  const dg = digest ?? getBrainDigest();
  if (!dg) return { ok: false, error: "خلاصه‌ی جامع (data/brain/digest.md) پیدا نشد.", results: [] };
  const lastReview = new Map();
  for (const r of currentRows("reviews").values()) if (!lastReview.has(r.question_id) || r.at > lastReview.get(r.question_id)) lastReview.set(r.question_id, r.at);
  const results = [];
  for (const q of round.questions) {
    const cur = currentVersion(roundId, q.id, isBrain);
    if (!cur) { results.push({ question: q.id, status: "no_forecast" }); continue; }
    const since = [cur.made_at, lastReview.get(q.id)].filter(Boolean).sort().pop();
    if (!force && (now.getTime() - new Date(since).getTime()) < cfg.brain_review_every_days * 86400000) { results.push({ question: q.id, status: "not_due" }); continue; }
    const hint = latestSeriesValue(q.target.truth_source);
    const input = [
      `پرسش: ${q.text}`,
      `ماه هدف: ${q.target.target_month}؛ واحد: ${q.target.unit}`,
      `پیش‌بینی قبلی شما (نسخه‌ی ${cur.revision_no || 1}، ثبت ${cur.made_at}): عدد ${cur.forecast.point}، بازه‌ی ۸۰٪ [${cur.forecast.lo}, ${cur.forecast.hi}]. دلیل قبلی: ${cur.rationale || "—"}`,
      hint ? `آخرین مقدار ثبت‌شده‌ی این سری: ${hint.value} ${hint.currency || ""}/${hint.unit || ""} (دوره‌ی گزارش: ${hint.reported}؛ منبع: ${hint.source})` : "برای این سری مقدار عمومی ثبت‌شده‌ای نداریم.",
      "",
      "===== خلاصه‌ی جامع تازه =====",
      dg,
    ].join("\n");
    try {
      const j = parseJson(await generate({ system: REVIEW_SYSTEM, input }));
      if (!j) { results.push({ question: q.id, status: "failed", error: "خروجی JSON نبود" }); continue; }
      let status = "unchanged";
      if (j.changed === true) {
        const bad = checkForecastNumbers(j, round.limits);
        if (bad) { results.push({ question: q.id, status: "failed", error: bad }); continue; }
        if (changedEnough(cur.forecast, j, cfg.brain_min_change_pct)) {
          const r = reviseBrainForecast({ roundId, questionId: q.id, point: j.point, lo: j.lo, hi: j.hi, reason: j.reason, rationale: j.reason, model: BRAIN_MODEL, method_version: METHOD_VERSION }, { now });
          if (!r.ok) { results.push({ question: q.id, status: "failed", error: r.error }); continue; }
          status = "revised";
        } else status = "change_too_small";
      }
      putRow("reviews", stampRow("review", { question_id: q.id, round_id: roundId, at: now.toISOString(), outcome: status, reason: String(j.reason || "").slice(0, 300), model: BRAIN_MODEL }, now.toISOString()));
      results.push({ question: q.id, status });
    } catch (err) {
      results.push({ question: q.id, status: "failed", error: String(err?.message || err).slice(0, 160) });
    }
  }
  return { ok: results.every((r) => r.status !== "failed"), results };
}

/**
 * برای هر پرسشِ دورِ داده‌شده که پیش‌بینی مغز ندارد، یکی می‌گیرد و ثبت می‌کند.
 * generate قابل‌تزریق است (آزمون بدون شبکه). هیچ خطایی دور را نمی‌اندازد؛ گزارش برمی‌گردد.
 */
export async function runBrainForecasts(roundId, { generate = defaultGenerate, digest, priceDays, now = new Date() } = {}) {
  const round = getRound(roundId);
  if (!round) return { ok: false, error: "دور پیدا نشد.", results: [] };
  const have = new Set(predictionsOf(roundId).filter(isBrain).map((p) => p.question_id));
  const dg = digest ?? getBrainDigest();
  if (!dg) return { ok: false, error: "خلاصه‌ی جامع (data/brain/digest.md) پیدا نشد.", results: [] };
  const results = [];
  for (const q of round.questions) {
    if (have.has(q.id)) { results.push({ question: q.id, status: "exists" }); continue; }
    const hint = latestSeriesValue(q.target.truth_source, priceDays);
    const input = [
      `پرسش: ${q.text}`,
      `تعریف: ${q.target.definition_fa}`,
      `ماه هدف: ${q.target.target_month}؛ واحد: ${q.target.unit}`,
      hint
        ? `آخرین مقدار ثبت‌شده‌ی این سری: ${hint.value} ${hint.currency || ""}/${hint.unit || ""} (دوره‌ی گزارش: ${hint.reported}؛ منبع: ${hint.source}؛ جمع‌آوری ${hint.collected})`
        : "برای این سری مقدار عمومی ثبت‌شده‌ای نداریم؛ از قیمت مرجع و قیمت‌های نزدیک در خلاصه‌ی جامع شروع کن.",
      "",
      "===== خلاصه‌ی جامع پلتفرم =====",
      dg,
    ].join("\n");
    try {
      const text = await generate({ system: SYSTEM, input });
      const j = parseJson(text);
      if (!j) { results.push({ question: q.id, status: "failed", error: "خروجی JSON نبود" }); continue; }
      const bad = checkForecastNumbers(j, round.limits);
      if (bad) { results.push({ question: q.id, status: "failed", error: bad }); continue; }
      const r = recordBrainForecast({ roundId, questionId: q.id, point: j.point, lo: j.lo, hi: j.hi, rationale: j.rationale, model: BRAIN_MODEL, method_version: METHOD_VERSION }, { now });
      results.push({ question: q.id, status: r.ok ? "recorded" : "failed", error: r.error });
    } catch (err) {
      results.push({ question: q.id, status: "failed", error: String(err?.message || err).slice(0, 160) });
    }
  }
  return { ok: results.every((r) => r.status !== "failed"), results };
}

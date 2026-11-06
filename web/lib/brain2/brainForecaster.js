import fs from "fs";
import path from "path";
import { generateContent } from "../geminiFetch";
import { BRAIN_MODEL, getBrainDigest, resolveBrainKey } from "../brain";
import { getRound, predictionsOf, recordBrainForecast, checkForecastNumbers } from "./forecast";

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

/**
 * برای هر پرسشِ دورِ داده‌شده که پیش‌بینی مغز ندارد، یکی می‌گیرد و ثبت می‌کند.
 * generate قابل‌تزریق است (آزمون بدون شبکه). هیچ خطایی دور را نمی‌اندازد؛ گزارش برمی‌گردد.
 */
export async function runBrainForecasts(roundId, { generate = defaultGenerate, digest, priceDays, now = new Date() } = {}) {
  const round = getRound(roundId);
  if (!round) return { ok: false, error: "دور پیدا نشد.", results: [] };
  const have = new Set(predictionsOf(roundId).filter((p) => p.forecaster.startsWith("brain:")).map((p) => p.question_id));
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

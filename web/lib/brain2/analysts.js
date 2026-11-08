import { BRAIN_MODEL, resolveBrainKey } from "../brain";
import { generateContent } from "../geminiFetch";
import { GROQ_DEFAULT_MODEL, generateGroqContent, resolveGroqApiKey } from "../groqFetch";
import { checkForecastNumbers } from "./forecast";
import { retrieve } from "./knowledge/retrieval";

// دو تحلیل‌گر پیش‌بین (پروتکل ۷-۱ و ۷-۲). هرکدام فقط از «بازیابی انتخابی» همان بسته‌ی داده‌ی خودش تغذیه می‌شود و هیچ‌وقت خروجی دیگری،
// پیش‌بینی انسان‌ها یا داده‌ی محرمانه‌ی فروش را نمی‌بیند. موتور هرکدام جدا است (آماری: مدل متن‌باز روی Groq؛ رویدادمحور: Gemini).
//   آماری:       از نرخ پایه و سابقه شروع می‌کند («نگاه بیرونی»)؛ عددهای روند را کد حساب می‌کند.
//   رویدادمحور:  از رویدادهای تازه شروع می‌کند («نگاه درونی») و آخرین مقدار را با هر رویداد تعدیل می‌کند.

export const ANALYSTS = {
  stat: { role: "stat", pack: "statistical", method: "stat-v1", engine: "groq", model: () => GROQ_DEFAULT_MODEL },
  event: { role: "event", pack: "event", method: "event-v1", engine: "gemini", model: () => BRAIN_MODEL },
};
export const forecasterName = (role, model) => `machine:${role}:${model}`;

const JSON_SPEC = 'خروجی فقط یک JSON معتبر: {"point": عدد, "lo": عدد, "hi": عدد, "rationale": "حداکثر ۴۰۰ نویسه‌ی فارسی: نقطه‌ی شروع و هر تعدیل با دلیل؛ اگر داده کم است همین را بگو"}';
const COMMON = `
قانون‌های مشترک:
- فقط با قطعه‌های داده‌شده کار کن؛ عدد از خودت نساز. هر تعدیل باید به یکی از قطعه‌ها (با شناسه‌ی داخل کروشه) تکیه کند.
- قیمت فوب با سی‌آی‌اف و ارزش واحد واردات قاطی نمی‌شود. آمار با برچسب «کم‌اظهار» قیمت نیست.
- point بهترین حدس؛ lo و hi بازه‌ای که ۸۰٪ احتمال دارد مقدار واقعی در آن بیفتد (نه خیلی باریک، نه بی‌معنی پهن).
${JSON_SPEC}`;

export const SYSTEM = {
  stat: `تو «تحلیل‌گر آماری» هستی و فقط یک پرسش قیمتی داری. از نرخ پایه و سابقه شروع کن (نگاه بیرونی): آخرین مقدار ثبت‌شده‌ی سری، تغییر معمول ماهانه‌ی آن (که کد حساب کرده) و روند. خبر و حدس رویدادی کار تو نیست؛ اگر سابقه‌ی سری کوتاه است، بازه را پهن‌تر بگیر.${COMMON}`,
  event: `تو «تحلیل‌گر رویدادمحور» هستی و فقط یک پرسش قیمتی داری. از رویدادهای تازه شروع کن (نگاه درونی): آخرین مقدار سری را نقطه‌ی مرجع بگیر و اثر هر رویداد مرتبط (تغییر قیمت انرژی/کرایه/تعرفه، توقف کارخانه، رفتار رقبا) را با دلیل و شناسه‌ی قطعه روی آن اعمال کن. بدون رویداد مستند تعدیل نکن؛ هشدارِ تناقض منابع را در پهنای بازه ببین.${COMMON}`,
};

function parseJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/** آمار روند سری با کد (نه مدل): آخرین مقدار، تغییر نسبت به دوره‌ی قبل، میانگین گام نسبی ماهانه. */
export function seriesStats(series) {
  const pts = series.filter((p) => typeof p.value === "number");
  if (!pts.length) return null;
  const last = pts[pts.length - 1];
  const prev = pts.length > 1 ? pts[pts.length - 2] : null;
  const steps = [];
  for (let i = 1; i < pts.length; i++) steps.push(Math.abs(pts[i].value - pts[i - 1].value) / pts[i - 1].value);
  const vals = pts.map((p) => p.value);
  return {
    n: pts.length, last: last.value, last_period: last.period, unit: last.unit,
    prev: prev ? prev.value : null, change_pct: prev ? Math.round(((last.value - prev.value) / prev.value) * 1000) / 10 : null,
    mean_step_pct: steps.length ? Math.round((steps.reduce((a, b) => a + b, 0) / steps.length) * 1000) / 10 : null,
    min: Math.min(...vals), max: Math.max(...vals),
  };
}

async function defaultGenerate(engine, { system, input }) {
  if (engine === "groq") {
    const key = resolveGroqApiKey();
    if (!key) throw new Error("کلید Groq تنظیم نشده.");
    return generateGroqContent({ apiKey: key, systemInstruction: system, input, maxTokens: 900 });
  }
  const key = resolveBrainKey();
  if (!key) throw new Error("کلید مغز (GEMINI_API_KEY_BRAIN) تنظیم نشده.");
  return generateContent({ apiKey: key, model: BRAIN_MODEL, systemInstruction: system, input, generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json" } });
}

/**
 * یک تحلیل‌گر را برای یک پرسش اجرا می‌کند. برمی‌گرداند
 * {ok, role, forecaster, model, method_version, point, lo, hi, rationale, retrieved_ids, claim_ids, rule_ids, input}
 * یا {ok:false, role, error}. generate قابل‌تزریق است (آزمون بدون شبکه).
 */
export async function runAnalyst(role, { question, limits, now = new Date(), generate, method = null, asOf = null }) {
  const A = ANALYSTS[role];
  try {
    const r = retrieve({ question, pack: A.pack, now, asOf });
    const st = seriesStats(r.series);
    const head = [
      `پرسش: ${question.text}`,
      `تعریف: ${question.target.definition_fa}`,
      `ماه هدف: ${question.target.target_month}؛ واحد: ${question.target.unit}`,
      st
        ? `محاسبه‌ی کد روی سری همین پرسش: آخرین مقدار ${st.last} (${st.last_period})${st.change_pct !== null ? `، تغییر نسبت به دوره‌ی قبل ${st.change_pct}٪` : ""}${st.mean_step_pct !== null ? `، میانگین گام نسبی بین دوره‌ها ${st.mean_step_pct}٪` : ""}؛ ${st.n} دوره در سابقه، کمینه ${st.min} و بیشینه ${st.max}.`
        : "برای این سری مقدار عمومی ثبت‌شده‌ای نیست؛ از قطعه‌های زیر و نرخ پایه‌ی مرجع شروع کن و بازه را پهن بگیر.",
    ].join("\n");
    const input = `${head}\n\n===== قطعه‌های بازیابی‌شده =====\n${r.text || "(قطعه‌ی مرتبطی پیدا نشد)"}`;
    const gen = generate || ((a) => defaultGenerate(A.engine, a));
    const j = parseJson(await gen({ system: method?.system || SYSTEM[role], input })); // نسخه‌ی تازه‌ی روش می‌تواند دستور سیستمی خودش را بیاورد (حلقه‌ی ۳)
    if (!j) return { ok: false, role, error: "خروجی JSON نبود" };
    const bad = checkForecastNumbers(j, limits);
    if (bad) return { ok: false, role, error: bad };
    const model = A.model();
    return {
      ok: true, role, forecaster: forecasterName(role, model) + (method?.suffix || ""), model, method_version: method?.method_version || A.method,
      point: Number(j.point), lo: Number(j.lo), hi: Number(j.hi), rationale: String(j.rationale || "").slice(0, limits.rationale_max_chars),
      retrieved_ids: r.retrieved_ids, claim_ids: r.claim_ids, rule_ids: r.rule_ids, input, stats: r.stats,
    };
  } catch (err) {
    return { ok: false, role, error: String(err?.message || err).slice(0, 200) };
  }
}

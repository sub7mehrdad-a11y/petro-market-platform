import { BRAIN_MODEL, resolveBrainKey } from "../brain";
import { generateContent } from "../geminiFetch";
import { loadAnalystsConfig } from "./knowledge/retrieval";

// داور (پروتکل ۷-۳). دو بخش:
//   محاسباتی (کد): وزن هر تحلیل‌گر از سابقه‌ی همان موضوع؛ عدد نهایی = میانگین وزن‌دار؛ میزان اختلاف؛ بازه با اختلاف پهن می‌شود.
//   نوشتاری (مدل): جمع‌بندی؛ حق ندارد اختلاف را پنهان کند؛ ترتیب نمایش تحلیل‌ها تصادفی است. اگر متن عدد بی‌پشتوانه داشته باشد، جایش
//   متن قطعی ساخته‌شده با کد می‌آید.

export const JUDGE_FORECASTER = "machine:judge:v1";
export const JUDGE_METHOD = "judge-v1";

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const clip = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * وزن‌ها از سابقه‌ی سنجیده‌شده‌ی هر تحلیل‌گر «در همان موضوع» (کلید پرسش، مثل china_fob). scoreRows: ردیف‌های time_avg.
 * با کمتر از history_min_scored پرسش سنجیده، وزن مساوی (و در گزارش «سابقه ندارد»).
 */
export function analystWeights(forecasters, topic, scoreRows, cfg = loadAnalystsConfig().judge) {
  const info = forecasters.map((f) => {
    const rows = scoreRows.filter((r) => r.kind === "time_avg" && r.forecaster === f && String(r.question_id).split(":")[1] === topic);
    const skills = rows.map((r) => r.skill_vs_baseline).filter((x) => typeof x === "number");
    return { forecaster: f, n_scored: rows.length, mean_skill: mean(skills), n_skill: skills.length };
  });
  const enough = info.every((i) => i.n_scored >= cfg.history_min_scored && i.n_skill > 0);
  if (!enough) return { weights: forecasters.map(() => 1 / forecasters.length), basis: "equal", info };
  const raw = info.map((i) => Math.max(cfg.weight_floor, 0.5 + 0.5 * clip(i.mean_skill, -1, 1)));
  const sum = raw.reduce((a, b) => a + b, 0);
  return { weights: raw.map((x) => x / sum), basis: "history", info };
}

/** تجمیع عددی: میانگین وزن‌دار نقطه و کف/سقف؛ بازه به‌اندازه‌ی ضریبی از اختلاف دو تحلیل‌گر پهن می‌شود. */
export function combine(a, b, [wa, wb], cfg = loadAnalystsConfig().judge) {
  const spread = Math.abs(a.point - b.point);
  const point = wa * a.point + wb * b.point;
  const lo = wa * a.lo + wb * b.lo - cfg.interval_widen_factor * spread;
  const hi = wa * a.hi + wb * b.hi + cfg.interval_widen_factor * spread;
  const disagreement = point > 0 ? spread / point : 0;
  const r1 = (x) => Math.round(x * 10) / 10;
  return { point: r1(point), lo: r1(lo), hi: r1(hi), spread: r1(spread), disagreement: Math.round(disagreement * 10000) / 10000, high: disagreement > cfg.disagreement_high };
}

const FA = "۰۱۲۳۴۵۶۷۸۹";
const numbersIn = (t) => new Set((String(t).replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/٬/g, ",").match(/\d[\d,]*(?:\.\d+)?/g) || []).map((x) => x.replace(/,/g, "").replace(/\.0+$/, "")));

/** متن قطعی (بدون مدل): پشتوانه‌ی «نوشتار» وقتی مدل در دسترس نیست یا عدد بی‌پشتوانه نوشته است. */
export function templateSummary(a, b, c, weights, basis, cfg = loadAnalystsConfig().judge) {
  const w = (x) => `${Math.round(x * 100)}٪`;
  const base = `تحلیل‌گر آماری ${a.point} (بازه‌ی ${a.lo} تا ${a.hi}) و تحلیل‌گر رویدادمحور ${b.point} (بازه‌ی ${b.lo} تا ${b.hi}) را با وزن ${w(weights[0])} و ${w(weights[1])} (${basis === "history" ? "از سابقه" : "برابر؛ هنوز سابقه‌ی سنجیده‌شده‌ی کافی نیست"}) ترکیب کردم: ${c.point} با بازه‌ی ${c.lo} تا ${c.hi}.`;
  return c.high ? `${cfg.must_say_when_high} اختلاف دو عدد ${c.spread} (${Math.round(c.disagreement * 1000) / 10}٪) است. ${base}` : base;
}

async function defaultGenerate({ system, input }) {
  const key = resolveBrainKey();
  if (!key) throw new Error("کلید مغز تنظیم نشده.");
  return generateContent({ apiKey: key, model: BRAIN_MODEL, systemInstruction: system, input, generationConfig: { temperature: 0.2, maxOutputTokens: 2048 } });
}

const SYSTEM = `تو «داور» هستی. دو تحلیل‌گر مستقل برای یک پرسش قیمتی عدد و دلیل داده‌اند و کد آن‌ها را وزن‌دار ترکیب کرده است. فقط یک جمع‌بندی کوتاه فارسی (حداکثر ۵۰۰ نویسه) بنویس:
- عدد نهایی و بازه همان است که کد داده؛ عدد تازه نساز و عدد دیگری جز عددهای ورودی ننویس.
- اگر «اختلاف بالا» اعلام شده، حتماً صریح بنویس «تحلیل‌گرها هم‌نظر نیستند» و دلیل هر دو را بیاور. اختلاف را پنهان نکن.
- تحلیل‌ها به ترتیب تصادفی آمده‌اند؛ برای هیچ‌کدام جایگاه برتر قائل نشو.`;

/**
 * جمع‌بندی نوشتاری. برمی‌گرداند {text, source: "model"|"template", ungrounded: [...]}.
 * shuffle قابل‌تزریق (آزمون)؛ پیش‌فرض تصادفی.
 */
export async function writeSummary({ question, a, b, combined, weights, basis, generate, shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5) }) {
  const cfg = loadAnalystsConfig().judge;
  const fallback = templateSummary(a, b, combined, weights, basis, cfg);
  const items = shuffle([
    { label: "تحلیل", روش: "آماری (نرخ پایه و سابقه)", point: a.point, lo: a.lo, hi: a.hi, دلیل: a.rationale },
    { label: "تحلیل", روش: "رویدادمحور (رویدادهای تازه)", point: b.point, lo: b.lo, hi: b.hi, دلیل: b.rationale },
  ]).map((x, i) => `تحلیل ${i + 1}: روش ${x.روش}؛ عدد ${x.point}، بازه‌ی ${x.lo} تا ${x.hi}؛ دلیل: ${x.دلیل}`);
  const input = [
    `پرسش: ${question.text}`,
    ...items,
    `نتیجه‌ی کد: عدد ${combined.point}، بازه‌ی ${combined.lo} تا ${combined.hi}؛ وزن‌ها ${weights.map((w) => Math.round(w * 100) + "٪").join(" و ")} (${basis === "history" ? "از سابقه" : "برابر"})؛ اختلاف ${combined.spread} (${Math.round(combined.disagreement * 1000) / 10}٪)؛ ${combined.high ? "اختلاف بالا است" : "اختلاف کم است"}.`,
  ].join("\n");
  let text;
  try {
    text = String(await (generate || defaultGenerate)({ system: SYSTEM, input })).trim();
  } catch {
    return { text: fallback, source: "template", ungrounded: [] };
  }
  if (!text) return { text: fallback, source: "template", ungrounded: [] };
  const known = numbersIn(input);
  const ungrounded = [...numbersIn(text)].filter((n) => !known.has(n));
  if (ungrounded.length) return { text: fallback, source: "template", ungrounded };
  if (combined.high && !/هم‌نظر نیستند|همنظر نیستند/.test(text)) text = `${cfg.must_say_when_high} ${text}`; // قانون: اختلاف پنهان نمی‌شود
  return { text: text.slice(0, 700), source: "model", ungrounded: [] };
}

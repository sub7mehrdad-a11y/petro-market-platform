import { currentRows } from "../store";
import { listRounds, predictionsOf } from "../forecast";
import { readTruth } from "./truth";

// خواندنِ نمره‌ها (فقط‌خواندنی؛ هیچ نوشتنی ندارد). مغز و رابط‌ها از اینجا نمره‌ها را می‌خوانند، نه از writer.js.
// قاعده‌ی دید (پروتکل ۱۱-۴): مدیر همه‌ی رتبه‌ها را با دلیل و سابقه می‌بیند؛ هر کارشناس فقط رتبه‌ی خودش را؛ دیگران هیچ.

export function readScores() {
  return [...currentRows("scores").values()].filter((r) => !r.recorded_to);
}

/** نمره‌هایی که این کاربر اجازه‌ی دیدن دارد. مغز (brain:*) فقط برای مدیر دیده می‌شود. */
export function visibleScores({ username, isAdmin }) {
  const me = `human:${String(username || "").toLowerCase()}`;
  return readScores().filter((r) => isAdmin || r.forecaster === me);
}

const mean = (xs) => { const v = xs.filter((x) => x !== null && x !== undefined); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const r4 = (x) => (x === null ? null : Math.round(x * 10000) / 10000);

/** خلاصه‌ی مهارت هر پیش‌بین از ردیف‌های «time_avg». coverage = سهم پرسش‌هایی که مقدار واقعی داخل بازه‌ی ۸۰٪ افتاد (هدف ۷۰ تا ۹۰٪، ۱۷). */
export function summarize(rows) {
  const by = new Map();
  for (const r of rows.filter((x) => x.kind === "time_avg")) {
    if (!by.has(r.forecaster)) by.set(r.forecaster, []);
    by.get(r.forecaster).push(r);
  }
  return [...by.entries()].map(([forecaster, list]) => ({
    forecaster,
    n_questions: list.length,
    mean_skill: r4(mean(list.map((r) => r.skill_vs_baseline))),
    n_with_baseline: list.filter((r) => r.skill_vs_baseline !== null).length,
    coverage: r4(mean(list.map((r) => r.inside))),
    mean_abs_rel_err: r4(mean(list.map((r) => r.abs_rel_err))),
    mean_surprise: r4(mean(list.map((r) => r.surprise))),
    revisions: list.reduce((s, r) => s + r.steps.n, 0),
    mean_step: r4(mean(list.filter((r) => r.steps.n > 0).map((r) => r.steps.mean))),
    max_step: list.length ? Math.max(...list.map((r) => r.steps.max)) : 0,
    questions: list.map((r) => ({ round_id: r.round_id, question_id: r.question_id, outcome: r.outcome, final_forecast: r.final_forecast, abs_rel_err: r.abs_rel_err, inside: r.inside, skill: r.skill_vs_baseline, surprise: r.surprise, n_versions: r.n_versions })),
  })).sort((a, b) => a.forecaster.localeCompare(b.forecaster));
}

/** پرسش‌هایی که این کاربر پیش‌بینی دارد ولی هنوز نمره نگرفته؛ با دلیل (بدون مقدار واقعی: فقط «چرا هنوز نه»). */
export function pendingFor({ username, isAdmin, now = new Date() }) {
  const me = `human:${String(username || "").toLowerCase()}`;
  const scored = new Set(readScores().filter((r) => r.kind === "time_avg").map((r) => `${r.question_id}|${r.forecaster}`));
  const today = now.toISOString().slice(0, 10);
  const out = [];
  for (const round of listRounds()) {
    for (const q of round.questions || []) {
      const who = [...new Set(predictionsOf(round.round_id).filter((p) => p.question_id === q.id && (isAdmin || p.forecaster === me)).map((p) => p.forecaster))];
      for (const f of who) {
        if (scored.has(`${q.id}|${f}`)) continue;
        let status = "در انتظار سررسید";
        if (q.resolves_at <= today) {
          const t = readTruth(q, now);
          status = t.ok ? "آماده‌ی سنجش (اجرای بعدی)" : `بدون داوری: ${t.reason}`;
        }
        out.push({ round_id: round.round_id, question_id: q.id, text: q.text, forecaster: f, resolves_at: q.resolves_at, status });
      }
    }
  }
  return out;
}

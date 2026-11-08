import { BRAIN_MODEL } from "../brain";
import { ANALYSTS, forecasterName, runAnalyst } from "./analysts";
import { currentVersion, getRound, isRoundOpen, recordMachineForecast } from "./forecast";
import { JUDGE_FORECASTER, JUDGE_METHOD, combine, writeSummary } from "./judge";
import { raiseItem } from "./knowledge/queue";
import { loadAnalystsConfig } from "./knowledge/retrieval";
import { loadIndex, upsertAnalysis } from "./memory";
import { reputationWeights } from "./reputation";

// هماهنگ‌کننده‌ی پیش‌بین‌های ماشینی (مرحله‌ی ۶): دو تحلیل‌گر مستقل ← ثبت در دفتر (هرکدام پیش از دیدن خروجی دیگری) ← داور.
// بازبینی هفتگی مثل «مغز فعلی»: نسخه‌ی تازه فقط با تغییر معنادار و دلیل. خروجی هر تحلیل‌گر و داور علاوه بر دفتر، در مخزن «تحلیل‌ها»ی حافظه
// هم ثبت می‌شود (تحلیل‌گر، نسخه‌ی روش، مدل، ادعاهای پایه). اختلاف زیاد → صف بازبینی انسانی (۷-۴).

const changedEnough = (prev, next, pct) => ["point", "lo", "hi"].some((k) => Math.abs(Number(next[k]) - prev[k]) / prev[k] * 100 >= pct);
const DAY = 86400000;

/**
 * generators: {stat, event, judge} (قابل‌تزریق برای آزمون). force: بازبینی بی‌توجه به سررسید هفتگی. shuffle برای ترتیب تحلیل‌ها در ورودی داور.
 * برمی‌گرداند {ok, results:[{question, stat, event, judge, ...}]}.
 */
export async function runMachineForecasts(roundId, { now = new Date(), generators = {}, force = false, shuffle } = {}) {
  const round = getRound(roundId);
  if (!round) return { ok: false, error: "دور پیدا نشد.", results: [] };
  if (!isRoundOpen(round, now)) return { ok: true, results: [], skipped: "locked" };
  const cfg = loadAnalystsConfig();
  const at = now.toISOString();
  const idx = loadIndex();
  const results = [];

  for (const q of round.questions) {
    const res = { question: q.id };
    const cur = {};
    const changed = {};
    for (const role of ["stat", "event"]) {
      const A = ANALYSTS[role];
      const name = forecasterName(role, A.model());
      const prev = currentVersion(roundId, q.id, (p) => p.forecaster === name);
      const due = force || !prev || now.getTime() - new Date(prev.made_at).getTime() >= cfg.analysts.review_every_days * DAY;
      cur[role] = prev;
      if (!due) { res[role] = "not_due"; continue; }
      const out = await runAnalyst(role, { question: q, limits: round.limits, now, generate: generators[role] });
      if (!out.ok) { res[role] = `failed: ${out.error}`; continue; }
      if (prev && !changedEnough(prev.forecast, out, cfg.analysts.min_change_pct)) { res[role] = "unchanged"; continue; }
      const rec = recordMachineForecast({
        roundId, questionId: q.id, forecaster: out.forecaster, point: out.point, lo: out.lo, hi: out.hi, rationale: out.rationale,
        reason: prev ? `بازبینی دوره‌ای: ${out.rationale.slice(0, 120)}` : undefined, model: out.model, method_version: out.method_version,
        retrieved_ids: out.retrieved_ids, claim_ids: out.claim_ids, rule_ids: out.rule_ids,
      }, { now });
      if (!rec.ok) { res[role] = `failed: ${rec.error}`; continue; }
      upsertAnalysis(idx, {
        key: `analyst|${q.id}|${role}`, analyst: role, statement: out.rationale, claim_ids: out.claim_ids, method_version: out.method_version, model: out.model,
        payload: { round_id: roundId, question_id: q.id, prediction_id: rec.prediction.id, forecast: { point: out.point, lo: out.lo, hi: out.hi }, retrieved: out.retrieved_ids.length },
      }, { at });
      res[role] = prev ? "revised" : "recorded";
      cur[role] = rec.prediction;
      changed[role] = true;
    }

    // داور: فقط وقتی هر دو تحلیل‌گر ثبت شده‌اند (هرکدام پیش از دیدن خروجی دیگری ثبت شد)
    if (!cur.stat || !cur.event) { res.judge = "waiting_for_analysts"; results.push(res); continue; }
    const prevJ = currentVersion(roundId, q.id, (p) => p.forecaster === JUDGE_FORECASTER);
    if (prevJ && !changed.stat && !changed.event && !force) { res.judge = "not_due"; results.push(res); continue; }
    const { weights, basis, info } = reputationWeights([cur.stat.forecaster, cur.event.forecaster], q.key); // وزن از اعتبار همان موضوع (۷-۳ و ۱۱)
    const a = { point: cur.stat.forecast.point, lo: cur.stat.forecast.lo, hi: cur.stat.forecast.hi, rationale: cur.stat.rationale };
    const b = { point: cur.event.forecast.point, lo: cur.event.forecast.lo, hi: cur.event.forecast.hi, rationale: cur.event.rationale };
    const combined = combine(a, b, weights, cfg.judge);
    const summary = await writeSummary({ question: q, a, b, combined, weights, basis, generate: generators.judge, shuffle });
    res.disagreement = combined.disagreement;
    res.judge_source = summary.source;
    const union = (k) => [...new Set([...(cur.stat[k] || []), ...(cur.event[k] || [])])];
    if (prevJ && !changedEnough(prevJ.forecast, combined, cfg.analysts.min_change_pct)) {
      res.judge = "unchanged";
    } else {
      const rec = recordMachineForecast({
        roundId, questionId: q.id, forecaster: JUDGE_FORECASTER, point: combined.point, lo: combined.lo, hi: combined.hi, rationale: summary.text,
        reason: prevJ ? "تحلیل‌گر نسخه‌ی تازه داد؛ تجمیع دوباره" : undefined, model: BRAIN_MODEL, method_version: JUDGE_METHOD,
        retrieved_ids: union("retrieved_ids"), claim_ids: union("claim_ids"), rule_ids: union("rule_ids"),
      }, { now });
      if (!rec.ok) { res.judge = `failed: ${rec.error}`; results.push(res); continue; }
      upsertAnalysis(idx, {
        key: `judge|${q.id}`, analyst: "judge", statement: summary.text, claim_ids: union("claim_ids"), method_version: JUDGE_METHOD, model: BRAIN_MODEL,
        payload: { round_id: roundId, question_id: q.id, prediction_id: rec.prediction.id, combined, weights, weight_basis: basis, history: info, summary_source: summary.source, ungrounded: summary.ungrounded, analysts: [cur.stat.id, cur.event.id] },
      }, { at });
      res.judge = prevJ ? "revised" : "recorded";
    }
    if (combined.high) {
      res.queue = raiseItem({
        natural_key: `disagreement|${q.id}`, kind: "disagreement", group: "analysts", label: cfg.judge.must_say_when_high, subject: q.target.region_fa, period: q.target.target_month,
        spread: Math.round(combined.disagreement * 1000) / 10,
        members: [cur.stat, cur.event].map((p) => ({ claim_key: `prediction:${p.id}`, metric: "forecast", source: p.forecaster, value: p.forecast.point, unit: p.forecast.unit, period: q.target.target_month })),
      }, { at });
    }
    results.push(res);
  }
  return { ok: results.every((r) => !String(r.stat).startsWith("failed") && !String(r.event).startsWith("failed") && !String(r.judge).startsWith("failed")), results };
}

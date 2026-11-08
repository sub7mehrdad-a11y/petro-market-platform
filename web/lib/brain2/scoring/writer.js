import { appendScoreEvent, currentRows, stampRow } from "../store";
import { listRounds, predictionsOf, versionsOf, roundLockAt } from "../forecast";
import { readBaseline, readTruth } from "./truth";
import { inInterval, relErr, round4, skill, steps, surpriseInterval, weightedMean, windows } from "./math";

// جزء سنجش (پروتکل ۸-۵): تنها کدی که در scores.jsonl می‌نویسد (outcome، score، مهارت، غافلگیری). مغز و دفتر پیش‌بینی نه آن را
// import می‌کنند و نه می‌توانند در scores بنویسند (store.appendEvent برای مخزن scores خطا می‌دهد؛ آزمون جداسازی ایمپورت‌ها را اسکن می‌کند).
// مقدار واقعی از منبع از پیش تعریف‌شده‌ی هر پرسش خوانده می‌شود (truth.js)؛ اگر نیامده یا کهنه باشد، پیش‌بینی «بدون داوری» می‌ماند.
// idempotent: نتیجه‌ی بدون تغییر چیزی نمی‌نویسد؛ اگر مقدار واقعی در منبع عوض شد، ردیف قبلی بسته و ردیف تازه نوشته می‌شود.
//
// دو نوع ردیف: «version» (نمره‌ی هر نسخه‌ی پیش‌بینی) و «time_avg» (میانگین زمانی نسخه‌های یک پیش‌بین برای یک پرسش، ۸-۶).
// فیلد surprise (۹-۵) هم همین‌جا (در ردیف نمره) ثبت می‌شود، چون ردیف پیش‌بینی هرگز تغییر نمی‌کند.

const stable = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
const IGNORE = new Set(["id", "created_at", "valid_from", "valid_to", "recorded_from", "recorded_to", "supersedes", "change_reason", "scored_at", "closed_reason"]);
const core = (row) => stable(Object.fromEntries(Object.entries(row).filter(([k]) => !IGNORE.has(k))));

function openScores() {
  const m = new Map();
  for (const r of currentRows("scores").values()) if (!r.recorded_to && r.natural_key) m.set(r.natural_key, r);
  return m;
}

function write(existing, row, nowIso, stats) {
  const old = existing.get(row.natural_key);
  const saved = stampRow("score", { ...row, supersedes: old ? old.id : null, change_reason: old ? "مقدار واقعی در منبع تغییر کرد" : null }, nowIso);
  if (old && core(old) === core(saved)) { stats.unchanged += 1; return; }
  appendScoreEvent({ op: "put", row: saved });
  if (old) {
    appendScoreEvent({ op: "close", id: old.id, at: nowIso, reason: saved.change_reason, by: "scoring", valid_to: null });
    stats.changed += 1;
  } else stats.written += 1;
  existing.set(row.natural_key, saved);
}

/** سنجش همه‌ی پرسش‌های سررسیدشده. برمی‌گرداند {written, changed, unchanged, unresolved:[{question_id, reason}]}. */
export function runScoring({ now = new Date() } = {}) {
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  const stats = { written: 0, changed: 0, unchanged: 0, unresolved: [], questions_checked: 0 };
  const existing = openScores();
  for (const round of listRounds()) {
    for (const q of round.questions || []) {
      if (!q.resolves_at || q.resolves_at > today) continue;
      const preds = predictionsOf(round.round_id).filter((p) => p.question_id === q.id && p.kind === "forecast");
      if (!preds.length) continue;
      stats.questions_checked += 1;
      const truth = readTruth(q, now);
      if (!truth.ok) { stats.unresolved.push({ round_id: round.round_id, question_id: q.id, reason: truth.reason }); continue; }
      const actual = truth.value;
      const lockMs = new Date(q.lock_at || roundLockAt(round)).getTime();
      for (const forecaster of [...new Set(preds.map((p) => p.forecaster))]) {
        const versions = versionsOf(round.round_id, q.id, (p) => p.forecaster === forecaster && p.kind === "forecast");
        const wins = windows(versions, lockMs);
        const scored = wins.map(({ version: v, weight }) => {
          const f = v.forecast;
          const err = relErr(f.point, actual);
          const base = readBaseline(q, v.made_at);
          const baseErr = base ? relErr(base.value, actual) : null;
          return {
            weight, v, err, inside: inInterval(actual, f.lo, f.hi), surprise: surpriseInterval(actual, f.lo, f.hi),
            width_ratio: (f.hi - f.lo) / f.point, base, baseErr, skill: baseErr === null ? null : skill(err, baseErr),
          };
        });
        const total = scored.reduce((s, x) => s + x.weight, 0);
        for (const s of scored) {
          write(existing, {
            natural_key: `version|${s.v.id}`, kind: "version", prediction_id: s.v.id, round_id: round.round_id, question_id: q.id, forecaster,
            revision_no: s.v.revision_no || 1, made_at: s.v.made_at,
            forecast: { point: s.v.forecast.point, lo: s.v.forecast.lo, hi: s.v.forecast.hi },
            outcome: actual, outcome_as_of: truth.as_of, outcome_source: truth.source,
            abs_rel_err: round4(s.err), inside: s.inside, width_ratio: round4(s.width_ratio), surprise: round4(s.surprise),
            baseline: s.base ? { value: s.base.value, as_of: s.base.as_of, abs_rel_err: round4(s.baseErr) } : null,
            skill_vs_baseline: round4(s.skill), weight_ms: s.weight, weight_share: round4(s.weight / total),
          }, nowIso, stats);
        }
        const st = steps(versions);
        write(existing, {
          natural_key: `time_avg|${q.id}|${forecaster}`, kind: "time_avg", round_id: round.round_id, question_id: q.id, forecaster,
          outcome: actual, outcome_as_of: truth.as_of, outcome_source: truth.source, n_versions: versions.length,
          final_forecast: { point: versions.at(-1).forecast.point, lo: versions.at(-1).forecast.lo, hi: versions.at(-1).forecast.hi },
          abs_rel_err: round4(weightedMean(scored, (x) => x.err)),
          inside: round4(weightedMean(scored, (x) => (x.inside ? 1 : 0))), // ۱ = همیشه داخل بازه، ۰ = هرگز
          surprise: round4(weightedMean(scored, (x) => x.surprise)),
          skill_vs_baseline: round4(weightedMean(scored, (x) => x.skill)),
          steps: { n: st.n, mean: round4(st.mean), max: round4(st.max) },
        }, nowIso, stats);
      }
    }
  }
  return stats;
}


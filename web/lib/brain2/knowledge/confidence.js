import { stable } from "../memory";
import { asciiDigits, daysBetween, freshness, metricClass, periodEnd, round2, sourceBase } from "./config";

// فرمول اعتماد (پروتکل ۶-۳): اعتبار منبع × تازگی + تأیید مستقل − جریمه‌ی قاعده‌های «پذیرفته». ضرایب در confidence_config.json.
// قاعده‌ی «پیشنهادی» (وضعیت فعلی هر هفت قاعده) جریمه نمی‌کند؛ فقط وقتی انسان «پذیرفته» کند اثر می‌گذارد (تصمیم کاربر: ابتدا فقط برچسب).

const normPeriod = (c) => {
  const e = periodEnd(c);
  return e ? e.slice(0, 4) : asciiDigits(c.period).trim();
};
const numeric = (v) => typeof v === "number" && Number.isFinite(v);
const agree = (a, b, tol) => numeric(a) && numeric(b) && Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-9) <= tol;
const words = (t) => new Set(String(t).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3));
const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter += 1;
  return inter / (a.size + b.size - inter);
};

/** نمایه‌ی تأیید مستقل: کلید دقیق (موضوع، سنجه، دوره، قیدها) + گروه‌های هم‌معنا + سیگنال‌های خبری هم‌روز. */
export function buildConfirmationIndex(claims, cfg, sourceKeyOf, originOf) {
  const exact = new Map();
  const groups = new Map();
  const signals = [];
  for (const c of claims) {
    if (c.metric === "signal") {
      const d = periodEnd(c);
      if (d) signals.push({ c, day: d, origin: originOf(c), tokens: words(c.value) });
      continue;
    }
    const k = `${c.subject}|${c.metric}|${normPeriod(c)}|${stable(c.qualifiers || {})}`;
    (exact.get(k) || exact.set(k, []).get(k)).push(c);
    for (const g of cfg.contradiction.groups) {
      if (!g.metrics.includes(c.metric)) continue;
      const gk = `${g.key}|${c.subject}|${normPeriod(c)}`;
      (groups.get(gk) || groups.set(gk, []).get(gk)).push(c);
    }
  }
  return { exact, groups, signals, cfg, sourceKeyOf };
}

function confirmations(c, ix) {
  const { cfg, sourceKeyOf } = ix;
  const mine = sourceKeyOf(c);
  const tol = cfg.confirmation.tolerance;
  const seen = new Set();
  const add = (o) => { const k = sourceKeyOf(o); if (k !== mine && agree(c.value, o.value, tol)) seen.add(k); };
  for (const o of ix.exact.get(`${c.subject}|${c.metric}|${normPeriod(c)}|${stable(c.qualifiers || {})}`) || []) add(o);
  for (const g of cfg.contradiction.groups) {
    if (g.metrics.includes(c.metric)) for (const o of ix.groups.get(`${g.key}|${c.subject}|${normPeriod(c)}`) || []) add(o);
  }
  return seen.size;
}

function signalConfirmed(c, ix) {
  const { confirmation: k } = ix.cfg;
  const day = periodEnd(c);
  if (!day) return false;
  const mine = ix.signals.find((s) => s.c === c);
  if (!mine) return false;
  for (const s of ix.signals) {
    if (s === mine || s.origin === mine.origin) continue;
    if (Math.abs(daysBetween(s.day, day)) > k.signal_window_days) continue;
    if (jaccard(mine.tokens, s.tokens) >= k.signal_similarity) return true;
  }
  return false;
}

/** اعتماد محاسبه‌شده‌ی یک ادعا (۰٫۰۵ تا ۰٫۹۹). ruleStatus: Map(کلید قاعده → وضعیت). */
export function computeConfidence(c, { today, cfg, sourceKeyOf, ix, ruleStatus }) {
  const base = sourceBase(sourceKeyOf(c), cfg);
  let conf = base * freshness(c, today, cfg);
  if (metricClass(c.metric, cfg) === "signal") {
    if (signalConfirmed(c, ix)) conf += cfg.confirmation.signal_boost;
  } else {
    conf += Math.min(cfg.confirmation.max_boost, cfg.confirmation.boost_per_source * confirmations(c, ix));
  }
  const penalised = (c.rule_flags || []).filter((k) => cfg.rule_penalty.applies_to_statuses.includes(ruleStatus.get(k)));
  conf -= cfg.rule_penalty.per_flag * penalised.length;
  return round2(Math.min(cfg.bounds.max, Math.max(cfg.bounds.min, conf)));
}

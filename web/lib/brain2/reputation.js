import fs from "fs";
import path from "path";
import { closeRow, currentRows, putRow } from "./store";
import { makeRow } from "./schema";
import { readScores } from "./scoring/read";
import { metricClass } from "./knowledge/config";
import { loadKnowledgeConfig } from "./knowledge/config";

// سازوکار اعتبار (پروتکل ۱۱). اعتبار فقط از مقایسه با واقعیت ساخته می‌شود:
//   • پیش‌بین‌ها (انسان، تحلیل‌گر آماری/رویدادمحور، داور، مغز فعلی) و روش‌ها: از نمره‌ی سنجش (مرحله‌ی ۴) ← دقت.
//   • منبع‌ها: از تصمیم انسانیِ مدیر در صف بازبینی (کدام مقدار درست بود).
//   • بازبین‌ها (نمره‌دهنده‌های مرحله‌ی ۷): نمره‌ی ۴/۵ به تحلیلی که بعداً با واقعیت بدتر از خط مبنا درآمد = اشتباه، و برعکس.
// هیچ‌چیز دیگری (موافقت با مغز، سِمت، پرکاری) وارد نمی‌شود. وزن = (n×دقت فرد + k×دقت گروه) ÷ (n + k) با کهنگی (نیمه‌عمر ۱۲ ماه)،
// موضوعی (قیمت جدا از ...)، و عضو تازه با میانگین گروه شروع می‌کند (نه صفر).

let cache = null;
export function loadReputationConfig() {
  const file = path.join(process.env.BRAIN_DATA_DIR || path.join(process.cwd(), "..", "data"), "brain", "reputation_config.json");
  const st = fs.statSync(/* turbopackIgnore: true */ file);
  if (cache && cache.file === file && cache.mtime === st.mtimeMs) return cache.cfg;
  const cfg = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ file, "utf-8"));
  cache = { file, mtime: st.mtimeMs, cfg };
  return cfg;
}

const DAY = 86400000;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const r4 = (x) => Math.round(x * 10000) / 10000;

/** دقتِ یک نتیجه‌ی عددی (۰ تا ۱): خطای نسبی و اینکه مقدار واقعی داخل بازه‌ی ۸۰٪ بود. */
export function accuracyOf({ abs_rel_err, inside }, cfg = loadReputationConfig()) {
  const a = cfg.accuracy;
  return clamp01((1 - a.inside_weight) * Math.max(0, 1 - abs_rel_err / a.error_tolerance) + a.inside_weight * clamp01(inside));
}

/** ضریب کهنگی یک نتیجه: نیمه‌عمر ۱۲ ماه. */
export const recencyOf = (atIso, now, cfg = loadReputationConfig()) => 0.5 ** (Math.max(0, now.getTime() - new Date(atIso).getTime()) / DAY / cfg.half_life_days);

/** وزن با کوچک‌سازی به میانگین گروه: (n×دقت + k×گروه) ÷ (n + k). nEff = تعداد مؤثر پس از کهنگی. */
export function shrunkWeight(accuracy, nEff, groupMean, k) {
  return (nEff * accuracy + k * groupMean) / (nEff + k);
}

/** نتیجه‌ی بازبین: نمره‌ی بالای استدلال به تحلیل با مهارت منفی = ۰؛ نمره‌ی پایین به تحلیل با مهارت منفی = ۱؛ بر عکس برای مهارت مثبت؛ نمره‌ی میانی کنار می‌رود. */
export function reviewerOutcome(reasoning, skill) {
  if (typeof skill !== "number" || skill === 0 || !Number.isInteger(reasoning) || reasoning === 3) return null;
  const high = reasoning >= 4;
  return (high && skill > 0) || (!high && skill < 0) ? 1 : 0;
}

const SOURCE_DECISIONS = new Set(["accept", "reject", "both_valid"]);
/** از تصمیم‌های مدیر در صف: [{source, outcome(۱=تأیید، ۰=رد), at, metric}] */
export function sourceEvidence(queueRows, sourceOf = null) {
  const out = [];
  for (const q of queueRows) {
    if (q.status !== "resolved" || !q.resolution || !SOURCE_DECISIONS.has(q.resolution.decision)) continue;
    const d = q.resolution.decision;
    for (const m of q.members || []) {
      const ck = String(m.claim_key || "");
      if (/^(prediction|analysis|rule|ranking):/.test(ck)) continue;
      const src = String(m.source || "").startsWith("human:") ? sourceOf?.(m.claim_key) : m.source; // گزارش کارشناس: منبعِ خودِ ادعا
      if (!src) continue;
      const chosen = q.resolution.claim_key === m.claim_key;
      const outcome = d === "both_valid" ? 1 : d === "accept" ? (chosen ? 1 : 0) : 0; // reject: ادعای مشکوک رد شد
      out.push({ source: src, outcome, at: q.resolution.at, metric: m.metric });
    }
  }
  return out;
}

/** همه‌ی شواهد ← ردیف‌های اعتبار (محاسبه‌ی خالص). */
export function buildReputation({ scoreRows, predictions, feedback, queueRows, now = new Date(), cfg = loadReputationConfig(), kcfg, sourceOf = null }) {
  const ev = new Map(); // `${entity}\u0000${topic}` → [{acc, n, at}]
  const type = new Map(); // entity → نوع
  const add = (entity, etype, topic, acc, n, at) => {
    const k = `${entity}\u0000${topic}`;
    if (!ev.has(k)) ev.set(k, []);
    ev.get(k).push({ acc, n, at });
    type.set(entity, etype);
  };
  const family = (qid) => cfg.topic_family[String(qid).split(":")[1]] || null;
  // پیش‌بین‌ها: ردیف‌های میانگین زمانی
  for (const r of scoreRows.filter((x) => x.kind === "time_avg")) {
    const acc = accuracyOf(r, cfg);
    const topics = [String(r.question_id).split(":")[1], family(r.question_id)].filter(Boolean);
    for (const t of new Set(topics)) add(r.forecaster, "forecaster", t, acc, 1, r.outcome_as_of);
  }
  // روش‌ها: نمره‌ی هر نسخه با وزن زمانی‌اش، به‌نام نسخه‌ی روش
  const predById = new Map(predictions.map((p) => [p.id, p]));
  for (const r of scoreRows.filter((x) => x.kind === "version")) {
    const mv = predById.get(r.prediction_id)?.method_version;
    if (!mv) continue;
    const acc = accuracyOf(r, cfg);
    for (const t of new Set([String(r.question_id).split(":")[1], family(r.question_id)].filter(Boolean))) add(`method:${mv}`, "method", t, acc, r.weight_share || 1, r.outcome_as_of);
  }
  // منبع‌ها: تصمیم انسانی مدیر
  for (const e of sourceEvidence(queueRows, sourceOf)) {
    for (const t of new Set(["all", kcfg ? metricClass(e.metric || "", kcfg) : null].filter(Boolean))) add(`source:${e.source}`, "source", t, e.outcome, 1, e.at);
  }
  // بازبین‌ها: نمره‌ی انسان در برابر مهارت واقعی
  const skillByPred = new Map(scoreRows.filter((x) => x.kind === "version").map((x) => [x.prediction_id, { skill: x.skill_vs_baseline, at: x.outcome_as_of }]));
  for (const f of feedback.filter((x) => x.kind === "analysis_score" && x.target_id.startsWith("analysis:"))) {
    const s = skillByPred.get(f.target_id.slice("analysis:".length));
    const o = s ? reviewerOutcome(f.scores?.reasoning, s.skill) : null;
    if (o !== null) add(`reviewer:${f.giver.replace("human:", "")}`, "reviewer", "review", o, 1, s.at);
  }
  // گروه: برای هر (نوع، موضوع) میانگین وزن‌دار همه‌ی شواهد
  const nowMs = now;
  const groups = new Map();
  for (const [k, list] of ev) {
    const [entity, topic] = k.split("\u0000");
    const g = `${type.get(entity)}\u0000${topic}`;
    const acc = groups.get(g) || { s: 0, w: 0 };
    for (const x of list) { const w = x.n * recencyOf(x.at, nowMs, cfg); acc.s += w * x.acc; acc.w += w; }
    groups.set(g, acc);
  }
  const rows = [];
  for (const [k, list] of ev) {
    const [entity, topic] = k.split("\u0000");
    const etype = type.get(entity);
    const g = groups.get(`${etype}\u0000${topic}`);
    const groupMean = g.w > 0 ? g.s / g.w : cfg.neutral;
    let nEff = 0, s = 0;
    for (const x of list) { const w = x.n * recencyOf(x.at, nowMs, cfg); nEff += w; s += w * x.acc; }
    const acc = nEff > 0 ? s / nEff : groupMean;
    const humanOwner = entity.startsWith("human:") ? entity : entity.startsWith("reviewer:") ? `human:${entity.slice(9)}` : null;
    rows.push({
      natural_key: `rep|${entity}|${topic}`, entity, entity_type: etype, topic,
      n_resolved: list.length, n_eff: r4(nEff), score: r4(acc), weight: r4(shrunkWeight(acc, nEff, groupMean, cfg.shrinkage_k)), group_mean: r4(groupMean),
      last_evidence_at: list.map((x) => x.at).sort().at(-1),
      visible_to: humanOwner ? [humanOwner, "admin"] : ["admin"],
    });
  }
  return rows.sort((a, b) => a.natural_key.localeCompare(b.natural_key));
}

const openRep = () => new Map([...currentRows("reputation").values()].filter((r) => !r.recorded_to && r.natural_key).map((r) => [r.natural_key, r]));

/** محاسبه و ثبت (فقط‌افزودنی): ردیف تازه فقط اگر وزن ≥ آستانه یا تعداد نتیجه‌ها عوض شده باشد؛ قبلی بسته می‌شود. */
export function computeReputation({ now = new Date() } = {}) {
  const cfg = loadReputationConfig();
  const kcfg = loadKnowledgeConfig();
  const srcs = new Map([...currentRows("sources").values()].map((s) => [s.id, s.natural_key]));
  const byClaim = new Map([...currentRows("claims").values()].filter((c) => c.natural_key).map((c) => [c.natural_key, srcs.get(c.source_ids?.[0])]));
  const sourceOf = (claimKey) => byClaim.get(claimKey) || null;
  const rows = buildReputation({
    scoreRows: readScores(),
    predictions: [...currentRows("predictions").values()],
    feedback: [...currentRows("feedback").values()].filter((f) => !f.recorded_to),
    queueRows: [...currentRows("queue").values()].filter((q) => !q.recorded_to),
    now, cfg, kcfg, sourceOf,
  });
  const at = now.toISOString();
  const open = openRep();
  const stats = { new: 0, changed: 0, unchanged: 0 };
  for (const r of rows) {
    const old = open.get(r.natural_key);
    if (old && old.n_resolved === r.n_resolved && Math.abs(old.weight - r.weight) < cfg.write_threshold && JSON.stringify(old.visible_to) === JSON.stringify(r.visible_to)) { stats.unchanged += 1; continue; }
    const row = putRow("reputation", makeRow("reputation", { ...r, supersedes: old ? old.id : null, change_reason: old ? "نتیجه یا کهنگی تغییر داد" : null, created_at: at }, at));
    if (old) { closeRow("reputation", old.id, { reason: row.change_reason, by: "reputation", at }); stats.changed += 1; } else stats.new += 1;
  }
  return stats;
}

/** ردیف‌های باز اعتبار. */
export const readReputation = () => [...openRep().values()];

/** دید (۱۱-۴): مدیر همه با دلیل و سابقه؛ هر کارشناس فقط رتبه‌ی خودش (نقش پیش‌بین و نقش بازبین)؛ دیگران هیچ. */
export function visibleReputation({ username, isAdmin }) {
  const me = `human:${String(username || "").toLowerCase()}`;
  return readReputation().filter((r) => isAdmin || r.visible_to.includes(me));
}

/** وزن داور از اعتبار (۷-۳): همان موضوعِ پرسش؛ عضو بدون سابقه با میانگین گروه شروع می‌کند؛ اگر هیچ‌کس سابقه ندارد وزن برابر. */
export function reputationWeights(forecasters, topic) {
  const rows = readReputation();
  const find = (f) => rows.find((r) => r.entity === f && r.topic === topic);
  const found = forecasters.map(find);
  if (!found.some(Boolean)) return { weights: forecasters.map(() => 1 / forecasters.length), basis: "equal", info: forecasters.map((f) => ({ forecaster: f, n_resolved: 0 })) };
  const group = found.find(Boolean).group_mean;
  const raw = found.map((r) => (r ? r.weight : group));
  const sum = raw.reduce((a, b) => a + b, 0);
  return { weights: raw.map((x) => x / sum), basis: "reputation", info: found.map((r, i) => ({ forecaster: forecasters[i], n_resolved: r?.n_resolved || 0, weight: r ? r.weight : group, score: r?.score ?? null })) };
}

/** تعدیل اعتبار پایه‌ی منبع در فرمول اعتماد (۶-۳): فقط وقتی شاهدی هست؛ منبع بی‌سابقه تغییری نمی‌کند. */
export function sourceAdjustments(cfgIn) {
  const m = new Map();
  let cfg;
  try { cfg = cfgIn || loadReputationConfig(); } catch { return m; } // نبود تنظیمات اعتبار چرخه‌ی دانش را نمی‌اندازد
  for (const r of readReputation()) if (r.entity_type === "source" && r.topic === "all" && r.n_resolved > 0) m.set(r.entity.slice("source:".length), cfg.source_adjust * (r.weight - r.group_mean));
  return m;
}

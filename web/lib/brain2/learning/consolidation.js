import fs from "fs";
import path from "path";
import { BRAIN_MODEL, resolveBrainKey } from "../../brain";
import { generateContent } from "../../geminiFetch";
import { closeRow, currentRows, getBrainDir, putRow } from "../store";
import { makeRow } from "../schema";
import { loadIndex, reviseClaim, stable } from "../memory";
import { raiseItem } from "../knowledge/queue";
import { readScores } from "../scoring/read";
import { DAY, loadLearningConfig } from "./config";

// تثبیت ماهانه (پروتکل ۹-۷): مثل «خواب» حافظه. هیچ‌چیز پاک نمی‌شود و هیچ تغییر قضاوتی بدون تأیید مدیر اجرا نمی‌شود:
//   ادغام قاعده‌های تقریباً تکراری، ساخت قاعده‌ی کلی‌تر از چند قاعده‌ی مشابه، بازنشستگی قاعده‌ی بلااستفاده‌ی مورد انتقاد ← آیتم صف «تثبیت»
//   (با تأیید مدیر اجرا می‌شود؛ ردیف قدیمی «ادغام‌شده/بازنشسته» می‌شود و می‌ماند).
//   بازمحاسبه‌ی اهمیت ادعا و قاعده از روی استفاده و رأی انسان ← خودکار (مثل اعتماد) و فقط وقتی تغییر ≥ آستانه و شواهدی هست.
//   افت عملکرد (میانگین خطای چند سررسید اخیر در برابر قبل) ← آیتم اطلاع‌رسانی.
// قاعده‌هایی که بررسی کدنویسی‌شده دارند (check) هرگز ادغام/بازنشسته نمی‌شوند: کدشان می‌ماند و فقط جدا از حافظه عوض می‌شود.

const norm = (s) => String(s || "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).toLowerCase();
export const tokens = (text) => new Set(norm(text).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1));
export function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  return inter / (A.size + B.size - inter);
}

const DEAD = new Set(["بازنشسته", "ادغام‌شده"]);
const openRules = () => [...currentRows("rules").values()].filter((r) => !r.recorded_to && r.natural_key);
const liveRules = () => openRules().filter((r) => !DEAD.has(r.status));
const feedbackRows = () => [...currentRows("feedback").values()].filter((r) => !r.recorded_to);

/** هر دو قاعده بدون بررسی کدنویسی‌شده و با دامنه‌ی یکسان و زنده باشند. */
export function canMerge(a, b) {
  return !!a && !!b && a.natural_key !== b.natural_key && !a.check && !b.check && !DEAD.has(a.status) && !DEAD.has(b.status) && stable(a.scope || null) === stable(b.scope || null);
}

/** رأی انسان به یک مرجع (rule:KEY یا claim:KEY): +۱ موافق/درست، −۱ مخالف/غلط. */
export function votesFor(ref) {
  let pos = 0, neg = 0;
  for (const f of feedbackRows()) {
    if (f.target_id !== ref) continue;
    if (f.kind === "rule_critique") (f.scores?.stance === "agree" ? pos++ : neg++);
    else if (f.kind === "data_check") { if (f.scores?.verdict === "correct") pos++; else if (f.scores?.verdict === "wrong") neg++; }
    else if (f.kind === "critique") neg++;
  }
  return { pos, neg, net: pos + neg ? (pos - neg) / (pos + neg + 2) : 0, total: pos + neg };
}

/** اهمیت = پایه + وزنِ استفاده(تا ۱۰ بار) + وزنِ رأی خالص. بدون استفاده و بدون رأی: null (دست‌نخورده می‌ماند). */
export function importanceOf({ use, votes }, cfg = loadLearningConfig().consolidation.importance) {
  if (!use && !votes.total) return null;
  const v = cfg.base + cfg.usage * Math.min(1, (use || 0) / 10) + cfg.votes * votes.net;
  return Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
}

function reviseRule(old, patch, reason, at, by = "learning") {
  const { id, created_at, recorded_from, recorded_to, closed_reason, ...keep } = old;
  const row = putRow("rules", makeRow("rules", { ...keep, ...patch, supersedes: id, change_reason: reason, created_at: new Date().toISOString() }, at));
  closeRow("rules", id, { reason, by, at });
  return row;
}

/** ۱) اهمیت: ادعاها و قاعده‌ها. فقط وقتی شواهد هست و تغییر ≥ آستانه. */
export function recomputeImportance({ at }) {
  const cfg = loadLearningConfig().consolidation.importance;
  const idx = loadIndex();
  let claims = 0, rules = 0;
  for (const c of idx.claims.values()) {
    const next = importanceOf({ use: c.use_count || 0, votes: votesFor(`claim:${c.natural_key}`) }, cfg);
    if (next === null || Math.abs(next - (c.importance ?? 0.5)) < cfg.rewrite_threshold) continue;
    reviseClaim(idx, c, { importance: next }, `اهمیت بازمحاسبه شد: ${c.importance} ← ${next} (استفاده و رأی انسان)`, { at, by: "consolidation" });
    claims += 1;
  }
  for (const r of liveRules()) {
    const tr = r.track_record || { better: 0, worse: 0 };
    const next = importanceOf({ use: (tr.better || 0) + (tr.worse || 0), votes: votesFor(`rule:${r.natural_key}`) }, cfg);
    if (next === null || Math.abs(next - (r.importance ?? 0.5)) < cfg.rewrite_threshold) continue;
    reviseRule(r, { importance: next }, `اهمیت بازمحاسبه شد: ${r.importance} ← ${next}`, at, "consolidation");
    rules += 1;
  }
  return { claims, rules };
}

const consItem = (action, keys, label, extra = {}) => ({
  natural_key: `consolidation|${action}|${[...keys].sort().join("+")}`, kind: "consolidation", group: "consolidation", label, subject: action, period: null, spread: null, action,
  members: keys.map((k) => ({ claim_key: `rule:${k}`, metric: action, source: "consolidation", value: null })), ...extra,
});

/** ۲) پیشنهاد ادغام: جفت‌های کاملاً مشابه (برگ‌های بالاتر از آستانه). */
export function proposeMerges({ at }) {
  const cfg = loadLearningConfig().consolidation;
  const rules = liveRules();
  const out = [];
  for (let i = 0; i < rules.length; i++) for (let j = i + 1; j < rules.length; j++) {
    const a = rules[i], b = rules[j];
    if (!canMerge(a, b)) continue;
    const s = similarity(a.text, b.text);
    if (s < cfg.merge_similarity) continue;
    // مبقی: قاعده‌ی با اهمیت بیشتر (و قدیمی‌تر در تساوی)
    const keep = (b.importance ?? 0.5) > (a.importance ?? 0.5) ? b : a;
    const drop = keep === a ? b : a;
    raiseItem(consItem("merge", [keep.natural_key, drop.natural_key], `ادغام دو قاعده‌ی تقریباً تکراری (شباهت ${Math.round(s * 100)}٪): «${drop.text.slice(0, 70)}» داخل «${keep.text.slice(0, 70)}»`, { keep: keep.natural_key, drop: drop.natural_key, similarity: Math.round(s * 100) / 100 }), { at });
    out.push([keep.natural_key, drop.natural_key]);
  }
  return out;
}

const ABSTRACT_SYSTEM = `از چند قاعده‌ی مشابه یک قاعده‌ی کلی‌تر یک‌جمله‌ای فارسی بساز که همه را پوشش دهد و هیچ عدد یا ادعای تازه‌ای اضافه نکند. خروجی فقط JSON: {"text":"..."}`;
async function defaultGenerate({ system, input }) {
  const key = resolveBrainKey();
  if (!key) throw new Error("کلید مغز تنظیم نشده.");
  return generateContent({ apiKey: key, model: BRAIN_MODEL, systemInstruction: system, input, generationConfig: { temperature: 0.2, maxOutputTokens: 1024, responseMimeType: "application/json" } });
}

/** ۳) انتزاع: دست‌کم abstract_min_group قاعده‌ی هم‌گروه (شباهت ≥ آستانه‌ی انتزاع، زنجیره‌ای) ← یک قاعده‌ی کلی‌تر (با مدل). بدون مدل چیزی پیشنهاد نمی‌شود. */
export async function proposeAbstractions({ at, generate = defaultGenerate }) {
  const cfg = loadLearningConfig().consolidation;
  const rules = liveRules().filter((r) => !r.check);
  const seen = new Set();
  const out = [];
  for (const r of rules) {
    if (seen.has(r.natural_key)) continue;
    const group = [r];
    for (const o of rules) if (o !== r && !seen.has(o.natural_key) && group.every((g) => canMerge(g, o)) && similarity(r.text, o.text) >= cfg.abstract_similarity) group.push(o);
    if (group.length < cfg.abstract_min_group) continue;
    group.forEach((g) => seen.add(g.natural_key));
    let text = null;
    try {
      const t = await generate({ system: ABSTRACT_SYSTEM, input: group.map((g, i) => `${i + 1}) ${g.text}`).join("\n") });
      const m = String(t).match(/\{[\s\S]*\}/);
      text = m ? String(JSON.parse(m[0]).text || "").slice(0, 400) : null;
    } catch { text = null; }
    if (!text || text.length < 10) continue;
    raiseItem(consItem("abstract", group.map((g) => g.natural_key), `قاعده‌ی کلی‌تر برای ${group.length} قاعده‌ی مشابه: «${text.slice(0, 120)}»`, { abstract_text: text }), { at });
    out.push(group.map((g) => g.natural_key));
  }
  return out;
}

/** نخستین ثبت یک قاعده (در میان همه‌ی نسخه‌هایش؛ بازمحاسبه‌ی اهمیت عمر قاعده را صفر نمی‌کند). */
function firstSeenMs(naturalKey) {
  let min = Infinity;
  for (const r of currentRows("rules").values()) if (r.natural_key === naturalKey) min = Math.min(min, new Date(r.recorded_from).getTime());
  return min;
}

/** ۴) بازنشستگی: قاعده‌ی بدون بررسی کد، بدون استفاده در retire_unused_days و دست‌کم N رأی منفی. */
export function proposeRetirements({ now, at }) {
  const cfg = loadLearningConfig().consolidation;
  const out = [];
  for (const r of liveRules()) {
    if (r.check) continue;
    const age = (now.getTime() - firstSeenMs(r.natural_key)) / DAY;
    const tr = r.track_record || { better: 0, worse: 0 };
    const v = votesFor(`rule:${r.natural_key}`);
    if (age < cfg.retire_unused_days || (tr.better || 0) + (tr.worse || 0) > 0 || v.neg < cfg.retire_min_negative_votes) continue;
    raiseItem(consItem("retire", [r.natural_key], `بازنشستگی قاعده‌ی «${r.text.slice(0, 90)}»: ${Math.round(age)} روز بدون استفاده و ${v.neg} رأی منفی.`), { at });
    out.push(r.natural_key);
  }
  return out;
}

/** ۵) افت عملکرد: میانگین خطای نسبی چند سررسید اخیر هر پیش‌بین در برابر قبل از آن. فقط آیتم اطلاع‌رسانی (بازبینی روش را «روش غلط» می‌خواند). */
export function performanceDrops({ at }) {
  const cfg = loadLearningConfig().consolidation.performance_drop;
  const by = new Map();
  for (const r of readScores().filter((x) => x.kind === "time_avg")) {
    if (r.forecaster.includes("@")) continue;
    (by.get(r.forecaster) || by.set(r.forecaster, []).get(r.forecaster)).push(r);
  }
  const out = [];
  for (const [forecaster, rows] of by) {
    rows.sort((a, b) => String(a.outcome_as_of || a.question_id).localeCompare(String(b.outcome_as_of || b.question_id)) || a.question_id.localeCompare(b.question_id));
    if (rows.length < cfg.min_total) continue;
    const mean = (xs) => xs.reduce((s, x) => s + x.abs_rel_err, 0) / xs.length;
    const recent = rows.slice(-cfg.recent), before = rows.slice(0, -cfg.recent);
    const drop = mean(recent) - mean(before);
    if (drop < cfg.threshold) continue;
    raiseItem(consItem("performance_drop", [forecaster.replace(/[+]/g, "_")], `افت عملکرد ${forecaster}: میانگین خطای ${cfg.recent} سررسید اخیر ${Math.round(mean(recent) * 1000) / 10}٪ در برابر ${Math.round(mean(before) * 1000) / 10}٪ پیش از آن.`, { spread: Math.round(drop * 1000) / 10 }), { at });
    out.push(forecaster);
  }
  return out;
}

/** تثبیت کامل. generate فقط برای انتزاع. */
export async function runConsolidation({ now = new Date(), generate } = {}) {
  const at = now.toISOString();
  const importance = recomputeImportance({ at });
  const merges = proposeMerges({ at });
  const abstractions = await proposeAbstractions({ at, generate });
  const retirements = proposeRetirements({ now, at });
  const drops = performanceDrops({ at });
  return { importance, merges: merges.length, abstractions: abstractions.length, retirements: retirements.length, performance_drops: drops.length };
}

/** تصمیم‌های مدیر روی آیتم‌های تثبیت را اجرا می‌کند (idempotent). */
export function syncConsolidationDecisions({ now = new Date() } = {}) {
  const at = now.toISOString();
  const applied = [];
  for (const q of currentRows("queue").values()) {
    if (q.recorded_to || q.kind !== "consolidation" || q.status !== "resolved" || q.resolution?.decision !== "accept") continue;
    const by = q.resolution.by;
    const byKey = new Map(openRules().map((r) => [r.natural_key, r]));
    if (q.action === "merge") {
      const keep = byKey.get(q.keep), drop = byKey.get(q.drop);
      if (!canMerge(keep, drop)) continue; // در این فاصله وضعیت عوض شده؛ دست نمی‌زنیم
      reviseRule(drop, { status: "ادغام‌شده", merged_into: keep.natural_key }, `ادغام در «${keep.natural_key}» با تأیید ${by}`, at);
      reviseRule(keep, { evidence: [...(keep.evidence || []), ...(drop.evidence || []), `ادغام:${drop.natural_key}`], track_record: { better: (keep.track_record?.better || 0) + (drop.track_record?.better || 0), worse: (keep.track_record?.worse || 0) + (drop.track_record?.worse || 0) } }, `قاعده‌ی «${drop.natural_key}» داخل آن ادغام شد (${by})`, at);
      applied.push(`merge:${q.drop}→${q.keep}`);
    } else if (q.action === "retire") {
      const key = q.members[0].claim_key.slice(5);
      const r = byKey.get(key);
      if (!r || r.check || DEAD.has(r.status)) continue;
      reviseRule(r, { status: "بازنشسته" }, `بازنشسته با تأیید ${by}`, at);
      applied.push(`retire:${key}`);
    } else if (q.action === "abstract") {
      const keys = q.members.map((m) => m.claim_key.slice(5));
      const group = keys.map((k) => byKey.get(k)).filter(Boolean);
      const nk = `abstract|${[...keys].sort().join("+")}`;
      if (group.length < 2 || byKey.has(nk)) continue;
      putRow("rules", makeRow("rules", { text: q.abstract_text, status: "پیشنهادی", check: null, scope: group[0].scope || null, origin: "تثبیت ماهانه", evidence: keys.map((k) => `rule:${k}`), natural_key: nk, created_at: new Date().toISOString() }, at));
      applied.push(`abstract:${nk}`);
    }
  }
  return applied;
}

// -------------------------------------------------------------------------------- زمان‌بندی ماهانه
const stateFile = () => path.join(getBrainDir(), "learning_state.json");
export function readLearningState() {
  try { return JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ stateFile(), "utf-8")); } catch { return {}; }
}
export function writeLearningState(patch) {
  fs.writeFileSync(/* turbopackIgnore: true */ stateFile(), JSON.stringify({ ...readLearningState(), ...patch }, null, 1));
}

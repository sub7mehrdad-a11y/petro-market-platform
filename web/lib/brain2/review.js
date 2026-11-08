import crypto from "crypto";
import { closeRow, currentRows, putRow } from "./store";
import { makeRow } from "./schema";
import { tehranClock } from "./forecast";
import { listRules } from "./rules";
import { raiseItem, syncClaimStatuses } from "./knowledge/queue";
import { loadIndex } from "./memory";
import { readScores } from "./scoring/read";

// صف بازبینی انسانی روزانه و بازخورد چهار نفر (پروتکل ۱۰). هر نفر هر روز حداکثر ۵ مورد می‌بیند: ۳ هدفمند (بیشترین اختلاف تحلیل‌گرها /
// کمترین اطمینان / بیشترین اثر) و ۲ تصادفی برای حسابرسی. ارزیابی کور: ارزیاب نمی‌داند تحلیل را کدام تحلیل‌گر یا مدل نوشته (سرور
// هویت را اصلاً نمی‌فرستد). بازخورد در مخزن feedback ثبت می‌شود (هر نفر جدا، فقط‌افزودنی). «داده غلط است» و نقد قاعده به صف بازبینی
// مدیر می‌روند. نمره‌ی استدلال/قابلیت اجرا فقط برای بهبود شکل خروجی است و هرگز جای سنجش با واقعیت را نمی‌گیرد (۱۰-۵ و ۱۰-۶).

export const DAILY = { targeted: 3, random: 2 };
const FAMILIES = ["analysis", "claim", "rule"];

// ------------------------------------------------------------------------------------------------ ابزار
const seeded = (seed) => {
  let a = crypto.createHash("sha256").update(seed).digest().readUInt32LE(0);
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};
const shuffle = (arr, rnd) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fmt = (v) => (typeof v === "number" ? (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : String(Math.round(v * 100) / 100)) : String(v).slice(0, 200));
const me = (u) => `human:${String(u || "").toLowerCase()}`;

function context() {
  const claimsById = currentRows("claims");
  const open = new Map();
  for (const c of claimsById.values()) if (!c.recorded_to && c.natural_key) open.set(c.natural_key, c);
  const sources = new Map([...currentRows("sources").values()].map((s) => [s.id, s]));
  return { claimsById, open, sources };
}
const claimLine = (c, ctx) => `${c.subject} | ${c.metric} | ${c.period ?? "—"}: ${fmt(c.value)} ${c.unit || ""} (${ctx.sources.get(c.source_ids?.[0])?.origin || "منبع نامشخص"}؛ اعتماد ${c.confidence})`;
function cited(ids, ctx, limit = 5) {
  const out = [];
  for (const id of ids || []) {
    const c = ctx.claimsById.get(id);
    if (!c || c.metric === "signal") continue;
    out.push({ claim_key: c.natural_key, line: claimLine(c, ctx) });
    if (out.length >= limit) break;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ مجموعه‌ی کاندیدها و توصیف کور
/** توصیف کورِ یک مورد. هویت تحلیل‌گر/مدل هرگز در خروجی نیست. null اگر مورد دیگر وجود ندارد. */
export function describe(ref, ctx = context()) {
  const [kind, ...rest] = String(ref).split(":");
  const key = rest.join(":");
  if (kind === "analysis") {
    const p = currentRows("predictions").get(key);
    if (!p || !p.forecaster?.startsWith("machine:")) return null;
    return { ref, type: "forecast", title: `پیش‌بینی: ${p.question}`, statement: p.rationale || "(بدون توضیح)", numbers: { point: p.forecast.point, lo: p.forecast.lo, hi: p.forecast.hi, unit: p.forecast.unit }, cited: cited(p.claim_ids, ctx) };
  }
  if (kind === "ranking") {
    const a = [...currentRows("analyses").values()].find((x) => !x.recorded_to && x.natural_key === key && x.analyst === "scoring-v1");
    if (!a) return null;
    const r = a.payload || {};
    return { ref, type: "ranking", title: `رتبه‌بندی بازار هدف: ${r.country}`, statement: `${a.statement}. ${Object.values(r.notes || {}).join("؛ ")}${r.flags?.length ? ` (برچسب: ${r.flags.join("، ")})` : ""}`, numbers: { score: r.score, tier: r.tier }, cited: cited(a.claim_ids, ctx) };
  }
  if (kind === "claim") {
    const c = ctx.open.get(key);
    if (!c || c.status === "بسته‌شده") return null;
    return { ref, type: "claim", title: "یک عدد از حافظه‌ی پلتفرم", statement: claimLine(c, ctx), numbers: { value: c.value, unit: c.unit }, cited: [] };
  }
  if (kind === "rule") {
    const r = listRules().find((x) => x.natural_key === key);
    if (!r) return null;
    return { ref, type: "rule", title: `قاعده (${r.status}): ${r.label_fa || key}`, statement: r.text, numbers: {}, cited: [] };
  }
  return null;
}

/** کاندیدهای روز با امتیاز «هدفمند»: اختلاف تحلیل‌گرها، کمترین اطمینان، بیشترین اثر. */
export function buildPool() {
  const ctx = context();
  const items = [];
  const disagreement = new Map();
  for (const a of currentRows("analyses").values()) {
    if (!a.recorded_to && a.analyst === "judge" && a.payload?.question_id) disagreement.set(a.payload.question_id, a.payload.combined?.disagreement || 0);
  }
  const cutoff = Date.now() - 45 * 86400000;
  for (const p of currentRows("predictions").values()) {
    if (p.recorded_to || !p.forecaster?.startsWith("machine:") || new Date(p.made_at).getTime() < cutoff) continue;
    const width = (p.forecast.hi - p.forecast.lo) / p.forecast.point;
    items.push({ ref: `analysis:${p.id}`, family: "analysis", score: (disagreement.get(p.question_id) > 0.05 ? 2 + disagreement.get(p.question_id) * 10 : 0.5) + width, targeted_by: disagreement.get(p.question_id) > 0.05 ? "بیشترین اختلاف تحلیل‌گرها" : "پهن‌ترین بازه (کمترین اطمینان)" });
  }
  for (const a of currentRows("analyses").values()) {
    if (a.recorded_to || a.analyst !== "scoring-v1") continue;
    const r = a.payload || {};
    const impact = (r.tier === "A" ? 1 : r.tier === "B" ? 0.5 : 0.2) + (r.data_gaps?.length || 0) * 0.2 + (r.flags?.includes("unit_value_suspect") ? 0.3 : 0);
    items.push({ ref: `ranking:${a.natural_key}`, family: "analysis", score: impact, targeted_by: "بیشترین اثر بر تصمیم (رتبه‌بندی)" });
  }
  for (const c of ctx.open.values()) {
    if (c.status === "بسته‌شده" || c.metric === "signal" || typeof c.value !== "number" || c.confidence >= 0.6) continue;
    items.push({ ref: `claim:${c.natural_key}`, family: "claim", score: 1 - c.confidence, targeted_by: "کمترین اطمینان" });
  }
  const flagged = {};
  for (const c of ctx.open.values()) for (const k of c.rule_flags || []) flagged[k] = (flagged[k] || 0) + 1;
  for (const r of listRules()) {
    if (r.status === "پذیرفته" || r.status === "بازنشسته") continue;
    items.push({ ref: `rule:${r.natural_key}`, family: "rule", score: 0.3 + Math.min(0.7, (flagged[r.natural_key] || 0) / 200), targeted_by: "قاعده‌ی پیشنهادی در انتظار نظر" });
  }
  return items.sort((a, b) => b.score - a.score || a.ref.localeCompare(b.ref));
}

// ------------------------------------------------------------------------------------------------ سهم روزانه
const rowsOf = (kind) => [...currentRows("queue").values()].filter((r) => !r.recorded_to && r.kind === kind);
const feedbackRows = () => [...currentRows("feedback").values()].filter((r) => !r.recorded_to);

/** سهم امروز یک نفر (idempotent: همان روز همان فهرست). اگر مورد تازه‌ای نیست ممکن است کمتر از ۵ باشد. */
export function assignFor(username, { now = new Date() } = {}) {
  const date = tehranClock(now).date;
  const key = `review|${date}|${String(username).toLowerCase()}`;
  let row = rowsOf("review_assignment").find((r) => r.natural_key === key);
  if (!row) {
    const done = new Set(feedbackRows().filter((f) => f.giver === me(username)).map((f) => f.target_id));
    const recent = new Set();
    const cut = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    for (const a of rowsOf("review_assignment")) if (a.subject === String(username).toLowerCase() && a.period >= cut) for (const m of a.members) recent.add(m.ref);
    const pool = buildPool().filter((it) => !done.has(it.ref) && !recent.has(it.ref));
    const chosen = [];
    const byFam = Object.fromEntries(FAMILIES.map((f) => [f, pool.filter((it) => it.family === f)]));
    // سه مورد هدفمند: از هر خانواده بهترین، به‌ترتیب دوره‌ای
    for (let guard = 0; chosen.length < DAILY.targeted && guard < 20; guard++) {
      const fam = FAMILIES[guard % FAMILIES.length];
      const it = byFam[fam].find((x) => !chosen.some((c) => c.ref === x.ref));
      if (it) chosen.push({ ...it, selection: "هدفمند" });
      if (FAMILIES.every((f) => byFam[f].every((x) => chosen.some((c) => c.ref === x.ref)))) break;
    }
    // دو مورد تصادفی (حسابرسی): قطعی برای هر (روز، نفر) تا قابل بازتولید باشد
    const rest = shuffle(pool.filter((it) => !chosen.some((c) => c.ref === it.ref)), seeded(key));
    for (const it of rest.slice(0, DAILY.random)) chosen.push({ ...it, selection: "تصادفی" });
    const at = now.toISOString();
    row = putRow("queue", makeRow("queue", {
      kind: "review_assignment", subject: String(username).toLowerCase(), period: date, status: "assigned", natural_key: key, detected_at: at,
      members: chosen.map((c) => ({ ref: c.ref, type: c.family, selection: c.selection, targeted_by: c.selection === "هدفمند" ? c.targeted_by : null })),
    }, at));
  }
  return row;
}

/** مورد‌های امروز با توصیف کور و وضعیت «ثبت شده». */
export function todayView(username, { now = new Date() } = {}) {
  const row = assignFor(username, { now });
  const ctx = context();
  const mine = feedbackRows().filter((f) => f.giver === me(username));
  const items = row.members.map((m) => {
    const d = describe(m.ref, ctx);
    const fb = mine.find((f) => f.target_id === m.ref && f.kind !== "critique");
    return d ? { ...d, selection: m.selection, done: !!fb, my_feedback: fb ? { kind: fb.kind, scores: fb.scores, comment: fb.comment } : null } : { ref: m.ref, type: m.type, gone: true, selection: m.selection, done: true };
  });
  return { date: row.period, items, answered: items.filter((i) => i.done).length, total: items.length };
}

// ------------------------------------------------------------------------------------------------ ثبت بازخورد
const isInt = (x) => Number.isInteger(x) && x >= 1 && x <= 5;
const str = (x, n) => String(x ?? "").trim().slice(0, n);

function validate(kind, ref, f, d) {
  if (kind === "analysis_score") {
    if (!["analysis", "ranking"].includes(ref.split(":")[0])) return "نمره‌ی تفکیکی فقط برای تحلیل است.";
    if (!["yes", "no", "unknown"].includes(f.data_ok)) return "درستی داده‌ها را مشخص کنید (بله / نه / نمی‌دانم).";
    if (f.data_ok === "no" && str(f.data_note, 400).length < 3) return "اگر داده‌ها درست نیست، بنویسید کدام عدد و چرا.";
    if (f.claim_key && !d.cited.some((c) => c.claim_key === f.claim_key)) return "عدد انتخاب‌شده جزو داده‌های این تحلیل نیست.";
    if (!isInt(f.reasoning) || !isInt(f.actionable)) return "نمره‌ی استدلال و قابلیت اجرا باید عدد ۱ تا ۵ باشد.";
  } else if (kind === "data_check") {
    if (ref.split(":")[0] !== "claim") return "بررسی داده فقط برای یک عدد حافظه است.";
    if (!["correct", "wrong", "unknown"].includes(f.verdict)) return "نظر خود را مشخص کنید (درست / غلط / نمی‌دانم).";
    if (f.verdict === "wrong" && str(f.note, 400).length < 3 && !str(f.believed_value, 60)) return "اگر عدد غلط است، مقدار درست یا توضیح را بنویسید.";
  } else if (kind === "rule_critique") {
    if (ref.split(":")[0] !== "rule") return "نقد قاعده فقط برای قاعده است.";
    if (!["agree", "disagree"].includes(f.stance)) return "موافقت یا مخالفت را مشخص کنید.";
    if (f.stance === "disagree" && str(f.reason, 600).length < 5) return "برای مخالفت دلیل بنویسید.";
  } else if (kind === "critique") {
    if (!["data", "rule", "reasoning", "method"].includes(f.type)) return "نوع نقد نامعتبر است.";
    if (str(f.reason, 800).length < 5) return "دلیل نقد را بنویسید.";
  } else return "نوع بازخورد نامعتبر است.";
  return null;
}

/**
 * ثبت بازخورد یک نفر. نمره‌های تفکیکی/بررسی داده/نقد قاعده فقط برای مورد سهم خودش (کور)؛ نقد آزاد برای هر مورد موجود.
 * بازخورد دوباره‌ی همان (نفر، هدف، نوع) = نسخه‌ی تازه (قبلی بسته می‌شود، پاک نمی‌شود).
 */
export function submitFeedback({ username, ref, kind, fields = {}, now = new Date() }) {
  const ctx = context();
  const d = describe(ref, ctx);
  if (!d) return { ok: false, error: "این مورد دیگر وجود ندارد." };
  const bad = validate(kind, ref, fields, d);
  if (bad) return { ok: false, error: bad };
  let selection = "آزاد";
  if (kind !== "critique") {
    const assigned = rowsOf("review_assignment").filter((a) => a.subject === String(username).toLowerCase()).flatMap((a) => a.members).find((m) => m.ref === ref);
    if (!assigned) return { ok: false, error: "این مورد در سهم شما نیست." };
    selection = assigned.selection;
  }
  const at = now.toISOString();
  const scores = kind === "analysis_score" ? { data_ok: fields.data_ok, reasoning: fields.reasoning, actionable: fields.actionable, claim_key: fields.claim_key || null }
    : kind === "data_check" ? { verdict: fields.verdict, believed_value: str(fields.believed_value, 60) || null }
    : kind === "rule_critique" ? { stance: fields.stance }
    : { type: fields.type, evidence: str(fields.evidence, 600) || null };
  const comment = str(fields.data_note ?? fields.note ?? fields.reason, 800) || null;
  const prev = feedbackRows().find((f) => f.giver === me(username) && f.target_id === ref && f.kind === kind && (kind !== "critique" || f.scores?.type === fields.type));
  const row = putRow("feedback", makeRow("feedback", {
    giver: me(username), target_id: ref, kind, scores, comment, blind: ["analysis", "ranking"].includes(ref.split(":")[0]), selection,
    supersedes: prev ? prev.id : null, change_reason: prev ? "بازخورد به‌روز شد" : null, created_at: at,
  }, at));
  if (prev) closeRow("feedback", prev.id, { reason: "نسخه‌ی تازه", by: me(username), at });
  return { ok: true, feedback: row, effects: applyEffects({ ref, kind, fields, d, username, at }) };
}

/** اثر بازخورد (۱۰-۵): «داده غلط است» ← صف بازبینی ادعا؛ نقد قاعده ← صف بازبینی قاعده؛ نمره‌های استدلال/اجرا فقط ثبت می‌شوند. */
function applyEffects({ ref, kind, fields, d, username, at }) {
  const out = [];
  const who = String(username).toLowerCase();
  const flagClaim = (claimKey, why) => {
    const c = context().open.get(claimKey);
    if (!c) return;
    raiseItem({ natural_key: `human_flag|${claimKey}`, kind: "human_flag", group: "human", label: `گزارش کارشناس (${who}): ${why}`, subject: c.subject, period: c.period, spread: null, members: [{ claim_key: claimKey, metric: c.metric, source: `human:${who}`, value: c.value, unit: c.unit, period: c.period }] }, { at });
    syncClaimStatuses(loadIndex(), { at });
    out.push("claim_review");
  };
  if (kind === "analysis_score" && fields.data_ok === "no") {
    if (fields.claim_key) flagClaim(fields.claim_key, str(fields.data_note, 120));
    else {
      raiseItem({ natural_key: `analysis_flag|${ref}`, kind: "analysis_flag", group: "human", label: `داده‌ی یک تحلیل غلط گزارش شد (${who}): ${str(fields.data_note, 160)}`, subject: d.title, period: null, spread: null, members: [{ claim_key: ref, metric: d.type, source: `human:${who}`, value: str(fields.data_note, 60) }] }, { at });
      out.push("analysis_review");
    }
  }
  if (kind === "data_check" && fields.verdict === "wrong") flagClaim(ref.slice("claim:".length), str(fields.note || `مقدار درست: ${fields.believed_value}`, 120));
  if (kind === "rule_critique" && fields.stance === "disagree") {
    raiseItem({ natural_key: `rule_critique|${ref}|${who}`, kind: "rule_critique", group: "human", label: `نقد قاعده (${who}): ${str(fields.reason, 160)}`, subject: d.title, period: null, spread: null, members: [{ claim_key: ref, metric: "rule", source: `human:${who}`, value: str(fields.reason, 60) }] }, { at });
    out.push("rule_review");
  }
  if (kind === "critique") {
    if (fields.type === "data" && ref.startsWith("claim:")) flagClaim(ref.slice(6), str(fields.reason, 120));
    else if (fields.type === "rule" && ref.startsWith("rule:")) {
      raiseItem({ natural_key: `rule_critique|${ref}|${who}`, kind: "rule_critique", group: "human", label: `نقد قاعده (${who}): ${str(fields.reason, 160)}`, subject: d.title, period: null, spread: null, members: [{ claim_key: ref, metric: "rule", source: `human:${who}`, value: str(fields.reason, 60) }] }, { at });
      out.push("rule_review");
    } else out.push("recorded");
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ گزارش مدیر
/** نرخ ثبت بازخورد (شاخص ۱۷: بیش از ۸۰٪ موارد ارسالی) و مقایسه‌ی نمره‌ی انسان با واقعیت (۱۰-۶). */
export function reviewStats({ now = new Date(), days = 14 } = {}) {
  const cut = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  const fb = feedbackRows();
  const byUser = new Map();
  for (const a of rowsOf("review_assignment")) {
    if (a.period < cut) continue;
    const u = a.subject;
    const e = byUser.get(u) || { user: u, assigned: 0, answered: 0, days: 0, targeted: 0, random: 0 };
    e.days += 1;
    for (const m of a.members) {
      e.assigned += 1;
      if (m.selection === "هدفمند") e.targeted += 1; else e.random += 1;
      if (fb.some((f) => f.giver === me(u) && f.target_id === m.ref && f.kind !== "critique")) e.answered += 1;
    }
    byUser.set(u, e);
  }
  const scores = readScores().filter((r) => r.kind === "version");
  const skillByPred = new Map(scores.map((r) => [r.prediction_id, r.skill_vs_baseline]));
  const people = [...byUser.values()].map((e) => {
    const mine = fb.filter((f) => f.giver === me(e.user) && f.kind === "analysis_score");
    const linked = mine.map((f) => ({ f, skill: skillByPred.get(f.target_id.replace("analysis:", "")) })).filter((x) => typeof x.skill === "number");
    return {
      ...e, response_rate: e.assigned ? Math.round((e.answered / e.assigned) * 100) / 100 : null,
      mean_reasoning: mine.length ? Math.round((mine.reduce((s, f) => s + f.scores.reasoning, 0) / mine.length) * 100) / 100 : null,
      scored_targets: linked.length, high_rating_on_negative_skill: linked.filter((x) => x.f.scores.reasoning >= 4 && x.skill < 0).length,
    };
  }).sort((a, b) => a.user.localeCompare(b.user));
  return { days, people, feedback_total: fb.length, open_human_items: [...currentRows("queue").values()].filter((r) => !r.recorded_to && r.status === "open" && ["human_flag", "rule_critique", "analysis_flag"].includes(r.kind)).length };
}

/** فهرست بازخوردها برای مدیر (با هویت بازخورددهنده و، برای تحلیل‌ها، تحلیل‌گر واقعی که ارزیاب نمی‌دید). */
export function feedbackForAdmin({ limit = 60 } = {}) {
  const preds = currentRows("predictions");
  return feedbackRows().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit).map((f) => {
    const p = f.target_id.startsWith("analysis:") ? preds.get(f.target_id.slice(9)) : null;
    return { id: f.id, giver: f.giver, target: f.target_id, kind: f.kind, scores: f.scores, comment: f.comment, selection: f.selection, at: f.created_at, analyst: p ? `${p.forecaster}` : null };
  });
}

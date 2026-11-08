// تست مرحله‌ی ۷ مغز (صف بازبینی انسانی روزانه و بازخورد چهار نفر، پروتکل ۱۰): سهم روزانه (۳ هدفمند + ۲ تصادفی)، ارزیابی کور،
// بازخورد ساخت‌یافته (نمره‌ی تفکیکی، بررسی عدد، نقد قاعده، نقد آزاد)، اثر بازخورد (داده غلط ← صف بازبینی)، مقایسه‌ی نمره‌ی انسان با واقعیت.
//   node --import ./scripts/alias-loader.mjs scripts/test-brain-review.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "brainrv-"));
const REAL = path.join(process.cwd(), "..", "data");
const dataDir = path.join(tmp, "data");
fs.mkdirSync(path.join(dataDir, "brain"), { recursive: true });
for (const f of fs.readdirSync(REAL)) if (f.endsWith(".json") && !/email|outreach|users|companies|exhibition/.test(f)) fs.copyFileSync(path.join(REAL, f), path.join(dataDir, f));
for (const f of ["country_scores.json", "scoring_config.json", "confidence_config.json", "analysts_config.json", "digest.md"]) fs.copyFileSync(path.join(REAL, "brain", f), path.join(dataDir, "brain", f));
process.env.BRAIN_DATA_DIR = dataDir;
process.env.BRAIN_STATE_DIR = path.join(tmp, "state");
process.env.SALES_STATE_DIR = path.join(tmp, "sales");
delete process.env.OUTREACH_STATE_DIR;

const S = await import("../lib/brain2/store.js");
const Mig = await import("../lib/brain2/migrate.js");
const K = await import("../lib/brain2/knowledge/cycle.js");
const Q = await import("../lib/brain2/knowledge/queue.js");
const M = await import("../lib/brain2/memory.js");
const F = await import("../lib/brain2/forecast.js");
const MF = await import("../lib/brain2/machineForecaster.js");
const W = await import("../lib/brain2/scoring/writer.js");
const RV = await import("../lib/brain2/review.js");

const NOW = new Date("2026-11-09T07:00:00Z");
Mig.runMigration({ now: NOW });
K.runKnowledgeCycle({ now: NOW });
F.ensureRound("2026-11", { now: NOW });
const gens = {
  stat: async () => JSON.stringify({ point: 176, lo: 168, hi: 186, rationale: "نرخ پایه و روند نزولی ملایم سری" }),
  event: async () => JSON.stringify({ point: 186, lo: 172, hi: 200, rationale: "رویداد یوان و کرایه" }),
  judge: async () => "تحلیل‌گرها هم‌نظر نیستند: ۱۷۶ و ۱۸۶.",
};
await MF.runMachineForecasts("2026-11", { now: NOW, generators: gens });

// ------------------------------------------------------------------ مجموعه‌ی کاندیدها
const pool = RV.buildPool();
const fam = (f) => pool.filter((p) => p.family === f);
assert.ok(fam("analysis").some((p) => p.ref.startsWith("analysis:")), "پیش‌بینی ماشینی در مجموعه");
assert.ok(fam("analysis").some((p) => p.ref.startsWith("ranking:")), "رتبه‌بندی در مجموعه");
assert.ok(fam("claim").length > 0 && fam("claim").every((p) => p.ref.startsWith("claim:")), "ادعای کم‌اطمینان");
assert.ok(fam("rule").length === 7, "هفت قاعده‌ی پیشنهادی");
for (let i = 1; i < pool.length; i++) assert.ok(pool[i - 1].score >= pool[i].score, "به‌ترتیب امتیاز هدفمند");
const ctxCheck = (ref) => RV.describe(ref);
for (const p of fam("claim").slice(0, 20)) assert.ok(/^claim:/.test(p.ref) && ctxCheck(p.ref), "همه‌ی ادعاها قابل‌توصیف");
// ادعای سیگنال خبری هرگز نمی‌آید
assert.ok(!pool.some((p) => p.ref.includes("signal")));
// اختلاف تحلیل‌گرها (۵٫۶٪) پیش‌بینی را بالاتر از رتبه‌بندی‌های معمولی هدف می‌گیرد
assert.equal(fam("analysis")[0].targeted_by, "بیشترین اختلاف تحلیل‌گرها");

// ------------------------------------------------------------------ سهم روزانه
const A = RV.assignFor("amini", { now: NOW });
assert.equal(A.members.length, 5, "حداکثر ۵ مورد");
assert.equal(A.members.filter((m) => m.selection === "هدفمند").length, 3);
assert.equal(A.members.filter((m) => m.selection === "تصادفی").length, 2);
assert.equal(new Set(A.members.map((m) => m.ref)).size, 5, "بدون تکرار");
assert.deepEqual(new Set(A.members.filter((m) => m.selection === "هدفمند").map((m) => m.type)), new Set(["analysis", "claim", "rule"]), "سه مورد هدفمند از سه خانواده");
assert.ok(A.members.filter((m) => m.selection === "هدفمند").every((m) => m.targeted_by));
assert.equal(RV.assignFor("amini", { now: new Date("2026-11-09T18:00:00Z") }).id, A.id, "همان روز همان فهرست (idempotent)");
const B = RV.assignFor("kasrayi", { now: NOW });
assert.equal(B.members.length, 5);
assert.deepEqual(B.members.filter((m) => m.selection === "هدفمند").map((m) => m.ref).sort(), A.members.filter((m) => m.selection === "هدفمند").map((m) => m.ref).sort(), "هدفمندها وابسته به نفر نیست (بیشترین اختلاف/کمترین اطمینان)");
assert.notDeepEqual(B.members.filter((m) => m.selection === "تصادفی").map((m) => m.ref), A.members.filter((m) => m.selection === "تصادفی").map((m) => m.ref), "تصادفی‌ها برای هر نفر جدا و قطعی‌اند");
// فردا: موردهای دیروز دوباره نمی‌آیند
const next = RV.assignFor("amini", { now: new Date("2026-11-10T07:00:00Z") });
const yesterday = new Set(A.members.map((m) => m.ref));
assert.ok(next.members.every((m) => !yesterday.has(m.ref)), "مورد ارائه‌شده‌ی هفته‌ی گذشته تکرار نمی‌شود");
assert.notEqual(next.id, A.id);

// ------------------------------------------------------------------ ارزیابی کور
const view = RV.todayView("amini", { now: NOW });
assert.equal(view.items.length, 5);
const blob = JSON.stringify(view);
assert.ok(!/machine:|gpt-oss|gemini|stat-v1|event-v1|judge-v1|تحلیل‌گر آماری|تحلیل‌گر رویدادمحور|scoring-v1/.test(blob), "هویت تحلیل‌گر/مدل هرگز به ارزیاب نمی‌رسد");
assert.ok(view.items.every((i) => i.title && i.statement));
const anItem = view.items.find((i) => i.type === "forecast" || i.type === "ranking");
assert.ok(anItem.cited.length > 0 && anItem.cited.every((c) => c.claim_key && c.line));
const claimItem = view.items.find((i) => i.type === "claim");
const ruleItem = view.items.find((i) => i.type === "rule");

// ------------------------------------------------------------------ اعتبارسنجی بازخورد
const sub = (user, ref, kind, fields) => RV.submitFeedback({ username: user, ref, kind, fields, now: NOW });
assert.match(sub("amini", anItem.ref, "analysis_score", { reasoning: 4, actionable: 4 }).error, /درستی داده/);
assert.match(sub("amini", anItem.ref, "analysis_score", { data_ok: "yes", reasoning: 6, actionable: 4 }).error, /۱ تا ۵/);
assert.match(sub("amini", anItem.ref, "analysis_score", { data_ok: "no", reasoning: 3, actionable: 3 }).error, /کدام عدد/);
assert.match(sub("amini", anItem.ref, "analysis_score", { data_ok: "no", data_note: "عدد غلط", claim_key: "nope", reasoning: 3, actionable: 3 }).error, /جزو داده‌های این تحلیل نیست/);
assert.match(sub("amini", claimItem.ref, "analysis_score", { data_ok: "yes", reasoning: 3, actionable: 3 }).error, /فقط برای تحلیل/);
assert.match(sub("amini", claimItem.ref, "data_check", { verdict: "wrong" }).error, /مقدار درست یا توضیح/);
assert.match(sub("amini", ruleItem.ref, "rule_critique", { stance: "disagree" }).error, /دلیل/);
assert.match(sub("amini", ruleItem.ref, "data_check", { verdict: "correct" }).error, /فقط برای یک عدد/);
assert.match(sub("amini", "claim:does-not-exist", "data_check", { verdict: "correct" }).error, /وجود ندارد/);
const notMine = RV.buildPool().find((p) => !A.members.some((m) => m.ref === p.ref) && !next.members.some((m) => m.ref === p.ref) && p.ref.startsWith("claim:"));
assert.match(sub("amini", notMine.ref, "data_check", { verdict: "correct" }).error, /سهم شما نیست/, "فقط مورد سهم خودش");
assert.equal(S.currentRows("feedback").size, 0, "بازخورد نامعتبر چیزی نمی‌نویسد");

// ------------------------------------------------------------------ ثبت و اثر
const fbFile = path.join(S.getBrainDir(), "feedback.jsonl");
// ۱) تحلیل: «نمره‌ی تفکیکی» با داده‌ی درست
const ok1 = sub("amini", anItem.ref, "analysis_score", { data_ok: "yes", reasoning: 5, actionable: 4 });
assert.ok(ok1.ok);
assert.equal(ok1.feedback.giver, "human:amini");
assert.equal(ok1.feedback.blind, true);
assert.equal(ok1.feedback.selection, A.members.find((m) => m.ref === anItem.ref).selection);
assert.deepEqual([ok1.feedback.scores.data_ok, ok1.feedback.scores.reasoning, ok1.feedback.scores.actionable], ["yes", 5, 4]);
assert.deepEqual(ok1.effects, [], "نمره‌ی استدلال/اجرا فقط ثبت می‌شود (اثر دیگری ندارد)");
// بازخورد دوباره = نسخه‌ی تازه، قبلی بسته می‌شود
const sizeBefore = fs.readFileSync(fbFile, "utf-8");
const ok1b = sub("amini", anItem.ref, "analysis_score", { data_ok: "yes", reasoning: 2, actionable: 4 });
assert.ok(ok1b.ok);
assert.equal(ok1b.feedback.supersedes, ok1.feedback.id);
assert.ok(S.currentRows("feedback").get(ok1.feedback.id).recorded_to, "نسخه‌ی قبلی بسته شد، پاک نشد");
assert.ok(fs.readFileSync(fbFile, "utf-8").startsWith(sizeBefore), "فقط‌افزودنی");
// ۲) تحلیل با «داده غلط است» و عدد مشخص ← ادعا به صف و وضعیت «در صف بررسی»
const target = anItem.cited[0];
const flagged = sub("amini", anItem.ref, "analysis_score", { data_ok: "no", data_note: "این عدد با گمرک نمی‌خواند", claim_key: target.claim_key, reasoning: 3, actionable: 3 });
assert.deepEqual(flagged.effects, ["claim_review"]);
const qv = Q.queueView({ now: NOW });
const hf = qv.open.find((q) => q.kind === "human_flag" && q.members[0].claim_key === target.claim_key);
assert.ok(hf, "ادعای غلط‌گزارش‌شده به صف مدیر رفت");
assert.match(hf.label, /amini/);
assert.equal([...S.currentRows("claims").values()].find((c) => !c.recorded_to && c.natural_key === target.claim_key).status, "در صف بررسی");
// مدیر رد می‌کند ← ادعا بسته می‌شود (از خلاصه کنار می‌رود)؛ «نادیده» برای نقدها ممکن است
let idx = M.loadIndex();
assert.equal(Q.resolveItem(idx, { id: hf.id, decision: "reject", by: "admin", note: "درست گفتی" }).ok, true);
assert.equal([...S.currentRows("claims").values()].find((c) => !c.recorded_to && c.natural_key === target.claim_key).status, "بسته‌شده");
// ۳) «داده غلط است» بدون عدد مشخص ← آیتم تحلیل (فقط «بررسی شد»)
const an2 = view.items.find((i) => (i.type === "forecast" || i.type === "ranking") && i.ref !== anItem.ref);
if (an2) {
  const r2 = sub("amini", an2.ref, "analysis_score", { data_ok: "no", data_note: "کل جدول مشکوک است", reasoning: 2, actionable: 2 });
  assert.deepEqual(r2.effects, ["analysis_review"]);
  const af = Q.queueView({ now: NOW }).open.find((q) => q.kind === "analysis_flag");
  assert.equal(Q.resolveItem(M.loadIndex(), { id: af.id, decision: "accept", claimKey: af.members[0].claim_key, by: "admin" }).ok, false);
  assert.equal(Q.resolveItem(M.loadIndex(), { id: af.id, decision: "dismiss", by: "admin" }).ok, true);
}
// ۴) بررسی یک عدد
assert.deepEqual(sub("amini", claimItem.ref, "data_check", { verdict: "correct" }).effects, []);
const wrong = sub("amini", claimItem.ref, "data_check", { verdict: "wrong", believed_value: "12000", note: "طبق گزارش اختصاصی" });
assert.deepEqual(wrong.effects, ["claim_review"]);
assert.ok(Q.queueView({ now: NOW }).open.some((q) => q.kind === "human_flag" && q.members[0].claim_key === claimItem.ref.slice(6)));
// ۵) نقد قاعده
assert.deepEqual(sub("amini", ruleItem.ref, "rule_critique", { stance: "agree" }).effects, []);
const rc = sub("amini", ruleItem.ref, "rule_critique", { stance: "disagree", reason: "فاصله‌ی ثبت‌شده هم گاهی هوایی است" });
assert.deepEqual(rc.effects, ["rule_review"]);
const rq = Q.queueView({ now: NOW }).open.find((q) => q.kind === "rule_critique");
assert.equal(Q.resolveItem(M.loadIndex(), { id: rq.id, decision: "accept", claimKey: rq.members[0].claim_key, by: "admin" }).ok, false, "نقد قاعده فقط «بررسی شد»");
// ۶) نقد آزاد
assert.match(sub("amini", ruleItem.ref, "critique", { type: "rule", reason: "کم" }).error, /دلیل/);
assert.match(sub("amini", ruleItem.ref, "critique", { type: "bad", reason: "دلیل کافی است" }).error, /نوع نقد/);
const freeClaim = RV.buildPool().find((p) => p.ref.startsWith("claim:") && !A.members.some((m) => m.ref === p.ref));
const free = sub("kasrayi", freeClaim.ref, "critique", { type: "data", reason: "این عدد با ITC نمی‌خواند", evidence: "ITC 2025" });
assert.ok(free.ok);
assert.equal(free.feedback.selection, "آزاد");
assert.deepEqual(free.effects, ["claim_review"], "نقد آزادِ داده ← صف بازبینی");
const freeRule = sub("kasrayi", ruleItem.ref, "critique", { type: "rule", reason: "این قاعده برای هند درست نیست" });
assert.deepEqual(freeRule.effects, ["rule_review"]);
assert.deepEqual(sub("kasrayi", anItem.ref, "critique", { type: "reasoning", reason: "استدلال ناقص است" }).effects, ["recorded"]);
// بازخورد هر نفر جدا
const mineA = [...S.currentRows("feedback").values()].filter((f) => !f.recorded_to && f.giver === "human:amini");
const mineK = [...S.currentRows("feedback").values()].filter((f) => !f.recorded_to && f.giver === "human:kasrayi");
assert.ok(mineA.length >= 3 && mineK.length === 3, "هر نفر فقط یک نسخه‌ی باز برای هر (هدف، نوع)");
assert.equal(new Set(mineA.map((f) => `${f.target_id}|${f.kind}`)).size, mineA.length);
assert.ok(mineK.every((f) => f.giver === "human:kasrayi"));
// موردهای پاسخ‌داده‌شده در view علامت می‌خورد
const view2 = RV.todayView("amini", { now: NOW });
assert.ok(view2.answered >= 3);
assert.ok(view2.items.find((i) => i.ref === anItem.ref).my_feedback.scores.reasoning === 3, "آخرین نسخه‌ی بازخورد (بعد از «داده غلط است») نمایش داده می‌شود");

// ------------------------------------------------------------------ گزارش مدیر: نرخ ثبت و مقایسه با واقعیت
const stats0 = RV.reviewStats({ now: NOW });
const sa = stats0.people.find((p) => p.user === "amini");
assert.equal(sa.days, 2); assert.equal(sa.assigned, 10, "دو روز × ۵ مورد");
assert.ok(sa.answered >= 3 && sa.response_rate > 0 && sa.response_rate <= 1);
assert.equal(sa.targeted, 6); assert.equal(sa.random, 4);
assert.ok(stats0.open_human_items >= 1);
const fa = RV.feedbackForAdmin();
assert.ok(fa.some((f) => f.analyst && f.analyst.startsWith("machine:")) || !view.items.some((i) => i.ref.startsWith("analysis:")), "مدیر تحلیل‌گرِ واقعی را می‌بیند (ارزیاب نه)");
assert.ok(!JSON.stringify(RV.todayView("amini", { now: NOW })).includes("machine:"));
// مقایسه‌ی نمره‌ی انسان با واقعیت (۱۰-۶): به یک پیش‌بینی ماشینی نمره‌ی بالا می‌دهد؛ بعد معلوم می‌شود مهارتش منفی بوده
const judgeRow = [...S.currentRows("predictions").values()].find((p) => !p.recorded_to && p.forecaster === "machine:judge:v1");
const sub2 = RV.submitFeedback; // ثبت مستقیم برای همین پیش‌بینی: ابتدا به سهم یک روز آینده ببریم
const dayN = new Date("2026-11-20T07:00:00Z");
const row = RV.assignFor("rezazadeh", { now: dayN });
// پیش‌بینی داور حتماً هدفمند می‌شود (بیشترین اختلاف)؛ اگر قبلاً به این نفر نشان داده نشده بود
const jref = row.members.find((m) => m.ref === `analysis:${judgeRow.id}`);
assert.ok(jref, "پیش‌بینی با بیشترین اختلاف در سهم هدفمند است");
const rated = RV.submitFeedback({ username: "rezazadeh", ref: jref.ref, kind: "analysis_score", fields: { data_ok: "yes", reasoning: 5, actionable: 5 }, now: dayN });
assert.ok(rated.ok);
fs.writeFileSync(path.join(dataDir, "price_history.json"), JSON.stringify([
  { date: "2026-11-05", records: [{ product: "sodium bicarbonate", country_or_region: "China", price_type: "FOB", value: 177.78, currency: "USD", unit: "mt", source_reported_date: "2026-08", source_name: "PR" }] },
  { date: "2027-02-20", records: [{ product: "sodium bicarbonate", country_or_region: "China", price_type: "FOB", value: 178, currency: "USD", unit: "mt", source_reported_date: "2026-12", source_name: "PR" }] },
]));
W.runScoring({ now: new Date("2027-03-02T00:00:00Z") });
const stats1 = RV.reviewStats({ now: new Date("2026-11-21T00:00:00Z") });
const sr = stats1.people.find((p) => p.user === "rezazadeh");
assert.equal(sr.scored_targets, 1);
assert.equal(sr.high_rating_on_negative_skill, 1, "نمره‌ی بالا به تحلیلی که با واقعیت بدتر از خط مبنا بود ثبت می‌شود");

// ------------------------------------------------------------------ بدون مدل و بدون داده‌ی فروش
assert.ok(!/gemini|groq|generateContent|salesStore/i.test(fs.readFileSync(path.join(process.cwd(), "lib", "brain2", "review.js"), "utf-8")), "بازبینی انسانی هیچ مدلی صدا نمی‌زند");

fs.rmSync(tmp, { recursive: true, force: true });
console.log("✔ تست بازبینی انسانی و بازخورد (مرحله‌ی ۷) گذشت");

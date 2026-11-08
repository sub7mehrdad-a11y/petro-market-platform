// تست مرحله‌ی ۸ مغز (سازوکار اعتبار، پروتکل ۱۱): اعتبار فقط از مقایسه با واقعیت؛ کوچک‌سازی به میانگین گروه؛ کهنگی؛ موضوعی؛
// شروع منصفانه؛ بی‌اثر بودن موافقت با مغز و جایگاه سازمانی؛ دید هر نفر؛ منبع‌ها از تصمیم انسانی؛ بازبین‌ها از واقعیت؛ وزن داور.
//   node --import ./scripts/alias-loader.mjs scripts/test-brain-reputation.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "brainrep-"));
const REAL = path.join(process.cwd(), "..", "data");
const dataDir = path.join(tmp, "data");
fs.mkdirSync(path.join(dataDir, "brain"), { recursive: true });
for (const f of ["confidence_config.json", "analysts_config.json", "scoring_config.json", "reputation_config.json"]) fs.copyFileSync(path.join(REAL, "brain", f), path.join(dataDir, "brain", f));
process.env.BRAIN_DATA_DIR = dataDir;
process.env.BRAIN_STATE_DIR = path.join(tmp, "state");
process.env.SALES_STATE_DIR = path.join(tmp, "sales");
delete process.env.OUTREACH_STATE_DIR;

const S = await import("../lib/brain2/store.js");
const M = await import("../lib/brain2/memory.js");
const Sch = await import("../lib/brain2/schema.js");
const F = await import("../lib/brain2/forecast.js");
const W = await import("../lib/brain2/scoring/writer.js");
const Rep = await import("../lib/brain2/reputation.js");
const Q = await import("../lib/brain2/knowledge/queue.js");
const K = await import("../lib/brain2/knowledge/cycle.js");

const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const cfg = Rep.loadReputationConfig();
assert.equal(cfg.shrinkage_k, 20);
assert.equal(cfg.half_life_days, 365);

// ------------------------------------------------------------------ ریاضی خالص
near(Rep.accuracyOf({ abs_rel_err: 0, inside: 1 }), 1);
near(Rep.accuracyOf({ abs_rel_err: 0.25, inside: 0 }), 0);
near(Rep.accuracyOf({ abs_rel_err: 0.125, inside: 1 }), 0.7 * 0.5 + 0.3);
near(Rep.accuracyOf({ abs_rel_err: 0.5, inside: 0 }), 0, 1e-9);
const nowD = new Date("2027-01-05T00:00:00Z");
near(Rep.recencyOf("2026-01-05", nowD), 0.5, 1e-3);       // درست ۱۲ ماه ← نیمه‌عمر
near(Rep.recencyOf("2027-01-05", nowD), 1, 1e-9);
assert.ok(Rep.recencyOf("2024-01-05", nowD) < 0.26);
// فرمول پیشنهادی: وزن = (n×دقت فرد + k×دقت گروه) ÷ (n + k)
near(Rep.shrunkWeight(1, 1, 0.5, 20), (1 * 1 + 20 * 0.5) / 21, 1e-9);        // یک نتیجه‌ی عالی ← تقریباً میانگین
near(Rep.shrunkWeight(0.9, 40, 0.5, 20), (40 * 0.9 + 10) / 60, 1e-9);         // ۴۰ نتیجه ← نزدیک دقت واقعی
near(Rep.shrunkWeight(0.2, 0, 0.5, 20), 0.5, 1e-9);                           // بدون نتیجه ← دقیقاً میانگین گروه (شروع منصفانه)
// نتیجه‌ی بازبین: نمره‌ی بالا به تحلیل بد = غلط
assert.equal(Rep.reviewerOutcome(5, -0.4), 0);
assert.equal(Rep.reviewerOutcome(5, 0.4), 1);
assert.equal(Rep.reviewerOutcome(1, -0.4), 1);
assert.equal(Rep.reviewerOutcome(2, 0.4), 0);
assert.equal(Rep.reviewerOutcome(3, 0.4), null, "نمره‌ی میانی داوری نیست");
assert.equal(Rep.reviewerOutcome(5, null), null, "بدون مهارت (خط مبنا نبود) داوری نیست");

// ------------------------------------------------------------------ داده‌ی ساختگی: شش دور پیش‌بینی ماهانه‌ی فوب چین
Sch.ensureRepos();
const truth = { "2026-02": 170, "2026-03": 172, "2026-04": 175, "2026-05": 173, "2026-06": 176, "2026-07": 178 };
const rec = (v, p) => ({ product: "sodium bicarbonate", country_or_region: "China", price_type: "FOB", value: v, currency: "USD", unit: "mt", source_reported_date: p, source_name: "PR" });
const days = Object.entries(truth).map(([month, v]) => ({ date: `${month}-28`, records: [rec(v, month)] }));
days.push({ date: "2026-12-15", records: [rec(178, "2026-07")] });
fs.writeFileSync(path.join(dataDir, "price_history.json"), JSON.stringify(days));
const rounds = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
for (const rid of rounds) {
  const now = new Date(`${rid}-02T07:00:00Z`);
  F.ensureRound(rid, { now });
  const target = F.addMonths(rid, 1);
  const T = truth[target];
  const qid = `${rid}:china_fob`;
  const sub = (u, p, lo, hi) => assert.ok(F.submitForecast({ username: u, roundId: rid, questionId: qid, point: p, lo, hi }, { now }).ok);
  sub("amini", T * 1.01, T * 0.95, T * 1.07);   // دقیق، و برخلاف مغز
  sub("admin", T * 1.01, T * 0.95, T * 1.07);   // دقیقاً همان دقت (مدیر)
  sub("kasrayi", T * 1.2, T * 1.1, T * 1.3);    // نادقیق
  assert.ok(F.recordBrainForecast({ roundId: rid, questionId: qid, point: T * 1.15, lo: T * 1.05, hi: T * 1.25, rationale: "x", model: "gemini-test", method_version: "brain-test" }, { now }).ok);
}
const scoring = W.runScoring({ now: nowD });
assert.equal(scoring.unresolved.length, 0, JSON.stringify(scoring.unresolved));
const repFile = path.join(S.getBrainDir(), "reputation.jsonl");
const r1 = Rep.computeReputation({ now: nowD });
assert.ok(r1.new > 0 && r1.changed === 0);
const rows = Rep.readReputation();
const row = (entity, topic = "china_fob") => rows.find((r) => r.entity === entity && r.topic === topic);

// ------------------------------------------------------------------ اعتبار پیش‌بین‌ها
const A = row("human:amini"), AD = row("human:admin"), KA = row("human:kasrayi"), BR = row("brain:gemini-test");
for (const r of [A, AD, KA, BR]) {
  assert.equal(r.entity_type, "forecaster");
  assert.equal(r.n_resolved, 6);
  assert.ok(r.n_eff > 2 && r.n_eff < 6, "کهنگی: نتیجه‌های قدیمی‌تر وزن کمتر");
  assert.ok(row(r.entity, "price"), "هم موضوع پرسش و هم خانواده‌ی «قیمت»");
}
assert.ok(A.score > 0.95 && KA.score < 0.2, "دقت خام از واقعیت");
// قانون طلایی: مدیر با دقت برابر وزن برابر؛ کسی که با مغز مخالف است اما دقیق‌تر است وزن بیشتر می‌گیرد
assert.equal(A.weight, AD.weight, "جایگاه سازمانی اثری ندارد");
assert.ok(A.weight > BR.weight && BR.weight > KA.weight, "ترتیب فقط از دقت واقعی: دقیق > مغز > نادقیق");
// کوچک‌سازی: وزن بین دقت خام و میانگین گروه است، و به گروه نزدیک‌تر
for (const r of [A, KA]) {
  const lo = Math.min(r.score, r.group_mean), hi = Math.max(r.score, r.group_mean);
  assert.ok(r.weight >= lo && r.weight <= hi);
  assert.ok(Math.abs(r.weight - r.group_mean) < Math.abs(r.score - r.group_mean), "تا نتیجه‌ها کم است به میانگین گروه نزدیک می‌ماند");
}
near(A.weight, Rep.shrunkWeight(A.score, A.n_eff, A.group_mean, 20), 1e-3);
// هر ردیف فیلدهای ۱۱ را دارد
for (const f of ["entity", "topic", "n_resolved", "score", "weight", "visible_to"]) assert.ok(f in A);
// روش‌ها (۱۱-۱): نسخه‌ی روش جدا
const MT = row("method:brain-test");
assert.ok(MT && MT.entity_type === "method" && MT.n_resolved >= 6);
// شروع منصفانه: عضو تازه بدون ردیف، و با میانگین گروه وزن می‌گیرد (نه صفر)
assert.equal(row("human:rezazadeh"), undefined);
const fair = Rep.reputationWeights(["human:rezazadeh", "human:amini"], "china_fob");
assert.equal(fair.basis, "reputation");
near(fair.info[0].weight, A.group_mean, 1e-9);
assert.ok(fair.weights[0] > 0 && fair.weights[0] < fair.weights[1], "عضو تازه صفر نیست و از فرد دقیق کمتر است");
near(fair.weights[0] + fair.weights[1], 1, 1e-9);
// موضوعی: پرسش بدون سابقه (ایران) ← وزن برابر
const none = Rep.reputationWeights(["human:amini", "human:kasrayi"], "iran_food_fob");
assert.equal(none.basis, "equal");
assert.deepEqual(none.weights, [0.5, 0.5]);
// وزن داور از اعتبار همان موضوع
const jw = Rep.reputationWeights(["human:amini", "human:kasrayi"], "china_fob");
assert.ok(jw.weights[0] > jw.weights[1]);
near(jw.weights[0], A.weight / (A.weight + KA.weight), 1e-9);

// ------------------------------------------------------------------ فقط واقعیت: موافقت با مغز یا محتوای پیش‌بینی‌ها در اعتبار اثری ندارد
const base = S.currentRows("scores");
const scoreRows = Rep.readReputation && [...base.values()].filter((r) => !r.recorded_to);
const preds = [...S.currentRows("predictions").values()];
const shuffled = preds.map((p, i) => ({ ...p, forecaster: preds[(i + 1) % preds.length].forecaster, forecast: { ...p.forecast, point: 1 } })); // هویت و عدد به‌هم‌ریخته
const a = Rep.buildReputation({ scoreRows, predictions: preds, feedback: [], queueRows: [], now: nowD }).filter((r) => r.entity_type === "forecaster");
const b = Rep.buildReputation({ scoreRows, predictions: shuffled, feedback: [], queueRows: [], now: nowD }).filter((r) => r.entity_type === "forecaster");
assert.deepEqual(a, b, "اعتبار پیش‌بین فقط از ردیف‌های نمره (واقعیت) می‌آید، نه از متن/عدد پیش‌بینی‌ها");
assert.ok(!/agree|brain_agreement|similarity|role|department/i.test(fs.readFileSync(path.join(process.cwd(), "lib", "brain2", "reputation.js"), "utf-8").replace(/disagree/gi, "")), "هیچ عاملِ موافقت/جایگاه در کد اعتبار نیست");

// ------------------------------------------------------------------ دید (۱۱-۴)
const vis = (u, adm) => [...new Set(Rep.visibleReputation({ username: u, isAdmin: adm }).map((r) => r.entity))].sort();
assert.deepEqual(vis("amini", false), ["human:amini"], "کارشناس فقط رتبه‌ی خودش");
assert.deepEqual(vis("Kasrayi", false), ["human:kasrayi"]);
assert.deepEqual(vis("rezazadeh", false), [], "بدون سابقه، هیچ‌چیز");
assert.deepEqual(vis("nobody", false), [], "دیگران هیچ");
const adminSees = vis("admin", true);
assert.ok(adminSees.includes("human:amini") && adminSees.includes("human:kasrayi") && adminSees.includes("brain:gemini-test") && adminSees.includes("method:brain-test"), "مدیر همه");
for (const u of ["amini", "kasrayi"]) assert.ok(vis(u, false).every((e) => e.startsWith("human:") || e.startsWith("reviewer:")), "منبع/روش/مغز برای کارشناس دیده نمی‌شود");

// ------------------------------------------------------------------ idempotent و فقط‌افزودنی
const before = fs.readFileSync(repFile, "utf-8");
const r2 = Rep.computeReputation({ now: nowD });
assert.deepEqual(r2, { new: 0, changed: 0, unchanged: r1.new });
assert.equal(fs.readFileSync(repFile, "utf-8"), before);
// بعد از دو سال، نتیجه‌ها کهنه‌ترند ← n_eff کمتر و وزن به میانگین نزدیک‌تر؛ ردیف قبلی بسته می‌شود، پاک نمی‌شود
const late = new Date("2029-01-05T00:00:00Z");
const r3 = Rep.computeReputation({ now: late });
assert.ok(r3.changed > 0);
const A2 = Rep.readReputation().find((r) => r.entity === "human:amini" && r.topic === "china_fob");
assert.ok(A2.n_eff < A.n_eff);
assert.ok(Math.abs(A2.weight - A2.group_mean) < Math.abs(A.weight - A.group_mean), "کهنگی: وزن به میانگین برمی‌گردد");
assert.ok(fs.readFileSync(repFile, "utf-8").startsWith(before), "فقط‌افزودنی");
assert.ok(S.currentRows("reputation").get(A.id).recorded_to, "ردیف قبلی بسته شد، پاک نشد");
Rep.computeReputation({ now: nowD }); // برگشت به زمان قبل ردیف‌های تازه می‌سازد (بدون پاک‌کردن)

// ------------------------------------------------------------------ بازبین‌ها (۱۰-۶ و ۱۱): نمره‌ی انسان در برابر واقعیت
const vrows = [...S.currentRows("scores").values()].filter((r) => !r.recorded_to && r.kind === "version");
const badOne = vrows.find((r) => r.forecaster === "human:kasrayi" && r.skill_vs_baseline < 0);
const goodOne = vrows.find((r) => r.forecaster === "human:amini" && r.skill_vs_baseline > 0);
assert.ok(badOne && goodOne, "نمونه‌ی مهارت منفی و مثبت");
const fb = (target, reasoning) => S.putRow("feedback", Sch.makeRow("feedback", { giver: "human:amini", target_id: `analysis:${target.prediction_id}`, kind: "analysis_score", scores: { data_ok: "yes", reasoning, actionable: 3 }, blind: true, selection: "هدفمند" }, "2026-12-01T00:00:00.000Z"));
fb(badOne, 5);   // نمره‌ی بالا به تحلیل بد ← اشتباه
fb(goodOne, 5);  // نمره‌ی بالا به تحلیل خوب ← درست
Rep.computeReputation({ now: nowD });
const rv = Rep.readReputation().find((r) => r.entity === "reviewer:amini");
assert.ok(rv && rv.entity_type === "reviewer" && rv.n_resolved === 2);
near(rv.score, 0.5, 1e-9);
assert.deepEqual(rv.visible_to, ["human:amini", "admin"]);
assert.ok(!vis("kasrayi", false).includes("reviewer:amini"), "رتبه‌ی بازبین فقط برای خودش");
assert.ok(vis("amini", false).includes("reviewer:amini"));

// ------------------------------------------------------------------ منبع‌ها از تصمیم انسانی مدیر
let idx = M.loadIndex();
const T0 = "2026-12-20T00:00:00.000Z";
for (const [k, o] of [["profile:عراق", "پروفایل عراق"], ["trade_map_2025", "Trade Map"], ["profile:کنیا", "پروفایل کنیا"]]) M.upsertSource(idx, { key: k, kind: "جدول آماری", origin: o }, { at: T0 });
const cl = (subject, metric, value, source, extra = {}) => M.upsertClaim(idx, { subject, metric, value, source_key: source, confidence: 0.7, unit: "تن", period: "2025", ...extra }, { at: T0 });
cl("عراق", "total_import_volume", 13000, "profile:عراق");
cl("عراق", "trade_map.imports.quantity", 6995, "trade_map_2025", { unit: "Tons" });
cl("کنیا", "total_import_volume", 5000, "profile:کنیا");
cl("کنیا", "trade_map.imports.quantity", 5200, "trade_map_2025", { unit: "Tons" });
K.runKnowledgeCycle({ now: new Date(T0) });
const iraq = Q.queueView({ now: new Date(T0) }).open.find((q) => q.subject === "عراق");
assert.ok(iraq);
// مدیر: Trade Map درست است ← منبعِ تأییدشده ۱، منبع ردشده ۰
assert.equal(Q.resolveItem(M.loadIndex(), { id: iraq.id, decision: "accept", claimKey: iraq.members.find((m) => m.source === "trade_map_2025").claim_key, by: "admin", at: "2026-12-21T00:00:00.000Z" }).ok, true);
Rep.computeReputation({ now: nowD });
const srcRows = Rep.readReputation().filter((r) => r.entity_type === "source" && r.topic === "all");
const tm = srcRows.find((r) => r.entity === "source:trade_map_2025"), pf = srcRows.find((r) => r.entity === "source:profile:عراق");
assert.ok(tm && pf);
assert.equal(tm.score, 1); assert.equal(pf.score, 0);
assert.ok(tm.weight > pf.weight, "منبع تأییدشده در واقعیت اعتبار بیشتر");
assert.ok(srcRows.every((r) => r.visible_to.length === 1 && r.visible_to[0] === "admin"), "اعتبار منبع فقط برای مدیر");
const adj = Rep.sourceAdjustments();
assert.ok(adj.get("trade_map_2025") > 0 && adj.get("profile:عراق") < 0, "اعتبار پایه‌ی منبع در فرمول اعتماد تعدیل می‌شود");
assert.ok(Math.abs(adj.get("trade_map_2025")) < 0.05, "با شاهد کم، تعدیل کوچک (کوچک‌سازی)");
assert.equal(adj.get("profile:کنیا"), undefined, "منبع بی‌سابقه تغییری نمی‌کند (شروع منصفانه)");
// اثر در اعتماد ادعا: منبع ردشده از منبع تأییدشده بدتر نمی‌شود وارونه؛ ادعای بسته‌شده کنار می‌ماند
K.runKnowledgeCycle({ now: new Date("2026-12-22T00:00:00Z") });

fs.rmSync(tmp, { recursive: true, force: true });
console.log("✔ تست سازوکار اعتبار (مرحله‌ی ۸) گذشت");

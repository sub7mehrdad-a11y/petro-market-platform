// تست مرحله‌ی ۱۰ مغز (حلقه‌ی ۳: بازبینی روش، تثبیت ماهانه، آزمایش فعال؛ پروتکل ۹-۲، ۹-۳، ۹-۶، ۹-۷):
// مخزن روش‌ها، آزمون روی سابقه با حافظه‌ی همان زمان، سقف تغییر در ماه، تأیید مدیر → آزمایشی → ارتقا (قبلی بایگانی می‌شود نه پاک)،
// ادغام/انتزاع/بازنشستگی قاعده‌ها و اهمیت، افت عملکرد، آزمایش فعال با پیش‌بینیِ پیش از اجرا و نمره‌ی غافلگیری، چرخه‌ی ماهانه.
//   node --import ./scripts/alias-loader.mjs scripts/test-brain-learning.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "brainle-"));
const REAL = path.join(process.cwd(), "..", "data");
const dataDir = path.join(tmp, "data");
fs.mkdirSync(path.join(dataDir, "brain"), { recursive: true });
for (const f of ["confidence_config.json", "analysts_config.json", "scoring_config.json", "reputation_config.json", "autopsy_config.json", "experiment_candidates.json"]) fs.copyFileSync(path.join(REAL, "brain", f), path.join(dataDir, "brain", f));
const lcfg = JSON.parse(fs.readFileSync(path.join(REAL, "brain", "learning_config.json"), "utf-8"));
lcfg.methods.min_method_errors = 3;
lcfg.methods.backtest.min_cases = 3;
lcfg.consolidation.merge_similarity = 0.8;
lcfg.consolidation.abstract_similarity = 0.3;
lcfg.consolidation.performance_drop = { recent: 2, min_total: 4, threshold: 0.15 };
fs.writeFileSync(path.join(dataDir, "brain", "learning_config.json"), JSON.stringify(lcfg, null, 2));
process.env.BRAIN_DATA_DIR = dataDir;
process.env.BRAIN_STATE_DIR = path.join(tmp, "state");
process.env.SALES_STATE_DIR = path.join(tmp, "sales");
delete process.env.OUTREACH_STATE_DIR;

const S = await import("../lib/brain2/store.js");
const M = await import("../lib/brain2/memory.js");
const Sch = await import("../lib/brain2/schema.js");
const F = await import("../lib/brain2/forecast.js");
const W = await import("../lib/brain2/scoring/writer.js");
const SR = await import("../lib/brain2/scoring/read.js");
const Q = await import("../lib/brain2/knowledge/queue.js");
const Ret = await import("../lib/brain2/knowledge/retrieval.js");
const An = await import("../lib/brain2/analysts.js");
const MF = await import("../lib/brain2/machineForecaster.js");
const Me = await import("../lib/brain2/learning/methods.js");
const Rv = await import("../lib/brain2/learning/revision.js");
const Co = await import("../lib/brain2/learning/consolidation.js");
const Ex = await import("../lib/brain2/learning/experiments.js");
const Cy = await import("../lib/brain2/learning/cycle.js");

Sch.ensureRepos();
const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const idOf = (nk) => Q.openQueue().get(nk).id;
const decide = (nk, decision, by = "admin", claimKey) => {
  const q = Q.openQueue().get(nk);
  return Q.resolveItem(M.loadIndex(), { id: q.id, decision, claimKey: claimKey ?? q.members[0]?.claim_key, by, at: "2026-11-01T00:00:00.000Z" });
};

// ------------------------------------------------------------------ مخزن روش‌ها
assert.deepEqual(Me.ensureMethods({ at: "2026-01-01T00:00:00.000Z" }), { created: 2 });
assert.deepEqual(Me.ensureMethods(), { created: 0 }, "idempotent");
for (const role of Me.METHOD_ROLES) {
  const a = Me.activeMethod(role);
  assert.equal(a.version, "v1");
  assert.equal(a.system, null, "v1 همان دستور پیش‌فرض است");
  assert.equal(a.method_version, An.ANALYSTS[role].method);
  assert.deepEqual(Me.methodObject(a), { system: null, method_version: An.ANALYSTS[role].method, suffix: "" });
}
assert.equal(Me.methodObject(null), null);
const tmpRow = Me.addMethodVersion("stat", { system: "x", rationale: "r", parent: "v1", at: "2026-01-02T00:00:00.000Z" });
assert.equal(tmpRow.version, "v2");
assert.equal(tmpRow.status, "پیشنهادی");
const exp2 = Me.setMethodStatus(tmpRow, "آزمایشی", "آزمون", { at: "2026-01-03T00:00:00.000Z" });
assert.equal(Me.methodObject(exp2).suffix, "@v2", "نسخه‌ی آزمایشی پیش‌بین جداگانه دارد");
Me.setMethodStatus(exp2, "بایگانی", "کنار گذاشته شد", { at: "2026-01-04T00:00:00.000Z" });
assert.equal(Me.methodsOf("stat").length, 2, "نسخه‌ی بایگانی‌شده می‌ماند");
assert.equal(Me.methodsOf("stat").find((r) => r.version === "v2").status, "بایگانی");
const allMethodRows = S.readEvents("methods").filter((e) => e.op === "put").map((e) => e.row).filter((r) => r.natural_key === "method|stat|v2");
assert.equal(allMethodRows.length, 3, "تاریخچه‌ی کامل در مخزن (پیشنهادی ← آزمایشی ← بایگانی)");
// برای ادامه‌ی آزمون، v2 بایگانی را حذف نمی‌کنیم؛ نسخه‌ی بعدی v3 می‌شود
assert.equal(Me.nextVersion("stat"), "v3");

// ------------------------------------------------------------------ بازیابی با asOf (حافظه‌ی همان زمان)
const idx0 = M.loadIndex();
M.upsertSource(idx0, { key: "price:PR", kind: "جدول آماری", origin: "price:PR" }, { at: "2025-01-01T00:00:00.000Z" });
const SERIES = { country_or_region: "China", product: "sodium bicarbonate", price_type: "FOB" };
const pq = { product: SERIES.product, price_type: "FOB" };
const vals = { "2025-09": 178, "2025-10": 176, "2025-11": 174, "2025-12": 171, "2026-01": 169, "2026-02": 170, "2026-03": 172, "2026-04": 175, "2026-05": 173, "2026-06": 176 };
const eom = (p) => { const [y, m] = p.split("-").map(Number); return new Date(Date.UTC(y, m, 0)); };
for (const [p, v] of Object.entries(vals)) M.upsertClaim(idx0, { subject: "China", metric: "price", value: v, unit: "USD/mt", period: p, qualifiers: pq, source_key: "price:PR", confidence: 0.7 }, { at: new Date(eom(p).getTime() + 15 * 86400000).toISOString() });
M.upsertClaim(idx0, { subject: "China", metric: "price", value: 190, unit: "USD/mt", period: "2026-01", qualifiers: pq, source_key: "price:PR", confidence: 0.7 }, { at: "2026-03-01T00:00:00.000Z" }); // اصلاح بعدی

// ------------------------------------------------------------------ دورها، پیش‌بین‌ها، سنجش
const truth = { "2026-02": 170, "2026-03": 172, "2026-04": 175, "2026-05": 173, "2026-06": 176 };
const rec = (v, p) => ({ product: SERIES.product, country_or_region: "China", price_type: "FOB", value: v, currency: "USD", unit: "mt", source_reported_date: p, source_name: "PR" });
const days = Object.entries(truth).map(([month, v]) => ({ date: `${month}-28`, records: [rec(v, month)] }));
days.push({ date: "2026-09-20", records: [rec(176, "2026-06")] });
fs.writeFileSync(path.join(dataDir, "price_history.json"), JSON.stringify(days));
const rounds = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"];
for (const rid of rounds) F.ensureRound(rid, { now: new Date(`${rid}-02T07:00:00Z`) });
const at = (rid) => new Date(`${rid}-02T07:00:00Z`);
const targetOf = (rid) => F.getRound(rid).questions.find((q) => q.id === `${rid}:china_fob`).target.target_month;
const mach = (rid, forecaster, point, spread = 0.03) => assert.ok(F.recordMachineForecast({ roundId: rid, questionId: `${rid}:china_fob`, forecaster, point, lo: point * (1 - spread), hi: point * (1 + spread), rationale: "r", model: "m", method_version: "v" }, { now: at(rid) }).ok, `ثبت ${forecaster}`);
const STAT = "machine:stat:gpt-test";
const EVENT = "machine:event:gem-test";
for (const rid of rounds) {
  const t = truth[targetOf(rid)];
  mach(rid, STAT, Math.round(t * 1.2 * 10) / 10);          // فعلی: ۲۰٪ بالا
  mach(rid, `${STAT}@v4`, t);                              // نسخه‌ی آزمایشی آینده (v4): دقیق. پیش‌ثبت‌شده برای ارزیابی ارتقا
  const early = ["2026-01", "2026-02", "2026-03"].includes(rid);
  mach(rid, EVENT, Math.round(t * (early ? 1.0 : 1.3) * 10) / 10); // رویدادمحور: اول دقیق، بعد افت
}
const NOW1 = new Date("2026-09-30T00:00:00Z");
const sc = W.runScoring({ now: NOW1 });
assert.ok(sc.written > 0);
assert.equal(SR.readScores().filter((r) => r.kind === "time_avg" && r.forecaster === STAT).length, 5);

// asOf: همان لحظه‌ی دور ۰۱ (۲ ژانویه) هنوز دوره‌ی ۲۰۲۶-۰۱ ثبت نشده؛ بعد از اصلاح (مارس) مقدار ۱۹۰ است
const qChina = F.getRound("2026-05").questions.find((q) => q.id === "2026-05:china_fob");
const seriesLast = (r) => r.series[r.series.length - 1];
const rNow = Ret.retrieve({ question: qChina, pack: "statistical", now: new Date("2026-05-02T07:00:00Z") });
const rThen = Ret.retrieve({ question: qChina, pack: "statistical", now: new Date("2026-05-02T07:00:00Z"), asOf: "2026-02-20T00:00:00.000Z" });
const jan = (r) => (r.series.find((s) => s.period === "2026-01") || {}).value;
assert.equal(jan(rNow), 190, "حافظه‌ی امروز مقدار اصلاح‌شده را دارد");
assert.equal(jan(rThen), 169, "حافظه‌ی آن زمان هنوز مقدار قدیم را باور داشت");
void seriesLast;

// ------------------------------------------------------------------ شرط شروع بازبینی روش
const model = An.ANALYSTS.stat.model();
const err = (i, role = "stat", forecaster = STAT) => M.upsertAnalysis(M.loadIndex(), { key: `autopsy|r|q${i}|${forecaster}`, analyst: "autopsy", statement: `خطای ${i}`, payload: { category: "method_wrong", forecaster, surprise: 1 + i / 10, abs_rel_err: 0.2 } }, { at: "2026-09-30T00:00:00.000Z" });
err(1); err(2);
let st = Rv.revisionState("stat", NOW1);
assert.equal(st.needs, false);
assert.match(st.blocked_reason, /2 از 3/, "خطای روش غلط کافی نیست");
err(3);
M.upsertAnalysis(M.loadIndex(), { key: "autopsy|r|q9|x", analyst: "autopsy", statement: "داده", payload: { category: "data_wrong", forecaster: STAT, surprise: 3 } }, { at: "2026-09-30T00:00:00.000Z" });
M.upsertAnalysis(M.loadIndex(), { key: "autopsy|r|q8|exp", analyst: "autopsy", statement: "آزمایشی", payload: { category: "method_wrong", forecaster: `${STAT}@v4`, surprise: 3 } }, { at: "2026-09-30T00:00:00.000Z" });
assert.equal(Rv.methodErrors("stat").length, 3, "فقط «روش غلط»ِ پیش‌بین فعال شمرده می‌شود (نه داده‌ی غلط، نه نسخه‌ی آزمایشی)");
assert.equal(Rv.revisionState("stat", NOW1).needs, true);
assert.equal(Rv.revisionState("event", NOW1).needs, false);

// ------------------------------------------------------------------ پیشنهاد روش: آزمون روی سابقه
const GOOD_SYSTEM = `تو تحلیل‌گر آماری قیمتی. ${"با تکیه بر آخرین مقدار و روند، ".repeat(10)}خروجی فقط JSON: {"point": عدد, "lo": عدد, "hi": عدد, "rationale": "متن"}`;
const seen = [];
const analystGood = async ({ system, input }) => { seen.push(system); const m = input.match(/ماه هدف: (\d{4}-\d{2})/)[1]; const v = truth[m]; return JSON.stringify({ point: v, lo: v * 0.97, hi: v * 1.03, rationale: "نسخه‌ی تازه" }); };
const analystBad = async ({ input }) => { const m = input.match(/ماه هدف: (\d{4}-\d{2})/)[1]; const v = truth[m] * 1.5; return JSON.stringify({ point: v, lo: v * 0.97, hi: v * 1.03, rationale: "بدتر" }); };
const proposeGood = async () => JSON.stringify({ system: GOOD_SYSTEM, rationale: "تکیه‌ی بیشتر بر آخرین مقدار" });
assert.equal((await Rv.proposeRevision("stat", { generate: { propose: async () => "not json" }, now: NOW1 })).status, "invalid_proposal");
assert.equal((await Rv.proposeRevision("stat", { generate: { propose: async () => JSON.stringify({ system: "کوتاه", rationale: "x" }) }, now: NOW1 })).status, "invalid_proposal", "نسخه‌ی کوتاه/بدون قالب خروجی رد می‌شود");
assert.equal((await Rv.proposeRevision("stat", { generate: { propose: async () => { throw new Error("down"); } }, now: NOW1 })).status, "model_failed");
assert.equal(Me.methodsOf("stat").length, 2, "پیشنهاد ناموفق ردیفی نمی‌سازد");

// نامزد بدتر ← آزمون رد می‌کند، نسخه بایگانی می‌شود، آیتمی در صف نمی‌آید
const bad = await Rv.proposeRevision("stat", { generate: { propose: proposeGood, analyst: analystBad }, now: NOW1 });
assert.equal(bad.status, "rejected_by_backtest");
assert.equal(bad.backtest.passes, false);
assert.equal(Me.methodsOf("stat").find((r) => r.version === "v3").status, "بایگانی");
assert.ok(!Q.openQueue().has("method_proposal|stat|v3"));
// سقف تغییر در ماه
st = Rv.revisionState("stat", NOW1);
assert.equal(st.needs, false);
assert.match(st.blocked_reason, /سقف/);
// ماه بعد، نامزد بهتر
const NOW2 = new Date("2026-11-10T00:00:00Z");
const good = await Rv.proposeRevision("stat", { generate: { propose: proposeGood, analyst: analystGood }, now: NOW2 });
assert.equal(good.status, "proposed");
assert.equal(good.version, "v4");
assert.equal(good.backtest.n, 5, "همه‌ی سابقه‌ی سررسیدشده");
assert.ok(good.backtest.mean_improvement > 0.15);
assert.ok(seen.every((s) => s === GOOD_SYSTEM), "دستور سیستمی نامزد واقعاً به تحلیل‌گر رسید (روش تزریق شد)");
const item = Q.openQueue().get("method_proposal|stat|v4");
assert.ok(item && item.status === "open" && item.kind === "method_proposal");
assert.equal(Me.methodsOf("stat").find((r) => r.version === "v4").status, "پیشنهادی");
assert.equal(Rv.revisionState("stat", NOW2).needs, false, "تا تکلیف نسخه‌ی در جریان، پیشنهاد دوم نمی‌آید");
// هیچ‌چیز خودکار عوض نمی‌شود
assert.equal(Me.activeMethod("stat").version, "v1");
assert.deepEqual(Rv.syncMethodDecisions({ now: NOW2 }), []);
// رد صریح مجاز نیست؛ فقط پذیرش یا نادیده
assert.equal(decide("method_proposal|stat|v4", "reject").ok, false);
assert.equal(decide("method_proposal|stat|v4", "both_valid").ok, false);

// ------------------------------------------------------------------ تأیید مدیر ← آزمایشی ← موازی با فعال
assert.equal(decide("method_proposal|stat|v4", "accept").ok, true);
assert.deepEqual(Rv.syncMethodDecisions({ now: new Date("2026-11-11T00:00:00Z") }), ["stat-v4: آزمایشی"]);
assert.deepEqual(Rv.syncMethodDecisions({ now: new Date("2026-11-11T00:00:00Z") }), [], "idempotent");
assert.equal(Me.experimentalMethods("stat")[0].version, "v4");
assert.equal(Me.methodObject(Me.experimentalMethods("stat")[0]).suffix, "@v4");

// اجرای واقعی موازی: دور ۲۰۲۶-۱۱ (نسخه‌ی فعال + آزمایشی)؛ آزمایشی وارد داور نمی‌شود
const NOWR = new Date("2026-11-12T07:00:00Z");
F.ensureRound("2026-11", { now: NOWR });
const sysUsed = [];
const gens = {
  stat: async ({ system }) => { sysUsed.push(system); return JSON.stringify({ point: 175, lo: 168, hi: 185, rationale: "نرخ پایه" }); },
  event: async () => JSON.stringify({ point: 185, lo: 172, hi: 198, rationale: "رویداد" }),
  judge: async () => { throw new Error("no"); },
};
const run1 = await MF.runMachineForecasts("2026-11", { now: NOWR, generators: gens });
const rc = run1.results.find((x) => x.question === "2026-11:china_fob");
assert.deepEqual([rc.stat, rc.event, rc.judge, rc.statv4], ["recorded", "recorded", "recorded", "recorded"]);
assert.equal(sysUsed.filter((s) => s === GOOD_SYSTEM).length >= 1, true, "نسخه‌ی آزمایشی دستور خودش را گرفت");
assert.ok(sysUsed.some((s) => s !== GOOD_SYSTEM), "نسخه‌ی فعال همچنان دستور اصلی را دارد");
const preds = F.predictionsOf("2026-11").filter((p) => p.question_id === "2026-11:china_fob");
const expPred = preds.find((p) => p.forecaster.endsWith("@v4"));
assert.ok(expPred && expPred.forecaster.startsWith(`machine:stat:${model}`) && expPred.method_version === "stat-v4");
const judgePred = preds.find((p) => p.forecaster.startsWith("machine:judge"));
assert.ok(judgePred, "داور ثبت شد");
const judgeAn = [...S.currentRows("analyses").values()].find((a) => !a.recorded_to && a.natural_key === "judge|2026-11:china_fob");
assert.equal(judgeAn.payload.analysts.length, 2, "داور فقط از دو پیش‌بین فعال ساخته شد");
assert.ok(!judgeAn.payload.analysts.includes(expPred.id), "پیش‌بین آزمایشی هرگز وارد داور نمی‌شود");
const run2 = await MF.runMachineForecasts("2026-11", { now: new Date("2026-11-13T07:00:00Z"), generators: gens });
assert.equal(run2.results.find((x) => x.question === "2026-11:china_fob").statv4, "not_due", "بازبینی هفتگی، نه هر ساعت");

// ------------------------------------------------------------------ ارزیابی ارتقا
const early = Rv.evaluatePromotion("stat", { now: new Date("2026-11-20T00:00:00Z") });
assert.equal(early[0].ready, false, "کمتر از ۴ هفته");
assert.ok(!Q.openQueue().has("method_promotion|stat|v4"));
const late = Rv.evaluatePromotion("stat", { now: new Date("2026-12-20T00:00:00Z") });
assert.equal(late[0].resolved, 5);
assert.ok(late[0].mean_improvement > 0.15);
assert.equal(late[0].ready, true);
const promo = Q.openQueue().get("method_promotion|stat|v4");
assert.ok(promo && promo.kind === "method_promotion");
assert.equal(Me.activeMethod("stat").version, "v1", "ارتقا خودکار نیست");
assert.equal(decide("method_promotion|stat|v4", "accept").ok, true);
assert.deepEqual(Rv.syncMethodDecisions({ now: new Date("2026-12-21T00:00:00Z") }), ["stat-v4: فعال"]);
assert.equal(Me.activeMethod("stat").version, "v4");
assert.equal(Me.methodsOf("stat").find((r) => r.version === "v1").status, "بایگانی", "نسخه‌ی قبلی بایگانی می‌شود، پاک نمی‌شود");
assert.equal(Me.methodObject(Me.activeMethod("stat")).suffix, "");
const ov = Rv.methodsOverview(new Date("2026-12-21T00:00:00Z"));
assert.deepEqual(ov.find((o) => o.role === "stat").versions.map((v) => `${v.version}:${v.status}`), ["v1:بایگانی", "v2:بایگانی", "v3:بایگانی", "v4:فعال"]);

// ------------------------------------------------------------------ تثبیت: ادغام، انتزاع، بازنشستگی، اهمیت
const OLD = "2025-01-01T00:00:00.000Z";
const mkRule = (key, text, extra = {}) => S.putRow("rules", Sch.makeRow("rules", { text, status: "پیشنهادی", natural_key: key, origin: "آزمون", ...extra }, OLD));
const A1 = "قیمت فوب چین نسبت به قیمت سیف اروپا پایین است";
const A2 = "قیمت فوب چین نسبت به قیمت سیف اروپا پایین‌تر است";
mkRule("t-a1", A1); mkRule("t-a2", A2); mkRule("t-code", A1, { check: "someCheck" });
for (const [k, c] of [["t-b1", "هند"], ["t-b2", "ترکیه"], ["t-b3", "روسیه"]]) mkRule(k, `تعرفه واردات ${c} بر جوش شیرین بالاست`);
mkRule("t-dead", "قاعده‌ای که کسی به آن عمل نکرد و مخالفت شد");
assert.ok(Co.similarity(A1, A2) >= 0.8 && Co.similarity(A1, "تعرفه واردات هند بر جوش شیرین بالاست") < 0.3);
const rk = (k) => [...S.currentRows("rules").values()].find((r) => !r.recorded_to && r.natural_key === k);
assert.equal(Co.canMerge(rk("t-a1"), rk("t-a2")), true);
assert.equal(Co.canMerge(rk("t-a1"), rk("t-code")), false, "قاعده‌ی دارای بررسی کدنویسی‌شده ادغام نمی‌شود");
assert.equal(Co.canMerge(rk("t-a1"), rk("t-a1")), false);
// رأی منفیِ دو نفر به قاعده‌ی بلااستفاده
for (const who of ["amini", "kasrayi"]) S.putRow("feedback", Sch.makeRow("feedback", { giver: `human:${who}`, target_id: "rule:t-dead", kind: "rule_critique", scores: { stance: "disagree" } }, "2026-10-01T00:00:00.000Z"));

// اهمیت ادعا: استفاده‌ی زیاد بالا می‌برد؛ بدون شواهد دست نمی‌خورد
const idx1 = M.loadIndex();
const claimsAll = [...idx1.claims.values()];
const used = claimsAll.find((c) => c.period === "2025-09");
M.reviseClaim(idx1, used, { use_count: 10 }, "استفاده", { at: "2026-10-02T00:00:00.000Z" });
const NOWC = new Date("2026-11-15T00:00:00Z");
const abstractGen = async () => JSON.stringify({ text: "تعرفه‌ی واردات بر جوش شیرین در کشورهای هدف بالاست" });
const cons = await Co.runConsolidation({ now: NOWC, generate: abstractGen });
assert.equal(cons.importance.claims, 1);
assert.equal(M.loadIndex().claims.get(used.natural_key).importance, 0.7);
assert.equal(M.loadIndex().claims.get(claimsAll.find((c) => c.period === "2025-10").natural_key).importance, 0.5, "بدون شواهد دست نمی‌خورد");
assert.equal(cons.merges, 1);
assert.equal(cons.abstractions, 1);
assert.equal(cons.retirements, 1);
const cons2 = await Co.runConsolidation({ now: NOWC, generate: abstractGen });
assert.equal(cons2.importance.claims + cons2.importance.rules, 0, "idempotent: اهمیت بدون تغییر دوباره نوشته نمی‌شود");
assert.equal([...Q.openQueue().values()].filter((q) => q.kind === "consolidation" && q.action !== "performance_drop").length, 3, "آیتم تکراری نمی‌سازد");
assert.equal(Q.openQueue().get([...Q.openQueue().keys()].find((k) => k.startsWith("consolidation|merge|"))).status, "open");
assert.equal(rk("t-a2").status, "پیشنهادی", "تا تأیید مدیر هیچ‌چیز عوض نمی‌شود");

// بدون مدل، انتزاع چیزی پیشنهاد نمی‌دهد
const noModel = await Co.proposeAbstractions({ at: NOWC.toISOString(), generate: async () => { throw new Error("no"); } });
assert.equal(noModel.length, 0, "خطای مدل مورد تازه نمی‌سازد");
// تأیید مدیر ← اجرا
const keyOfAct = (a) => [...Q.openQueue().keys()].find((k) => k.startsWith(`consolidation|${a}|`));
for (const a of ["merge", "abstract", "retire"]) assert.equal(decide(keyOfAct(a), "accept").ok, true, a);
const applied = Co.syncConsolidationDecisions({ now: NOWC });
assert.equal(applied.length, 3);
const mergeItem = [...S.currentRows("queue").values()].find((q) => q.kind === "consolidation" && q.action === "merge" && !q.recorded_to);
const dropped = rk(mergeItem.drop), kept = rk(mergeItem.keep);
assert.equal(dropped.status, "ادغام‌شده");
assert.equal(dropped.merged_into, kept.natural_key);
assert.ok(kept.evidence.includes(`ادغام:${dropped.natural_key}`));
assert.equal(rk("t-code").status, "پیشنهادی");
assert.equal(rk("t-dead").status, "بازنشسته");
const absRule = [...S.currentRows("rules").values()].find((r) => !r.recorded_to && r.natural_key.startsWith("abstract|"));
assert.ok(absRule && absRule.status === "پیشنهادی" && absRule.evidence.length === 3);
assert.deepEqual(Co.syncConsolidationDecisions({ now: NOWC }), [], "idempotent");
assert.ok(S.readEvents("rules").some((e) => e.op === "put" && e.row.natural_key === "t-dead" && e.row.status === "پیشنهادی"), "نسخه‌ی قبلی قاعده در تاریخچه می‌ماند");

// افت عملکرد: رویدادمحور (اول دقیق، بعد ۳۰٪ خطا)
const pd = Co.performanceDrops({ at: NOWC.toISOString() });
assert.deepEqual(pd, [EVENT]);
assert.ok([...Q.openQueue().keys()].some((k) => k.startsWith("consolidation|performance_drop|")));

// ------------------------------------------------------------------ آزمایش فعال
const q0 = Ex.experimentQuota();
assert.equal(q0.quota, 30, "۱۵٪ از ۲۰۰");
assert.equal(Ex.experimentQuota(1000).quota, 150);
const props = Ex.proposeExperiments({ now: NOWC });
assert.equal(props.length, 3);
assert.deepEqual(Ex.proposeExperiments({ now: NOWC }), [], "تکراری نیست");
assert.equal(Ex.experimentRows().length, 0, "تا تأیید مدیر آزمایشی شروع نمی‌شود");
assert.equal(decide("experiment_proposal|subject-with-price", "reject").ok, false);
assert.equal(decide("experiment_proposal|subject-with-price", "accept").ok, true);
assert.equal(decide("experiment_proposal|followup-day-5-vs-10", "dismiss").ok, true);
assert.deepEqual(Ex.syncExperimentDecisions({ now: NOWC }), ["subject-with-price"]);
assert.deepEqual(Ex.syncExperimentDecisions({ now: NOWC }), []);
const e1 = Ex.experimentByKey("subject-with-price");
assert.equal(e1.status, "فعال");
assert.deepEqual(e1.prior, { point: 10, lo: 5, hi: 15 }, "پیش‌بینی پیش از اجرا ثبت شد");
assert.equal(e1.quota_per_month, 30);
assert.equal(new Date(e1.ends_at) - new Date(e1.started_at), 30 * 86400000);
assert.equal(Ex.proposeExperiments({ now: NOWC }).length, 0, "ردشده دوباره پیشنهاد نمی‌شود");
// نتیجه
assert.equal(Ex.recordExperimentResult({ key: "nope", sent: 50, replied: 5 }).ok, false);
assert.equal(Ex.recordExperimentResult({ key: "subject-with-price", sent: 30, replied: 5 }).ok, false, "نمونه کم");
assert.equal(Ex.recordExperimentResult({ key: "subject-with-price", sent: 50, replied: 60 }).ok, false);
const r1 = Ex.recordExperimentResult({ key: "subject-with-price", sent: 50, replied: 12, by: "admin" }, { now: new Date("2026-12-25T00:00:00Z") });
assert.equal(r1.ok, true);
assert.equal(r1.experiment.observed.rate, 24);
assert.match(r1.experiment.verdict, /بالاتر از بازه/);
assert.equal(Ex.recordExperimentResult({ key: "subject-with-price", sent: 50, replied: 12 }).ok, false, "آزمایش تمام‌شده دوباره ثبت نمی‌شود");
// نمره‌ی غافلگیری آزمایش
const sc2 = W.runScoring({ now: NOW1 });
const es = SR.readScores().find((r) => r.kind === "experiment");
assert.ok(es && es.experiment_key === "subject-with-price");
assert.equal(es.inside, false);
near(es.surprise, 0.9, 1e-3);
assert.equal(es.forecast.hi, 15);
assert.equal(W.runScoring({ now: NOW1 }).written, 0, "idempotent");
void sc2;
assert.ok(!SR.summarize(SR.readScores()).some((s) => s.forecaster === "brain:experiments"), "نمره‌ی آزمایش در رتبه‌بندی پیش‌بین‌ها نمی‌آید");

// ------------------------------------------------------------------ چرخه‌ی کامل ماهانه
const cyc1 = await Cy.runLearningCycle({ now: new Date("2027-01-05T00:00:00Z"), generate: { propose: async () => "bad", abstract: abstractGen } });
assert.equal(cyc1.monthly, "ran");
assert.equal(cyc1.revisions.stat, "invalid_proposal", "شرط شروع برقرار بود، مدل خروجی نامعتبر داد");
assert.equal(cyc1.revisions.event, "not_needed");
const cyc2 = await Cy.runLearningCycle({ now: new Date("2027-01-20T00:00:00Z"), generate: { propose: async () => "bad" } });
assert.equal(cyc2.monthly, "done_this_month");
const cyc3 = await Cy.runLearningCycle({ now: new Date("2027-02-03T00:00:00Z"), generate: { propose: async () => "bad", abstract: abstractGen } });
assert.equal(cyc3.monthly, "ran", "ماه بعد دوباره");

console.log("test-brain-learning: همه‌ی بررسی‌ها گذشت");

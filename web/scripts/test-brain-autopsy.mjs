// تست مرحله‌ی ۹ مغز (کالبدشکافی خطا، حلقه‌ی ۲، پروتکل ۹-۱ و ۹-۵): ترتیب غافلگیری و سقف ماهانه، بازگشت زمانی حافظه به لحظه‌ی ثبت، شش دسته با
// نشانه‌های قطعی، مدل فقط پیشنهاد می‌دهد (اختلاف ثبت می‌شود)، صف بازبینی انسانی، اثر تأیید روی اعتبار منبع، غافلگیری معکوس، پوشش ۱۰۰٪.
//   node --import ./scripts/alias-loader.mjs scripts/test-brain-autopsy.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "brainau-"));
const REAL = path.join(process.cwd(), "..", "data");
const dataDir = path.join(tmp, "data");
fs.mkdirSync(path.join(dataDir, "brain"), { recursive: true });
for (const f of ["confidence_config.json", "analysts_config.json", "scoring_config.json", "reputation_config.json", "autopsy_config.json"]) fs.copyFileSync(path.join(REAL, "brain", f), path.join(dataDir, "brain", f));
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
const A = await import("../lib/brain2/autopsy.js");
const Q = await import("../lib/brain2/knowledge/queue.js");
const Rep = await import("../lib/brain2/reputation.js");

const cfg = A.loadAutopsyConfig();
assert.equal(cfg.per_month, 10);
assert.equal(Object.keys(cfg.categories).length, 6, "شش دسته‌ی ۹-۱");
const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

// ------------------------------------------------------------------ علت‌ها: آزمون خالص با نشانه‌ی قطعی
const SERIES = { country_or_region: "China", product: "sodium bicarbonate", price_type: "FOB" };
const question = { id: "r:china_fob", target: { truth_source: { series: SERIES } } };
const mk = (id, period, value, recorded_from, extra = {}) => ({ id, natural_key: `nk-${id}`, metric: "price", subject: "China", qualifiers: { product: SERIES.product, price_type: "FOB" }, period, value, recorded_from, recorded_to: null, source_ids: ["src1"], supersedes: null, ...extra });
const goodClaims = [mk("a", "2025-09", 178, "2025-10-15T00:00:00Z"), mk("b", "2025-10", 176, "2025-11-15T00:00:00Z"), mk("c", "2025-11", 174, "2025-12-15T00:00:00Z")];
const base = { id: "p1", made_at: "2026-01-02T07:00:00Z", forecast: { point: 150, lo: 140, hi: 160 }, claim_ids: [], rule_ids: [], retrieved_ids: ["c"] };
const cls = (o = {}) => A.classify({ pred: { ...base, ...(o.pred || {}) }, question, actual: o.actual ?? 170, claimsAll: o.claims || goodClaims, others: o.others || [], ruleCritiqueKeys: o.critique || new Set(), ruleKeyOf: (id) => (id === "r1" ? "rule-x" : null), cfg });
// ۶) روش غلط: همه‌چیز درست و در دسترس بود
const m6 = cls();
assert.equal(m6.category, "method_wrong");
assert.deepEqual(m6.known_last, { period: "2025-11", value: 174 });
near(m6.baseline_error, 4 / 170, 1e-6);
// ۱) داده‌ی غلط: ادعای پایه‌ی پیش‌بینی بعد از ثبتش با مقدار دیگر جایگزین شد
const corrected = [...goodClaims.slice(0, 2), mk("c", "2025-11", 174, "2025-12-15T00:00:00Z", { recorded_to: "2026-01-20T00:00:00Z" }), mk("c2", "2025-11", 185, "2026-01-20T00:00:00Z", { supersedes: "c" })];
const d1 = cls({ claims: corrected, pred: { claim_ids: ["c"] } });
assert.equal(d1.category, "data_wrong");
assert.equal(d1.evidence[0].type, "claim_corrected");
assert.deepEqual([d1.evidence[0].old_value, d1.evidence[0].new_value], [174, 185]);
assert.deepEqual(d1.implicated_source_ids, ["src1"]);
// اصلاحِ پیش از ثبت پیش‌بینی داده‌ی غلط نیست (سیستم همان لحظه صحیح را می‌دانست)
const earlier = [...goodClaims.slice(0, 2), mk("c", "2025-11", 174, "2025-12-15T00:00:00Z", { recorded_to: "2025-12-20T00:00:00Z" }), mk("c2", "2025-11", 185, "2025-12-20T00:00:00Z", { supersedes: "c" })];
assert.notEqual(cls({ claims: earlier, pred: { claim_ids: ["c"] } }).category, "data_wrong");
// اصلاح بسیار کوچک (زیر ۱٪) هم داده‌ی غلط نیست
const tiny = [...goodClaims.slice(0, 2), mk("c", "2025-11", 174, "2025-12-15T00:00:00Z", { recorded_to: "2026-01-20T00:00:00Z" }), mk("c2", "2025-11", 174.5, "2026-01-20T00:00:00Z", { supersedes: "c" })];
assert.notEqual(cls({ claims: tiny, pred: { claim_ids: ["c"] } }).category, "data_wrong");
// ۲) داده‌ی کهنه: آخرین مقدار شناخته‌شده خیلی قدیمی
assert.equal(cls({ pred: { made_at: "2026-03-20T07:00:00Z" } }).category, "data_stale");
assert.equal(cls({ pred: { made_at: "2026-03-20T07:00:00Z" } }).evidence[0].type, "stale_series");
// ... یا سابقه‌ی کوتاه
assert.equal(cls({ claims: goodClaims.slice(1) }).category, "data_stale");
assert.equal(cls({ claims: goodClaims.slice(1) }).evidence[0].type, "short_series");
// ... یا هیچ مقداری نبود (در لحظه‌ی ثبت هنوز ثبت نشده بود)
assert.equal(cls({ pred: { made_at: "2025-10-01T00:00:00Z" } }).evidence[0].type, "no_series", "بازگشت زمانی حافظه: آن موقع هنوز چیزی نمی‌دانست");
// ۳) قاعده‌ی غلط: قاعده‌ی به‌کاررفته زیر نقد
assert.equal(cls({ pred: { rule_ids: ["r1"] }, critique: new Set(["rule-x"]) }).category, "rule_wrong");
assert.equal(cls({ pred: { rule_ids: ["r1"] } }).category, "method_wrong", "قاعده‌ی بی‌نقد علت نیست");
// ۴) بازیابی ناقص: آخرین مقدار در حافظه بود ولی بازیابی نشد
const gap = cls({ pred: { retrieved_ids: ["a"] } });
assert.equal(gap.category, "retrieval_gap");
assert.equal(gap.evidence[0].period, "2025-11");
// ۵) رویداد پیش‌بینی‌ناپذیر: خط مبنا و بیشتر پیش‌بین‌ها هم بزرگ خطا کردند
const others = [{ abs_rel_err: 0.2 }, { abs_rel_err: 0.15 }, { abs_rel_err: 0.01 }];
assert.equal(cls({ actual: 150, others }).category, "unpredictable");
assert.equal(cls({ actual: 150, others: [{ abs_rel_err: 0.01 }, { abs_rel_err: 0.02 }] }).category, "method_wrong", "اگر بقیه درست گفتند شوک نبود");
// اولویت: داده‌ی غلط بر کهنه و بر روش
assert.equal(cls({ claims: corrected, pred: { claim_ids: ["c"], made_at: "2026-01-02T07:00:00Z", retrieved_ids: ["a"] } }).category, "data_wrong");

// ------------------------------------------------------------------ سناریوی کامل: شش دور، سنجش خودکار، کالبدشکافی
Sch.ensureRepos();
let idx = M.loadIndex();
for (const k of ["price:PR", "price:CA"]) M.upsertSource(idx, { key: k, kind: "جدول آماری", origin: k }, { at: "2025-01-01T00:00:00.000Z" });
const pq = { product: SERIES.product, price_type: "FOB" };
const vals = { "2025-09": 178, "2025-10": 176, "2025-11": 174, "2025-12": 171, "2026-01": 169, "2026-02": 170, "2026-03": 172, "2026-04": 175, "2026-05": 173, "2026-06": 176 };
const rowIdOf = {};
const eom = (p) => { const [y, m] = p.split("-").map(Number); return new Date(Date.UTC(y, m, 0)); };
for (const [p, v] of Object.entries(vals)) {
  const published = new Date(eom(p).getTime() + 15 * 86400000).toISOString(); // پانزده روز بعد از پایان دوره منتشر می‌شود
  rowIdOf[p] = M.upsertClaim(idx, { subject: "China", metric: "price", value: v, unit: "USD/mt", period: p, qualifiers: pq, source_key: "price:PR", confidence: 0.7 }, { at: published }).row.id;
}
// اصلاح بعدی ادعای دوره‌ی ۲۰۲۶-۰۱ (پس از ثبت پیش‌بینی دور ۲۰۲۶-۰۲)
M.upsertClaim(idx, { subject: "China", metric: "price", value: 180, unit: "USD/mt", period: "2026-01", qualifiers: pq, source_key: "price:PR", confidence: 0.7 }, { at: "2026-02-20T00:00:00.000Z" });

const truth = { "2026-02": 170, "2026-03": 172, "2026-04": 175, "2026-05": 173, "2026-06": 176 };
const rec = (v, p) => ({ product: SERIES.product, country_or_region: "China", price_type: "FOB", value: v, currency: "USD", unit: "mt", source_reported_date: p, source_name: "PR" });
const days = Object.entries(truth).map(([month, v]) => ({ date: `${month}-28`, records: [rec(v, month)] }));
days.push({ date: "2026-09-20", records: [rec(176, "2026-06")] });
const writePrices = () => fs.writeFileSync(path.join(dataDir, "price_history.json"), JSON.stringify(days));
writePrices();

const rounds = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
for (const rid of rounds) F.ensureRound(rid, { now: new Date(`${rid}-02T07:00:00Z`) });
const at = (rid) => new Date(`${rid}-02T07:00:00Z`);
const mach = (rid, forecaster, point, lo, hi, retrieved, claimIds = []) => assert.ok(F.recordMachineForecast({ roundId: rid, questionId: `${rid}:china_fob`, forecaster, point, lo, hi, rationale: "r", model: "m", method_version: "v", retrieved_ids: retrieved, claim_ids: claimIds }, { now: at(rid) }).ok);
const hum = (rid, u, p) => assert.ok(F.submitForecast({ username: u, roundId: rid, questionId: `${rid}:china_fob`, point: p, lo: p * 0.97, hi: p * 1.03 }, { now: at(rid) }).ok);
// دور ۱ (هدف فوریه، واقعی ۱۷۰): سه پیش‌بین ماشینی غلط با غافلگیری‌های متفاوت + انسان درست و انسان غلط
mach("2026-01", "machine:judge:v1", 150, 140, 160, [rowIdOf["2025-11"]]);                 // غافلگیری ۰٫۵ (روش غلط)
mach("2026-01", "machine:stat:gpt-test", 130, 120, 140, [rowIdOf["2025-11"]]);             // غافلگیری ۱٫۵ (بیشترین)
assert.ok(F.recordBrainForecast({ roundId: "2026-01", questionId: "2026-01:china_fob", point: 155, lo: 148, hi: 163, rationale: "x", model: "gemini-test", method_version: "b" }, { now: at("2026-01") }).ok); // خطای ۸٫۸٪، غافلگیری ≈ ۰٫۴۷
hum("2026-01", "amini", 171); hum("2026-01", "kasrayi", 190);
// دور ۲ (هدف مارس، واقعی ۱۷۲): داور بر ادعای دوره‌ی ۲۰۲۶-۰۱ تکیه کرد که بعداً اصلاح شد
mach("2026-02", "machine:judge:v1", 195, 185, 205, [rowIdOf["2026-01"]], [rowIdOf["2026-01"]]);
hum("2026-02", "amini", 172);
// دور ۳ (هدف آوریل، واقعی ۱۷۵): پیش‌بینی درست ولی با بازه‌ی بسیار پهن ← غافلگیری معکوس
mach("2026-03", "machine:event:gem-test", 176, 130, 225, [rowIdOf["2026-02"]]);
hum("2026-03", "amini", 175);
// دور ۵ (هدف ژوئن، واقعی ۱۷۶): بازیابی ناقص: آخرین مقدار (۲۰۲۶-۰۳) در حافظه بود ولی بازیابی نشد
mach("2026-05", "machine:event:gem-test", 140, 130, 150, [rowIdOf["2025-09"]]);
hum("2026-05", "amini", 176);
hum("2026-05", "kasrayi", 175);

const now1 = new Date("2026-09-30T00:00:00Z");
const sc1 = W.runScoring({ now: now1 });
assert.ok(sc1.written >= 10, `نمره: ${sc1.written}`);

// ------------------------------------------------------------------ انتخاب: ترتیب غافلگیری، فقط سیستم، سقف ماهانه
const sel = A.selectForAutopsy({ scoreRows: SR.readScores(), cfg });
const names = sel.map((s) => `${s.month}|${s.row.forecaster.split(":").slice(0, 2).join(":")}`);
assert.ok(!sel.some((s) => s.row.forecaster.startsWith("human:")), "خطای انسان‌ها کالبدشکافی نمی‌شود (در اعتبارشان می‌آید)");
const feb = sel.filter((s) => s.month === "2026-02");
assert.deepEqual(feb.map((s) => s.row.forecaster.split(":")[1]), ["stat", "judge", "gemini-test"], "ترتیب نزولی غافلگیری");
assert.deepEqual(feb.map((s) => s.rank), [1, 2, 3]);
assert.ok(feb[0].row.surprise > feb[1].row.surprise && feb[1].row.surprise > feb[2].row.surprise);
assert.ok(!names.some((n) => n.startsWith("2026-04")), "پیش‌بینی درست (حتی با بازه‌ی پهن) کالبدشکافی خطا نمی‌شود");
fs.writeFileSync(path.join(dataDir, "brain", "autopsy_config.json"), JSON.stringify({ ...cfg, per_month: 2 }, null, 2));
const capped = A.selectForAutopsy({ scoreRows: SR.readScores(), cfg: A.loadAutopsyConfig() });
assert.equal(capped.filter((s) => s.month === "2026-02").length, 2, "سقف ماهانه");
assert.deepEqual(capped.filter((s) => s.month === "2026-02").map((s) => s.row.forecaster.split(":")[1]), ["stat", "judge"], "در سقف، پرغافلگیری‌ترین‌ها می‌مانند");
fs.writeFileSync(path.join(dataDir, "brain", "autopsy_config.json"), JSON.stringify(cfg, null, 2)); // بازگشت (سقف ۱۰)

// ------------------------------------------------------------------ اجرای کالبدشکافی با مدل پیشنهادی (فقط پیشنهاد)
const genInputs = [];
const gen = async ({ system, input }) => {
  genInputs.push(input);
  const cat = /retrieval_gap/.test(input) ? "unpredictable" : /data_wrong/.test(input) ? "data_wrong" : "method_wrong"; // برای بازیابی ناقص مخالفت می‌کند
  return JSON.stringify({ category: cat, narrative: `روایت مدل برای ${cat}`, proposal: "یک اقدام مشخص" });
};
const au1 = await A.runAutopsies({ now: now1, generate: gen });
assert.equal(au1.new, 5, "فوریه ۳ مورد (اینجا ۵ ردیف: ۳ + مارس ۱ + ژوئن ۱)");
assert.equal(au1.unchanged, 0);
const list = A.listAutopsies().filter((a) => a.category);
const byKey = (c) => list.filter((a) => a.category === c);
assert.equal(byKey("method_wrong").length, 3, "روش غلط: داور و آماری و مغز فعلی در دور ۱");
assert.equal(byKey("data_wrong").length, 1);
assert.equal(byKey("retrieval_gap").length, 1);
const dw = byKey("data_wrong")[0];
assert.equal(dw.forecaster, "machine:judge:v1");
assert.equal(dw.evidence[0].type, "claim_corrected");
assert.deepEqual([dw.evidence[0].old_value, dw.evidence[0].new_value], [169, 180]);
assert.equal(dw.narrative_source, "model");
assert.match(dw.statement, /روایت مدل/);
// مدل با دسته‌ی کد مخالف بود ← «اختلاف» ثبت شد، دسته همان دسته‌ی کد ماند
const rg = byKey("retrieval_gap")[0];
assert.equal(rg.disputed, true);
assert.equal(rg.model_category, "unpredictable");
assert.equal(rg.category, "retrieval_gap", "پیشنهاد مدل دسته را خودکار عوض نمی‌کند");
assert.ok(genInputs.every((i) => !/human:|amini|kasrayi/.test(i)), "ورودی مدل بدون پیش‌بینی انسان‌ها");
// حافظه در لحظه‌ی ثبت: برای دور ۱ آخرین مقدار شناخته‌شده ۱۷۴ (۲۰۲۵-۱۱) بود نه چیزی که بعداً آمد
assert.deepEqual(byKey("method_wrong")[0].known_last, { period: "2025-11", value: 174 });
// فقط اقدام‌های نیازمند انسان به صف می‌روند: داده‌ی غلط + بازیابی ناقص (روش غلط فقط ثبت می‌شود برای حلقه‌ی ۳)
const qv = Q.queueView({ now: now1 });
const ai = qv.open.filter((q) => q.kind === "autopsy");
assert.equal(ai.length, 2);
assert.deepEqual(ai.map((q) => q.category).sort(), ["data_wrong", "retrieval_gap"]);
assert.ok(ai.find((q) => q.category === "retrieval_gap").label.includes("مدل «رویداد پیش‌بینی‌ناپذیر» پیشنهاد کرد"));
// کالبدشکافی هیچ ادعایی را «متناقض» علامت نمی‌زند و قاعده‌ای عوض نمی‌شود
assert.ok([...S.currentRows("claims").values()].filter((c) => !c.recorded_to).every((c) => c.status === "تازه" || c.status === undefined || c.status === "تأییدشده"));
// فقط‌افزودنی و idempotent
const af = fs.readFileSync(path.join(S.getBrainDir(), "analyses.jsonl"), "utf-8");
const au2 = await A.runAutopsies({ now: now1, generate: gen });
assert.deepEqual([au2.new, au2.unchanged, au2.queued], [0, 5, 0]);
assert.equal(fs.readFileSync(path.join(S.getBrainDir(), "analyses.jsonl"), "utf-8"), af, "هیچ بایتی اضافه نشد");
// غافلگیری معکوس ثبت شد (دور ۳)
const rev = A.listAutopsies().filter((a) => a.kind === "reverse");
assert.equal(rev.length, 1);
assert.match(rev[0].statement, /غافلگیری معکوس/);
assert.equal(rev[0].forecaster, "machine:event:gem-test");
// پوشش (شاخص ۱۷: ۱۰۰٪)
const cov = A.autopsyCoverage({ scoreRows: SR.readScores(), cfg });
assert.ok(cov.length >= 3 && cov.every((c) => c.coverage === 1), JSON.stringify(cov));

// ------------------------------------------------------------------ بدون مدل: روایت قالبی (دور ۶ بعداً سنجیده می‌شود)
const rid6 = "2026-06";
mach(rid6, "machine:judge:v1", 160, 150, 165, [rowIdOf["2026-04"]]);
days.push({ date: "2026-10-02", records: [rec(178, "2026-07")] });
writePrices();
const now2 = new Date("2026-10-05T00:00:00Z");
W.runScoring({ now: now2 });
const au3 = await A.runAutopsies({ now: now2, useModel: false });
assert.equal(au3.new, 1);
const a6 = A.listAutopsies().find((a) => a.round_id === rid6);
assert.equal(a6.narrative_source, "template");
assert.match(a6.statement, /مقدار واقعی 178/);
assert.equal(a6.model_category, null);
assert.equal(a6.disputed, false);

// ------------------------------------------------------------------ تصمیم مدیر: تأیید «داده‌ی غلط» ← اعتبار منبعِ ادعای اصلاح‌شده
const before = Rep.computeReputation({ now: now2 });
assert.ok(!Rep.readReputation().some((r) => r.entity === "source:price:PR"), "هنوز تصمیمی نیست ← شاهدی برای منبع نیست");
const item = Q.queueView({ now: now2 }).open.find((q) => q.kind === "autopsy" && q.category === "data_wrong");
assert.deepEqual(item.implicated_sources, ["price:PR"]);
assert.equal(Q.resolveItem(M.loadIndex(), { id: item.id, decision: "reject", by: "admin" }).ok, false, "برای کالبدشکافی فقط تأیید/نادیده");
assert.equal(Q.resolveItem(M.loadIndex(), { id: item.id, decision: "accept", claimKey: item.members[0].claim_key, by: "admin", note: "اصلاح واقعی بود", at: "2026-10-06T00:00:00.000Z" }).ok, true);
Rep.computeReputation({ now: now2 });
const src = Rep.readReputation().find((r) => r.entity === "source:price:PR" && r.topic === "all");
assert.ok(src, "منبع شاهد گرفت");
assert.equal(src.score, 0, "یک ادعای اصلاح‌شده ← نتیجه‌ی ۰");
assert.ok(src.weight < src.group_mean + 1e-9 || src.n_resolved === 1);
assert.deepEqual(src.visible_to, ["admin"]);
const adj = Rep.sourceAdjustments();
assert.ok(adj.get("price:PR") <= 0, "اعتبار پایه‌ی آن منبع کاهش می‌یابد (یا بی‌اثر با شاهد کم)");
// «نادیده»: بدون اثر روی اعتبار
const item2 = Q.queueView({ now: now2 }).open.find((q) => q.kind === "autopsy" && q.category === "retrieval_gap");
assert.equal(Q.resolveItem(M.loadIndex(), { id: item2.id, decision: "dismiss", by: "admin" }).ok, true);

// ------------------------------------------------------------------ بدون مدل و بدون داده‌ی فروش در کد کالبدشکافی
const code = fs.readFileSync(path.join(process.cwd(), "lib", "brain2", "autopsy.js"), "utf-8");
assert.ok(!/salesStore|scoring\/writer|appendScoreEvent/.test(code), "کالبدشکافی به نویسنده‌ی سنجش و داده‌ی فروش دسترسی ندارد");

fs.rmSync(tmp, { recursive: true, force: true });
console.log("✔ تست کالبدشکافی خطا (مرحله‌ی ۹) گذشت");

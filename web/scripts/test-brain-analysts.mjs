// تست مرحله‌ی ۶ مغز (دو تحلیل‌گر و داور با بازیابی انتخابی، پروتکل ۶-۴ و ۷): بازیابی (ارتباط، بودجه، قاعده‌ی پذیرفته، ثبت فهرست)،
// استقلال و کور بودن تحلیل‌گرها، تجمیع وزن‌دار داور، اختلاف → صف، ثبت در دفتر و حافظه، سنجش خودکار پیش‌بین‌های ماشینی.
//   node --import ./scripts/alias-loader.mjs scripts/test-brain-analysts.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "brainan-"));
const REAL = path.join(process.cwd(), "..", "data");
const dataDir = path.join(tmp, "data");
fs.mkdirSync(path.join(dataDir, "brain"), { recursive: true });
for (const f of ["confidence_config.json", "analysts_config.json", "scoring_config.json"]) fs.copyFileSync(path.join(REAL, "brain", f), path.join(dataDir, "brain", f));
process.env.BRAIN_DATA_DIR = dataDir;
process.env.BRAIN_STATE_DIR = path.join(tmp, "state");
process.env.SALES_STATE_DIR = path.join(tmp, "sales");
delete process.env.OUTREACH_STATE_DIR;

const S = await import("../lib/brain2/store.js");
const M = await import("../lib/brain2/memory.js");
const F = await import("../lib/brain2/forecast.js");
const R = await import("../lib/brain2/rules.js");
const Ret = await import("../lib/brain2/knowledge/retrieval.js");
const Q = await import("../lib/brain2/knowledge/queue.js");
const An = await import("../lib/brain2/analysts.js");
const J = await import("../lib/brain2/judge.js");
const MF = await import("../lib/brain2/machineForecaster.js");
const W = await import("../lib/brain2/scoring/writer.js");
const SR = await import("../lib/brain2/scoring/read.js");

const T0 = "2026-11-09T07:00:00.000Z";
const NOW = new Date(T0);

// ------------------------------------------------------------------ حافظه‌ی ساختگی
await import("../lib/brain2/schema.js").then((m) => m.ensureRepos());
R.ensureRules({ at: T0 });
let idx = M.loadIndex();
const src = (k, o) => M.upsertSource(idx, { key: k, kind: "جدول آماری", origin: o }, { at: T0 });
src("price:PR", "Procurement Resource"); src("price:CA", "ChemAnalyst"); src("trade_map_2025", "Trade Map"); src("news:r", "Reuters"); src("news:s", "SCMP"); src("iran_customs", "گمرک ایران"); src("profile:کنیا", "پروفایل کنیا");
const cl = (subject, metric, value, source, extra = {}) => M.upsertClaim(idx, { subject, metric, value, source_key: source, confidence: 0.7, ...extra }, { at: T0 }).row;
const pq = { product: "sodium bicarbonate", price_type: "FOB" };
const series = [["2026-01", 190], ["2026-02", 188], ["2026-03", 186], ["2026-04", 184], ["2026-05", 182], ["2026-06", 180], ["2026-07", 179.5], ["2026-08", 177.78]];
for (const [p, v] of series) cl("China", "price", v, "price:PR", { unit: "USD/mt", period: p, qualifiers: pq });
cl("China", "price", 400, "price:PR", { unit: "USD/mt", period: "2026-08", qualifiers: { product: "sodium bicarbonate", price_type: "CIF" } }); // نوع دیگر قیمت: جزو سری نیست
cl("چین", "trade_map.exports.quantity", 123456, "trade_map_2025", { unit: "Tons", period: "2025" });
cl("چین", "per_capita_kg", 1.1, "trade_map_2025", { unit: "kg", period: "2025" });
cl("کنیا", "total_import_volume", 777, "profile:کنیا", { unit: "تن", period: "2025" });
const sig = (text, source, day, extra = {}) => cl("بازار", "signal", text, source, { period: day, qualifiers: { headline: text, i: 0 }, confidence: 0.3, ...extra });
sig("بانک مرکزی چین برای مهار رشد یوآن اقدام کرد", "news:r", "2026-11-08");
sig("افت قیمت کربنات سدیم در بازار چین به زیر ۱۰۰۰ یوان", "news:s", "2026-11-07", { confidence: 0.6 });
sig("افت قیمت کربنات سدیم در بازار چین به زیر ۱۰۰۰ یوان (قدیمی)", "news:s", "2026-06-01", { confidence: 0.6, qualifiers: { headline: "old", i: 1 } });
sig("مسابقات فوتبال لیگ برتر برگزار شد", "news:r", "2026-11-08", { qualifiers: { headline: "x", i: 2 } });   // نامرتبط
const closed = sig("خبر ردشده درباره‌ی چین", "news:s", "2026-11-08", { qualifiers: { headline: "closed", i: 3 } });
M.reviseClaim(idx, closed, { status: "بسته‌شده" }, "رد در بازبینی", { at: T0 });
cl("ایران", "iran_export_tons", 53096, "iran_customs", { unit: "تن", period: "1404", qualifiers: { calendar: "شمسی" }, rule_flags: ["iran-customs-underdeclared"] });
Q.raiseItem({ natural_key: "contradiction|import_volume_tons|چین|2025", kind: "contradiction", group: "import_volume_tons", label: "حجم واردات کشور (تن)", subject: "چین", period: "2025", spread: 2, members: [{ claim_key: "a", metric: "m", source: "profile:چین", value: 100 }, { claim_key: "b", metric: "m", source: "trade_map_2025", value: 200 }] }, { at: T0 });
// یک پیش‌بینی انسانی با متن شناسه‌دار (باید هرگز به مدل نرسد)
F.ensureRound("2026-11", { now: NOW });
const qid = "2026-11:china_fob";
const qi = "2026-11:iran_food_fob";
assert.ok(F.submitForecast({ username: "amini", roundId: "2026-11", questionId: qid, point: 123.45, lo: 110, hi: 150, rationale: "SECRET-HUMAN-RATIONALE" }, { now: NOW }).ok);
const round = F.getRound("2026-11");
const qChina = round.questions.find((x) => x.id === qid);
const qIran = round.questions.find((x) => x.id === qi);

// ------------------------------------------------------------------ بازیابی انتخابی
const rs = Ret.retrieve({ question: qChina, pack: "statistical", now: NOW });
assert.ok(rs.text.includes("177.78") && rs.text.includes("2026-08"), "آخرین نقطه‌ی سری همیشه می‌آید");
assert.ok(!rs.text.includes("400"), "قیمت سی‌آی‌اف جزو سری فوب نیست");
assert.ok(!rs.text.includes("777"), "ادعای کشور دیگر بازیابی نمی‌شود (ارتباط صفر)");
assert.ok(rs.text.includes("123,456"), "ادعای سالانه‌ی مرتبط (چین) می‌آید");
assert.ok(!rs.text.includes("فوتبال") && !rs.text.includes("بانک مرکزی"), "بسته‌ی آماری خبر نمی‌گیرد");
assert.ok(!rs.text.includes("ردشده"), "ادعای بسته‌شده نمی‌آید");
assert.equal(rs.series.length, 8);
assert.deepEqual(rs.series.map((p) => p.period), series.map((x) => x[0]), "سری قدیمی→جدید");
assert.ok(rs.text.length <= 6000 + 200);
assert.equal(rs.retrieved_ids.length, new Set(rs.retrieved_ids).size, "شناسه‌ها یکتا");
assert.ok(rs.claim_ids.length > 0 && rs.claim_ids.every((id) => rs.retrieved_ids.includes(id)));
const re = Ret.retrieve({ question: qChina, pack: "event", now: NOW });
assert.ok(re.text.includes("بانک مرکزی چین") && re.text.includes("کربنات سدیم"), "بسته‌ی رویدادمحور خبر مرتبط می‌گیرد");
assert.ok(!re.text.includes("فوتبال"), "خبر نامرتبط بازیابی نمی‌شود");
assert.ok(re.text.indexOf("(قدیمی)") > re.text.indexOf("به زیر ۱۰۰۰ یوان [اعتماد 0.6]") || re.text.indexOf("(قدیمی)") > re.text.indexOf("2026-11-07"), "خبر تازه‌تر با اعتماد برابر بالاتر می‌آید");
assert.match(re.text, /هشدار: حجم واردات کشور \(تن\) \(چین، 2025\)/, "تناقض باز مرتبط به تحلیل‌گر رویدادمحور هشدار می‌شود");
assert.ok(!rs.text.includes("هشدار:"), "بسته‌ی آماری هشدار تناقض نمی‌گیرد (داده‌ی لازم روش او نیست)");
const re2 = Ret.retrieve({ question: qChina, pack: "event", now: NOW });
assert.equal(re.text, re2.text, "بازیابی قطعی است");
assert.ok(re.retrieved_ids.includes(re.items.find((i) => i.kind === "contradiction").id));
// هر دو تحلیل‌گر به آخرین مقدار سری دسترسی دارند (داده‌ی لازم هر دو روش)
assert.ok(re.text.includes("177.78"));
// قاعده‌ی «پذیرفته» همیشه می‌آید، «پیشنهادی» نه
assert.ok(!rs.text.includes("قاعده‌ی پذیرفته"));
const rule = R.listRules().find((r) => r.natural_key === "iran-customs-underdeclared");
const { id: _i, created_at: _c, recorded_from: _f, recorded_to: _t, closed_reason: _r, ...keepR } = rule;
S.putRow("rules", S.stampRow("rule", { ...keepR, status: "پذیرفته", supersedes: rule.id, change_reason: "آزمون" }, T0));
S.closeRow("rules", rule.id, { reason: "آزمون", at: T0 });
const rr = Ret.retrieve({ question: qChina, pack: "statistical", now: NOW });
assert.ok(rr.text.includes("قاعده‌ی پذیرفته: آمار صادرات گمرک ایران کم‌اظهار است"), "قاعده‌ی پذیرفته همیشه بازیابی می‌شود");
assert.equal(rr.rule_ids.length, 1);
// بودجه و سقف تعداد
for (let i = 0; i < 80; i++) sig(`افت قیمت کربنات سدیم در بازار چین، گزارش شماره ${i}`, i % 2 ? "news:r" : "news:s", "2026-11-08", { qualifiers: { headline: `bulk${i}`, i } });
const big = Ret.retrieve({ question: qChina, pack: "event", now: NOW });
assert.ok(big.items.filter((i) => i.kind === "signal").length <= 40, "سقف تعداد");
assert.ok(big.stats.chars <= 14000 + 300, "سقف حجم متن");
assert.ok(big.stats.candidates > big.stats.selected, "همه‌چیز یک‌جا به مدل داده نمی‌شود");
// پرسش ایران: سری عمومی ندارد؛ داده‌ی فروش محرمانه هرگز نمی‌آید
const ri = Ret.retrieve({ question: qIran, pack: "statistical", now: NOW });
assert.equal(ri.series.length, 0);
assert.ok(ri.text.includes("53,096") && ri.text.includes("کم‌اظهار"), "ادعای گمرک ایران با برچسب کم‌اظهار");
assert.ok(!/buyer|مشتری|قرارداد فروش/.test(ri.text));

// ------------------------------------------------------------------ آمار روند با کد
const st = An.seriesStats(rs.series);
assert.equal(st.n, 8); assert.equal(st.last, 177.78); assert.equal(st.prev, 179.5);
assert.equal(st.change_pct, -1);
assert.equal(st.min, 177.78); assert.equal(st.max, 190);
assert.equal(An.seriesStats([]), null);

// ------------------------------------------------------------------ تحلیل‌گر: استقلال و اعتبارسنجی
const captured = [];
const gen = (obj) => async (a) => { captured.push(a); return JSON.stringify(obj); };
const ok1 = await An.runAnalyst("stat", { question: qChina, limits: round.limits, now: NOW, generate: gen({ point: 176, lo: 168, hi: 185, rationale: "از آخرین مقدار و گام معمول" }) });
assert.ok(ok1.ok);
assert.match(ok1.forecaster, /^machine:stat:/);
assert.equal(ok1.method_version, "stat-v1");
assert.ok(ok1.retrieved_ids.length >= 8);
const ok2 = await An.runAnalyst("event", { question: qChina, limits: round.limits, now: NOW, generate: gen({ point: 182, lo: 170, hi: 195, rationale: "رویداد یوان" }) });
assert.match(ok2.forecaster, /^machine:event:/);
assert.ok(ok2.input.includes("بانک مرکزی چین") && !ok1.input.includes("بانک مرکزی چین"), "هر تحلیل‌گر فقط بسته‌ی خودش را می‌بیند");
for (const c of captured) {
  assert.ok(!/SECRET-HUMAN|123\.45|human:|amini/.test(c.system + c.input), "پیش‌بینی انسان هرگز به مدل نمی‌رسد");
  assert.ok(!/machine:|تحلیل‌گر دیگر/.test(c.input), "خروجی تحلیل‌گر دیگر دیده نمی‌شود");
}
assert.match(captured[0].system, /آماری/);
assert.match(captured[1].system, /رویدادمحور/);
assert.equal((await An.runAnalyst("stat", { question: qChina, limits: round.limits, generate: async () => "نه JSON" })).ok, false);
assert.equal((await An.runAnalyst("stat", { question: qChina, limits: round.limits, generate: gen({ point: 500, lo: 600, hi: 700, rationale: "" }) })).ok, false, "کف > عدد رد می‌شود");
assert.equal((await An.runAnalyst("event", { question: qChina, limits: round.limits, generate: async () => { throw new Error("Gemini 503"); } })).ok, false);

// ------------------------------------------------------------------ داور: وزن، تجمیع، اختلاف، نوشتار
const sc = (f, topic, skill, n = 1) => Array.from({ length: n }, (_, i) => ({ kind: "time_avg", forecaster: f, question_id: `r${i}:${topic}`, skill_vs_baseline: skill }));
const eq = J.analystWeights(["a", "b"], "china_fob", []);
assert.deepEqual(eq.weights, [0.5, 0.5]); assert.equal(eq.basis, "equal", "بدون سابقه: وزن برابر");
assert.equal(J.analystWeights(["a", "b"], "china_fob", [...sc("a", "china_fob", 0.8, 2), ...sc("b", "china_fob", -0.5, 2)]).basis, "equal", "کمتر از سه پرسش سنجیده");
const hist = J.analystWeights(["a", "b"], "china_fob", [...sc("a", "china_fob", 0.8, 3), ...sc("b", "china_fob", -0.5, 3), ...sc("a", "iran_food_fob", -1, 5)]);
assert.equal(hist.basis, "history");
assert.ok(hist.weights[0] > hist.weights[1], "تحلیل‌گر با مهارت بیشتر در همان موضوع وزن بیشتر");
near(hist.weights[0] + hist.weights[1], 1);
near(hist.weights[0], 0.9 / (0.9 + 0.25), 1e-6);
assert.ok(J.analystWeights(["a", "b"], "china_fob", [...sc("a", "china_fob", 1, 3), ...sc("b", "china_fob", -1, 3)]).weights[1] >= 0.1 / 1.1 - 1e-9, "کف وزن");
function near(a, b, eps = 1e-6) { assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`); }
const c1 = J.combine({ point: 176, lo: 168, hi: 185 }, { point: 182, lo: 170, hi: 195 }, [0.5, 0.5]);
near(c1.point, 179); near(c1.spread, 6);
near(c1.lo, 169 - 0.25 * 6, 0.06); near(c1.hi, 190 + 0.25 * 6, 0.06);
assert.equal(c1.high, false, "۶٫۶ دلار = ۳٫۴٪ ≤ آستانه‌ی ۵٪");
const c2 = J.combine({ point: 170, lo: 160, hi: 180 }, { point: 190, lo: 180, hi: 200 }, [0.75, 0.25]);
near(c2.point, 175);
assert.equal(c2.high, true);
assert.ok(c2.lo < 165 && c2.hi > 185, "اختلاف زیاد بازه را پهن می‌کند");
assert.ok(J.combine({ point: 100, lo: 90, hi: 110 }, { point: 100, lo: 90, hi: 110 }, [0.5, 0.5]).disagreement === 0);
// نوشتار: متن مدل با شرط‌ها
const A = { point: 170, lo: 160, hi: 180, rationale: "آماری" }, B = { point: 190, lo: 180, hi: 200, rationale: "رویدادی" };
const inputs = [];
const good = await J.writeSummary({ question: qChina, a: A, b: B, combined: c2, weights: [0.75, 0.25], basis: "history", generate: async (x) => { inputs.push(x.input); return "تحلیل‌گرها هم‌نظر نیستند؛ عدد ۱۷۵ و بازه‌ی ۱۶۰ تا ۱۹۰ است."; } });
assert.equal(good.source, "model");
const hidden = await J.writeSummary({ question: qChina, a: A, b: B, combined: c2, weights: [0.75, 0.25], basis: "history", generate: async () => "هر دو تحلیل نزدیک‌اند؛ عدد ۱۷۵." });
assert.match(hidden.text, /^تحلیل‌گرها هم‌نظر نیستند\./, "اختلاف بالا پنهان نمی‌شود حتی اگر مدل ننویسد");
const invented = await J.writeSummary({ question: qChina, a: A, b: B, combined: c2, weights: [0.75, 0.25], basis: "history", generate: async () => "عدد ۹۹۹ را پیش‌بینی می‌کنم" });
assert.equal(invented.source, "template", "عدد بی‌پشتوانه ← متن قطعی کد");
assert.deepEqual(invented.ungrounded, ["999"]);
assert.match(invented.text, /هم‌نظر نیستند/);
const down = await J.writeSummary({ question: qChina, a: A, b: B, combined: c2, weights: [0.5, 0.5], basis: "equal", generate: async () => { throw new Error("x"); } });
assert.equal(down.source, "template");
// ترتیب نمایش تصادفی (قابل‌تزریق)
const order = [];
await J.writeSummary({ question: qChina, a: A, b: B, combined: c2, weights: [0.5, 0.5], basis: "equal", shuffle: (arr) => [...arr].reverse(), generate: async (x) => { order.push(x.input.indexOf("آماری") < x.input.indexOf("رویدادمحور")); return "ok"; } });
await J.writeSummary({ question: qChina, a: A, b: B, combined: c2, weights: [0.5, 0.5], basis: "equal", shuffle: (arr) => [...arr], generate: async (x) => { order.push(x.input.indexOf("آماری") < x.input.indexOf("رویدادمحور")); return "ok"; } });
assert.deepEqual(order, [false, true], "ترتیب تحلیل‌ها در ورودی داور قابل‌جابه‌جایی است");

// ------------------------------------------------------------------ هماهنگ‌کننده: ثبت در دفتر و حافظه
const log = [];
const generators = {
  stat: async (a) => { log.push("stat"); return JSON.stringify({ point: 175, lo: 168, hi: 185, rationale: "نرخ پایه و روند نزولی ملایم" }); },
  event: async (a) => { log.push("event"); return JSON.stringify({ point: 185, lo: 172, hi: 198, rationale: "رویداد یوان" }); },
  judge: async (a) => { log.push("judge"); return "تحلیل‌گرها هم‌نظر نیستند: آماری ۱۷۵ و رویدادی ۱۸۵."; },
};
const ran = await MF.runMachineForecasts("2026-11", { now: NOW, generators });
assert.equal(ran.ok, true);
const rChina = ran.results.find((x) => x.question === qid);
assert.deepEqual([rChina.stat, rChina.event, rChina.judge], ["recorded", "recorded", "recorded"]);
assert.deepEqual(log.slice(0, 3), ["stat", "event", "judge"], "تحلیل‌گرها پیش از داور اجرا می‌شوند");
const preds = F.predictionsOf("2026-11").filter((p) => p.forecaster.startsWith("machine:") && p.question_id === qid);
assert.equal(preds.length, 3);
assert.deepEqual(preds.map((p) => p.forecaster.split(":")[1]).sort(), ["event", "judge", "stat"]);
const fileOrder = fs.readFileSync(path.join(S.getBrainDir(), "predictions.jsonl"), "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l).row).filter((r) => r && r.forecaster?.startsWith("machine:") && r.question_id === qid).map((r) => r.forecaster.split(":")[1]);
assert.deepEqual(fileOrder, ["stat", "event", "judge"], "ثبت هر تحلیل‌گر پیش از داور (و پیش از دیدن خروجی دیگری)");
for (const p of preds) {
  assert.ok(p.retrieved_ids.length > 0, "فهرست موارد بازیابی‌شده ثبت است");
  assert.ok(p.blind === true && p.kind === "forecast" && p.revision_no === 1);
  assert.equal(p.outcome, undefined);
}
const judge = preds.find((p) => p.forecaster === J.JUDGE_FORECASTER);
near(judge.forecast.point, 180, 0.06);
assert.match(judge.rationale, /هم‌نظر نیستند/);
assert.ok(judge.retrieved_ids.length >= preds.find((p) => p.forecaster.includes(":stat:")).retrieved_ids.length, "اجتماع بازیابی‌های دو تحلیل‌گر");
assert.equal(new Set(judge.retrieved_ids).size, judge.retrieved_ids.length);
// حافظه: تحلیل‌ها
const an = [...S.currentRows("analyses").values()].filter((a) => !a.recorded_to && ["stat", "event", "judge"].includes(a.analyst));
assert.deepEqual(an.filter((a) => a.payload.question_id === qid).map((a) => a.analyst).sort(), ["event", "judge", "stat"], "هر سه خروجی در مخزن تحلیل‌ها ثبت شد");
const jAn = an.find((a) => a.analyst === "judge" && a.payload.question_id === qid);
assert.equal(jAn.payload.weight_basis, "equal");
assert.equal(jAn.payload.analysts.length, 2);
assert.ok(jAn.method_version === "judge-v1" && jAn.model);
// اختلاف زیاد (۵٫۶٪) ← صف بازبینی انسانی (۷-۴)
const dq = Q.queueView({ now: NOW }).open.find((q) => q.kind === "disagreement" && q.natural_key === `disagreement|${qid}`);
assert.ok(dq, "اختلاف زیاد به صف می‌رود");
assert.equal(dq.members.length, 2);
assert.equal(Q.resolveItem(M.loadIndex(), { id: dq.id, decision: "accept", claimKey: dq.members[0].claim_key, by: "admin" }).ok, false, "برای اختلاف تحلیل‌گرها فقط «بررسی شد»");
// بازبینی هفتگی: بدون سررسید چیزی صدا زده نمی‌شود
log.length = 0;
const again = await MF.runMachineForecasts("2026-11", { now: new Date("2026-11-12T07:00:00Z"), generators });
assert.deepEqual([again.results[0].stat, again.results[0].event, again.results[0].judge], ["not_due", "not_due", "not_due"]);
assert.equal(log.length, 0);
// بعد از ۷ روز: تغییر معنادار ← نسخه‌ی تازه با دلیل؛ تغییر کوچک ← بدون نسخه
const later = new Date("2026-11-17T07:00:00Z");
const gen2 = { ...generators, event: async () => JSON.stringify({ point: 183, lo: 172, hi: 197, rationale: "رویداد تازه کرایه" }), stat: async () => JSON.stringify({ point: 175.2, lo: 168, hi: 185, rationale: "همان" }) };
const rev = await MF.runMachineForecasts("2026-11", { now: later, generators: gen2 });
const rv = rev.results.find((x) => x.question === qid);
assert.deepEqual([rv.stat, rv.event, rv.judge], ["unchanged", "revised", "revised"]);
const evVers = F.versionsOf("2026-11", qid, (p) => p.forecaster.startsWith("machine:event:"));
assert.equal(evVers.length, 2);
assert.equal(evVers[1].revision_of, evVers[0].id);
assert.match(evVers[1].revision_reason, /بازبینی دوره‌ای/);
assert.ok(S.currentRows("predictions").get(evVers[0].id).recorded_to, "نسخه‌ی قبلی بسته شد، پاک نشد");
// شکست یک تحلیل‌گر ← داور اجرا نمی‌شود
F.ensureRound("2026-12", { now: new Date("2026-12-02T07:00:00Z") });
const half = await MF.runMachineForecasts("2026-12", { now: new Date("2026-12-02T08:00:00Z"), generators: { ...generators, event: async () => { throw new Error("Gemini 503"); } } });
const h0 = half.results[0];
assert.equal(h0.stat, "recorded"); assert.match(h0.event, /^failed/); assert.equal(h0.judge, "waiting_for_analysts");
assert.equal(half.ok, false);
assert.equal(F.predictionsOf("2026-12").filter((p) => p.forecaster === J.JUDGE_FORECASTER).length, 0);

// ------------------------------------------------------------------ دید و کور بودن
const lockPast = new Date("2027-01-01T00:00:00Z"); // بعد از مهلت قفل دور ۲۰۲۶-۱۱ (ماه هدف دسامبر؛ قفل ۲۸ دسامبر)
const open = F.viewRound({ username: "admin", isAdmin: true, roundId: "2026-11", now: NOW });
assert.ok(open.questions.every((q) => q.machines.length === 0), "پیش از قفل برای مدیر هم نیست");
const userView = F.viewRound({ username: "amini", isAdmin: false, roundId: "2026-11", now: lockPast });
assert.ok(userView.questions.every((q) => q.machines.length === 0) && !JSON.stringify(userView).includes("machine:"), "کاربر عادی هرگز پیش‌بین ماشینی نمی‌بیند");
const adminView = F.viewRound({ username: "admin", isAdmin: true, roundId: "2026-11", now: lockPast });
const mq = adminView.questions.find((q) => q.id === qid).machines;
assert.equal(mq.length, 3);
assert.ok(mq.every((m) => m.retrieved > 0));
assert.equal((await MF.runMachineForecasts("2026-11", { now: lockPast, generators, force: true })).skipped, "locked", "بعد از قفل چیزی ثبت نمی‌شود");

// ------------------------------------------------------------------ سنجش خودکار پیش‌بین‌های ماشینی (مرحله‌ی ۴)
const rec = (v, p) => ({ product: "sodium bicarbonate", country_or_region: "China", price_type: "FOB", value: v, currency: "USD", unit: "mt", source_reported_date: p, source_name: "PR" });
fs.writeFileSync(path.join(dataDir, "price_history.json"), JSON.stringify([
  { date: "2026-11-05", records: [rec(177.78, "2026-08")] },
  { date: "2027-02-20", records: [rec(181, "2026-12")] },
]));
const scored = W.runScoring({ now: new Date("2027-03-02T00:00:00Z") });
assert.ok(scored.written >= 6, `نمره‌ی ماشینی: ${scored.written}`);
const rows = SR.readScores().filter((r) => r.kind === "time_avg" && r.question_id === qid);
const who = rows.map((r) => r.forecaster.split(":").slice(0, 2).join(":")).sort();
assert.deepEqual(who, ["human:amini", "machine:event", "machine:judge", "machine:stat"], "هر پیش‌بین سابقه‌ی جدا دارد");
const evRow = rows.find((r) => r.forecaster.startsWith("machine:event:"));
assert.equal(evRow.n_versions, 2);
assert.equal(evRow.outcome, 181);
assert.equal(SR.visibleScores({ username: "amini", isAdmin: false }).filter((r) => r.forecaster.startsWith("machine:")).length, 0, "کارشناس نمره‌ی ماشین‌ها را نمی‌بیند");
assert.ok(SR.visibleScores({ username: "admin", isAdmin: true }).some((r) => r.forecaster.startsWith("machine:judge")), "مدیر نمره‌ی داور را می‌بیند");
// وزن داور از سابقه‌ی همین موضوع (ترازو بعد از سنجش)
const w = J.analystWeights(rows.filter((r) => r.forecaster.startsWith("machine:stat") || r.forecaster.startsWith("machine:event")).map((r) => r.forecaster), "china_fob", SR.readScores());
assert.equal(w.basis, "equal", "با یک پرسش سنجیده هنوز سابقه‌ی کافی نیست");

fs.rmSync(tmp, { recursive: true, force: true });
console.log("✔ تست تحلیل‌گرها و داور (مرحله‌ی ۶) گذشت");

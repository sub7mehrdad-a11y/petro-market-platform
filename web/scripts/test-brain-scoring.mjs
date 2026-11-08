// تست مرحله‌ی ۴ مغز (جزء سنجش، پروتکل ۸-۳ تا ۸-۶، ۹-۵، ۱۱-۴): نمره‌ی دستی چند سناریو، میانگین زمانی نسخه‌ها، خط مبنا، «بدون داوری»
// (نبود مقدار / کهنگی)، idempotent، جداسازی (مغز نمی‌تواند در scores بنویسد)، دید هر کاربر، محرمانگی منبع فروش.
//   node --import ./scripts/alias-loader.mjs scripts/test-brain-scoring.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "brainscore-"));
const dataDir = path.join(tmp, "data");
fs.mkdirSync(dataDir, { recursive: true });
process.env.BRAIN_STATE_DIR = path.join(tmp, "state");
process.env.BRAIN_DATA_DIR = dataDir;
process.env.SALES_STATE_DIR = path.join(tmp, "sales");
delete process.env.OUTREACH_STATE_DIR;
delete process.env.GEMINI_API_KEY_BRAIN;

const S = await import("../lib/brain2/store.js");
const F = await import("../lib/brain2/forecast.js");
const Math2 = await import("../lib/brain2/scoring/math.js");
const W = await import("../lib/brain2/scoring/writer.js");
const R = await import("../lib/brain2/scoring/read.js");
const T = await import("../lib/brain2/scoring/truth.js");
const Sales = await import("../lib/salesStore.js");

const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

// ------------------------------------------------------------------ ریاضی خالص (نمره‌ی دستی)
assert.equal(Math2.relErr(180, 177.78) > 0.0124 && Math2.relErr(180, 177.78) < 0.0126, true);
assert.equal(Math2.inInterval(5, 5, 10), true);
assert.equal(Math2.inInterval(4.99, 5, 10), false);
near(Math2.skill(0.01, 0.04), 0.75);
assert.equal(Math2.skill(0.01, 0), null, "خطای خط مبنا صفر: مهارت تعریف نمی‌شود");
near(Math2.skill(0.08, 0.04), -1, 1e-9);
near(Math2.surpriseInterval(150, 140, 160), 0);
near(Math2.surpriseInterval(180, 140, 160), 1, 1e-9);        // ۲۰ بیرون ÷ پهنای ۲۰
near(Math2.surpriseInterval(120, 140, 160), 1, 1e-9);
near(Math2.surpriseInterval(190, 100, 110), 8, 1e-9);        // بازه‌ی باریک و خطای بزرگ = غافلگیری بزرگ
near(Math2.surpriseProbability(0.95, 0), 0.855, 1e-9);       // اطمینان زیاد و غلط
near(Math2.surpriseProbability(0.55, 0), 0.055, 1e-9);       // اطمینان کم و غلط: تقریباً هیچ
near(Math2.surpriseProbability(0.9, 1), 0.08, 1e-9);
near(Math2.brier(0.9, 1), 0.01);
near(Math2.brier(0.9, 0), 0.81);
near(Math2.spearman([1, 2, 3, 4], [1, 2, 3, 4]), 1, 1e-9);
near(Math2.spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1, 1e-9);
near(Math2.spearman([1, 2, 3], [1, 3, 2]), 0.5, 1e-9);
assert.equal(Math2.spearman([1], [1]), null);
near(Math2.weightedMean([{ weight: 1, v: 10 }, { weight: 3, v: 20 }, { weight: 5, v: null }], (x) => x.v), 17.5, 1e-9);
assert.equal(Math2.weightedMean([{ weight: 1, v: null }], (x) => x.v), null);
const wv = Math2.windows([{ made_at: "2026-01-01T00:00:00Z" }, { made_at: "2026-01-11T00:00:00Z" }], new Date("2026-01-14T00:00:00Z").getTime());
assert.deepEqual(wv.map((w) => w.weight / 86400000), [10, 3], "هر نسخه تا ثبت نسخه‌ی بعد، و آخرین تا مهلت قفل");
const stp = Math2.steps([{ forecast: { point: 100 } }, { forecast: { point: 110 } }, { forecast: { point: 99 } }]);
near(stp.mean, 0.1, 1e-9); near(stp.max, 0.1, 1e-9); assert.equal(stp.n, 2);

// ------------------------------------------------------------------ داده‌ی ساختگی: سری قیمت چین
const rec = (value, reported) => ({ product: "sodium bicarbonate", country_or_region: "China", price_type: "FOB", value, currency: "USD", unit: "mt", source_reported_date: reported, source_name: "PR" });
const priceDays = [
  { date: "2026-08-04", records: [rec(170, "2026-07")] },
  { date: "2026-08-31", records: [rec(176, "2026-08")] },
  { date: "2026-11-24", records: [rec(176, "2026-08")] }, // منبع هنوز زنده است (هر روز همان مقدار را گزارش می‌دهد) ولی دوره‌ی ۲۰۲۶-۰۹ را ندارد
];
const writePrices = (days) => fs.writeFileSync(path.join(dataDir, "price_history.json"), JSON.stringify(days));
writePrices(priceDays);

// دور ۲۰۲۶-۰۸ (ماه هدف ۲۰۲۶-۰۹، سررسید ۲۰۲۶-۱۱-۲۹)، پرسش فوب چین
const t = (iso) => new Date(iso);
F.ensureRound("2026-08", { now: t("2026-08-02T07:00:00Z") });
const qid = "2026-08:china_fob";
const q = F.getRound("2026-08").questions.find((x) => x.id === qid);
assert.equal(q.resolves_at, "2026-11-29");
assert.equal(F.roundLockAt(F.getRound("2026-08")), "2026-09-27T20:30:00.000Z");
const sub = (user, point, lo, hi, now, reason) => F.submitForecast({ username: user, roundId: "2026-08", questionId: qid, point, lo, hi, revisionReason: reason }, { now: t(now) });
assert.ok(sub("amini", 180, 165, 200, "2026-08-05T07:00:00Z").ok);
assert.ok(sub("amini", 175, 168, 185, "2026-09-05T07:00:00Z", "بعد از خبر ماه اوت").ok);
assert.ok(sub("kasrayi", 150, 140, 160, "2026-08-05T07:00:00Z").ok);
assert.ok(F.recordBrainForecast({ roundId: "2026-08", questionId: qid, point: 178, lo: 160, hi: 195, rationale: "x", model: "gemini-test", method_version: "t" }, { now: t("2026-08-02T07:00:00Z") }).ok);

// ------------------------------------------------------------------ «بدون داوری»
const before = W.runScoring({ now: t("2026-10-10T00:00:00Z") });
assert.equal(before.questions_checked, 0, "پیش از سررسید چیزی سنجیده نمی‌شود");
const miss = W.runScoring({ now: t("2026-11-30T00:00:00Z") });
assert.equal(miss.written, 0);
assert.match(miss.unresolved[0].reason, /2026-09.*هنوز.*منتشر نشده/, "مقدار ماه هدف نیامده");
const stale = W.runScoring({ now: t("2027-03-01T00:00:00Z") });
assert.equal(stale.written, 0);
assert.match(stale.unresolved[0].reason, /کهنه/, "منبع بیش از ۷۵ روز مشاهده‌ای نداشته");
assert.equal(S.currentRows("scores").size, 0, "بدون داوری = هیچ نمره‌ای نوشته نمی‌شود");
const pend = R.pendingFor({ username: "amini", isAdmin: false, now: t("2026-11-30T00:00:00Z") });
assert.equal(pend.length, 1);
assert.match(pend[0].status, /بدون داوری: .*منتشر نشده/);
assert.ok(!JSON.stringify(pend).includes("177"), "دلیل «بدون داوری» مقدار واقعی را نمی‌دهد");

// مقدار واقعی می‌رسد
priceDays.push({ date: "2026-11-25", records: [rec(177.78, "2026-09")] });
writePrices(priceDays);
const now = t("2026-11-30T00:00:00Z");
const r1 = W.runScoring({ now });
assert.deepEqual([r1.written, r1.changed, r1.unresolved.length], [7, 0, 0], "۴ نمره‌ی نسخه + ۳ میانگین زمانی");
const rows = R.readScores();
const A = 177.78;
const ver = (u, n) => rows.find((r) => r.kind === "version" && r.forecaster === u && r.revision_no === n);
const avg = (u) => rows.find((r) => r.kind === "time_avg" && r.forecaster === u);

// کارشناس amini، نسخه‌ی ۱: خطا، داخل بازه، خط مبنا ۱۷۰ (آخرین مقدار شناخته‌شده‌ی ۵ اوت)
const v1 = ver("human:amini", 1);
assert.equal(v1.outcome, A);
near(v1.abs_rel_err, 2.22 / A, 1e-4);
assert.equal(v1.inside, true);
assert.equal(v1.surprise, 0);
assert.equal(v1.baseline.value, 170);
near(v1.baseline.abs_rel_err, 7.78 / A, 1e-4);
near(v1.skill_vs_baseline, 1 - (2.22 / A) / (7.78 / A), 1e-3);
assert.ok(v1.skill_vs_baseline > 0.7, "از خط مبنا بهتر");
// نسخه‌ی ۲ (۵ سپتامبر): خط مبنا ۱۷۶ (مقدار ۳۱ اوت) که بهتر از پیش‌بینی ۱۷۵ بود ← مهارت منفی
const v2 = ver("human:amini", 2);
assert.equal(v2.baseline.value, 176);
near(v2.skill_vs_baseline, 1 - (2.78 / A) / (1.78 / A), 1e-3);
assert.ok(v2.skill_vs_baseline < 0, "گاهی به‌روزرسانی از حدس ساده بدتر است و همین گزارش می‌شود");
// میانگین زمانی: نسخه‌ی ۱ از ۵ اوت تا ۵ سپتامبر (۳۱ روز)، نسخه‌ی ۲ از ۵ سپتامبر تا مهلت قفل ۲۷ سپتامبر ۲۰:۳۰ (۲۲٫۵۶۲۵ روز)
const w1 = 31, w2 = 22.5625;
near(v1.weight_share, w1 / (w1 + w2), 1e-3);
const a = avg("human:amini");
near(a.abs_rel_err, (w1 * (2.22 / A) + w2 * (2.78 / A)) / (w1 + w2), 1e-4);
near(a.skill_vs_baseline, (w1 * v1.skill_vs_baseline + w2 * v2.skill_vs_baseline) / (w1 + w2), 1e-3);
assert.equal(a.inside, 1);
assert.equal(a.n_versions, 2);
near(a.steps.mean, 5 / 180, 1e-4); assert.equal(a.steps.n, 1);
// کارشناس kasrayi: خارج بازه ← غافلگیری بزرگ و مهارت بسیار منفی
const k = avg("human:kasrayi");
assert.equal(k.inside, 0);
near(k.surprise, (A - 160) / 20, 1e-3);
assert.ok(k.skill_vs_baseline < -2);
// مغز: در لحظه‌ی ثبت (۲ اوت) هیچ مقداری در سری نبود ← خط مبنا ندارد، مهارت null (نه صفر)
const br = rows.find((r) => r.kind === "time_avg" && r.forecaster.startsWith("brain:"));
assert.equal(br.skill_vs_baseline, null);
assert.equal(br.inside, 1);
// ردیف پیش‌بینی‌ها outcome/score/surprise ندارند (فقط جزء سنجش و فقط در scores.jsonl)
for (const p of S.currentRows("predictions").values()) assert.ok(!("outcome" in p) && !("score" in p) && !("surprise" in p));

// ------------------------------------------------------------------ idempotent و تغییر مقدار واقعی
const file = path.join(S.getBrainDir(), "scores.jsonl");
const before1 = fs.readFileSync(file, "utf-8");
const r2 = W.runScoring({ now: t("2026-12-01T00:00:00Z") });
assert.deepEqual([r2.written, r2.changed, r2.unchanged], [0, 0, 7], "اجرای دوباره = بدون تغییر");
assert.equal(fs.readFileSync(file, "utf-8"), before1, "هیچ بایتی اضافه نشد");
priceDays.push({ date: "2026-11-27", records: [rec(179, "2026-09")] }); // منبع مقدار را اصلاح کرد
writePrices(priceDays);
const r3 = W.runScoring({ now: t("2026-12-01T00:00:00Z") });
assert.equal(r3.changed, 7);
assert.ok(fs.readFileSync(file, "utf-8").startsWith(before1), "فقط‌افزودنی");
const all = S.currentRows("scores");
assert.equal([...all.values()].filter((r) => r.recorded_to).length, 7, "نمره‌های قبلی بسته شدند، پاک نشدند");
assert.equal(R.readScores().find((r) => r.kind === "version" && r.forecaster === "human:amini" && r.revision_no === 1).outcome, 179);
assert.equal(R.readScores().find((r) => r.kind === "version" && r.forecaster === "human:amini" && r.revision_no === 1).supersedes != null, true);

// ------------------------------------------------------------------ منبع محرمانه: فروش داخلی (ایران)
F.ensureRound("2026-09", { now: t("2026-09-02T07:00:00Z") });
const qi = "2026-09:iran_food_fob";
const firm = (extra) => ({ stage: "firm", grade: "خوراکی", incoterm: "FOB", currency: "USD", buyer: "راز", country: "عراق", ...extra });
Sales.saveSalesSnapshot({ asOf: "2026-09-08", rows: [firm({ tons: 200, price: 245, date: "2026-09-03" }), firm({ tons: 50, price: 100, date: "2026-09-04", stage: "quote" })] });
Sales.saveSalesSnapshot({ asOf: "2026-11-10", rows: [
  firm({ tons: 100, price: 240, date: "2026-10-12" }),
  firm({ tons: 300, price: 260, date: "2026-10-20", incoterm: "EXW" }),
  firm({ tons: 999, price: 900, date: "2026-10-21", incoterm: "CIF" }),   // اینکوترمز نامعتبر
  firm({ tons: 999, price: 900, date: "2026-10-22", stage: "quote" }),    // فقط پیشنهاد
  firm({ tons: 999, price: 900, date: "2026-10-23", grade: "صنعتی" }),     // گرید دیگر
  firm({ tons: 999, price: 900, date: "2026-11-02" }),                     // ماه دیگر
  firm({ tons: 999, price: null, date: "2026-10-24" }),                    // بدون قیمت
] });
assert.ok(F.submitForecast({ username: "amini", roundId: "2026-09", questionId: qi, point: 250, lo: 235, hi: 265 }, { now: t("2026-09-10T07:00:00Z") }).ok);
const r4 = W.runScoring({ now: t("2026-11-30T00:00:00Z") });
assert.equal(r4.written, 2);
const ir = R.readScores().find((r) => r.kind === "version" && r.question_id === qi);
assert.equal(ir.outcome, 255, "میانگین وزنی (۱۰۰×۲۴۰ + ۳۰۰×۲۶۰) ÷ ۴۰۰ فقط از ردیف‌های واجد شرایط");
assert.equal(ir.baseline.value, 245, "خط مبنا: میانگین ماه جاری در آخرین گزارش پیش از ثبت");
near(ir.skill_vs_baseline, 1 - (5 / 255) / (10 / 255), 1e-3);
assert.ok(!/راز|buyer|عراق/.test(fs.readFileSync(file, "utf-8")), "نام مشتری/مقصد هرگز وارد scores نمی‌شود");
// گزارش فروش کهنه / بدون پایان ماه
assert.match(T.readTruth(F.getRound("2026-09").questions.find((x) => x.id === qi), t("2027-01-30T00:00:00Z")).reason, /کهنه/);
Sales.deleteSalesSnapshot("2026-11-10");
assert.match(T.readTruth(F.getRound("2026-09").questions.find((x) => x.id === qi), t("2026-10-20T00:00:00Z")).reason, /پیش از پایان ماه/);

// ------------------------------------------------------------------ دید هر کاربر (۱۱-۴)
const seenBy = (user, isAdmin) => [...new Set(R.visibleScores({ username: user, isAdmin }).map((r) => r.forecaster))].sort();
assert.deepEqual(seenBy("amini", false), ["human:amini"], "کارشناس فقط خودش");
assert.deepEqual(seenBy("Kasrayi", false), ["human:kasrayi"]);
assert.deepEqual(seenBy("rezazadeh", false), [], "کسی که پیش‌بینی نداشته هیچ‌چیز نمی‌بیند");
const adminSees = seenBy("admin", true);
assert.ok(adminSees.includes("human:amini") && adminSees.includes("human:kasrayi") && adminSees.some((f) => f.startsWith("brain:")), "مدیر همه (و مغز)");
const sumA = R.summarize(R.visibleScores({ username: "amini", isAdmin: false }));
assert.equal(sumA.length, 1);
assert.equal(sumA[0].n_questions, 2);
assert.equal(sumA[0].revisions, 1);
assert.equal(sumA[0].coverage, 1);
const sumAll = R.summarize(R.readScores());
assert.equal(sumAll.length, 3);
assert.equal(sumAll.find((s) => s.forecaster.startsWith("brain:")).n_with_baseline, 0);

// ------------------------------------------------------------------ جداسازی: مغز نمی‌تواند نمره بنویسد یا تغییر دهد
assert.throws(() => S.putRow("scores", { id: "x", natural_key: "x" }), /جزء سنجش/);
assert.throws(() => S.appendEvent("scores", { op: "put", row: { id: "y" } }), /جزء سنجش/);
assert.throws(() => S.closeRow("scores", "any", { reason: "hack" }), /جزء سنجش/);
const lib = path.join(process.cwd(), "lib", "brain2");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const brainFiles = walk(lib).filter((f) => /\.jsx?$/.test(f) && !f.includes(`${path.sep}scoring${path.sep}`) && !f.endsWith("scoringAuto.js") && !f.endsWith("store.js"));
assert.ok(brainFiles.length >= 10);
const FORBIDDEN = /scoring\/writer|scoring\/truth|appendScoreEvent|salesStore|runScoring/;
for (const f of brainFiles) assert.ok(!FORBIDDEN.test(fs.readFileSync(f, "utf-8")), `${path.basename(f)} به نویسنده‌ی سنجش یا منبع محرمانه دسترسی دارد`);
for (const rel of ["forecasts/route.js", "forecasts/admin/route.js", "memory/route.js"]) {
  assert.ok(!FORBIDDEN.test(fs.readFileSync(path.join(process.cwd(), "app", "api", "brain", rel), "utf-8")), `${rel} نباید به نویسنده‌ی سنجش برسد`);
}
// فقط scoringAuto.js و scoring/* نویسنده را import می‌کنند
const writers = walk(path.join(process.cwd(), "lib")).concat(walk(path.join(process.cwd(), "app"))).filter((f) => /\.jsx?$/.test(f) && /from\s+["'][^"']*scoring\/writer/.test(fs.readFileSync(f, "utf-8")));
assert.deepEqual(writers.map((f) => path.basename(f)).sort(), ["scoringAuto.js"], "تنها واردکننده‌ی نویسنده‌ی نمره: زمان‌بند سنجش");

fs.rmSync(tmp, { recursive: true, force: true });
console.log("✔ تست جزء سنجش مغز (مرحله‌ی ۴) گذشت");

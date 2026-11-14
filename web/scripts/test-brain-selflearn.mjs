// تست یادگیری خودکار پیش‌بین کشور (۱۰-ب، بدون تأیید انسان): کالبدشکافی چندزاویه، قاعده‌ی کلیِ معتبر (نه جابه‌جایی کور/نام کشور/رقم)،
// نسخه‌ی تازه، سنجش روی کشورهای دیده‌نشده (نیمه‌ی مقابل)، فعال‌شدن فقط در صورت بهبود، بایگانی نسخه‌ی قبل، توقف با plateau.
//   node --import ./scripts/alias-loader.mjs scripts/test-brain-selflearn.mjs
import assert from "node:assert/strict";
import { fakeModel, setupEnv } from "./_selflearn-fixture.mjs";

setupEnv("ok");
const Sch = await import("../lib/brain2/schema.js");
const S = await import("../lib/brain2/store.js");
const SR = await import("../lib/brain2/scoring/read.js");
const Dom = await import("../lib/brain2/domain/baking-soda/countryBacktest.js");
const BT = await import("../lib/brain2/learning/countryBacktest.js");
const CM = await import("../lib/brain2/learning/countryMethod.js");
const SL = await import("../lib/brain2/learning/countrySelfLearning.js");
Sch.ensureRepos();

const GOOD_RULE = "به کشورهای هم‌درآمد و هم‌جمعیت بیش از میانگین همه‌ی کشورها اعتماد کن";
const MARK = "هم‌درآمد و هم‌جمعیت";
const names = Dom.loadCountryTable().map((r) => r.country);

// ------------------------------------------------------------------ قاعده‌ی کلیِ معتبر
assert.equal(SL.badRule(GOOD_RULE, names), null);
assert.match(SL.badRule("برآورد را همیشه ۲۰٪ پایین‌تر بگیر برای همه", names), /درصدی/);
assert.match(SL.badRule("حدس اولیه را بیست درصد بالاتر بگیر و تعدیل کن", names), /درصدی|حاوی/);
assert.match(SL.badRule("برای عراق جداگانه تعدیل کن و محتاط باش", names), /نام کشور/);
assert.match(SL.badRule("همیشه عدد 123 را در نظر بگیر و تعدیل کن", names), /رقم/);
assert.match(SL.badRule("کوتاه", names), /کوتاه/);

// ------------------------------------------------------------------ نیمه‌ها و کشورهای مقایسه‌ای
const all = Dom.loadCountryTable().map((r) => r.country);
const f0 = all.filter((c) => SL.foldOf(c, all) === 0), f1 = all.filter((c) => SL.foldOf(c, all) === 1);
assert.ok(f0.length >= 5 && f1.length >= 5 && f0.length + f1.length === all.length);
assert.ok(f0.every((c) => !f1.includes(c)));
const uae = Dom.loadCountryTable().find((r) => r.country === "امارات");
const others = Dom.loadCountryTable().filter((r) => r.country !== "امارات");
assert.equal(CM.selectComparables(uae, others, { mode: "all" }).length, others.length);
const near = CM.selectComparables(uae, others, { mode: "nearest", k: 4 });
assert.equal(near.length, 4);
assert.ok(!near.some((r) => r.country === "امارات"));
// تصمیم پذیرش
const cfg = SL.countryLearningConfig();
assert.equal(SL.decide({ pairs: 2, better: 2, worse: 0, err_current: 0.5, err_candidate: 0.1 }, cfg).accept, false, "نمونه کم");
assert.equal(SL.decide({ pairs: 10, better: 5, worse: 5, err_current: 0.5, err_candidate: 0.49 }, cfg).accept, false, "بهبود ناچیز");
assert.equal(SL.decide({ pairs: 10, better: 3, worse: 7, err_current: 0.5, err_candidate: 0.3 }, cfg).accept, false, "بدتر بیشتر از بهتر");
assert.equal(SL.decide({ pairs: 10, better: 8, worse: 2, err_current: 0.5, err_candidate: 0.3 }, cfg).accept, true);

// ------------------------------------------------------------------ حلقه‌ی کامل با مدل ساختگی
const diagCalls = [], reviseCalls = [], predictCalls = [];
const generate = fakeModel({ Dom, goodMarker: MARK, goodRule: GOOD_RULE, diagCalls, reviseCalls, predictCalls });
const logs = [];
const sum = await SL.runSelfImprovement({ generate, model: "fake", now: new Date("2026-11-20T00:00:00Z"), log: (m) => logs.push(m) });

assert.equal(sum.started_with, "v1");
assert.equal(sum.failed_runs.length, 0);
assert.equal(sum.promoted, 1, "فقط نسخه‌ی اول بهبود داد؛ بقیه‌ی دورها بدون خطای بزرگ");
const it1 = sum.iterations[0];
assert.equal(it1.outcome, "promoted");
assert.equal(it1.candidate, "v2");
assert.ok(it1.train.every((c) => !it1.test.includes(c)), "آزمون روی کشورهایی است که از خطایشان درس نگرفته");
assert.ok(it1.comparison.pairs >= 4);
assert.ok(it1.comparison.err_candidate < it1.comparison.err_current);
assert.match(it1.reason, /کشورهای دیده‌نشده/);
assert.ok(sum.final.mean_abs_rel_err < sum.initial.mean_abs_rel_err, "خطای نسبی کل کم شد");
assert.ok(sum.iterations.at(-1).outcome === "no_fixes", "وقتی خطای بزرگ نمانده، اصلاحی نمی‌خواهد");

// نسخه‌ها: v1 بایگانی، v2 فعال با قاعده‌ی معتبر و فقط آن (قاعده‌ی دارای نام کشور/رقم/تکراری حذف شد)
const ms = CM.countryMethodRows();
assert.equal(CM.activeCountryMethod().version, "v2");
assert.equal(ms.find((m) => m.version === "v1").status, "بایگانی", "نسخه‌ی قبل پاک نمی‌شود، بایگانی می‌شود");
const v2 = ms.find((m) => m.version === "v2");
assert.deepEqual(v2.rules, [GOOD_RULE]);
assert.deepEqual(v2.comparables, { mode: "nearest", k: 6 });
assert.deepEqual(v2.derived_from, it1.train);
assert.ok(v2.backtest_score.held_out_countries.every((c) => !v2.derived_from.includes(c)));
assert.ok(S.readEvents("methods").some((e) => e.op === "put" && e.row.natural_key === "method|country|v2" && e.row.status === "آزمایشی"), "تاریخچه: آزمایشی ← فعال");

// پیش‌بین واقعاً با قاعده اجرا شد
assert.ok(predictCalls.some((p) => p.includes(MARK)) && predictCalls.some((p) => !p.includes(MARK)));
// کالبدشکافی چندزاویه ذخیره شد: پاسخ پنج زاویه + علت ریشه‌ای؛ جابه‌جایی کور رد و ثبت شد
const ov = SL.countryLearningOverview();
assert.ok(ov.autopsies.length >= 5);
assert.ok(ov.autopsies.every((a) => a.answers && a.answers.info && a.answers.rule && a.answers.method && a.answers.country_factor && a.answers.calibration));
assert.ok(ov.autopsies.some((a) => a.rejected && /درصدی/.test(a.rejected)), "قاعده‌ی «۲۰٪ پایین‌تر» رد شد");
assert.ok(ov.autopsies.some((a) => a.root_cause_fa && /قاعده/.test(a.root_cause_fa)));
assert.ok(ov.autopsies.some((a) => /ناشناخته|قابل‌دانستن/.test(a.root_cause_fa || "")), "علت ناشناختنی هم ثبت شد (بدون قاعده)");
assert.ok(reviseCalls.length >= 1 && reviseCalls[0].includes(GOOD_RULE));
assert.ok(logs.length > 5);

// جدا از نمره‌ی زنده و دفتر پیش‌بینی
assert.deepEqual(SR.readScores(), []);
assert.equal(S.readEvents("predictions").length, 0);
// آمار اصلی از روش فعال است
const s = BT.summarizeBacktests();
assert.ok(s.rows.every((r) => r.method_version === "v2"));

console.log("test-brain-selflearn: همه‌ی بررسی‌ها گذشت");

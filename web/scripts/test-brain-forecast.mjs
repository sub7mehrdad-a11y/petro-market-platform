// تست مرحله‌ی ۰ مغز (دفتر پیش‌بینی، پروتکل ۰٫۲): دید کور، به‌روزرسانی تا مهلت قفل (نسخه‌ی تازه، نه ویرایش)، فقط‌افزودنی بودن،
// بازبینی دوره‌ای مغز، محرمانگی ورودی مغز، دسترسی مدیر، حساب‌های کاربری. بدون شبکه و بدون هیچ داده‌ی واقعی. اجرا (از پوشه‌ی web):
//   node --import ./scripts/alias-loader.mjs scripts/test-brain-forecast.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "brain-"));
process.env.BRAIN_STATE_DIR = tmp;
process.env.SESSION_SECRET = "test-secret";
delete process.env.GEMINI_API_KEY_BRAIN;
delete process.env.BRAIN_ADMINS;

const F = await import("../lib/brain2/forecast.js");
const S = await import("../lib/brain2/store.js");
const BF = await import("../lib/brain2/domain/baking-soda/brainForecaster.js");
const A = await import("../lib/brain2/access.js");
const Auto = await import("../lib/brain2/forecastAuto.js");
const auth = await import("../lib/auth.js");

// --- پیکربندی ---
const cfg = F.loadConfig();
assert.deepEqual(cfg.questions.map((x) => x.key), ["china_fob", "iran_food_fob"], "فقط منطقه‌هایی که منبع واقعیت ماهانه دارند");
assert.equal(cfg.cycle.lock_days_before_target_end, 3, "مهلت قفل: ۳ روز پیش از پایان ماه هدف");
const okCycle = { horizon_months: 1, lock_days_before_target_end: 3 };
const baseQ = { key: "x", region_fa: "a", grade_fa: "b", price_type: "FOB", package_fa: "p", unit: "USD/t" };
assert.throws(() => F.validateConfig({ cycle: okCycle, questions: [{ ...baseQ, truth: {} }] }), /منبع واقعیت/);
assert.throws(() => F.validateConfig({ cycle: okCycle, questions: [{ ...baseQ, truth: { source_id: "s", kind: "k" } }] }), /lag_days/);
assert.throws(() => F.validateConfig({ cycle: okCycle, questions: [{ ...baseQ, price_type: "XYZ", truth: { source_id: "s", kind: "k", lag_days: 1, max_staleness_days: 1 } }] }), /FOB یا CIF/);
assert.throws(() => F.validateConfig({ cycle: { horizon_months: 1 }, questions: [{ ...baseQ, truth: { source_id: "s", kind: "k", lag_days: 1, max_staleness_days: 1 } }] }), /مهلت قفل/);

// --- زمان ---
assert.equal(F.tehranClock(new Date("2026-11-06T07:00:00Z")).date, "2026-11-06");
assert.equal(F.tehranClock(new Date("2026-11-06T07:00:00Z")).hour, 10);
assert.equal(F.tehranClock(new Date("2026-11-30T21:00:00Z")).month, "2026-12", "نیمه‌شب تهران ماه را جابه‌جا می‌کند");
assert.equal(F.addMonths("2026-12", 1), "2027-01");
assert.equal(F.endOfMonth("2026-02"), "2026-02-28");
assert.equal(F.addDaysIso("2026-12-31", 60), "2027-03-01");
assert.equal(F.lockAtFor("2026-12", 3), "2026-12-28T20:30:00.000Z", "پایان روز ۲۸ دی‌ماه میلادی به وقت تهران");
assert.equal(F.lockAtFor("2026-02", 3), "2026-02-25T20:30:00.000Z");

// --- دور ---
const t0 = new Date("2026-11-06T07:00:00Z");
const r1 = F.ensureRound("2026-11", { by: "admin", now: t0 });
assert.equal(r1.created, true);
assert.equal(r1.round.target_month, "2026-12");
assert.equal(r1.round.lock_at, "2026-12-28T20:30:00.000Z");
assert.equal(r1.round.closes_at, r1.round.lock_at);
assert.equal(r1.round.questions.length, cfg.questions.length);
const q = r1.round.questions.find((x) => x.key === "china_fob");
assert.equal(q.resolves_at, "2027-03-01", "سررسید = پایان ماه هدف + lag_days (60)");
assert.equal(q.lock_at, r1.round.lock_at);
assert.ok(q.target.truth_source.source_id && q.target.definition_fa.includes("فوب"));
assert.equal(F.ensureRound("2026-11", { now: t0 }).created, false, "باز کردن دوباره چیزی نمی‌سازد");
assert.equal(F.isRoundOpen(r1.round, new Date("2026-12-28T20:00:00Z")), true);
assert.equal(F.isRoundOpen(r1.round, new Date("2026-12-28T21:00:00Z")), false);

// دور قدیمی (پیش از نسخه‌ی ۲ تنظیمات) lock_at ندارد و از ماه هدف محاسبه می‌شود
const legacy = S.putRow("rounds", S.stampRow("round", { round_id: "2026-09", target_month: "2026-10", opened_at: "2026-09-02T07:00:00.000Z", closes_at: "2026-09-09T07:00:00.000Z", questions: [], valid_from: "2026-09-02T07:00:00.000Z" }, "2026-09-02T07:00:00.000Z"));
assert.equal(F.roundLockAt(legacy), "2026-10-28T20:30:00.000Z");
assert.equal(F.isRoundOpen(legacy, new Date("2026-10-20T00:00:00Z")), true);
assert.equal(F.isRoundOpen(legacy, new Date("2026-10-30T00:00:00Z")), false);

const base = { roundId: "2026-11", questionId: q.id, point: 180, lo: 165, hi: 200 };
const tIn = new Date("2026-11-08T07:00:00Z");

// --- ثبت انسان: اعتبارسنجی ---
assert.equal(F.submitForecast({ username: "amini", ...base, lo: 190 }, { now: tIn }).code, "invalid", "کف > عدد");
assert.equal(F.submitForecast({ username: "amini", ...base, point: "abc" }, { now: tIn }).code, "invalid");
assert.equal(F.submitForecast({ username: "amini", ...base, lo: 10 }, { now: tIn }).code, "invalid", "زیر حداقل مجاز");
assert.equal(F.submitForecast({ username: "amini", ...base, lo: 60, hi: 600, point: 180 }, { now: tIn }).code, "invalid", "بازه‌ی خیلی پهن");
assert.equal(F.submitForecast({ username: "amini", ...base, lo: 180, hi: 180 }, { now: tIn }).code, "invalid", "بازه‌ی صفر");
assert.equal(F.submitForecast({ username: "amini", ...base, questionId: "2026-11:nope" }, { now: tIn }).code, "no_question");
assert.equal(F.submitForecast({ username: "amini", ...base, roundId: "1999-01" }, { now: tIn }).code, "no_round");
assert.equal(F.submitForecast({ username: "amini", ...base, rationale: "x".repeat(700) }, { now: tIn }).code, "invalid");
assert.equal(F.predictionsOf("2026-11").length, 0, "ثبت ناموفق چیزی ننوشته است");

// --- دید کور ---
const calls = [];
const gen = async ({ system, input }) => { calls.push({ system, input }); return JSON.stringify({ point: 175, lo: 160, hi: 195, rationale: "از آخرین مقدار شروع، بدون رویداد تعدیل نشد." }); };
const rep = await BF.runBrainForecasts("2026-11", { generate: gen, digest: "# خلاصه‌ی جامع آزمایشی\nقیمت مرجع 250", priceDays: [], now: t0 });
assert.equal(rep.results.filter((r) => r.status === "recorded").length, cfg.questions.length);
assert.equal(F.predictionsOf("2026-11").filter((p) => p.forecaster.startsWith("brain:")).length, cfg.questions.length);

let vA = F.viewRound({ username: "amini", isAdmin: false, roundId: "2026-11", now: tIn });
let qa = vA.questions.find((x) => x.id === q.id);
assert.equal(qa.brain, null, "پیش از ثبت خودش، مغز دیده نمی‌شود");
assert.equal(qa.brain_ready, true, "فقط هست/نیست، بدون مقدار");
assert.equal(vA.can_submit, true);
assert.equal(vA.lock_at, "2026-12-28T20:30:00.000Z");
assert.ok(!JSON.stringify(vA).includes("175"), "مقدار مغز در خروجی سرور نیست (نه فقط پنهان در رابط)");
assert.ok(!JSON.stringify(vA).includes("rationale\":\"از آخرین"));

const ok = F.submitForecast({ username: "amini", ...base, rationale: "روند ثابت" }, { now: tIn });
assert.ok(ok.ok);
assert.equal(ok.revision, false);
assert.equal(ok.prediction.blind, true);
assert.equal(ok.prediction.forecaster, "human:amini");
assert.equal(ok.prediction.revision_no, 1);
assert.equal(ok.prediction.revision_of, null);
assert.equal(ok.prediction.kind, "forecast");
assert.equal(ok.prediction.outcome, undefined, "outcome/score را مغز و دفتر نمی‌نویسند");
assert.equal(ok.prediction.score, undefined);
assert.equal(ok.prediction.surprise, undefined);
assert.equal(ok.prediction.resolves_at, "2027-03-01");
assert.equal(ok.prediction.lock_at, "2026-12-28T20:30:00.000Z");
assert.equal(ok.prediction.target.truth_source.source_id, "procurement_resource_china_fob");

vA = F.viewRound({ username: "amini", isAdmin: false, roundId: "2026-11", now: tIn });
qa = vA.questions.find((x) => x.id === q.id);
assert.equal(qa.brain.forecast.point, 175, "بعد از ثبت خودش، مغز دیده می‌شود");
assert.equal(qa.brain_updated, false);
assert.equal(qa.mine.forecast.point, 180);
assert.deepEqual(qa.history, []);
const qOther = vA.questions.find((x) => x.id !== q.id);
assert.equal(qOther.brain, null, "مغز فقط برای همان پرسش باز می‌شود، نه همه‌ی پرسش‌ها");

// --- به‌روزرسانی = نسخه‌ی تازه، نه ویرایش ---
assert.equal(F.submitForecast({ username: "amini", ...base, point: 170, lo: 160, hi: 190 }, { now: tIn }).code, "need_reason", "بدون دلیل نسخه‌ی تازه نمی‌شود");
assert.equal(F.submitForecast({ username: "amini", ...base, point: 170, lo: 160, hi: 190, revisionReason: "ab" }, { now: tIn }).code, "need_reason");
assert.equal(F.submitForecast({ username: "amini", ...base, revisionReason: "بدون تغییر عددی" }, { now: tIn }).code, "unchanged", "اعداد یکسان بدون confirm رد می‌شود");
assert.equal(F.submitForecast({ username: "AMINI", ...base, point: 170, lo: 160, hi: 190 }, { now: tIn }).code, "need_reason", "حروف بزرگ/کوچک نام کاربری فرقی نمی‌کند");
assert.equal(F.predictionsOf("2026-11").filter((p) => p.forecaster === "human:amini").length, 1, "رد شده‌ها چیزی ننوشتند");
assert.ok(!Object.keys(F).some((k) => /^(update|delete|edit|remove|overwrite|set)/i.test(k)), "هیچ تابعی برای ویرایش/حذف وجود ندارد");
assert.ok(!Object.keys(S).some((k) => /^(delete|remove|update|overwrite|truncate|rewrite)/i.test(k)));

// --- بازبینی دوره‌ای مغز (هر ۷ روز؛ فقط با دلیل و تغییر معنادار) ---
const rcalls = [];
const mkGen = (obj) => async ({ system, input }) => { rcalls.push({ system, input }); if (obj instanceof Error) throw obj; return JSON.stringify(obj); };
const t1 = new Date("2026-11-10T07:00:00Z"); // فقط ۴ روز بعد از پیش‌بینی اول
const notDue = await BF.runBrainReviews("2026-11", { generate: mkGen({ changed: false }), digest: "d2", now: t1 });
assert.ok(notDue.results.every((r) => r.status === "not_due") && rcalls.length === 0, "پیش از سررسید بازبینی مدل صدا زده نمی‌شود");

const t2 = new Date("2026-11-15T07:00:00Z");
const rv1 = await BF.runBrainReviews("2026-11", { generate: mkGen({ changed: true, point: 200, lo: 185, hi: 220, reason: "رویداد آزمایشی: افزایش قیمت" }), digest: "d2", now: t2 });
assert.ok(rv1.ok && rv1.results.every((r) => r.status === "revised"), JSON.stringify(rv1));
const brainVersions = F.versionsOf("2026-11", q.id, F.isBrain);
assert.equal(brainVersions.length, 2);
assert.equal(brainVersions[1].revision_of, brainVersions[0].id);
assert.equal(brainVersions[1].revision_no, 2);
assert.equal(brainVersions[1].revision_reason, "رویداد آزمایشی: افزایش قیمت");
assert.ok(S.currentRows("predictions").get(brainVersions[0].id).recorded_to, "نسخه‌ی قبلی مغز بسته شد، پاک نشد");
assert.equal(F.currentVersion("2026-11", q.id, F.isBrain).forecast.point, 200);
const again = await BF.runBrainReviews("2026-11", { generate: mkGen({ changed: false }), digest: "d2", now: new Date("2026-11-16T07:00:00Z") });
assert.ok(again.results.every((r) => r.status === "not_due"), "بلافاصله بعد از بازبینی دوباره سررسید نیست");

// کاربر تا ثبت دوباره نسخه‌ی تازه‌ی مغز را نمی‌بیند
vA = F.viewRound({ username: "amini", isAdmin: false, roundId: "2026-11", now: t2 });
qa = vA.questions.find((x) => x.id === q.id);
assert.equal(qa.brain_updated, true, "اعلام می‌شود که نسخه‌ی تازه هست");
assert.equal(qa.brain.forecast.point, 175, "همچنان نسخه‌ی قبلی (پیش از ثبت او) را می‌بیند");
assert.ok(!JSON.stringify(vA).includes('"point":200') && !JSON.stringify(vA).includes("رویداد آزمایشی"), "نسخه‌ی تازه‌ی مغز در خروجی سرور نیست");

// نسخه‌ی تازه‌ی کاربر
const t3 = new Date("2026-11-16T07:00:00Z");
const rev = F.submitForecast({ username: "amini", ...base, point: 185, lo: 170, hi: 205, revisionReason: "بعد از خبر افزایش قیمت" }, { now: t3 });
assert.ok(rev.ok && rev.revision);
assert.equal(rev.prediction.revision_no, 2);
assert.equal(rev.prediction.revision_of, ok.prediction.id);
assert.equal(rev.prediction.rationale, "روند ثابت", "توضیح خالی = همان توضیح قبلی");
assert.ok(S.currentRows("predictions").get(ok.prediction.id).recorded_to, "نسخه‌ی قبلی کاربر بسته شد، پاک نشد");
vA = F.viewRound({ username: "amini", isAdmin: false, roundId: "2026-11", now: t3 });
qa = vA.questions.find((x) => x.id === q.id);
assert.equal(qa.mine.forecast.point, 185);
assert.equal(qa.history.length, 1);
assert.equal(qa.history[0].forecast.point, 180);
assert.equal(qa.brain_updated, false);
assert.equal(qa.brain.forecast.point, 200, "بعد از ثبت نسخه‌ی تازه، نسخه‌ی تازه‌ی مغز دیده می‌شود");
assert.equal(qa.brain.revision_no, 2);

// «تأیید بدون تغییر»
const t4 = new Date("2026-11-24T07:00:00Z");
const rv2 = await BF.runBrainReviews("2026-11", { generate: mkGen({ changed: true, point: 210, lo: 195, hi: 230, reason: "رویداد آزمایشی دوم" }), digest: "d3", now: t4 });
assert.ok(rv2.results.every((r) => r.status === "revised"));
vA = F.viewRound({ username: "amini", isAdmin: false, roundId: "2026-11", now: t4 });
assert.equal(vA.questions.find((x) => x.id === q.id).brain_updated, true);
assert.equal(vA.questions.find((x) => x.id === q.id).brain.forecast.point, 200);
const conf = F.submitForecast({ username: "amini", roundId: "2026-11", questionId: q.id, confirm: true }, { now: new Date("2026-11-25T07:00:00Z") });
assert.ok(conf.ok && conf.prediction.no_change === true);
assert.equal(conf.prediction.revision_no, 3);
assert.deepEqual([conf.prediction.forecast.point, conf.prediction.forecast.lo, conf.prediction.forecast.hi], [185, 170, 205], "اعداد همان نسخه‌ی قبلی");
vA = F.viewRound({ username: "amini", isAdmin: false, roundId: "2026-11", now: t4 });
assert.equal(vA.questions.find((x) => x.id === q.id).brain.forecast.point, 210, "بعد از تأیید، مغز تازه دیده می‌شود");

// بازبینی بی‌دلیل یا نامعتبر یا ناموفق نسخه نمی‌سازد
const t5 = new Date("2026-12-02T07:00:00Z");
const nVer = F.predictionsOf("2026-11").length;
const rvSmall = await BF.runBrainReviews("2026-11", { generate: mkGen({ changed: true, point: 210.5, lo: 195, hi: 230, reason: "تغییر خیلی کوچک" }), digest: "d4", now: t5 });
assert.ok(rvSmall.results.every((r) => r.status === "change_too_small"), "تغییر کمتر از آستانه نسخه نمی‌سازد");
const rvNo = await BF.runBrainReviews("2026-11", { generate: mkGen({ changed: false, reason: "چیزی عوض نشده" }), digest: "d4", now: new Date("2026-12-10T07:00:00Z") });
assert.ok(rvNo.results.every((r) => r.status === "unchanged"));
const rvBad = await BF.runBrainReviews("2026-11", { generate: mkGen({ changed: true, point: 100, lo: 150, hi: 120, reason: "نامعتبر" }), digest: "d4", now: new Date("2026-12-18T07:00:00Z") });
assert.ok(rvBad.results.every((r) => r.status === "failed") && !rvBad.ok);
const rvErr = await BF.runBrainReviews("2026-11", { generate: mkGen(new Error("Gemini 503")), digest: "d4", now: new Date("2026-12-18T08:00:00Z"), force: true });
assert.ok(rvErr.results.every((r) => r.status === "failed"));
const rvForce = await BF.runBrainReviews("2026-11", { generate: mkGen({ changed: false }), digest: "d4", now: new Date("2026-12-18T09:00:00Z"), force: true });
assert.ok(rvForce.results.every((r) => r.status === "unchanged"), "force بدون توجه به سررسید بازبینی می‌کند");
assert.equal(F.predictionsOf("2026-11").length, nVer, "هیچ‌کدام نسخه‌ی تازه نساختند");
assert.ok(S.currentRows("reviews").size >= 4, "هر بازبینی موفق ثبت می‌شود");
assert.equal((await BF.runBrainReviews("1999-01", { generate: mkGen({}), digest: "d" })).ok, false);
assert.equal(F.reviseBrainForecast({ roundId: "2026-11", questionId: q.id, point: 300, lo: 280, hi: 320, reason: "x" }, { now: t5 }).ok, false, "بدون دلیل کافی نسخه‌ی مغز ساخته نمی‌شود");

// --- همکار دیگر، مدیر، فقط‌افزودنی ---
const tMid = new Date("2026-11-26T07:00:00Z");
assert.ok(F.submitForecast({ username: "kasrayi", ...base, point: 190, lo: 170, hi: 215 }, { now: tMid }).ok);
assert.ok(F.submitForecast({ username: "admin", ...base, point: 185, lo: 168, hi: 205 }, { now: tMid }).ok);
const vK = F.viewRound({ username: "kasrayi", isAdmin: false, roundId: "2026-11", now: tMid });
assert.ok(!JSON.stringify(vK).includes("human:amini") && !JSON.stringify(vK).includes("human:admin"), "پیش‌بینی همکاران برای کارشناس دیده نمی‌شود");
const vAdminOpen = F.viewRound({ username: "admin", isAdmin: true, roundId: "2026-11", now: tMid });
assert.equal(vAdminOpen.questions.find((x) => x.id === q.id).others.length, 0, "مدیر هم تا مهلت قفل پیش‌بینی بقیه را نمی‌بیند");

const predFile = path.join(tmp, "predictions.jsonl");
const before = fs.readFileSync(predFile, "utf-8");
assert.ok(F.submitForecast({ username: "rezazadeh", roundId: "2026-11", questionId: q.id, point: 181, lo: 170, hi: 200 }, { now: tMid }).ok);
const after = fs.readFileSync(predFile, "utf-8");
assert.ok(after.startsWith(before), "فایل فقط به انتها اضافه می‌شود؛ خط‌های قبلی دست‌نخورده");
assert.ok(F.submitForecast({ username: "rezazadeh", roundId: "2026-11", questionId: q.id, point: 183, lo: 170, hi: 200, revisionReason: "به‌روزرسانی آزمایشی" }, { now: new Date("2026-11-27T07:00:00Z") }).ok);
assert.ok(fs.readFileSync(predFile, "utf-8").startsWith(after), "نسخه‌ی تازه هم فقط اضافه می‌شود");

// --- بعد از مهلت قفل ---
const tClosed = new Date("2026-12-29T00:00:00Z");
assert.equal(F.submitForecast({ username: "newbie", ...base }, { now: tClosed }).code, "closed", "بعد از مهلت ثبت نمی‌شود");
assert.equal(F.submitForecast({ username: "amini", ...base, point: 190, lo: 170, hi: 210, revisionReason: "دیر" }, { now: tClosed }).code, "closed", "به‌روزرسانی هم بعد از قفل ممکن نیست");
assert.equal(F.submitForecast({ username: "amini", roundId: "2026-11", questionId: q.id, confirm: true }, { now: tClosed }).code, "closed");
assert.equal(F.reviseBrainForecast({ roundId: "2026-11", questionId: q.id, point: 215, lo: 200, hi: 230, reason: "دیرهنگام" }, { now: tClosed }).ok, false, "مغز هم بعد از قفل نسخه‌ی تازه نمی‌سازد");
assert.equal((await BF.runBrainReviews("2026-11", { generate: mkGen({ changed: true, point: 300, lo: 280, hi: 320, reason: "x" }), digest: "d", now: tClosed, force: true })).skipped, "locked");
const vAdminClosed = F.viewRound({ username: "admin", isAdmin: true, roundId: "2026-11", now: tClosed });
assert.equal(vAdminClosed.can_submit, false);
const others = vAdminClosed.questions.find((x) => x.id === q.id).others;
assert.equal(others.length, 3, "بعد از قفل، مدیر آخرین نسخه‌ی بقیه را می‌بیند");
const aminiRow = others.find((o) => o.forecaster === "human:amini");
assert.equal(aminiRow.revisions, 2);
assert.equal(aminiRow.revision_no, 3);
assert.equal(others.find((o) => o.forecaster === "human:rezazadeh").forecast.point, 183, "آخرین نسخه، نه اولی");
const vKClosed = F.viewRound({ username: "kasrayi", isAdmin: false, roundId: "2026-11", now: tClosed });
assert.equal(vKClosed.questions.find((x) => x.id === q.id).others.length, 0, "کارشناس هیچ‌وقت پیش‌بینی بقیه را نمی‌بیند");
assert.equal(F.viewRound({ username: "newbie", isAdmin: false, roundId: "2026-11", now: tClosed }).questions.find((x) => x.id === q.id).brain, null, "کسی که ثبت نکرده، مغز را هم نمی‌بیند");
const part = F.participationOf("2026-11");
assert.deepEqual(part["human:amini"], { forecasts: 1, revisions: 2 });
assert.deepEqual(part["human:kasrayi"], { forecasts: 1, revisions: 0 });
assert.deepEqual(part[Object.keys(part).find((k) => k.startsWith("brain:"))], { forecasts: 2, revisions: 4 }, "مغز: ۲ پرسش، هرکدام ۲ نسخه‌ی تازه");

// --- محرمانگی ورودی مغز ---
assert.equal(calls.length, cfg.questions.length);
for (const c of [...calls, ...rcalls]) {
  assert.ok(!/human:|amini|kasrayi|rezazadeh|sales|فروش|قرارداد|مشتری/i.test(c.input), "ورودی مدل شامل پیش‌بینی انسان یا داده‌ی فروش نیست");
}
for (const c of calls) assert.ok(c.input.includes("خلاصه‌ی جامع آزمایشی"));
assert.ok(calls.some((c) => /برای این سری مقدار عمومی/.test(c.input)), "سری محرمانه‌ی ایران مقدار به مدل نمی‌دهد");
assert.ok(rcalls.length > 0 && rcalls.every((c) => c.input.includes("پیش‌بینی قبلی شما")));

// --- خروجی نامعتبر مغز ذخیره نمی‌شود ---
F.ensureRound("2026-12", { now: new Date("2026-12-02T07:00:00Z") });
const bad1 = await BF.runBrainForecasts("2026-12", { generate: async () => "نه JSON", digest: "d", priceDays: [] });
assert.ok(bad1.results.every((r) => r.status === "failed"));
const bad2 = await BF.runBrainForecasts("2026-12", { generate: async () => JSON.stringify({ point: 500, lo: 600, hi: 700, rationale: "" }), digest: "d", priceDays: [] });
assert.ok(bad2.results.every((r) => r.status === "failed"), "کف > عدد رد می‌شود");
assert.equal(F.predictionsOf("2026-12").length, 0);
const bad3 = await BF.runBrainForecasts("2026-12", { generate: async () => { throw new Error("Gemini 503"); }, digest: "d", priceDays: [] });
assert.ok(bad3.results.every((r) => r.status === "failed") && !bad3.ok);
const bad4 = await BF.runBrainForecasts("2026-12", { generate: gen, digest: "", priceDays: [] });
assert.equal(bad4.ok, false, "بدون خلاصه‌ی جامع پیش‌بینی نمی‌گیرد");

// --- آخرین مقدار سری ---
const days = [{ date: "2026-10-01", records: [{ product: "sodium bicarbonate", country_or_region: "China", price_type: "FOB", value: 170, currency: "USD", unit: "mt", source_reported_date: "Sept 2026", source_name: "PR" }] },
  { date: "2026-10-02", records: [{ product: "sodium bicarbonate", country_or_region: "China", price_type: "FOB", value: null }] }];
assert.equal(BF.latestSeriesValue(cfg.questions[0].truth, days).value, 170, "آخرین مقدار غیرخالی");
assert.equal(BF.latestSeriesValue(cfg.questions.find((x) => x.key === "iran_food_fob").truth, days), null, "سری داخلی/محرمانه نشان داده نمی‌شود");

// --- بستن = ردیف می‌ماند ---
S.closeRow("predictions", ok.prediction.id, { reason: "آزمون", by: "t" });
assert.ok(S.currentRows("predictions").get(ok.prediction.id).recorded_to, "بستن = ردیف می‌ماند با recorded_to");

// --- دسترسی ---
assert.equal(A.isBrainAdmin("admin"), true);
assert.equal(A.isBrainAdmin("Admin"), true);
assert.equal(A.isBrainAdmin("amini"), false);
process.env.BRAIN_ADMINS = "boss, admin2";
assert.equal(A.isBrainAdmin("boss"), true);
assert.equal(A.isBrainAdmin("admin"), false, "با تنظیم env فقط همان فهرست مدیر است");
delete process.env.BRAIN_ADMINS;
const req = (token) => ({ cookies: { get: () => (token ? { value: token } : undefined) } });
assert.ok(A.commercialSession(req(auth.createSession({ username: "amini", role: "commercial" }))));
assert.equal(A.commercialSession(req(auth.createSession({ username: "manager", role: "viewer" }))), null, "مشاهده‌گر راه ندارد");
assert.equal(A.commercialSession(req("fake.token")), null);
assert.equal(A.commercialSession(req(null)), null);

// --- حساب‌های کاربری افزوده ---
const { getUsers } = await import("../lib/data.js");
const savedBase = process.env.PLATFORM_USERS_JSON;
process.env.PLATFORM_USERS_JSON = JSON.stringify([{ username: "admin", passwordHash: "x:y", role: "commercial" }, { username: "manager", passwordHash: "x:y", role: "viewer" }]);
process.env.PLATFORM_EXTRA_USERS_JSON = JSON.stringify([{ username: "amini", passwordHash: "a:b", role: "commercial" }, { username: "Manager", passwordHash: "n:n", role: "viewer" }]);
const users = getUsers();
assert.deepEqual(users.map((u) => u.username).sort(), ["Manager", "admin", "amini"], "کاربران افزوده ادغام می‌شوند و نام تکراری جایگزین می‌شود");
assert.equal(users.find((u) => u.username === "Manager").passwordHash, "n:n");
process.env.PLATFORM_EXTRA_USERS_JSON = "not json";
assert.equal(getUsers().length, 2, "env خراب بقیه را خراب نمی‌کند");
delete process.env.PLATFORM_EXTRA_USERS_JSON;
if (savedBase === undefined) delete process.env.PLATFORM_USERS_JSON; else process.env.PLATFORM_USERS_JSON = savedBase;

// --- زمان‌بند ---
const day1Early = await Auto.brainForecastTick({ now: new Date("2027-01-01T04:00:00Z") }); // ۰۷:۳۰ تهران
assert.ok(day1Early.skipped, "روز اول قبل از ساعت تعیین‌شده صبر می‌کند");
assert.equal(F.getRound("2027-01"), null);
const day1Late = await Auto.brainForecastTick({ now: new Date("2027-01-01T08:00:00Z") }); // ۱۱:۳۰ تهران
assert.ok(F.getRound("2027-01"), "دور ماه باز شد");
assert.equal(F.getRound("2027-01").lock_at, "2027-02-25T20:30:00.000Z", "مهلت قفل در دور ثبت می‌شود");
assert.ok(day1Late.brain === "no_key" || Array.isArray(day1Late.brain), "بدون کلید، فقط دور باز می‌شود");
await Auto.brainForecastTick({ now: new Date("2027-02-14T08:00:00Z") });
assert.ok(F.getRound("2027-02"), "اگر سرور وسط ماه بالا آمد، دور همان لحظه باز می‌شود");

// --- محافظ دیسک ---
const saveDir = process.env.BRAIN_STATE_DIR;
const saveEnv = process.env.NODE_ENV;
delete process.env.BRAIN_STATE_DIR; delete process.env.OUTREACH_STATE_DIR; process.env.NODE_ENV = "production";
assert.match(S.brainStorageProblem(), /دیسک دائمی/);
process.env.BRAIN_STATE_DIR = saveDir; process.env.NODE_ENV = saveEnv;
assert.equal(S.brainStorageProblem(), null);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("✔ تست دفتر پیش‌بینی مغز (مرحله‌ی ۰، پروتکل ۰٫۲: به‌روزرسانی تا مهلت قفل) گذشت");

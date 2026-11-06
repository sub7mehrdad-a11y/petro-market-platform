// تست مرحله‌ی ۰ مغز (دفتر پیش‌بینی): دید کور، ویرایش‌ناپذیری، فقط‌افزودنی بودن، محرمانگی ورودی مغز، دسترسی مدیر، حساب‌های کاربری.
// بدون شبکه و بدون هیچ داده‌ی واقعی. اجرا (از پوشه‌ی web):
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
const BF = await import("../lib/brain2/brainForecaster.js");
const A = await import("../lib/brain2/access.js");
const Auto = await import("../lib/brain2/forecastAuto.js");
const auth = await import("../lib/auth.js");

// --- پیکربندی ---
const cfg = F.loadConfig();
assert.deepEqual(cfg.questions.map((x) => x.key), ["china_fob", "iran_food_fob"], "فقط منطقه‌هایی که منبع واقعیت ماهانه دارند");
assert.throws(() => F.validateConfig({ cycle: { submit_days: 7, horizon_months: 1 }, questions: [{ key: "x", region_fa: "a", grade_fa: "b", price_type: "FOB", package_fa: "p", unit: "USD/t", truth: {} }] }), /منبع واقعیت/);
assert.throws(() => F.validateConfig({ cycle: { submit_days: 7, horizon_months: 1 }, questions: [{ key: "x", region_fa: "a", grade_fa: "b", price_type: "FOB", package_fa: "p", unit: "USD/t", truth: { source_id: "s", kind: "k" } }] }), /lag_days/);
assert.throws(() => F.validateConfig({ cycle: { submit_days: 7, horizon_months: 1 }, questions: [{ key: "x", region_fa: "a", grade_fa: "b", price_type: "XYZ", package_fa: "p", unit: "USD/t", truth: { source_id: "s", kind: "k", lag_days: 1, max_staleness_days: 1 } }] }), /FOB یا CIF/);

// --- زمان ---
assert.equal(F.tehranClock(new Date("2026-11-06T07:00:00Z")).date, "2026-11-06");
assert.equal(F.tehranClock(new Date("2026-11-06T07:00:00Z")).hour, 10);
assert.equal(F.tehranClock(new Date("2026-11-30T21:00:00Z")).month, "2026-12", "نیمه‌شب تهران ماه را جابه‌جا می‌کند");
assert.equal(F.addMonths("2026-12", 1), "2027-01");
assert.equal(F.endOfMonth("2026-02"), "2026-02-28");
assert.equal(F.addDaysIso("2026-12-31", 60), "2027-03-01");

// --- دور ---
const t0 = new Date("2026-11-06T07:00:00Z");
const r1 = F.ensureRound("2026-11", { by: "admin", now: t0 });
assert.equal(r1.created, true);
assert.equal(r1.round.target_month, "2026-12");
assert.equal(r1.round.questions.length, cfg.questions.length);
const q = r1.round.questions.find((x) => x.key === "china_fob");
assert.equal(q.resolves_at, "2027-03-01", "سررسید = پایان ماه هدف + lag_days (60)");
assert.ok(q.target.truth_source.source_id && q.target.definition_fa.includes("فوب"));
assert.equal(F.ensureRound("2026-11", { now: t0 }).created, false, "باز کردن دوباره چیزی نمی‌سازد");
assert.equal(new Date(r1.round.closes_at).getTime() - t0.getTime(), 7 * 86400000);

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
// مغز از قبل پیش‌بینی دارد (پنهان)
const calls = [];
const gen = async ({ system, input }) => { calls.push({ system, input }); return JSON.stringify({ point: 175, lo: 160, hi: 195, rationale: "از آخرین مقدار شروع، بدون رویداد تعدیل نشد." }); };
const rep = await BF.runBrainForecasts("2026-11", { generate: gen, digest: "# خلاصه‌ی جامع آزمایشی\nقیمت مرجع 250", priceDays: [], now: t0 });
assert.equal(rep.results.filter((r) => r.status === "recorded").length, cfg.questions.length);
assert.equal(F.predictionsOf("2026-11").filter((p) => p.forecaster.startsWith("brain:")).length, cfg.questions.length);

let vA = F.viewRound({ username: "amini", isAdmin: false, roundId: "2026-11", now: tIn });
let qa = vA.questions.find((x) => x.id === q.id);
assert.equal(qa.brain, null, "پیش از ثبت خودش، مغز دیده نمی‌شود");
assert.equal(qa.brain_ready, true, "فقط هست/نیست، بدون مقدار");
assert.ok(!JSON.stringify(vA).includes("175"), "مقدار مغز در خروجی سرور نیست (نه فقط پنهان در رابط)");
assert.ok(!JSON.stringify(vA).includes("rationale\":\"از آخرین"));

const ok = F.submitForecast({ username: "amini", ...base, rationale: "روند ثابت" }, { now: tIn });
assert.ok(ok.ok);
assert.equal(ok.prediction.blind, true);
assert.equal(ok.prediction.forecaster, "human:amini");
assert.equal(ok.prediction.outcome, undefined, "outcome/score را مغز و دفتر نمی‌نویسند");
assert.equal(ok.prediction.score, undefined);
assert.equal(ok.prediction.resolves_at, "2027-03-01");
assert.equal(ok.prediction.target.truth_source.source_id, "procurement_resource_china_fob");

vA = F.viewRound({ username: "amini", isAdmin: false, roundId: "2026-11", now: tIn });
qa = vA.questions.find((x) => x.id === q.id);
assert.equal(qa.brain.forecast.point, 175, "بعد از ثبت خودش، مغز دیده می‌شود");
assert.equal(qa.mine.forecast.point, 180);
const qOther = vA.questions.find((x) => x.id !== q.id);
assert.equal(qOther.brain, null, "مغز فقط برای همان پرسش باز می‌شود، نه همه‌ی پرسش‌ها");

// ویرایش‌ناپذیری و تکرار
assert.equal(F.submitForecast({ username: "amini", ...base, point: 170 }, { now: tIn }).code, "duplicate");
assert.equal(F.submitForecast({ username: "AMINI", ...base, point: 170 }, { now: tIn }).code, "duplicate", "حروف بزرگ/کوچک نام کاربری فرقی نمی‌کند");
assert.ok(!Object.keys(F).some((k) => /^(update|delete|edit|remove|overwrite|set)/i.test(k)), "هیچ تابعی برای ویرایش/حذف وجود ندارد");
assert.ok(!Object.keys(S).some((k) => /^(delete|remove|update|overwrite|truncate|rewrite)/i.test(k)));

// همکار دیگر و مدیر
assert.ok(F.submitForecast({ username: "kasrayi", ...base, point: 190, lo: 170, hi: 215 }, { now: tIn }).ok);
assert.ok(F.submitForecast({ username: "admin", ...base, point: 185, lo: 168, hi: 205 }, { now: tIn }).ok);
const vK = F.viewRound({ username: "kasrayi", isAdmin: false, roundId: "2026-11", now: tIn });
assert.ok(!JSON.stringify(vK).includes("human:amini") && !JSON.stringify(vK).includes("human:admin"), "پیش‌بینی همکاران برای کارشناس دیده نمی‌شود");
const vAdminOpen = F.viewRound({ username: "admin", isAdmin: true, roundId: "2026-11", now: tIn });
assert.equal(vAdminOpen.questions.find((x) => x.id === q.id).others.length, 0, "مدیر هم تا پایان مهلت پیش‌بینی بقیه را نمی‌بیند");

// بعد از مهلت
const tClosed = new Date("2026-11-20T07:00:00Z");
assert.equal(F.submitForecast({ username: "rezazadeh", ...base }, { now: tClosed }).code, "closed", "بعد از مهلت ثبت نمی‌شود");
const vAdminClosed = F.viewRound({ username: "admin", isAdmin: true, roundId: "2026-11", now: tClosed });
assert.equal(vAdminClosed.questions.find((x) => x.id === q.id).others.length, 2, "بعد از بسته شدن، مدیر پیش‌بینی بقیه را می‌بیند");
const vKClosed = F.viewRound({ username: "kasrayi", isAdmin: false, roundId: "2026-11", now: tClosed });
assert.equal(vKClosed.questions.find((x) => x.id === q.id).others.length, 0, "کارشناس هیچ‌وقت پیش‌بینی بقیه را نمی‌بیند");
assert.equal(F.viewRound({ username: "rezazadeh", isAdmin: false, roundId: "2026-11", now: tClosed }).questions.find((x) => x.id === q.id).brain, null, "کسی که ثبت نکرده، مغز را هم نمی‌بیند");

// --- محرمانگی ورودی مغز ---
assert.equal(calls.length, cfg.questions.length);
for (const c of calls) {
  assert.ok(c.input.includes("خلاصه‌ی جامع آزمایشی"));
  assert.ok(!/human:|amini|kasrayi|rezazadeh|sales|فروش|قرارداد|مشتری/i.test(c.input), "ورودی مدل شامل پیش‌بینی انسان یا داده‌ی فروش نیست");
}
assert.ok(calls.some((c) => /برای این سری مقدار عمومی/.test(c.input)), "سری محرمانه‌ی ایران مقدار به مدل نمی‌دهد");

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

// --- فقط‌افزودنی ---
const predFile = path.join(tmp, "predictions.jsonl");
const before = fs.readFileSync(predFile, "utf-8");
F.submitForecast({ username: "rezazadeh", roundId: "2026-11", questionId: q.id, point: 181, lo: 170, hi: 200 }, { now: tIn });
const after = fs.readFileSync(predFile, "utf-8");
assert.ok(after.startsWith(before), "فایل فقط به انتها اضافه می‌شود؛ خط‌های قبلی دست‌نخورده");
S.closeRow("predictions", ok.prediction.id, { reason: "آزمون", by: "t" });
const rows = S.currentRows("predictions");
assert.ok(rows.get(ok.prediction.id).recorded_to, "بستن = ردیف می‌ماند با recorded_to");
assert.ok(fs.readFileSync(predFile, "utf-8").startsWith(after));

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
assert.ok(day1Late.brain === "no_key" || Array.isArray(day1Late.brain), "بدون کلید، فقط دور باز می‌شود");
const mid = await Auto.brainForecastTick({ now: new Date("2027-02-14T08:00:00Z") });
assert.ok(F.getRound("2027-02"), "اگر سرور وسط ماه بالا آمد، دور همان لحظه باز می‌شود");

// --- محافظ دیسک ---
const saveDir = process.env.BRAIN_STATE_DIR;
const saveEnv = process.env.NODE_ENV;
delete process.env.BRAIN_STATE_DIR; delete process.env.OUTREACH_STATE_DIR; process.env.NODE_ENV = "production";
assert.match(S.brainStorageProblem(), /دیسک دائمی/);
process.env.BRAIN_STATE_DIR = saveDir; process.env.NODE_ENV = saveEnv;
assert.equal(S.brainStorageProblem(), null);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("✔ تست دفتر پیش‌بینی مغز (مرحله‌ی ۰) گذشت");

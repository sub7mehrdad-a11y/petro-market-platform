// تست یادگیری خودکار کشور، حالت «بهبود نیامد»: نسخه‌ی پیشنهادی روی کشورهای دیده‌نشده بهتر نیست ← بایگانی (پاک نمی‌شود)، روش فعال عوض نمی‌شود،
// بعد از دو دور بی‌بهبود پیاپی متوقف می‌شود (plateau). همچنین اجرای پس‌زمینه با وضعیت پایدار.
//   node --import ./scripts/alias-loader.mjs scripts/test-brain-selflearn-reject.mjs
import assert from "node:assert/strict";
import { fakeModel, setupEnv } from "./_selflearn-fixture.mjs";

setupEnv("rej");
const Sch = await import("../lib/brain2/schema.js");
const S = await import("../lib/brain2/store.js");
const Dom = await import("../lib/brain2/domain/baking-soda/countryBacktest.js");
const CM = await import("../lib/brain2/learning/countryMethod.js");
const SL = await import("../lib/brain2/learning/countrySelfLearning.js");
Sch.ensureRepos();

const GOOD_RULE = "به کشورهای هم‌درآمد و هم‌جمعیت بیش از میانگین همه‌ی کشورها اعتماد کن";
const diagCalls = [], reviseCalls = [], predictCalls = [];
const generate = fakeModel({ Dom, goodMarker: "هم‌درآمد و هم‌جمعیت", goodRule: GOOD_RULE, diagCalls, reviseCalls, predictCalls, goodWorks: false });

const sum = await SL.runSelfImprovement({ generate, model: "fake", now: new Date("2026-11-20T00:00:00Z") });
assert.equal(sum.promoted, 0);
assert.equal(sum.iterations.length, 2, "plateau: دو دور بی‌بهبود پیاپی ← توقف");
for (const it of sum.iterations) {
  assert.equal(it.outcome, "archived");
  assert.equal(it.accepted, false);
  assert.match(it.reason, /بهبود/);
}
assert.equal(CM.activeCountryMethod().version, "v1", "روش فعال عوض نشد");
const ms = CM.countryMethodRows();
assert.deepEqual(ms.map((m) => `${m.version}:${m.status}`).sort(), ["v1:فعال", "v2:بایگانی", "v3:بایگانی"]);
assert.ok(ms.filter((m) => m.status === "بایگانی").every((m) => /رد شد/.test(m.change_reason) && m.backtest_score?.pairs >= 4), "دلیل و نتیجه‌ی آزمون روی نسخه‌ی بایگانی ثبت است");
assert.ok(S.readEvents("methods").some((e) => e.op === "put" && e.row.natural_key === "method|country|v2" && e.row.status === "آزمایشی"));
assert.ok(sum.final.mean_abs_rel_err >= sum.initial.mean_abs_rel_err - 1e-9, "چیزی بهتر نشد و چیزی هم بدتر نشد");

// اجرای پس‌زمینه: شروع، وضعیت پایدار، جلوگیری از اجرای هم‌زمان، پایان با خلاصه
const started = SL.startSelfImprovement({ generate, model: "fake", now: new Date("2026-11-21T00:00:00Z"), maxIterations: 1 });
assert.equal(started.started, true);
assert.equal(SL.startSelfImprovement({ generate }).started, false, "هم‌زمان دو بار اجرا نمی‌شود");
assert.equal(SL.countryLearningStatus().running, true);
for (let i = 0; i < 400 && SL.countryLearningStatus().running; i++) await new Promise((r) => setTimeout(r, 25));
const st = SL.countryLearningStatus();
assert.equal(st.running, false);
assert.ok(st.summary && st.summary.iterations.length === 1, JSON.stringify(st.error || st.summary));
assert.ok(st.log.length > 0);
assert.equal(SL.startSelfImprovement({ generate, model: "fake", now: new Date("2026-11-22T00:00:00Z"), maxIterations: 1 }).started, true, "بعد از پایان دوباره قابل‌شروع است");
for (let i = 0; i < 400 && SL.countryLearningStatus().running; i++) await new Promise((r) => setTimeout(r, 25));

// بدون قاعده‌ی معتبر (مدل فقط قاعده‌ی دارای نام کشور داد) ← نسخه‌ای ساخته نمی‌شود
const badModel = async (a) => (/بازنویسی می‌کنی/.test(a.system) ? JSON.stringify({ rules: ["برای عراق جداگانه تعدیل کن و محتاط باش"], comparables: { mode: "all" }, rationale: "x" }) : generate(a));
const before = CM.countryMethodRows().length;
const sum2 = await SL.runSelfImprovement({ generate: badModel, model: "fake", now: new Date("2026-11-23T00:00:00Z"), maxIterations: 1 });
assert.equal(sum2.iterations[0].outcome, "no_valid_proposal");
assert.equal(CM.countryMethodRows().length, before, "پیشنهاد نامعتبر ردیفی نمی‌سازد");

console.log("test-brain-selflearn-reject: همه‌ی بررسی‌ها گذشت");

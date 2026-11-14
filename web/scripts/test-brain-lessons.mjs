// تست یادگیری از اشتباه در آزمون بازپخش کشورها (۱۰-ب): کالبدشکافی با دسته‌ی قطعیِ کد، درس پیشنهادی ← صف ← تأیید مدیر ← دستور پیش‌بین،
// درس سوگیری تجمعی، leave-one-out، اثر «با درس» در برابر «بدون درس»، idempotent.
//   node --import ./scripts/alias-loader.mjs scripts/test-brain-lessons.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "brainls-"));
const REAL = path.join(process.cwd(), "..", "data");
const dataDir = path.join(tmp, "data");
fs.mkdirSync(dataDir, { recursive: true });
for (const f of ["country_profiles.json", "country_population.json", "import_suppliers.json"]) fs.copyFileSync(path.join(REAL, f), path.join(dataDir, f));
process.env.BRAIN_DATA_DIR = dataDir;
process.env.BRAIN_STATE_DIR = path.join(tmp, "state");
process.env.SALES_STATE_DIR = path.join(tmp, "sales");
delete process.env.OUTREACH_STATE_DIR;

const Sch = await import("../lib/brain2/schema.js");
const M = await import("../lib/brain2/memory.js");
const Q = await import("../lib/brain2/knowledge/queue.js");
const S = await import("../lib/brain2/store.js");
const Dom = await import("../lib/brain2/domain/baking-soda/countryBacktest.js");
const BT = await import("../lib/brain2/learning/countryBacktest.js");
const LS = await import("../lib/brain2/learning/countryLessons.js");
Sch.ensureRepos();

const table = Dom.loadCountryTable();
const by = Object.fromEntries(table.map((r) => [r.country, r]));
const NUMERIC = Dom.COUNTRY_TARGETS.filter((t) => t.kind === "number");

// ------------------------------------------------------------------ دسته‌ی خطا از نشانه‌ی قطعی
const row = (o) => ({ kind: "number", truth: 100, baseline: 90, forecast: { point: 200, lo: 150, hi: 250 }, result: { scored: true, abs_rel_err: 1, inside: false, skill: -10, surprise: 1 }, ...o });
assert.equal(LS.classifyCountryError(row({}), [80, 90, 95]).category, "few_comparables", "کمتر از ۴ کشور مقایسه‌ای");
assert.equal(LS.classifyCountryError(row({ truth: 500, forecast: { point: 700, lo: 600, hi: 800 } }), [80, 90, 95, 99, 120]).category, "outside_range");
assert.equal(LS.classifyCountryError(row({}), [80, 90, 95, 99, 120, 140, 160]).category, "worse_than_baseline");
assert.equal(LS.classifyCountryError(row({ result: { scored: true, abs_rel_err: 0.3, inside: true, skill: 0.2, surprise: 0 } }), [80, 90, 95, 99, 120, 140, 160]).category, "estimation_error");
assert.equal(LS.classifyCountryError(row({ result: { scored: true, abs_rel_err: 0.05, inside: true, skill: 0.5, surprise: 0 } }), [80, 90, 95, 99]), null, "پیش‌بینی خوب کالبدشکافی نمی‌شود");
assert.equal(LS.classifyCountryError(row({ result: { scored: false } }), [1, 2, 3, 4]), null);

// ------------------------------------------------------------------ پیش‌بین «همیشه ۵۰٪ بیش‌برآورد» روی چند کشور
const prompts = [];
const biased = (country, factor = 1.5) => async ({ system, input }) => {
  prompts.push({ country, system });
  const t = {};
  for (const d of NUMERIC) { const v = by[country].truth[d.id]; if (v !== null) t[d.id] = { point: v * factor, lo: v * factor * 0.9, hi: v * factor * 1.1, reason: "حدس آزمون" }; }
  const dp = by[country].truth.domestic_production;
  if (dp !== null) t.domestic_production = { p: 0.5, reason: "نامطمئن" };
  return JSON.stringify({ targets: t });
};
const COUNTRIES = ["امارات", "عربستان سعودی", "قزاقستان", "عراق", "هند"];
let t0 = Date.parse("2026-11-20T00:00:00Z");
for (const c of COUNTRIES) assert.equal((await BT.runCountryBacktest(c, { generate: biased(c), model: "m1", now: new Date(t0 += 1000) })).ok, true);
assert.ok(prompts.every((p) => !/درس‌های آموخته/.test(p.system)), "بدون درس: دستور ساده");

// ------------------------------------------------------------------ کالبدشکافی
const genCalls = [];
const narr = async ({ system, input }) => {
  genCalls.push(input);
  return JSON.stringify({ narrative: "پیش‌بین بیش‌ازحد به کشورهای بزرگ شبیه‌سازی کرد.", lesson: "در برآورد واردات، از نسبت سرانه‌ی کشورهای هم‌درآمد شروع کن و بیش از ۲۰٪ از آن فاصله نگیر." });
};
const au = await LS.runCountryAutopsies({ now: new Date("2026-11-21T00:00:00Z"), generate: narr });
assert.ok(au.new >= 10, `کالبدشکافی‌های تازه: ${au.new}`);
assert.ok(au.by_category.worse_than_baseline > 0 || au.by_category.estimation_error > 0 || au.by_category.outside_range > 0);
const autopsies = LS.lessonsOverview().autopsies;
assert.ok(autopsies.length === au.new);
assert.ok(autopsies.every((a) => a.category && a.category_fa && a.statement), "دسته را کد می‌دهد و روایت مدل است");
assert.ok(autopsies.some((a) => /بیش‌ازحد/.test(a.statement)));
// مدل نمی‌تواند دسته را عوض کند: دسته‌ها فقط از مجموعه‌ی کد هستند
assert.ok(autopsies.every((a) => ["few_comparables", "outside_range", "worse_than_baseline", "estimation_error"].includes(a.category)));
// idempotent
const au2 = await LS.runCountryAutopsies({ now: new Date("2026-11-22T00:00:00Z"), generate: narr });
assert.equal(au2.new, 0);
assert.equal(au2.lessons_proposed, 0);
assert.equal(au2.unchanged, au.new);

// ------------------------------------------------------------------ درس‌های پیشنهادی در صف (و هنوز اثری ندارند)
const open = () => [...Q.openQueue().values()].filter((q) => q.kind === "country_lesson");
assert.ok(open().length >= 2, "درس مدلی + درس سوگیری");
const bias = open().find((q) => q.lesson_kind === "bias");
assert.ok(bias, "بیش‌برآوردِ ۵۰٪ در چند کشور ← درس کالیبراسیون (بدون مدل)");
assert.match(bias.lesson_text, /بیش‌برآورد/);
assert.ok(bias.derived_from.length >= 3);
assert.equal(LS.acceptedLessons().length, 0);
assert.equal(LS.lessonsPromptFor("امارات").text, "");
assert.deepEqual(LS.syncLessonDecisions({ now: new Date() }), [], "تا تصمیم مدیر چیزی عوض نمی‌شود");
assert.equal(Q.resolveItem(M.loadIndex(), { id: bias.id, decision: "reject", claimKey: bias.members[0].claim_key, by: "admin" }).ok, false, "فقط تأیید یا رد (dismiss)");

// ------------------------------------------------------------------ تأیید مدیر ← دستور پیش‌بین
const modelLesson = open().find((q) => q.lesson_kind === "model");
const idx = M.loadIndex();
assert.equal(Q.resolveItem(idx, { id: bias.id, decision: "accept", claimKey: bias.members[0].claim_key, by: "admin", at: "2026-11-22T00:00:00.000Z" }).ok, true);
assert.equal(Q.resolveItem(idx, { id: modelLesson.id, decision: "dismiss", by: "admin", at: "2026-11-22T00:00:00.000Z" }).ok, true);
const applied = LS.syncLessonDecisions({ now: new Date("2026-11-22T01:00:00Z") });
assert.equal(applied.length, 2);
assert.deepEqual(LS.syncLessonDecisions({ now: new Date("2026-11-22T02:00:00Z") }), [], "idempotent");
assert.equal(LS.acceptedLessons().length, 1);
// leave-one-out: درس از کشورهای سازنده‌اش به همان کشورها داده نمی‌شود
const derived = bias.derived_from;
const other = Object.keys(by).find((c) => !derived.includes(c) && by[c].truth.imports_tons);
assert.match(LS.lessonsPromptFor(other).text, /درس‌های آموخته/);
assert.equal(LS.lessonsPromptFor(derived[0]).text, "", "درس از خودِ این کشور آمده؛ به آن نمی‌رسد");
// ردشده دوباره پیشنهاد نمی‌شود
const openBefore = open().filter((q) => q.status === "open").length;
const au3 = await LS.runCountryAutopsies({ now: new Date("2026-11-23T00:00:00Z"), generate: narr, rows: BT.latestBacktestRows() });
assert.equal(au3.lessons_proposed, 0);
assert.equal(open().filter((q) => q.status === "open").length, openBefore, "درس‌های تصمیم‌گرفته‌شده (پذیرفته یا ردشده) دوباره به صف نمی‌آیند");

// ------------------------------------------------------------------ اجرای «با درس» روی کشوری که درس از آن نیامده + مقایسه
const rWith = await BT.runCountryBacktest(other, { generate: biased(other), model: "m1", lessons: true, now: new Date("2026-11-24T00:00:00Z") });
assert.equal(rWith.ok, true);
assert.equal(rWith.with_lessons, true);
assert.equal(rWith.lessons_used, 1);
assert.ok(rWith.forecaster.endsWith("@bt+lessons"));
assert.match(prompts.at(-1).system, /درس‌های آموخته/);
assert.match(prompts.at(-1).system, new RegExp("بیش‌برآورد"));
// برای کشور سازنده‌ی درس: دستور بدون درس
const rSelf = await BT.runCountryBacktest(derived[0], { generate: biased(derived[0]), model: "m1", lessons: true, now: new Date("2026-11-24T01:00:00Z") });
assert.equal(rSelf.lessons_used, 0);
assert.ok(!/درس‌های آموخته/.test(prompts.at(-1).system));
// آمار اصلی فقط «بدون درس» است؛ اثر درس جدا
const sum = BT.summarizeBacktests();
assert.ok(sum.overall.n > 0);
assert.ok(sum.rows.every((r) => !String(r.model).includes("lessons")));
const eff = sum.lessons_effect;
assert.ok(eff.pairs >= 3, `جفت‌های مقایسه: ${eff.pairs}`);
assert.equal(eff.better + eff.worse + eff.same, eff.pairs);
assert.ok(eff.mean_skill_with !== null && eff.mean_skill_without !== null);

// ------------------------------------------------------------------ جداسازی: هیچ‌چیز در نمره‌ی زنده/دفتر پیش‌بینی ننوشته است
assert.equal(S.readEvents("predictions").length, 0);
const scoresFile = path.join(process.env.BRAIN_STATE_DIR, "scores.jsonl");
assert.ok(!fs.existsSync(scoresFile) || fs.readFileSync(scoresFile, "utf-8").trim() === "");

console.log("test-brain-lessons: همه‌ی بررسی‌ها گذشت");

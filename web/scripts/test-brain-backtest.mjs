// تست آزمون بازپخش کشورها (مرحله‌ی ۱۰-ب): استخراج مقدار واقعی از پروفایل، عدم نشت کشور هدف به ورودی مدل، سنجش عددی/احتمالی،
// خط مبنای leave-one-out، پیش‌بینی نامعتبر، جدا بودن از نمره‌ی زنده، و خلاصه.
//   node --import ./scripts/alias-loader.mjs scripts/test-brain-backtest.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "brainbt-"));
const REAL = path.join(process.cwd(), "..", "data");
const dataDir = path.join(tmp, "data");
fs.mkdirSync(dataDir, { recursive: true });
for (const f of ["country_profiles.json", "country_population.json", "import_suppliers.json"]) fs.copyFileSync(path.join(REAL, f), path.join(dataDir, f));
process.env.BRAIN_DATA_DIR = dataDir;
process.env.BRAIN_STATE_DIR = path.join(tmp, "state");
process.env.SALES_STATE_DIR = path.join(tmp, "sales");
delete process.env.OUTREACH_STATE_DIR;

const Sch = await import("../lib/brain2/schema.js");
const S = await import("../lib/brain2/store.js");
const Dom = await import("../lib/brain2/domain/baking-soda/countryBacktest.js");
const BT = await import("../lib/brain2/learning/countryBacktest.js");
const SR = await import("../lib/brain2/scoring/read.js");
Sch.ensureRepos();
const near = (a, b, eps = 0.05) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

// ------------------------------------------------------------------ جدول و مقدار واقعی
const table = Dom.loadCountryTable();
const by = Object.fromEntries(table.map((r) => [r.country, r]));
assert.ok(by["امارات"] && by["عربستان سعودی"] && by["ازبکستان"]);
assert.ok(!by["ترکیه"], "رقیب صادرکننده (بدون مقدار قابل‌سنجش) در جدول نیست");
const uae = by["امارات"].truth;
assert.equal(uae.imports_tons, 12514);
assert.equal(uae.consumption_tons, 9000);
assert.equal(uae.per_capita_kg, 0.8);
near(uae.top_supplier_share_pct, 34.2);
near(uae.iran_share_pct, 6.4);
assert.equal(uae.domestic_production, 0);
assert.equal(uae.tariff_pct, 5);
assert.equal(by["عربستان سعودی"].truth.domestic_production, 0);
assert.equal(by["هند"].truth.domestic_production, 1);
assert.ok(by["قزاقستان"].truth.consumption_tons > 10000, "میانه‌ی بازه‌ی real_trade_stats");
assert.ok(by["امارات"].indicators.population > 1e7);

// خط مبنا: میانه‌ی کشورهای دیگر، بدون خود کشور
const others = table.filter((r) => r.country !== "امارات");
const pcMed = Dom.baselineFor("per_capita_kg", by["امارات"], others);
assert.ok(pcMed > 0 && pcMed !== 0.8);
assert.equal(Dom.baselineFor("consumption_tons", by["امارات"], others), Math.round((pcMed * by["امارات"].indicators.population) / 1000));
const dp = Dom.baselineFor("domestic_production", by["امارات"], others);
assert.ok(dp >= 0 && dp <= 1);

// ------------------------------------------------------------------ اجرا با مدل ساختگی
const inputs = [];
const perfect = (country) => async ({ input }) => {
  inputs.push(input);
  const row = by[country];
  const t = {};
  for (const d of Dom.COUNTRY_TARGETS) {
    const v = row.truth[d.id];
    if (v === null) continue;
    t[d.id] = d.kind === "probability" ? { p: v ? 0.9 : 0.1, reason: "آزمون" } : { point: v, lo: v * 0.9, hi: v * 1.1, reason: "آزمون" };
  }
  return JSON.stringify({ targets: t });
};
const r1 = await BT.runCountryBacktest("امارات", { generate: perfect("امارات"), model: "fake-model", now: new Date("2026-11-20T00:00:00Z") });
assert.equal(r1.ok, true);
assert.equal(r1.rows.length, 7);
assert.equal(r1.forecaster, "machine:country:fake-model@bt");
const num = r1.rows.find((r) => r.target === "imports_tons");
assert.equal(num.result.abs_rel_err, 0);
assert.equal(num.result.inside, true);
assert.equal(num.result.surprise, 0);
assert.ok(num.result.skill > 0.9, "پیش‌بینی دقیق در برابر خط مبنا مهارت بالا دارد");
const prob = r1.rows.find((r) => r.target === "domestic_production");
near(prob.result.brier, 0.01, 1e-4);
assert.ok(prob.result.skill !== null);

// نشت: ورودی مدل ردیفی از خود کشور هدف ندارد
const input = inputs[0];
assert.ok(!/^امارات \|/m.test(input), "ردیف کشور هدف در جدول کشورهای مشابه نیست");
assert.ok(/^عربستان سعودی \|/m.test(input) && /^ازبکستان \|/m.test(input), "کشورهای دیگر هستند");
assert.match(input, /کشور هدف: امارات/);
assert.ok(!input.includes("12514") && !input.includes("۱۲۵۱۴"), "واردات ثبت‌شده‌ی خود کشور در ورودی نیست");
assert.ok(!/gdp_per_capita|تفکیک مبدأ|گزارش/.test(input.split("=====")[0]), "سربرگ فقط شاخص‌های عمومی است");

// خطای بزرگ: بازه‌ی دور از واقعیت ← خارج از بازه و مهارت منفی؛ پیش‌بینی نامعتبر ← سنجیده نمی‌شود
const bad = async () => JSON.stringify({ targets: {
  imports_tons: { point: 40000, lo: 30000, hi: 50000, reason: "x" },
  consumption_tons: { point: 5, lo: 9, hi: 3, reason: "ترتیب غلط" },
  per_capita_kg: { point: 0.8, lo: 0.7, hi: 0.9 },
  top_supplier_share_pct: { point: 50, lo: 40, hi: 130 },
  domestic_production: { p: 1.5 },
} });
const r2 = await BT.runCountryBacktest("امارات", { generate: bad, model: "bad-model", now: new Date("2026-11-21T00:00:00Z") });
assert.equal(r2.ok, true);
const g = (id) => r2.rows.find((r) => r.target === id).result;
assert.equal(g("imports_tons").inside, false);
assert.ok(g("imports_tons").surprise > 0 && g("imports_tons").skill < 0);
assert.equal(g("consumption_tons").scored, false);
assert.match(g("consumption_tons").reason, /ترتیب/);
assert.equal(g("per_capita_kg").inside, true);
assert.equal(g("top_supplier_share_pct").scored, false, "درصد بیش از ۱۰۰");
assert.equal(g("domestic_production").scored, false);
assert.equal(g("iran_share_pct").scored, false, "هدفی که مدل نفرستاد");

// خطاهای اجرا
assert.equal((await BT.runCountryBacktest("ترکیه", { generate: perfect("امارات") })).ok, false);
assert.equal((await BT.runCountryBacktest("امارات", { generate: async () => "متن بی‌JSON" })).ok, false);
assert.equal((await BT.runCountryBacktest("امارات", { generate: async () => { throw new Error("شبکه"); } })).error, "شبکه");

// ------------------------------------------------------------------ عربستان + خلاصه
await BT.runCountryBacktest("عربستان سعودی", { generate: perfect("عربستان سعودی"), model: "fake-model", now: new Date("2026-11-22T00:00:00Z") });
const latest = BT.latestBacktestRows();
assert.equal(latest.filter((r) => r.country === "امارات" && r.model === "fake-model").length, 7);
const sum = BT.summarizeBacktests();
assert.ok(sum.overall.n >= 14);
assert.ok(sum.by_country.some((c) => c.country === "امارات") && sum.by_country.some((c) => c.country === "عربستان سعودی"));
assert.equal(sum.by_target.find((t) => t.id === "imports_tons").coverage > 0, true);
const onlyFake = BT.summarizeBacktests(latest.filter((r) => r.model === "fake-model"));
assert.equal(onlyFake.overall.coverage, 1, "پیش‌بینی دقیق: همه داخل بازه");
assert.ok(onlyFake.overall.mean_skill > 0.5);

// ------------------------------------------------------------------ جدا از نمره‌ی زنده
assert.deepEqual(SR.readScores(), [], "آزمون بازپخش در scores.jsonl نمی‌نویسد");
assert.equal(S.readEvents("predictions").length, 0, "و در دفتر پیش‌بینی هم نه");
assert.ok(latest.every((r) => r.forecaster.endsWith("@bt")));


// ------------------------------------------------------------------ پیش‌بینی پیش‌ثبت‌شده برای کشور تازه (بدون داده‌ی پژوهش)
const fwInputs = [];
const fwGen = async ({ input }) => {
  fwInputs.push(input);
  return JSON.stringify({ targets: {
    imports_tons: { point: 5000, lo: 3000, hi: 8000, reason: "از کشورهای هم‌درآمد" }, consumption_tons: { point: 4000, lo: 2500, hi: 6500, reason: "x" },
    per_capita_kg: { point: 0.8, lo: 0.5, hi: 1.3, reason: "x" }, top_supplier_share_pct: { point: 40, lo: 25, hi: 60, reason: "x" },
    iran_share_pct: { point: 10, lo: 2, hi: 25, reason: "x" }, domestic_production: { p: 0.1, reason: "x" }, tariff_pct: { point: 5, lo: 0, hi: 5, reason: "x" },
  } });
};
const kw = await BT.predictNewCountry("قطر", { generate: fwGen, model: "fake-model", now: new Date("2026-11-25T00:00:00Z") });
assert.equal(kw.ok, true);
assert.equal(kw.rows.length, 7);
assert.ok(kw.rows.every((r) => r.forecast && r.baseline !== undefined));
assert.ok(!/^قطر \|/m.test(fwInputs[0]), "کشور تازه در جدول مقایسه‌ای نیست");
assert.match(fwInputs[0], /کشور هدف: قطر/);
assert.match(fwInputs[0], /جمعیت: 2972215|جمعیت: 2,972,215/);
assert.equal((await BT.predictNewCountry("قطر", { generate: fwGen, model: "fake-model" })).ok, false, "پیش‌ثبت تغییرناپذیر است");
assert.match((await BT.predictNewCountry("قطر", { generate: fwGen })).error, /پیش‌ثبت/);
assert.match((await BT.predictNewCountry("امارات", { generate: fwGen })).error, /قبلاً پژوهش شده/);
assert.match((await BT.predictNewCountry("جزیره‌ی ناشناخته", { generate: fwGen })).error, /شاخص/);
let sf = BT.summarizeBacktests();
assert.equal(sf.forward.pending, 7);
assert.equal(sf.forward.n, 0);
assert.ok(sf.rows.every((r) => !r.forward), "پیش‌ثبت‌ها در آمار آزمون بازپخش نمی‌آیند");
assert.equal(BT.resolveForwardPredictions({ now: new Date("2026-11-26T00:00:00Z") }), 0, "تا پژوهش نیاید چیزی سنجیده نمی‌شود");
// پژوهش قطر وارد پروفایل‌ها می‌شود ← سنجش
const profFile = path.join(dataDir, "country_profiles.json");
const profs = JSON.parse(fs.readFileSync(profFile, "utf-8"));
profs["قطر"] = { country: "قطر", total_import_volume: { value: 4000, unit: "تن" }, supply_stats: { production_tons: 0, apparent_consumption_tons: 3500, per_capita_kg: 0.72 }, tariff_note: "تعرفه‌ی ۷٫۵٪ بر ارزش CIF؛ دارو معاف است.",
  report_import_breakdown: { year: 2025, total_tons: 4000, suppliers: [{ country: "چین", tons: 1800 }, { country: "هند", tons: 1200 }, { country: "ایران", tons: 400 }, { country: "سایر", tons: 600 }] } };
fs.writeFileSync(profFile, JSON.stringify(profs));
const nRes = BT.resolveForwardPredictions({ now: new Date("2026-12-10T00:00:00Z") });
assert.ok(nRes >= 6, `سنجیده‌شده: ${nRes}`);
sf = BT.summarizeBacktests();
assert.equal(sf.forward.pending, 0, "تعرفه از tariff_note پروفایل می‌آید (Trade Map لازم نیست) ← همه‌ی ۷ هدف سنجیده شد");
const tarRow = BT.latestBacktestRows().find((r) => r.forward && r.country === "قطر" && r.target === "tariff_pct");
assert.equal(tarRow.truth, 7.5);
const conc = sf.forward_conclusions.find((c) => c.country === "قطر");
assert.equal(conc.complete, true);
assert.equal(conc.scored, 7);
assert.ok(conc.lines[0].startsWith("7 از 7 هدف سنجیده شد"), conc.lines[0]);
assert.ok(conc.items.length >= 4 && conc.items.every((x) => x.label && x.direction));
assert.ok(conc.lines.some((l) => /داخل بازه/.test(l)), "نتیجه‌گیری شامل شمار داخل بازه");
assert.ok(sf.forward.n >= 6);
const imp = sf.rows.length; void imp;
const fw = BT.latestBacktestRows().filter((r) => r.forward && r.country === "قطر");
const impRow = fw.find((r) => r.target === "imports_tons");
assert.equal(impRow.truth, 4000);
assert.equal(impRow.result.inside, true);
near(impRow.result.abs_rel_err, 0.25, 1e-3);
assert.equal(impRow.made_at, "2026-11-25T00:00:00.000Z", "زمان پیش‌ثبت دست نمی‌خورد");
assert.ok(impRow.resolved_at.startsWith("2026-12-10"));
assert.ok(S.readEvents("backtests").filter((e) => e.op === "put" && e.row.natural_key === impRow.natural_key).length >= 2, "تاریخچه: پیش‌ثبت ← سنجش‌شده (هر دو می‌مانند)");
assert.equal(BT.resolveForwardPredictions({ now: new Date("2026-12-11T00:00:00Z") }), 0, "idempotent");
console.log("test-brain-backtest: همه‌ی بررسی‌ها گذشت");

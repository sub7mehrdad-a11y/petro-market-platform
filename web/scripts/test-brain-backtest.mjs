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

console.log("test-brain-backtest: همه‌ی بررسی‌ها گذشت");

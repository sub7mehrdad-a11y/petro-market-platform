// تست مرحله‌ی ۱۱ مغز (جداسازی هسته از بسته‌ی دامنه): (۱) هسته نباید واژه‌های خاص دامنه‌ی جوش‌شیرین را داشته باشد، جز فهرست «بدهی» صریح؛
// (۲) هسته هیچ‌جا از پوشه‌ی دامنه مستقیم import نمی‌کند (فقط domain/index)؛ (۳) دامنه‌ی ساختگی دوم بدون دست‌زدن به هسته کار می‌کند:
// قاعده‌ها، دستور تحلیل‌گر، خواننده‌ی واقعیت.
//   node --import ./scripts/alias-loader.mjs scripts/test-brain-domain.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "braindo-"));
const REAL = path.join(process.cwd(), "..", "data");
const dataDir = path.join(tmp, "data");
fs.mkdirSync(path.join(dataDir, "brain"), { recursive: true });
for (const f of ["confidence_config.json", "analysts_config.json", "scoring_config.json"]) fs.copyFileSync(path.join(REAL, "brain", f), path.join(dataDir, "brain", f));
process.env.BRAIN_DATA_DIR = dataDir;
process.env.BRAIN_STATE_DIR = path.join(tmp, "state");
process.env.SALES_STATE_DIR = path.join(tmp, "sales");
delete process.env.OUTREACH_STATE_DIR;

// ------------------------------------------------------------------ (۱) اسکن واژه‌های دامنه در هسته
const lib = path.join(process.cwd(), "lib", "brain2");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const rel = (f) => path.relative(lib, f).split(path.sep).join("/");
const core = walk(lib).filter((f) => /\.jsx?$/.test(f) && !rel(f).startsWith("domain/"));
assert.ok(core.length >= 30);
const TOKENS = /جوش.?شیرین|bicarbonate|baking|iran_customs|price_history|intratec|china|turkey|russia|iraq|گمرک|روسیه|trade_map|فوب|سی‌آی‌اف/i;
// بدهی شناخته‌شده (هنوز به بسته‌ی دامنه منتقل نشده): هرکدام دلیل دارد. فهرست فقط باید کوتاه شود، نه بلندتر.
const DEBT = {
  "store.js": "شناسه‌ی پیش‌فرض دامنه (قابل‌تغییر با BRAIN_DOMAIN)",
  "forecast.js": "متن پرسش‌های دور از تنظیمات (فوب/سی‌آی‌اف) — باید از دامنه بیاید",
  "judge.js": "فقط مثال داخل توضیح (china_fob)",
  "knowledge/checks.js": "نام معیارهای trade_map در بررسی‌های منطقی — باید از پیکربندی دامنه بیاید",
  "knowledge/config.js": "طبقه‌بندی معیار trade_map به سالانه — باید از پیکربندی دامنه بیاید",
  "knowledge/retrieval.js": "یک برچسب متنی سی‌آی‌اف در قالب خروجی — باید از دامنه بیاید",
};
const offenders = core.filter((f) => TOKENS.test(fs.readFileSync(f, "utf-8"))).map(rel);
for (const o of offenders) assert.ok(DEBT[o], `${o}: واژه‌ی خاص دامنه در هسته است و در فهرست بدهی نیست`);
for (const k of Object.keys(DEBT)) assert.ok(offenders.includes(k), `${k} دیگر بدهی نیست؛ از فهرست بدهی حذفش کن`);
assert.ok(Object.keys(DEBT).length <= 6, "فهرست بدهی بزرگ‌تر نمی‌شود");

// ------------------------------------------------------------------ (۲) هسته فقط از domain/index می‌خواند
for (const f of core) {
  const bad = fs.readFileSync(f, "utf-8").split("\n").filter((l) => /^\s*import .* from ".*domain\/baking-soda/.test(l));
  assert.deepEqual(bad, [], `${rel(f)} مستقیم از بسته‌ی دامنه import می‌کند`);
}
for (const f of walk(path.join(process.cwd(), "app")).filter((x) => /\.jsx?$/.test(x))) {
  assert.ok(!/from "@\/lib\/brain2\/domain\/baking-soda/.test(fs.readFileSync(f, "utf-8")), `${f} مستقیم از بسته‌ی دامنه import می‌کند`);
}

// ------------------------------------------------------------------ (۳) دامنه‌ی ساختگی دوم
const D = await import("../lib/brain2/domain/index.js");
const Sch = await import("../lib/brain2/schema.js");
const R = await import("../lib/brain2/rules.js");
const An = await import("../lib/brain2/analysts.js");
const T = await import("../lib/brain2/scoring/truth.js");
const S = await import("../lib/brain2/store.js");

assert.equal(D.getDomain().id, "baking-soda");
assert.throws(() => D.getDomain("nope"), /ناشناخته/);
for (const k of ["rules", "pairedFlags", "outputChecks", "isUsableAsPrice", "comparePrices", "analystPrompts", "truthReaders", "migrate", "digest", "legacyForecaster", "experimentCandidates"]) assert.ok(D.getDomain()[k] !== undefined, `کلید ${k} در بسته‌ی دامنه`);

D.registerDomain("toy", {
  rules: [{ key: "toy-big", level: "claim", label: "بزرگ", check: "flagBig", text: "عدد بزرگ مشکوک است.", scope: { metric: "x" }, test: (c) => c.value > 1000 }],
  pairedFlags: () => [],
  outputChecks: { "toy-out": () => ({ violations: [], checked: 3 }) },
  isUsableAsPrice: () => true,
  comparePrices: () => ({ ok: true, ratio: 1 }),
  analystPrompts: { stat: "دستور آماری اسباب‌بازی", event: "دستور رویدادی اسباب‌بازی" },
  truthReaders: { toy_series: { truth: () => ({ ok: true, value: 42, as_of: "2026-01-01", source: "toy" }), baseline: () => ({ value: 40, as_of: "2025-12-01" }) } },
  migrate: () => ({ stats: {} }), digest: () => "toy digest", legacyForecaster: {}, experimentCandidates: () => [{ key: "toy-exp", title: "آزمایش اسباب‌بازی" }],
});
process.env.BRAIN_DOMAIN = "toy";
Sch.ensureRepos();
assert.equal(D.getDomain().id, "toy");
assert.deepEqual(R.ensureRules({ at: "2026-01-01T00:00:00.000Z" }), { created: 1, changed: 0 }, "قاعده‌ی دامنه‌ی دوم ثبت شد، نه قاعده‌های جوش‌شیرین");
assert.deepEqual(R.listRules().map((r) => r.natural_key), ["toy-big"]);
assert.equal(An.SYSTEM.stat, "دستور آماری اسباب‌بازی");
assert.equal(An.SYSTEM.event, "دستور رویدادی اسباب‌بازی");
const q = { target: { truth_source: { kind: "toy_series" } } };
assert.equal(T.readTruth(q).value, 42);
assert.equal(T.readBaseline(q, "2026-02-01T00:00:00Z").value, 40);
assert.match(T.readTruth({ target: { truth_source: { kind: "price_history" } } }).reason, /پشتیبانی نمی‌شود/, "نوع منبعِ دامنه‌ی دیگر در این دامنه ناشناخته است");
const M = await import("../lib/brain2/memory.js");
const idx = M.loadIndex();
M.upsertSource(idx, { key: "toy:src", kind: "x", origin: "toy" }, { at: "2026-01-01T00:00:00.000Z" });
M.upsertClaim(idx, { subject: "A", metric: "x", value: 5000, period: "2026-01", source_key: "toy:src" }, { at: "2026-01-02T00:00:00.000Z" });
M.upsertClaim(idx, { subject: "B", metric: "x", value: 5, period: "2026-01", source_key: "toy:src" }, { at: "2026-01-02T00:00:00.000Z" });
const ap = R.applyClaimRules(idx, { at: "2026-01-03T00:00:00.000Z" });
assert.equal(ap.changed, 1);
assert.deepEqual(ap.flagged, { "toy-big": 1 });
const out = R.runOutputChecks(idx, { today: "2026-01-04", digestText: "", scoringConfig: {}, at: "2026-01-04T00:00:00.000Z" });
assert.deepEqual(out, { "toy-out": { violations: 0, checked: 3 } });
assert.equal(D.getDomain().experimentCandidates()[0].key, "toy-exp");
void S;
delete process.env.BRAIN_DOMAIN;
assert.equal(D.getDomain().id, "baking-soda", "بازگشت به دامنه‌ی پیش‌فرض");

console.log("test-brain-domain: همه‌ی بررسی‌ها گذشت");

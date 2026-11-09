// تست مرحله‌ی ۳ مغز (قاعده‌ها، پروتکل ۰٫۲ بخش ۱۵-۳): ثبت هفت قاعده با وضعیت «پیشنهادی»؛ برای هر قاعده یک نمونه‌ی مثبت و یک منفی؛
// برچسب فقط‌افزودنی و idempotent؛ قاعده فقط برچسب می‌زند (اعتماد/مقدار دست‌نخورده)؛ بررسی‌های خروجی؛ اجرا روی داده‌ی واقعی.
//   node --import ./scripts/alias-loader.mjs scripts/test-brain-rules.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "brainrules-"));
process.env.BRAIN_STATE_DIR = path.join(tmp, "state");
delete process.env.OUTREACH_STATE_DIR;

const S = await import("../lib/brain2/store.js");
const M = await import("../lib/brain2/memory.js");
const R = await import("../lib/brain2/rules.js");
const DR = await import("../lib/brain2/domain/baking-soda/rules.js");
const Mig = await import("../lib/brain2/domain/baking-soda/migrate.js");
const Sch = await import("../lib/brain2/schema.js");

Sch.ensureRepos();
const T0 = "2026-11-08T10:00:00.000Z";

// ------------------------------------------------------------------ ثبت قاعده‌ها
assert.equal(DR.RULES.length, 7, "هفت قاعده‌ی ۱۵-۳");
assert.equal(DR.RULES.filter((r) => r.level === "claim").length, 5);
assert.equal(DR.RULES.filter((r) => r.level === "output").length, 2);
for (const r of DR.RULES) assert.ok(r.text && r.check && r.label && r.scope, `قاعده ${r.key} متن و بررسی خودکار دارد`);
assert.deepEqual(R.ensureRules({ at: T0 }), { created: 7, changed: 0 });
assert.deepEqual(R.ensureRules({ at: T0 }), { created: 0, changed: 0 }, "اجرای دوباره = بدون تغییر");
const rows = R.listRules();
assert.equal(rows.length, 7);
assert.ok(rows.every((r) => r.status === "پیشنهادی" && r.origin === "پروتکل ۱۵-۳" && r.votes.length === 0 && r.merged_into === null && "importance" in r), "همه «پیشنهادی» با فیلدهای ۰٫۲");
// تغییر متن = ردیف تازه، وضعیت (مثلاً «آزمایشی» که انسان داده) حفظ می‌شود، قبلی بسته می‌شود
const rule0 = DR.RULES[0];
const origText = rule0.text;
const cur = rows.find((r) => r.natural_key === rule0.key);
const { id: _i, created_at: _c, recorded_from: _f, recorded_to: _t, closed_reason: _r, ...keep } = cur;
S.putRow("rules", S.stampRow("rule", { ...keep, status: "آزمایشی", supersedes: cur.id, change_reason: "ارتقا (آزمون)" }, T0));
S.closeRow("rules", cur.id, { reason: "ارتقا", at: T0 });
rule0.text = origText + " (ویرایش)";
assert.deepEqual(R.ensureRules({ at: "2026-11-09T00:00:00.000Z" }), { created: 0, changed: 1 });
const after = R.listRules().find((r) => r.natural_key === rule0.key);
assert.equal(after.status, "آزمایشی", "وضعیتی که انسان داده با ویرایش متن برنمی‌گردد");
assert.ok(S.currentRows("rules").size >= 9, "ردیف‌های قبلی در فایل مانده‌اند");
rule0.text = origText;
R.ensureRules({ at: "2026-11-09T01:00:00.000Z" });

// ------------------------------------------------------------------ قاعده‌های ادعا: مثبت و منفی
const idx = M.loadIndex();
const K = (key, origin) => M.upsertSource(idx, { key, kind: "جدول آماری", origin }, { at: T0 });
K("iran_customs", "گمرک ایران"); K("other", "منبع دیگر"); K("wits", "WITS");
const claim = (subject, metric, value, extra = {}, source = "other") => M.upsertClaim(idx, { subject, metric, value, source_key: source, confidence: 0.7, ...extra }, { at: T0 }).row;
const c = {
  iranPos: claim("ایران", "iran_export_tons", 53096, { period: "1404", qualifiers: { calendar: "شمسی" } }, "iran_customs"),
  iranNeg: claim("ایران", "iran_export_tons", 1000, { period: "2025", qualifiers: { calendar: "میلادی" } }, "other"),
  uvPos: claim("عراق", "trade_map.imports.unit_value_usd", 300, { period: "2025" }),
  uvPos2: claim("عراق", "trade_map.exports.unit_value_usd", 310, { period: "2025" }),
  qtyNeg: claim("عراق", "trade_map.imports.quantity", 9000, { period: "2025" }),
  priceNeg: claim("چین", "price", 177.78, { period: "2026-08", qualifiers: { product: "sodium bicarbonate", price_type: "FOB" } }),
  shamsiPos: claim("ایران", "x_metric", 5, { period: "1403" }),
  shamsiNeg: claim("ایران", "x_metric", 5, { period: "2025" }),
  airPos: claim("ازبکستان", "distance_km", 1500, { unit: "km", qualifiers: { to: "ایران", method: "air" } }),
  airNeg: claim("اردن", "distance_km", 2076, { unit: "km", qualifiers: { to: "ایران" } }),
  // تناقض: ۲۶٬۹۴۵ تن در برابر ۱۶٬۰۰۰ (نسبت ۱٫۶۸)
  expRu: claim("روسیه", "iran_export_destination_tons", 26945, { period: "1404", qualifiers: { calendar: "شمسی" } }, "iran_customs"),
  impRu: claim("روسیه", "import_supplier_tons", 16000, { period: "2025", qualifiers: { supplier: "ایران" } }),
  // هماهنگ: نسبت ۱٫۱
  expUz: claim("ازبکستان", "iran_export_destination_tons", 3432, { period: "1404", qualifiers: { calendar: "شمسی" } }, "iran_customs"),
  impUz: claim("ازبکستان", "import_supplier_tons", 3120, { period: "2025", qualifiers: { supplier: "ایران" } }),
  // فقط واردکننده (صادرکننده ندارد)
  impLone: claim("هند", "import_supplier_tons", 510, { period: "2025", qualifiers: { supplier: "ایران" } }),
};
const confBefore = Object.fromEntries(Object.entries(c).map(([k, r]) => [k, [r.confidence, r.value, r.status]]));
const log1 = lines("claims");
function lines(repo) { return fs.readFileSync(path.join(S.getBrainDir(), `${repo}.jsonl`), "utf-8"); }
const res = R.applyClaimRules(idx, { at: "2026-11-08T11:00:00.000Z" });
const flagsOf = (key) => [...S.currentRows("claims").values()].find((r) => !r.recorded_to && r.natural_key === c[key].natural_key).rule_flags;
assert.deepEqual(flagsOf("iranPos"), ["calendar-year-only", "iran-customs-underdeclared"].sort(), "گمرک ایران: کم‌اظهار + سال شمسی");
assert.deepEqual(flagsOf("iranNeg"), [], "همان سنجه از منبع دیگر کم‌اظهار نیست");
assert.deepEqual(flagsOf("uvPos"), ["price-type-not-comparable"]);
assert.deepEqual(flagsOf("uvPos2"), ["price-type-not-comparable"]);
assert.deepEqual(flagsOf("qtyNeg"), []);
assert.deepEqual(flagsOf("priceNeg"), [], "قیمت فوب برچسب ارزش واحد نمی‌گیرد");
assert.deepEqual(flagsOf("shamsiPos"), ["calendar-year-only"], "دوره‌ی ۱۴۰۳ شمسی");
assert.deepEqual(flagsOf("shamsiNeg"), []);
assert.deepEqual(flagsOf("airPos"), ["air-distance-estimated"]);
assert.deepEqual(flagsOf("airNeg"), [], "فاصله‌ی ثبت‌شده برآوردی نیست");
assert.ok(flagsOf("expRu").includes("importer-stats-preferred") && flagsOf("impRu").includes("importer-stats-preferred"), "تناقض روسیه روی هر دو ادعا");
assert.deepEqual(flagsOf("impUz"), [], "نسبت ۱٫۱ تناقض نیست");
assert.ok(!flagsOf("expUz").includes("importer-stats-preferred"));
assert.deepEqual(flagsOf("impLone"), [], "بدون جفت، تناقضی نیست");
assert.deepEqual(res.contradictions.map((x) => x.country), ["روسیه"]);
const expRuRow = [...S.currentRows("claims").values()].find((r) => !r.recorded_to && r.natural_key === c.expRu.natural_key);
assert.match(expRuRow.change_reason, /تناقض.*26945.*16000/, "دلیل تناقض عددها را می‌گوید");
assert.equal(res.flagged["iran-customs-underdeclared"], 3, "هر سه ادعای منبع گمرک ایران (کل سال، مقصد روسیه، مقصد ازبکستان)");

// فقط برچسب: مقدار و اعتماد دست‌نخورده
for (const [k, [conf, val, status]] of Object.entries(confBefore)) {
  const now = [...S.currentRows("claims").values()].find((r) => !r.recorded_to && r.natural_key === c[k].natural_key);
  assert.deepEqual([now.confidence, now.value, now.status], [conf, val, status], `${k}: قاعده‌ی «پیشنهادی» اعتماد را عوض نمی‌کند`);
}
// فقط‌افزودنی: ردیف قبلی بسته شده و مانده، فایل فقط بزرگ شده
const all = S.currentRows("claims");
assert.ok(all.get(c.iranPos.id).recorded_to, "ردیف بدون برچسب بسته شد، پاک نشد");
assert.ok(lines("claims").startsWith(log1), "فایل فقط افزوده شد");
// idempotent
const size = lines("claims").length;
assert.equal(R.applyClaimRules(idx, { at: "2026-11-09T11:00:00.000Z" }).changed, 0, "اجرای دوباره برچسب تکراری نمی‌سازد");
assert.equal(lines("claims").length, size);
// تغییر مقدار: ردیف تازه برچسب ندارد تا قاعده دوباره اعمال شود
const idxFresh = M.loadIndex();
const upd = M.upsertClaim(idxFresh, { subject: "ایران", metric: "iran_export_tons", value: 99999, period: "1404", qualifiers: { calendar: "شمسی" }, source_key: "iran_customs" }, { at: "2026-11-10T00:00:00.000Z" });
assert.equal(upd.outcome, "changed");
assert.deepEqual(upd.row.rule_flags, [], "ردیف تازه هنوز برچسب نگرفته");
assert.ok(R.applyClaimRules(idxFresh, { at: "2026-11-10T00:01:00.000Z" }).changed >= 1);
assert.deepEqual([...S.currentRows("claims").values()].find((r) => !r.recorded_to && r.natural_key === c.iranPos.natural_key).rule_flags.sort(), ["calendar-year-only", "iran-customs-underdeclared"]);

// ------------------------------------------------------------------ مصرف‌کننده‌ها: قیمت قابل‌استفاده و مقایسه
const open = (key) => [...S.currentRows("claims").values()].find((r) => !r.recorded_to && r.natural_key === c[key].natural_key);
assert.equal(R.isUsableAsPrice(open("priceNeg")), true);
assert.equal(R.isUsableAsPrice(open("uvPos")), false, "ارزش واحد قیمت نیست");
assert.equal(R.isUsableAsPrice(open("iranPos")), false, "آمار کم‌اظهار قیمت نیست");
const fob2 = { ...open("priceNeg"), value: 250 };
const cif = { ...open("priceNeg"), value: 268, qualifiers: { product: "sodium bicarbonate", price_type: "CIF" } };
const other = { ...open("priceNeg"), qualifiers: { product: "soda ash", price_type: "FOB" } };
assert.equal(R.comparePrices(open("priceNeg"), fob2).ok, true);
assert.equal(R.comparePrices(open("priceNeg"), cif).ok, false, "فوب با سی‌آی‌اف مسدود");
assert.match(R.comparePrices(open("priceNeg"), cif).reason, /نوع قیمت متفاوت/);
assert.equal(R.comparePrices(open("priceNeg"), other).ok, false, "محصول متفاوت مسدود");
assert.equal(R.comparePrices(open("priceNeg"), open("uvPos")).ok, false, "قیمت با ارزش واحد مسدود");

// ------------------------------------------------------------------ بررسی‌های خروجی
const scoring = (country, competition) => ({ payload: { country, notes: { competition } } });
const cl = [
  { metric: "import_supplier_tons", subject: "ازبکستان", qualifiers: { supplier: "روسیه" }, value: 3450 },
  { metric: "import_supplier_share_pct", subject: "قزاقستان", qualifiers: { supplier: "روسیه" }, value: 78.7 },
  { metric: "import_supplier_tons", subject: "عراق", qualifiers: { supplier: "روسیه" }, value: 0 },
];
const okCfg = { competition: { rivals: ["ترکیه", "چین", "روسیه"] } };
const ruNeg = DR.checkRussiaInCompetition({ analyses: [scoring("ازبکستان", "سهم ترکیه+چین+روسیه 60٪"), scoring("قزاقستان", "سهم ترکیه+چین+روسیه 80٪"), scoring("عراق", "سهم ترکیه+چین 10٪")], claims: cl, scoringConfig: okCfg });
assert.deepEqual(ruNeg.violations, [], "روسیه دیده شده؛ سهم صفر روسیه (عراق) نقض نیست");
const ruPos = DR.checkRussiaInCompetition({ analyses: [scoring("ازبکستان", "سهم ترکیه+چین 5٪")], claims: cl, scoringConfig: okCfg });
assert.equal(ruPos.violations.length, 1);
assert.equal(ruPos.violations[0].item, "ازبکستان", "همان خطای مرحله‌ی ۱ (امتیاز کامل رقابت کم)");
assert.equal(DR.checkRussiaInCompetition({ analyses: [], claims: [], scoringConfig: { competition: { rivals: ["ترکیه", "چین"] } } }).violations.length, 1, "روسیه از فهرست رقبا افتاده");

const digest = [
  "### اردن — رتبه ۱۰ از ۱۳",
  "- نمایشگاه‌های پیش‌رو (قابل‌پیشنهاد): Food Africa (پایان 2026-12-10)؛ Old Fair (پایان 2026-08-12)",
  "### هند — رتبه ۴ از ۱۳",
  "- نمایشگاه‌های پیش‌رو (قابل‌پیشنهاد): CPHI (پایان ۲۰۲۶-۱۱-۲۵)",
  "- 3 نمایشگاه با تاریخ گذشته در بانک هست (قابل‌پیشنهاد نیست).",
].join("\n");
const evPos = DR.checkUpcomingEvents({ digestText: digest, today: "2026-11-08" });
assert.equal(evPos.checked, 3);
assert.deepEqual(evPos.violations.map((v) => v.item), ["اردن: Old Fair"], "فقط رویداد گذشته نقض است");
assert.equal(DR.checkUpcomingEvents({ digestText: digest, today: "2026-12-30" }).violations.length, 3, "با گذشت زمان همان خلاصه نقض می‌شود");
assert.ok(DR.checkUpcomingEvents({ digestText: null, today: "2026-11-08" }).skipped);

// ثبت نتیجه‌ی بررسی خروجی در حافظه (تحلیل rule-check)، idempotent
const idx2 = M.loadIndex();
const out1 = R.runOutputChecks(idx2, { today: "2026-11-08", digestText: digest, scoringConfig: okCfg, at: "2026-11-08T12:00:00.000Z" });
assert.equal(out1["past-event-not-next-step"].violations, 1);
const ana = () => [...S.currentRows("analyses").values()].filter((a) => a.analyst === "rule-check" && !a.recorded_to);
assert.equal(ana().length, 2);
assert.match(ana().find((a) => a.natural_key === "rule-check:past-event-not-next-step").statement, /1 مورد نقض/);
const n = lines("analyses").length;
R.runOutputChecks(idx2, { today: "2026-11-08", digestText: digest, scoringConfig: okCfg, at: "2026-11-08T13:00:00.000Z" });
assert.equal(lines("analyses").length, n, "نتیجه‌ی بدون تغییر چیزی نمی‌نویسد");
R.runOutputChecks(idx2, { today: "2026-11-08", digestText: digest.replace("Old Fair (پایان 2026-08-12)", "Fixed (پایان 2026-12-12)"), scoringConfig: okCfg, at: "2026-11-09T00:00:00.000Z" });
assert.match(ana().find((a) => a.natural_key === "rule-check:past-event-not-next-step").statement, /بدون نقض/, "رفع نقض = نسخه‌ی تازه‌ی نتیجه");

// ------------------------------------------------------------------ داده‌ی واقعی
const REAL = path.join(process.cwd(), "..", "data");
const dataCopy = path.join(tmp, "data");
fs.mkdirSync(path.join(dataCopy, "brain"), { recursive: true });
for (const f of fs.readdirSync(REAL)) if (f.endsWith(".json") && !/email|outreach|users|companies|exhibition/.test(f)) fs.copyFileSync(path.join(REAL, f), path.join(dataCopy, f));
for (const f of ["country_scores.json", "scoring_config.json", "digest.md"]) fs.copyFileSync(path.join(REAL, "brain", f), path.join(dataCopy, "brain", f));
process.env.BRAIN_DATA_DIR = dataCopy;
process.env.BRAIN_STATE_DIR = path.join(tmp, "real");
const m1 = Mig.runMigration({ now: new Date("2026-11-08T12:00:00Z") });
assert.ok(m1.rules.flagged["iran-customs-underdeclared"] >= 6, "ادعاهای گمرک ایران برچسب خوردند");
assert.ok(m1.rules.flagged["price-type-not-comparable"] > 100, "ارزش واحد Trade Map برچسب خورد");
assert.ok(m1.rules.flagged["air-distance-estimated"] >= 3, "فاصله‌ی هوایی کشورهای بدون فاصله‌ی ثبت‌شده");
assert.ok(m1.rules.contradictions.some((x) => x.country === "روسیه"), "تناقض روسیه (۲۶٬۹۴۵ در برابر ≈۱۶٬۰۰۰) پیدا شد");
assert.equal(m1.checks["russia-is-rival"].violations, 0, "خلاصه‌ی فعلی خطای روسیه ندارد (مرحله‌ی ۱)");
assert.equal(m1.checks["past-event-not-next-step"].violations, 0, "خلاصه‌ی فعلی رویداد گذشته ندارد");
const m2 = Mig.runMigration({ now: new Date("2026-11-08T13:00:00Z") });
assert.equal(m2.rules.changed, 0);
assert.equal(m2.stats.claims_new + m2.stats.claims_changed + m2.stats.analyses_new + m2.stats.analyses_changed, 0, "اجرای دوباره روی داده‌ی واقعی = بدون تغییر");
assert.equal(R.listRules().length, 7);
// با گذشت زمان همان خلاصه‌ی قدیمی بررسی خروجی را نقض می‌کند
const m3 = Mig.runMigration({ now: new Date("2027-03-01T00:00:00Z") });
assert.ok(m3.checks["past-event-not-next-step"].violations > 0, "خلاصه‌ی کهنه رویداد گذشته دارد و گزارش می‌شود");

fs.rmSync(tmp, { recursive: true, force: true });
console.log("✔ تست قاعده‌های مغز (مرحله‌ی ۳) گذشت");

// تست مرحله‌ی ۲ مغز (حافظه): قالب هشت مخزن و فیلدهای ۰٫۲، idempotent بودن، بستن و جایگزینی ردیف، «سیستم در تاریخ X چه باور داشت»،
// کهنگی تحلیل، فقط‌افزودنی بودن فایل، پشتیبان، و هم‌ارزی خلاصه‌ی ساخته‌شده از حافظه با خلاصه‌ی قدیمی روی داده‌ی واقعی.
// اجرا (از پوشه‌ی web):  node --import ./scripts/alias-loader.mjs scripts/test-brain-memory.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "brainmem-"));
const stateA = path.join(tmp, "stateA");
process.env.BRAIN_STATE_DIR = stateA;
delete process.env.OUTREACH_STATE_DIR;

const S = await import("../lib/brain2/store.js");
const Sch = await import("../lib/brain2/schema.js");
const M = await import("../lib/brain2/memory.js");
const P = await import("../lib/brain2/periods.js");
const Mig = await import("../lib/brain2/migrate.js");
const D = await import("../lib/brain2/digest.js");
const B = await import("../lib/brain2/backup.js");

const lines = (repo) => fs.readFileSync(path.join(S.getBrainDir(), `${repo}.jsonl`), "utf-8").split("\n").filter(Boolean);

// ------------------------------------------------------------------ قالب هشت مخزن و فیلدهای ۰٫۲
Sch.ensureRepos();
assert.deepEqual(Sch.REPO_NAMES.sort(), ["analyses", "claims", "feedback", "methods", "predictions", "reputation", "rules", "sources"], "هر هشت مخزن");
for (const r of Sch.REPO_NAMES) assert.ok(fs.existsSync(path.join(stateA, `${r}.jsonl`)), `فایل ${r} ساخته شد`);
const T0 = "2026-09-01T10:00:00.000Z";
const c0 = Sch.makeRow("claims", { subject: "عراق", metric: "m", value: 1 }, T0);
for (const f of ["importance", "last_used_at", "use_count", "rule_flags", "confidence", "status", "qualifiers", "source_ids"]) assert.ok(f in c0, `ادعا: ${f}`);
assert.equal(c0.use_count, 0);
assert.equal(c0.recorded_from, T0);
assert.equal(c0.recorded_to, null);
assert.equal(c0.domain, "baking-soda");
const r0 = Sch.makeRow("rules", { text: "t", status: "پیشنهادی" }, T0);
for (const f of ["importance", "votes", "merged_into", "check", "track_record"]) assert.ok(f in r0, `قاعده: ${f}`);
assert.throws(() => Sch.makeRow("claims", { subject: "x" }), /metric/);
assert.throws(() => Sch.makeRow("nope", {}), /ناشناخته/);
const c1 = Sch.makeRow("claims", { subject: "عراق", metric: "m", value: 2 }, T0);
c0.qualifiers.x = 1;
assert.deepEqual(c1.qualifiers, {}, "پیش‌فرض‌ها بین ردیف‌ها مشترک نیست");

// ------------------------------------------------------------------ نوشتن idempotent، تغییر، «در تاریخ X چه باور داشتیم»
const idx = M.loadIndex();
const SK = "test-src";
M.upsertSource(idx, { key: SK, kind: "جدول آماری", origin: "آزمون" }, { at: T0 });
M.upsertSource(idx, { key: SK, kind: "جدول آماری", origin: "آزمون" }, { at: T0 });
assert.equal(lines("sources").length, 1, "منبع تکراری نمی‌شود");
const spec = (value) => ({ subject: "عراق", metric: "total_import_volume", value, unit: "تن", period: "2025", source_key: SK });
const a1 = M.upsertClaim(idx, spec(1000), { at: T0 });
assert.equal(a1.outcome, "new");
const nLines = lines("claims").length;
assert.equal(M.upsertClaim(idx, spec(1000), { at: "2026-09-02T00:00:00.000Z" }).outcome, "unchanged");
assert.equal(lines("claims").length, nLines, "اجرای دوباره چیزی ننوشت");
const T1 = "2026-10-01T10:00:00.000Z";
const before = fs.readFileSync(path.join(stateA, "claims.jsonl"), "utf-8");
const a2 = M.upsertClaim(idx, spec(1200), { at: T1, reason: "گزارش تازه" });
assert.equal(a2.outcome, "changed");
assert.equal(a2.row.supersedes, a1.row.id);
assert.equal(a2.row.change_reason, "گزارش تازه");
assert.ok(fs.readFileSync(path.join(stateA, "claims.jsonl"), "utf-8").startsWith(before), "فایل فقط به انتها اضافه شد");
const rows = S.currentRows("claims");
assert.equal(rows.get(a1.row.id).recorded_to, T1, "ردیف قدیمی بسته شد، پاک نشد");
assert.equal(rows.get(a2.row.id).recorded_to, null);
// سناریوی دو نسخه‌ای از یک ادعا
const val = (knownAt) => M.queryClaims({ subject: "عراق", metric: "total_import_volume", knownAt }).map((r) => r.value);
assert.deepEqual(val("2026-09-15T00:00:00.000Z"), [1000], "در ۱۵ شهریور سیستم ۱۰۰۰ را باور داشت");
assert.deepEqual(val("2026-10-15T00:00:00.000Z"), [1200], "بعد از تغییر ۱۲۰۰");
assert.deepEqual(val("2026-08-01T00:00:00.000Z"), [], "پیش از ثبت، چیزی نمی‌دانست");
assert.deepEqual(val(undefined), [1200], "بدون تاریخ = باور فعلی");
assert.equal(M.queryClaims({ subject: "عراق", metric: "total_import_volume", validAtTime: "2026-10-15T00:00:00.000Z" }).length, 1);
// تحلیل وابسته کهنه می‌شود
M.upsertAnalysis(idx, { key: "an:1", analyst: "t", statement: "s", claim_ids: [a2.row.id], payload: { a: 1 } }, { at: T1 });
M.upsertClaim(idx, spec(1300), { at: "2026-10-05T00:00:00.000Z" });
assert.equal(M.flagStaleAnalyses(idx, { at: "2026-10-05T00:00:00.000Z" }), 1);
const an = [...S.currentRows("analyses").values()];
assert.equal(an.length, 2);
assert.equal(an.filter((r) => !r.recorded_to).length, 1);
assert.equal(an.find((r) => !r.recorded_to).stale, true, "ادعای پایه تغییر کرد ← تحلیل کهنه");
assert.equal(M.flagStaleAnalyses(idx), 0, "دوباره علامت نمی‌زند");
assert.ok(!Object.keys(M).some((k) => /^(delete|remove|overwrite|truncate|rewrite)/i.test(k)), "هیچ تابع حذف/بازنویسی");
assert.ok(!Object.keys(Sch).some((k) => /^(delete|remove|overwrite|truncate|rewrite)/i.test(k)));

// ------------------------------------------------------------------ پشتیبان
const bk = B.backupBrain({ now: new Date("2026-11-01T00:00:00Z"), keep: 2 });
assert.ok(bk.ok && bk.files >= 8);
assert.equal(B.backupBrain({ now: new Date("2026-11-01T05:00:00Z"), keep: 2 }).skipped, "already");
B.backupBrain({ now: new Date("2026-11-02T00:00:00Z"), keep: 2 });
const bk3 = B.backupBrain({ now: new Date("2026-11-03T00:00:00Z"), keep: 2 });
assert.deepEqual(bk3.removed, ["2026-11-01"], "فقط نسخه‌ی پشتیبان قدیمی حذف می‌شود");
assert.ok(fs.existsSync(path.join(stateA, "claims.jsonl")) && fs.statSync(path.join(stateA, "claims.jsonl")).size > 0, "فایل زنده دست‌نخورده");
assert.equal(fs.readFileSync(path.join(stateA, "backups", "2026-11-03", "claims.jsonl"), "utf-8"), fs.readFileSync(path.join(stateA, "claims.jsonl"), "utf-8"));

// ------------------------------------------------------------------ دوره و کهنگی (هم‌ارز brain_core.py)
const cases = { "June 2026": ["month", "2026-06", "2026-06-30"], "2026-06": ["month", "2026-06", "2026-06-30"], "Q2 2026": ["quarter", "2026-Q2", "2026-06-30"], "2026-Q2": ["quarter", "2026-Q2", "2026-06-30"], "2026-09-07": ["day", "2026-09-07", "2026-09-07"], "September 2026": ["month", "2026-09", "2026-09-30"], "February 2028": ["month", "2028-02", "2028-02-29"], "abc": ["unknown", null, null], "": ["unknown", null, null] };
for (const [inp, [kind, label, end]] of Object.entries(cases)) assert.deepEqual(P.periodOf(inp), { kind, label, end }, inp);
const st = P.staleness("2026-08", "2026-11-06", { month: 75, quarter: 130, day: 20 });
assert.deepEqual([st.label, st.age, st.stale], ["2026-08", 67, false]);
assert.equal(P.staleness("2026-06", "2026-11-06", { month: 75 }).stale, true);
assert.deepEqual(P.shamsiSpan("1404"), ["2025-03-21", "2026-03-20"]);

// ------------------------------------------------------------------ انتقال روی داده‌ی واقعی
const REAL_DATA = path.join(process.cwd(), "..", "data");
const dataCopy = path.join(tmp, "data");
fs.mkdirSync(path.join(dataCopy, "brain"), { recursive: true });
for (const f of fs.readdirSync(REAL_DATA)) {
  if (f.endsWith(".json") && !/email|outreach|users|companies|exhibition/.test(f)) fs.copyFileSync(path.join(REAL_DATA, f), path.join(dataCopy, f));
}
for (const f of ["country_scores.json", "scoring_config.json"]) fs.copyFileSync(path.join(REAL_DATA, "brain", f), path.join(dataCopy, "brain", f));
process.env.BRAIN_DATA_DIR = dataCopy;
const stateB = path.join(tmp, "stateB");
process.env.BRAIN_STATE_DIR = stateB;

const tMig1 = new Date("2026-11-06T12:00:00Z");
const mig1 = Mig.runMigration({ now: tMig1 });
assert.ok(mig1.stats.claims_new > 3000, `ادعاهای تازه: ${mig1.stats.claims_new}`);
assert.equal(mig1.stats.claims_changed, 0);
assert.equal(mig1.stats.analyses_new, 15, "۱۳ تحلیل رتبه‌بندی + ۲ نتیجه‌ی بررسی قاعده‌های خروجی");
const sizeAfter1 = ["sources", "claims", "analyses"].map((r) => fs.statSync(path.join(stateB, `${r}.jsonl`)).size);
const mig2 = Mig.runMigration({ now: new Date("2026-11-06T13:00:00Z") });
assert.equal(mig2.stats.claims_new + mig2.stats.claims_changed + mig2.stats.analyses_new + mig2.stats.analyses_changed + mig2.stats.sources, 0, "اجرای دوباره = بدون تغییر");
assert.deepEqual(["sources", "claims", "analyses"].map((r) => fs.statSync(path.join(stateB, `${r}.jsonl`)).size), sizeAfter1, "هیچ بایتی اضافه نشد");
for (const r of S.currentRows("claims").values()) assert.ok(r.importance !== undefined && r.use_count === 0 && "last_used_at" in r);
// داده‌ی محرمانه‌ی فروش هرگز وارد حافظه نمی‌شود
assert.ok(![...S.currentRows("sources").values()].some((s) => s.confidential), "منبع محرمانه‌ای وارد نشد");
assert.ok(!fs.readFileSync(path.join(stateB, "claims.jsonl"), "utf-8").match(/sales|Sales Report|قرارداد فروش/), "داده‌ی فروش در حافظه نیست");

// تغییر یک عدد در داده → دقیقاً یک ادعا عوض می‌شود، تحلیل کشور کهنه/به‌روز می‌شود، و «در تاریخ X» جواب درست می‌دهد
const profPath = path.join(dataCopy, "country_profiles.json");
const prof = JSON.parse(fs.readFileSync(profPath, "utf-8"));
const oldVol = prof["عراق"].total_import_volume.value;
prof["عراق"].total_import_volume.value = oldVol + 500;
fs.writeFileSync(profPath, JSON.stringify(prof), "utf-8");
const tMig3 = new Date("2026-11-20T12:00:00Z");
const mig3 = Mig.runMigration({ now: tMig3 });
assert.equal(mig3.stats.claims_changed, 1);
assert.equal(mig3.stats.claims_new, 0);
const vol = (knownAt) => M.queryClaims({ subject: "عراق", metric: "total_import_volume", knownAt }).map((r) => r.value);
assert.deepEqual(vol("2026-11-10T00:00:00.000Z"), [oldVol], "پیش از تغییر");
assert.deepEqual(vol("2026-11-25T00:00:00.000Z"), [oldVol + 500], "بعد از تغییر");
const iraq = [...S.currentRows("analyses").values()].filter((a) => a.natural_key === "scoring-v1:عراق");
assert.ok(iraq.some((a) => a.recorded_to) && iraq.filter((a) => !a.recorded_to).length === 1, "نسخه‌ی قبلی تحلیل بسته، یک نسخه‌ی باز");
assert.ok(M.memoryCounts().claims.total > M.memoryCounts().claims.open, "ردیف بسته‌شده در فایل مانده است");
prof["عراق"].total_import_volume.value = oldVol;
fs.writeFileSync(profPath, JSON.stringify(prof), "utf-8");
Mig.runMigration({ now: new Date("2026-11-21T12:00:00Z") }); // برگرداندن = نسخه‌ی تازه، نه پاک‌کردن

// ------------------------------------------------------------------ هم‌ارزی خلاصه‌ی سایه با خلاصه‌ی قدیمی
const oldDigest = fs.readFileSync(path.join(REAL_DATA, "brain", "digest.md"), "utf-8").split("\r").join(""); // CRLF (autocrlf ویندوز)
const today = oldDigest.match(/ساخته‌شده: (\d{4}-\d{2}-\d{2})/)[1];
const shadow = D.buildShadowDigest({ today });
fs.writeFileSync(path.join(tmp, "shadow.md"), shadow);

const fa = "۰۱۲۳۴۵۶۷۸۹";
const tokens = (s) => new Set(((s.replace(/[۰-۹]/g, (d) => fa.indexOf(d)).replace(/٬/g, ",").replace(/٫/g, ".")).match(/\d[\d,]*(?:\.\d+)?/g) || []).map((t) => t.replace(/,/g, "").replace(/\.0+$/, "")));
const sectionOf = (text, startRe, endRe) => {
  const L = text.split("\n");
  const i = L.findIndex((l) => startRe.test(l));
  assert.ok(i >= 0, `بخش ${startRe} پیدا نشد`);
  let j = L.findIndex((l, k) => k > i && endRe.test(l));
  if (j < 0) j = L.length;
  return L.slice(i + 1, j);
};
const missing = (oldLines, newLines) => {
  const have = tokens(newLines.join("\n"));
  const lost = [];
  for (const l of oldLines) for (const t of tokens(l)) if (!have.has(t)) lost.push(`${t} ⟸ ${l.slice(0, 90)}`);
  return lost;
};
// ۱) رتبه‌بندی
assert.deepEqual(missing(sectionOf(oldDigest, /^## ۱\./, /^## /), sectionOf(shadow, /^## ۱\./, /^## /)), [], "بخش ۱ (رتبه‌بندی)");
// ۲) قیمت‌ها (به‌جز سطر «آخرین جمع‌آوری ربات» که جزئیات اجرای ربات است نه ادعا)
const oldPrices = sectionOf(oldDigest, /^## ۲\./, /^## /).filter((l) => !l.startsWith("آخرین جمع‌آوری ربات"));
assert.deepEqual(missing(oldPrices, sectionOf(shadow, /^## ۲\./, /^## /)), [], "بخش ۲ (قیمت‌ها)");
// ۳) صادرات ایران
assert.deepEqual(missing(sectionOf(oldDigest, /^## ۳\./, /^## /), sectionOf(shadow, /^## ۳\./, /^## /)), [], "بخش ۳ (صادرات ایران)");
// ۵) خطوط ساخت‌یافته‌ی هر کشور
const STRUCT = /^- (مؤلفه‌ها|شرح|نقاط قوت|نقاط ضعف|برچسب‌ها|⚠|خلأ داده|بندر|تأمین‌کنندگان|شرکای اصلی|تعرفه|عرضه و مصرف|نکته‌ی آمار|تولید داخلی|اتحادیه)/;
const oldCountries = sectionOf(oldDigest, /^## ۵\./, /^## ۶\./).join("\n").split(/^### /m).slice(1);
const newCountries = sectionOf(shadow, /^## ۵\./, /^\u0000$/).join("\n").split(/^### /m).slice(1);
assert.equal(oldCountries.length, 13);
const newBy = new Map(newCountries.map((b) => [b.split(" — ")[0], b.split("\n")]));
for (const block of oldCountries) {
  const name = block.split(" — ")[0];
  const oldLines = block.split("\n").filter((l) => STRUCT.test(l));
  assert.ok(newBy.has(name), `کشور ${name} در خلاصه‌ی سایه نیست`);
  assert.deepEqual(missing(oldLines, newBy.get(name)), [], `کشور ${name}`);
  // هر خط ساخت‌یافته‌ی قدیمی عیناً (به‌جز ترتیب قیمت) در سایه هست؛ تفاوت‌ها باید صفر باشد
  for (const l of oldLines) assert.ok(newBy.get(name).includes(l), `خط ${name}: ${l.slice(0, 80)}`);
}
// کهنگی و ترتیب خطوط قیمت: همان متن
const oldPriceLines = new Set(oldPrices.filter((l) => l.startsWith("- sodium") || l.startsWith("- soda")));
const newPriceLines = new Set(sectionOf(shadow, /^## ۲\./, /^## /));
for (const l of oldPriceLines) assert.ok(newPriceLines.has(l), `خط قیمت عیناً: ${l.slice(0, 100)}`);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("✔ تست حافظه‌ی مغز (مرحله‌ی ۲) گذشت");

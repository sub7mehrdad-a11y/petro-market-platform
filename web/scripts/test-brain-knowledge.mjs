// تست مرحله‌ی ۵ مغز (چرخه‌ی روزانه‌ی دانش و صف تناقض، پروتکل ۶-۱ و ۶-۳): بررسی‌های ساده، تناقض بین منابع مستقل، صف بازبینی با تصمیم انسان،
// فرمول اعتماد (اعتبار منبع، تازگی، تأیید مستقل، سیگنال خبری، جریمه‌ی قاعده‌ی پذیرفته)، idempotent، فقط‌افزودنی، داده‌ی واقعی.
//   node --import ./scripts/alias-loader.mjs scripts/test-brain-knowledge.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "brainkc-"));
const REAL = path.join(process.cwd(), "..", "data");
process.env.BRAIN_STATE_DIR = path.join(tmp, "a");
delete process.env.OUTREACH_STATE_DIR;

const S = await import("../lib/brain2/store.js");
const M = await import("../lib/brain2/memory.js");
const Sch = await import("../lib/brain2/schema.js");
const R = await import("../lib/brain2/rules.js");
const K = await import("../lib/brain2/knowledge/cycle.js");
const Q = await import("../lib/brain2/knowledge/queue.js");
const C = await import("../lib/brain2/knowledge/config.js");
const Ch = await import("../lib/brain2/knowledge/checks.js");
const Mig = await import("../lib/brain2/migrate.js");

const cfg = C.loadKnowledgeConfig();
const near = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const T0 = "2026-11-09T12:00:00.000Z";
const NOW = new Date(T0);

// ------------------------------------------------------------------ پیکربندی
assert.ok(cfg.source_base["trade_map_2025"] > cfg.source_base["news:"], "خبر کم‌اعتمادتر از آمار رسمی");
assert.equal(C.sourceBase("price:PR:http", cfg), cfg.source_base["price:"]);
assert.equal(C.sourceBase("unknown-src", cfg), cfg.source_base.default);
assert.equal(C.periodEnd({ period: "۲۰۲۵" }), "2025-12-31", "رقم فارسی");
assert.equal(C.periodEnd({ period: "1404", qualifiers: { calendar: "شمسی" } }), "2026-03-20");
assert.equal(C.periodEnd({ period: "2026-08" }), "2026-08-31");
assert.equal(C.periodEnd({ period: null }), null);
assert.equal(C.freshness({ metric: "distance_km", period: null }, "2026-11-09", cfg), 1, "ایستا: تازگی کامل");
assert.ok(C.freshness({ metric: "price", period: "2026-01" }, "2026-11-09", cfg) < C.freshness({ metric: "price", period: "2026-10" }, "2026-11-09", cfg), "قدیمی‌تر کم‌تازه‌تر");
assert.ok(C.freshness({ metric: "price", period: "2020-01" }, "2026-11-09", cfg) >= cfg.freshness_floor - 1e-9, "کف تازگی");

// ------------------------------------------------------------------ بررسی‌های ساده
const sp = (metric, value, extra = {}) => Ch.sanityProblem({ metric, value, subject: "x", qualifiers: {}, ...extra }, cfg);
assert.equal(sp("price", 177.78, { unit: "USD/mt" }), null);
assert.match(sp("price", 5000, { unit: "USD/mt" }), /خارج از دامنه/);
assert.equal(sp("price", 1010, { unit: "CNY/mt" }), null);
assert.match(sp("price", 3, { unit: "USD/mt" }), /خارج از دامنه/);
assert.match(sp("import_supplier_share_pct", 120), /۰ تا ۱۰۰/);
assert.equal(sp("import_supplier_share_pct", 78.7), null);
assert.match(sp("total_import_volume", -5, { unit: "تن" }), /تناژ/);
assert.match(sp("distance_km", 99999), /فاصله/);
assert.match(sp("trade_map.imports.unit_value_usd", 50000), /ارزش واحد/);
assert.equal(sp("trade_map.exports.unit_value_usd", 50309), null, "ارزش واحد صادرات بررسی نمی‌شود (در تصمیم‌ها استفاده نمی‌شود)");
assert.equal(sp("trade_map.imports.growth_value_1y_pct", 5669), null, "رشد بالا طبیعی است");
assert.match(sp("x", 1, { period: "1850" }), /سال/);
assert.equal(sp("x", 1, { period: "1404", qualifiers: { calendar: "شمسی" } }), null, "سال شمسی خطا نیست");
assert.match(sp("price", NaN, { unit: "USD/mt" }), /معتبر نیست/);

// ------------------------------------------------------------------ سناریوی ترکیبی روی حافظه‌ی ساختگی
Sch.ensureRepos();
R.ensureRules({ at: T0 });
let idx = M.loadIndex();
const src = (key, origin) => M.upsertSource(idx, { key, kind: "جدول آماری", origin }, { at: T0 });
for (const [k, o] of [["profile:عراق", "پروفایل عراق"], ["profile:اردن", "پروفایل اردن"], ["profile:کنیا", "پروفایل کنیا"], ["trade_map_2025", "Trade Map"], ["price:PR", "Procurement"], ["price:CA", "ChemAnalyst"], ["news:a", "Reuters"], ["news:b", "SCMP"], ["news:c", "Reuters"]]) src(k, o);
const claim = (subject, metric, value, source, extra = {}) => M.upsertClaim(idx, { subject, metric, value, source_key: source, confidence: 0.1, ...extra }, { at: T0 }).row;
const V = (s) => ({ unit: "تن", period: "۲۰۲۵", ...s });
claim("عراق", "total_import_volume", 13000, "profile:عراق", V());
claim("عراق", "trade_map.imports.quantity", 6995, "trade_map_2025", V({ unit: "Tons", period: "2025" }));
claim("اردن", "total_import_volume", 10725, "profile:اردن", V());
claim("اردن", "trade_map.imports.quantity", 10800, "trade_map_2025", V({ unit: "Tons", period: "2025" })); // هم‌خوان
claim("کنیا", "total_import_volume", 5000, "profile:کنیا", V());
claim("کنیا", "trade_map.imports.quantity", 9000, "trade_map_2025", V({ unit: "Tons", period: "2025" })); // متناقض
const pq = { product: "sodium bicarbonate", price_type: "FOB" };
claim("چین", "price", 177.78, "price:PR", { unit: "USD/mt", period: "2026-08", qualifiers: pq });
claim("چین", "price", 178.5, "price:CA", { unit: "USD/mt", period: "2026-08", qualifiers: pq });          // تأیید مستقل
claim("هند", "price", 5000, "price:PR", { unit: "USD/mt", period: "2026-08", qualifiers: { product: "x", price_type: "CIF" } }); // مشکوک
claim("ایران", "iran_export_tons", 1000, "trade_map_2025", { unit: "تن", period: "2025" });
const sig = (text, source, day, i = 0) => claim("بازار", "signal", text, source, { period: day, qualifiers: { i, headline: text } });
sig("قیمت کربنات سدیم در چین به زیر ۱۰۰۰ یوان رسید", "news:a", "2026-11-05");
sig("قیمت کربنات سدیم در چین زیر ۱۰۰۰ یوان رسید", "news:b", "2026-11-06");
sig("افزایش نرخ کرایه‌ی کانتینر در مسیر شانگهای", "news:c", "2026-10-01");
const nk = (subject, metric, source, period) => [...idx.claims.values()].find((c) => c.subject === subject && c.metric === metric && idx.sourceKeyOf.get(c.source_ids[0]) === source && (!period || c.period === period)).natural_key;
const open = (key) => [...S.currentRows("claims").values()].find((r) => !r.recorded_to && r.natural_key === key);

const c1 = K.runKnowledgeCycle({ now: NOW });
assert.equal(c1.contradictions, 2, "عراق و کنیا؛ اردن هم‌خوان است");
assert.equal(c1.sanity, 1, "قیمت ۵۰۰۰ دلار");
assert.deepEqual(c1.queue, { new: 3, reopened: 0, unchanged: 0, converged: 0 });
let qv = Q.queueView({ now: NOW });
assert.deepEqual(qv.counts, { open: 3, overdue: 0, contradictions: 2, sanity: 1 });
const iraq = qv.open.find((q) => q.subject === "عراق");
assert.equal(iraq.group, "import_volume_tons");
assert.equal(iraq.spread, 1.86);
assert.deepEqual(iraq.members.map((m) => m.value).sort((a, b) => a - b), [6995, 13000]);
assert.ok(iraq.members.every((m) => m.claim_key && m.source));
assert.ok(!qv.open.some((q) => q.subject === "اردن"), "اختلاف ۰٫۷٪ تناقض نیست");
// «هیچ‌کدام خودکار رد نمی‌شود»: هر دو مقدار باز و با وضعیت «متناقض»
assert.equal(open(nk("عراق", "total_import_volume", "profile:عراق")).status, "متناقض");
assert.equal(open(nk("عراق", "trade_map.imports.quantity", "trade_map_2025")).status, "متناقض");
assert.equal(open(nk("هند", "price", "price:PR")).status, "در صف بررسی");
assert.equal(open(nk("اردن", "total_import_volume", "profile:اردن")).status, "تازه");

// اعتماد: منبع × تازگی (+ تأیید مستقل)
near(open(nk("چین", "price", "price:PR")).confidence, 0.7 * (0.7 + 0.3 * 0.5 ** (70 / 60)) + 0.05);  // ≈ ۰٫۶۳؛ ۷۰ روز از پایان اوت
near(open(nk("چین", "price", "price:CA")).confidence, 0.7 * (0.7 + 0.3 * 0.5 ** (70 / 60)) + 0.05);
near(open(nk("اردن", "total_import_volume", "profile:اردن")).confidence, 0.8 * (0.7 + 0.3 * 0.5 ** (313 / 540)) + 0.05); // با تأیید Trade Map
near(open(nk("اردن", "trade_map.imports.quantity", "trade_map_2025")).confidence, 0.9 * (0.7 + 0.3 * 0.5 ** (313 / 540)) + 0.05);
near(open(nk("عراق", "total_import_volume", "profile:عراق")).confidence, 0.8 * (0.7 + 0.3 * 0.5 ** (313 / 540)), 0.011); // متناقض: بدون تأیید
// جریمه‌ی «کم‌اظهار»: چون قاعده فقط «پیشنهادی» است اثری ندارد
const irPre = open(nk("ایران", "iran_export_tons", "trade_map_2025")).confidence;
// سیگنال خبری: تأیید منبع دوم هم‌روز با متن مشابه ← اعتماد بالا؛ خبر تنها همان اعتماد پایین
const sigConf = (text) => [...S.currentRows("claims").values()].find((r) => !r.recorded_to && r.metric === "signal" && r.value === text).confidence;
near(sigConf("قیمت کربنات سدیم در چین به زیر ۱۰۰۰ یوان رسید"), 0.3 * (0.7 + 0.3 * 0.5 ** (4 / 21)) + 0.2);
near(sigConf("قیمت کربنات سدیم در چین زیر ۱۰۰۰ یوان رسید"), 0.3 * (0.7 + 0.3 * 0.5 ** (3 / 21)) + 0.2);
near(sigConf("افزایش نرخ کرایه‌ی کانتینر در مسیر شانگهای"), 0.3 * (0.7 + 0.3 * 0.5 ** (39 / 21)), 0.02);
assert.ok(sigConf("افزایش نرخ کرایه‌ی کانتینر در مسیر شانگهای") < 0.3, "خبر قدیمی و بدون تأیید کم‌اعتمادتر");

// جریمه‌ی قاعده‌ی «پذیرفته»
const flagged = M.reviseClaim(idx, open(nk("ایران", "iran_export_tons", "trade_map_2025")), { rule_flags: ["iran-customs-underdeclared"] }, "آزمون", { at: T0 });
const accept = R.listRules().find((r) => r.natural_key === "iran-customs-underdeclared");
const { id: _i, created_at: _c, recorded_from: _f, recorded_to: _t, closed_reason: _r, ...keepRule } = accept;
S.putRow("rules", S.stampRow("rule", { ...keepRule, status: "پذیرفته", supersedes: accept.id, change_reason: "پذیرش (آزمون)" }, T0));
S.closeRow("rules", accept.id, { reason: "پذیرش", at: T0 });
K.runKnowledgeCycle({ now: new Date("2026-11-09T13:00:00Z") });
near(open(flagged.natural_key).confidence, irPre - 0.15, 0.011);
// قاعده‌ی «پیشنهادی» جریمه نمی‌کند (سایر برچسب‌ها)
assert.equal(R.listRules().filter((r) => r.status === "پذیرفته").length, 1);

// ------------------------------------------------------------------ idempotent و فقط‌افزودنی
const claimsFile = path.join(S.getBrainDir(), "claims.jsonl");
const queueFile = path.join(S.getBrainDir(), "queue.jsonl");
const sizeC = fs.readFileSync(claimsFile, "utf-8"), sizeQ = fs.readFileSync(queueFile, "utf-8");
const c2 = K.runKnowledgeCycle({ now: new Date("2026-11-09T18:00:00Z") });
assert.deepEqual([c2.queue.new, c2.queue.reopened, c2.queue.converged, c2.status_changes, c2.confidence_rewritten], [0, 0, 0, 0, 0], "اجرای دوباره = بدون تغییر");
assert.equal(fs.readFileSync(claimsFile, "utf-8"), sizeC);
assert.equal(fs.readFileSync(queueFile, "utf-8"), sizeQ);

// ------------------------------------------------------------------ تصمیم انسان
idx = M.loadIndex();
const iraqItem = Q.queueView({ now: NOW }).open.find((q) => q.subject === "عراق");
assert.equal(Q.resolveItem(idx, { id: iraqItem.id, decision: "accept", claimKey: "nope", by: "admin" }).ok, false, "فقط یکی از مقدارهای خود آیتم");
assert.equal(Q.resolveItem(idx, { id: iraqItem.id, decision: "reject", by: "admin" }).ok, false, "رد برای تناقض نیست");
assert.equal(Q.resolveItem(idx, { id: "x", decision: "dismiss", by: "admin" }).ok, false);
const tm = nk("عراق", "trade_map.imports.quantity", "trade_map_2025");
const prof = nk("عراق", "total_import_volume", "profile:عراق");
const before = fs.readFileSync(claimsFile, "utf-8");
const res = Q.resolveItem(idx, { id: iraqItem.id, decision: "accept", claimKey: tm, by: "admin", note: "Trade Map معتبرتر است", at: "2026-11-10T08:00:00.000Z" });
assert.equal(res.ok, true);
assert.equal(open(tm).status, "تأییدشده");
assert.equal(open(prof).status, "بسته‌شده", "مقدار رد‌شده در بازبینی انسانی بسته می‌شود، پاک نمی‌شود");
assert.ok(fs.readFileSync(claimsFile, "utf-8").startsWith(before), "فقط‌افزودنی");
assert.equal(Q.resolveItem(idx, { id: iraqItem.id, decision: "dismiss", by: "admin" }).ok, false, "آیتم بسته نسخه‌ی تازه گرفته و دوباره بسته نمی‌شود");
let qv2 = Q.queueView({ now: NOW });
assert.equal(qv2.counts.open, 2);
assert.equal(qv2.resolved[0].resolution.decision, "accept");
assert.equal(qv2.resolved[0].resolution.by, "admin");
// چرخه‌ی بعد: ادعای بسته‌شده کنار می‌رود، تناقض دوباره باز نمی‌شود و ادعای رد‌شده زنده نمی‌شود
const c3 = K.runKnowledgeCycle({ now: new Date("2026-11-10T09:00:00Z") });
assert.equal(c3.queue.new + c3.queue.reopened, 0);
assert.equal(open(prof).status, "بسته‌شده");
assert.equal(Q.queueView({ now: NOW }).counts.open, 2);
// مهاجرت دوباره (کلید طبیعی) ادعای رد‌شده را زنده نمی‌کند
idx = M.loadIndex();
const re = M.upsertClaim(idx, { subject: "عراق", metric: "total_import_volume", value: 13000, unit: "تن", period: "۲۰۲۵", source_key: "profile:عراق" }, { at: "2026-11-10T10:00:00.000Z" });
assert.equal(re.outcome, "unchanged");
assert.equal(re.row.status, "بسته‌شده");

// «هر دو درست»، «نادیده»، رد ادعای مشکوک
idx = M.loadIndex();
const kenya = Q.queueView({ now: NOW }).open.find((q) => q.subject === "کنیا");
assert.equal(Q.resolveItem(idx, { id: kenya.id, decision: "dismiss", by: "admin", note: "بعداً" }).ok, true);
assert.equal(open(nk("کنیا", "total_import_volume", "profile:کنیا")).status, "تازه");
K.runKnowledgeCycle({ now: new Date("2026-11-11T09:00:00Z") });
assert.equal(Q.queueView({ now: NOW }).counts.contradictions, 0, "نادیده‌شده با همان مقدارها دوباره باز نمی‌شود");
assert.equal(open(nk("کنیا", "total_import_volume", "profile:کنیا")).status, "تازه", "بین «متناقض» و «تازه» نوسان نمی‌کند");
// مقدار تغییر کند ← تناقض دوباره باز می‌شود
idx = M.loadIndex();
M.upsertClaim(idx, { subject: "کنیا", metric: "trade_map.imports.quantity", value: 12000, unit: "Tons", period: "2025", source_key: "trade_map_2025" }, { at: "2026-11-12T00:00:00.000Z" });
const c4 = K.runKnowledgeCycle({ now: new Date("2026-11-12T09:00:00Z") });
assert.equal(c4.queue.reopened, 1, "مقدار تازه ← دوباره به صف");
assert.equal(open(nk("کنیا", "total_import_volume", "profile:کنیا")).status, "متناقض");
// خودبه‌خود همگرا: مقدار اصلاح شد و دیگر تناقض نیست
idx = M.loadIndex();
M.upsertClaim(idx, { subject: "کنیا", metric: "trade_map.imports.quantity", value: 5100, unit: "Tons", period: "2025", source_key: "trade_map_2025" }, { at: "2026-11-13T00:00:00.000Z" });
const c5 = K.runKnowledgeCycle({ now: new Date("2026-11-13T09:00:00Z") });
assert.equal(c5.queue.converged, 1);
assert.equal(open(nk("کنیا", "total_import_volume", "profile:کنیا")).status, "تازه");
assert.equal(Q.queueView({ now: NOW }).resolved.find((r) => r.subject === "کنیا").resolution.decision, "auto_converged");
// ادعای مشکوک: رد ← بسته
idx = M.loadIndex();
const india = Q.queueView({ now: NOW }).open.find((q) => q.kind === "sanity");
assert.equal(Q.resolveItem(idx, { id: india.id, decision: "both_valid", by: "admin" }).ok, false, "«هر دو درست» فقط برای تناقض");
assert.equal(Q.resolveItem(idx, { id: india.id, decision: "reject", by: "admin" }).ok, true);
assert.equal(open(nk("هند", "price", "price:PR")).status, "بسته‌شده");

// ------------------------------------------------------------------ سررسیدگذشته (۱۷: تناقض بی‌تصمیم بیش از دو هفته)
Sch.ensureRepos();
const idx2 = M.loadIndex();
M.upsertClaim(idx2, { subject: "ترکیه", metric: "total_import_volume", value: 1000, unit: "تن", period: "2025", source_key: "profile:عراق", confidence: 0.1 }, { at: "2026-11-13T10:00:00.000Z" });
M.upsertClaim(idx2, { subject: "ترکیه", metric: "trade_map.imports.quantity", value: 3000, unit: "Tons", period: "2025", source_key: "trade_map_2025", confidence: 0.1 }, { at: "2026-11-13T10:00:00.000Z" });
K.runKnowledgeCycle({ now: new Date("2026-11-14T00:00:00Z") });
assert.equal(Q.queueView({ now: new Date("2026-11-20T00:00:00Z") }).counts.overdue, 0);
const late = Q.queueView({ now: new Date("2026-12-01T00:00:00Z") });
assert.equal(late.counts.overdue, 1, "بعد از ۱۴ روز سررسیدگذشته");
assert.equal(late.open.find((q) => q.subject === "ترکیه").overdue, true);

// بدون هیچ مدل: ماژول‌های چرخه به سرویس هوش مصنوعی وصل نیستند
for (const f of fs.readdirSync(path.join(process.cwd(), "lib", "brain2", "knowledge"))) assert.ok(!/gemini|groq|generateContent|aiRelay/i.test(fs.readFileSync(path.join(process.cwd(), "lib", "brain2", "knowledge", f), "utf-8")), `${f} نباید مدل صدا بزند`);

// ------------------------------------------------------------------ داده‌ی واقعی
const dataCopy = path.join(tmp, "data");
fs.mkdirSync(path.join(dataCopy, "brain"), { recursive: true });
for (const f of fs.readdirSync(REAL)) if (f.endsWith(".json") && !/email|outreach|users|companies|exhibition/.test(f)) fs.copyFileSync(path.join(REAL, f), path.join(dataCopy, f));
for (const f of ["country_scores.json", "scoring_config.json", "confidence_config.json", "digest.md"]) fs.copyFileSync(path.join(REAL, "brain", f), path.join(dataCopy, "brain", f));
process.env.BRAIN_DATA_DIR = dataCopy;
process.env.BRAIN_STATE_DIR = path.join(tmp, "real");
Mig.runMigration({ now: NOW });
const sizeBefore = fs.statSync(path.join(S.getBrainDir(), "claims.jsonl")).size;
const rc = K.runKnowledgeCycle({ now: NOW });
assert.ok(rc.contradictions >= 5 && rc.contradictions <= 12, `تناقض‌های واقعی: ${rc.contradictions}`);
assert.ok(rc.confidence_rewritten > 100 && rc.confidence_rewritten < 1200, `بازمحاسبه‌ی اعتماد: ${rc.confidence_rewritten}`);
const real = Q.queueView({ now: NOW });
assert.ok(real.open.some((q) => q.subject === "عراق" && q.group === "import_volume_tons" && q.members.some((m) => m.value === 13000) && q.members.some((m) => Math.round(m.value) === 6995)), "عراق: ۱۳٬۰۰۰ در برابر ۶٬۹۹۵");
assert.ok(real.open.some((q) => q.group === "iran_to_importer" && q.subject === "روسیه"));
const growth = fs.statSync(path.join(S.getBrainDir(), "claims.jsonl")).size - sizeBefore;
assert.ok(growth < 3_000_000, `رشد فایل ادعاها ${growth}`);
const rc2 = K.runKnowledgeCycle({ now: new Date("2026-11-09T18:00:00Z") });
assert.deepEqual([rc2.queue.new, rc2.queue.reopened, rc2.status_changes, rc2.confidence_rewritten], [0, 0, 0, 0], "روی داده‌ی واقعی هم idempotent");
// مهاجرت پس از چرخه: وضعیت/اعتماد ادعاها دست‌نخورده می‌ماند و مقدارها «تغییرنکرده» حساب می‌شوند
const mg = Mig.runMigration({ now: new Date("2026-11-09T19:00:00Z") });
assert.equal(mg.stats.claims_new + mg.stats.claims_changed, 0);
assert.equal(K.runKnowledgeCycle({ now: new Date("2026-11-09T20:00:00Z") }).queue.reopened, 0);

fs.rmSync(tmp, { recursive: true, force: true });
console.log("✔ تست چرخه‌ی دانش و صف تناقض (مرحله‌ی ۵) گذشت");

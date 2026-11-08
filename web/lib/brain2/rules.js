import { closeRow, currentRows, putRow } from "./store";
import { makeRow } from "./schema";
import { stable, upsertAnalysis } from "./memory";

// قاعده‌های اولیه‌ی بسته‌ی حوزه (پروتکل ۰٫۲ بخش ۱۵-۳)، همه با وضعیت «پیشنهادی». هر قاعده یک متن (برای مدل) و یک بررسی خودکار
// (برای کد) دارد. در این مرحله قاعده فقط «برچسب» می‌زند و در اعتماد/امتیاز اثر نمی‌گذارد تا وقتی «آزمایشی/پذیرفته» شود
// (تصمیم تأییدشده‌ی کاربر: فقط برچسب). برچسب‌ها در فیلد rule_flags ادعا ثبت می‌شوند: افزودن برچسب = ردیف تازه‌ی ادعا با
// supersedes و بستن ردیف قبلی (هیچ ردیفی پاک نمی‌شود). دو قاعده روی «خروجی» اجرا می‌شوند (رتبه‌بندی و خلاصه‌ی ساخته‌شده) و
// نتیجه‌ی بررسی‌شان به‌صورت تحلیل «rule-check» در حافظه می‌ماند.

export const RULES = [
  {
    key: "iran-customs-underdeclared", level: "claim", label: "کم‌اظهار", check: "flagIranCustoms",
    text: "آمار صادرات گمرک ایران کم‌اظهار است. قیمت واقعی صادراتی جوش‌شیرین (فوب) حداقل حدود ۲۳۰ تا ۲۷۰ دلار بر تن است؛ ارزش واحد آمار گمرک را به‌عنوان قیمت به کار نبر.",
    scope: { source: "iran_customs", subject: "ایران" },
    test: (c, ctx) => ctx.sourceKey(c) === "iran_customs",
  },
  {
    key: "importer-stats-preferred", level: "claim", label: "تناقض با آمار واردکننده", check: "flagImporterContradiction",
    text: "آمار کشور واردکننده معتبرتر از آمار صادرات ایران است. در تناقض، اعتبار پایه‌ی آمار واردکننده بالاتر است.",
    scope: { metrics: ["import_supplier_tons", "iran_export_destination_tons"], contradiction_ratio: [0.5, 1.5] },
    test: null, // ادعاهای جفت‌شده در applyClaimRules پیدا می‌شوند
  },
  {
    key: "price-type-not-comparable", level: "claim", label: "ارزش واحد، نه قیمت فوب", check: "flagUnitValue",
    text: "قیمت مبدأ (فوب)، قیمت مقصد (سی‌آی‌اف) و ارزش واحد واردات قابل مقایسه‌ی مستقیم نیستند. مقایسه‌ی دو عدد با نوع قیمت متفاوت مسدود است.",
    scope: { metrics: ["trade_map.*.unit_value_usd", "price"] },
    test: (c) => /^trade_map\.(imports|exports)\.unit_value_usd$/.test(c.metric),
  },
  {
    key: "calendar-year-only", level: "claim", label: "تبدیل لازم (سال شمسی)", check: "flagShamsiYear",
    text: "ارقام باید بر پایه‌ی سال میلادی باشند، نه سال مالی یا شمسی. ادعای سال شمسی پیش از مقایسه با ارقام میلادی باید تبدیل شود.",
    scope: { calendar: "شمسی" },
    test: (c) => c.qualifiers?.calendar === "شمسی" || /^1[34]\d\d$/.test(String(c.period || "")),
  },
  {
    key: "russia-is-rival", level: "output", label: "روسیه رقیب است", check: "checkRussiaInCompetition",
    text: "روسیه رقیب است، و در کشورهای اوراسیا رقیب اصلی. در امتیاز رقابت سهم روسیه هم حساب شود.",
    scope: { analyst: "scoring-v1", component: "competition" },
  },
  {
    key: "air-distance-estimated", level: "claim", label: "فاصله‌ی برآوردی هوایی", check: "flagAirDistance",
    text: "فاصله‌ی هوایی مسیر واقعی نیست؛ فاصله‌ی برآورد هوایی برچسب «برآوردی» بگیرد.",
    scope: { metric: "distance_km", method: "air" },
    test: (c) => c.metric === "distance_km" && c.qualifiers?.method === "air",
  },
  {
    key: "past-event-not-next-step", level: "output", label: "رویداد گذشته", check: "checkUpcomingEvents",
    text: "نمایشگاه و رویداد گذشته قدم بعدی نیست؛ رویداد با تاریخ گذشته از پیشنهادها حذف شود.",
    scope: { section: "نمایشگاه‌های پیش‌رو" },
  },
];

export const RULE_KEYS = RULES.map((r) => r.key);
const CLAIM_RULES = RULES.filter((r) => r.level === "claim" && r.test);

// ------------------------------------------------------------------------------------------------ ثبت قاعده‌ها
/** هفت قاعده را (یک‌بار؛ idempotent) با وضعیت «پیشنهادی» ثبت می‌کند. متن عوض شود: ردیف تازه با supersedes، وضعیت دست‌نخورده. */
export function ensureRules({ at = new Date().toISOString() } = {}) {
  const open = new Map([...currentRows("rules").values()].filter((r) => !r.recorded_to && r.natural_key).map((r) => [r.natural_key, r]));
  let created = 0, changed = 0;
  for (const r of RULES) {
    const old = open.get(r.key);
    if (old && old.text === r.text && stable(old.scope) === stable(r.scope) && old.check === r.check) continue;
    const row = putRow("rules", makeRow("rules", {
      text: r.text, status: old ? old.status : "پیشنهادی", check: r.check, scope: r.scope, origin: "پروتکل ۱۵-۳", natural_key: r.key,
      label_fa: r.label, level: r.level, supersedes: old ? old.id : null, change_reason: old ? "متن یا بررسی قاعده تغییر کرد" : null,
      created_at: new Date().toISOString(),
    }, at));
    if (old) { closeRow("rules", old.id, { reason: row.change_reason, by: "rules", at }); changed += 1; } else created += 1;
  }
  return { created, changed };
}

export function listRules() {
  return [...currentRows("rules").values()].filter((r) => !r.recorded_to && r.natural_key);
}

// ------------------------------------------------------------------------------------------------ بررسی روی ادعاها
function reflag(idx, claim, flags, reason, at) {
  const { id, created_at, recorded_from, recorded_to, closed_reason, ...keep } = claim;
  const row = putRow("claims", makeRow("claims", { ...keep, rule_flags: flags, supersedes: id, change_reason: reason, created_at: new Date().toISOString() }, at));
  closeRow("claims", id, { reason, by: "rules", at });
  idx.claims.set(claim.natural_key, row);
  return row;
}

/** ادعاهای جفت‌شده‌ی «ایران به X صادر کرد» و «X از ایران وارد کرد» که نسبتشان از بازه‌ی مجاز بیرون است. */
function findContradictions(claims) {
  const [lo, hi] = RULES.find((r) => r.key === "importer-stats-preferred").scope.contradiction_ratio;
  const exporters = new Map();
  const importers = new Map();
  for (const c of claims) {
    if (c.metric === "iran_export_destination_tons") exporters.set(c.subject, c);
    else if (c.metric === "import_supplier_tons" && c.qualifiers?.supplier === "ایران") importers.set(c.subject, c);
  }
  const out = [];
  for (const [country, e] of exporters) {
    const i = importers.get(country);
    if (!i || !i.value) continue;
    const ratio = e.value / i.value;
    if (ratio > hi || ratio < lo) {
      out.push({ country, exporter: e, importer: i, ratio, reason: `تناقض: آمار گمرک ایران ${Math.round(e.value)} تن (۱۴۰۴ شمسی، ۱۰ ماه) در برابر آمار ${country} ${Math.round(i.value)} تن (${i.period}) — نسبت ${ratio.toFixed(2)}؛ آمار واردکننده معتبرتر است` });
    }
  }
  return out;
}

/** همه‌ی بررسی‌های سطح ادعا را روی ادعاهای باز اجرا می‌کند. idempotent: برچسبِ تغییرنکرده ردیف تازه نمی‌سازد. */
export function applyClaimRules(idx, { at = new Date().toISOString() } = {}) {
  const sourceKeys = new Map([...idx.sources.values()].map((s) => [s.id, s.natural_key]));
  const ctx = { sourceKey: (c) => sourceKeys.get(c.source_ids?.[0]) };
  const claims = [...idx.claims.values()];
  const contradictions = findContradictions(claims);
  const contraBy = new Map();
  for (const x of contradictions) { contraBy.set(x.exporter.id, x); contraBy.set(x.importer.id, x); }

  const counts = Object.fromEntries(RULE_KEYS.map((k) => [k, 0]));
  let changed = 0;
  for (const c of claims) {
    const want = new Set();
    for (const r of CLAIM_RULES) if (r.test(c, ctx)) want.add(r.key);
    const x = contraBy.get(c.id);
    if (x) want.add("importer-stats-preferred");
    for (const k of want) counts[k] += 1;
    const desired = [...want].sort();
    const current = [...(c.rule_flags || [])].sort();
    if (stable(desired) === stable(current)) continue;
    const added = desired.filter((k) => !current.includes(k));
    const reason = x && added.includes("importer-stats-preferred") ? x.reason : `قاعده‌ی پیشنهادی اعمال شد: ${added.join("، ") || "حذف برچسب"}`;
    reflag(idx, c, desired, reason, at);
    changed += 1;
  }
  return { flagged: counts, changed, contradictions: contradictions.map((x) => ({ country: x.country, ratio: Math.round(x.ratio * 100) / 100 })) };
}

// ------------------------------------------------------------------------------------------------ بررسی روی خروجی
const FA = "۰۱۲۳۴۵۶۷۸۹";
const ascii = (s) => String(s).replace(/[۰-۹]/g, (d) => FA.indexOf(d));

/** رتبه‌بندی: اگر سهم روسیه در تأمین‌کنندگان کشور معلوم است، شرح «رقابت» باید روسیه را ببیند؛ و روسیه در فهرست رقبای تنظیمات باشد. */
export function checkRussiaInCompetition({ analyses, claims, scoringConfig }) {
  const v = [];
  const rivals = scoringConfig?.competition?.rivals || [];
  if (!rivals.includes("روسیه")) v.push({ item: "scoring_config.competition.rivals", problem: "روسیه در فهرست رقبا نیست" });
  const russia = new Set();
  for (const c of claims) {
    const isRus = (c.metric === "import_supplier_tons" || c.metric === "import_supplier_share_pct" || c.metric === "mirror.supplier_share_pct") && c.qualifiers?.supplier === "روسیه" && Number(c.value) > 0;
    if (isRus) russia.add(c.subject);
  }
  let checked = 0;
  for (const a of analyses) {
    const country = a.payload?.country;
    if (!country || !russia.has(country)) continue;
    checked += 1;
    const note = a.payload?.notes?.competition || "";
    if (!note.includes("روسیه")) v.push({ item: country, problem: "سهم روسیه معلوم است ولی در شرح رقابت نیامده", note });
  }
  return { violations: v, checked: checked + 1 };
}

/** خلاصه: هر «نمایشگاه‌های پیش‌رو (قابل‌پیشنهاد)» که تاریخ پایانش پیش از امروز است نقض است. */
export function checkUpcomingEvents({ digestText, today }) {
  const v = [];
  let checked = 0;
  if (!digestText) return { violations: v, checked, skipped: "خلاصه در دسترس نبود" };
  let country = "";
  for (const raw of digestText.split("\n")) {
    const line = ascii(raw); // خلاصه با ارقام لاتین است، ولی اگر روزی فارسی شد هم کار کند
    const h = line.match(/^### (.+?) — رتبه/);
    if (h) country = h[1];
    if (!line.startsWith("- نمایشگاه‌های پیش‌رو")) continue;
    for (const m of line.matchAll(/([^؛:]+?) \(پایان (\d{4}-\d{2}-\d{2})\)/g)) {
      checked += 1;
      const end = m[2];
      if (end < today) v.push({ item: `${country}: ${m[1].replace(/^.*:\s*/, "").trim()}`, problem: `تاریخ پایان ${end} گذشته است` });
    }
  }
  return { violations: v, checked };
}

/** بررسی‌های سطح خروجی را اجرا و نتیجه را به‌صورت تحلیل «rule-check» در حافظه ثبت می‌کند. */
export function runOutputChecks(idx, { today, digestText, scoringConfig, at = new Date().toISOString() }) {
  const claims = [...idx.claims.values()];
  const analyses = [...idx.analyses.values()].filter((a) => a.analyst === "scoring-v1");
  const results = {
    "russia-is-rival": checkRussiaInCompetition({ analyses, claims, scoringConfig }),
    "past-event-not-next-step": checkUpcomingEvents({ digestText, today }),
  };
  const out = {};
  for (const [key, r] of Object.entries(results)) {
    upsertAnalysis(idx, {
      key: `rule-check:${key}`, analyst: "rule-check", method_version: key, model: null,
      statement: r.skipped ? `${key}: بررسی نشد (${r.skipped})` : r.violations.length ? `${key}: ${r.violations.length} مورد نقض` : `${key}: بدون نقض (${r.checked} مورد بررسی شد)`,
      claim_ids: [], payload: { violations: r.violations, checked: r.checked, skipped: r.skipped || null, today },
    }, { at });
    out[key] = { violations: r.violations.length, checked: r.checked };
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ مصرف‌کننده‌ها (تحلیل‌گرهای بعدی)
/** آیا این ادعا را می‌شود به‌عنوان «قیمت» به کار برد؟ ارزش واحد و آمار کم‌اظهار نه. */
export function isUsableAsPrice(claim) {
  if (claim.metric !== "price") return false;
  return !(claim.rule_flags || []).some((k) => k === "iran-customs-underdeclared" || k === "price-type-not-comparable");
}

/** مقایسه‌ی دو قیمت فقط وقتی مجاز است که هر دو «قیمت» و هم‌نوع باشند (فوب با فوب، سی‌آی‌اف با سی‌آی‌اف). */
export function comparePrices(a, b) {
  if (!isUsableAsPrice(a) || !isUsableAsPrice(b)) return { ok: false, reason: "یکی از دو عدد قیمت قابل‌استفاده نیست (ارزش واحد یا آمار کم‌اظهار)" };
  if (a.qualifiers?.price_type !== b.qualifiers?.price_type) return { ok: false, reason: `نوع قیمت متفاوت است (${a.qualifiers?.price_type} در برابر ${b.qualifiers?.price_type})` };
  if (a.qualifiers?.product !== b.qualifiers?.product) return { ok: false, reason: "محصول متفاوت است" };
  return { ok: true, ratio: a.value / b.value };
}

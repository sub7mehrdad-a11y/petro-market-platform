// قاعده‌ها و بررسی‌های بسته‌ی دامنه‌ی جوش‌شیرین (پروتکل ۰٫۲ بخش ۱۵-۳). موتور اعمال آن‌ها در هسته است (rules.js)؛ این‌جا فقط محتوا.

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

/** ادعاهای جفت‌شده‌ی متناقض به شکل عمومی برای موتور: [{ruleKey, claimIds, reason, summary}]. */
export function pairedFlags(claims) {
  return findContradictions(claims).map((x) => ({ ruleKey: "importer-stats-preferred", claimIds: [x.exporter.id, x.importer.id], reason: x.reason, summary: { country: x.country, ratio: x.ratio } }));
}

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

/** بررسی‌های سطح خروجی: کلید قاعده ← تابع روی {analyses, claims, scoringConfig, digestText, today}. */
export const OUTPUT_CHECKS = {
  "russia-is-rival": (ctx) => checkRussiaInCompetition({ analyses: ctx.analyses.filter((a) => a.analyst === "scoring-v1"), claims: ctx.claims, scoringConfig: ctx.scoringConfig }),
  "past-event-not-next-step": (ctx) => checkUpcomingEvents({ digestText: ctx.digestText, today: ctx.today }),
};

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

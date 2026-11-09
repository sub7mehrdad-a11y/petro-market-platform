import fs from "fs";
import path from "path";
import { currentRows } from "../../store";
import { METRIC } from "./migrate";
import { periodOf, shamsiSpan, staleness } from "../../periods";

// خلاصه‌ی جامع «سایه»: ساخته‌شده از حافظه (ادعاها و تحلیل‌ها)، نه از فایل‌های خام (مرحله‌ی ۲).
// پوشش: بخش ۱ (رتبه‌بندی، از تحلیل‌های scoring-v1)، ۲ (قیمت‌ها)، ۳ (صادرات ایران) و خطوط ساخت‌یافته‌ی هر کشور در بخش ۵
// (امتیاز/شرح/بندر/تأمین‌کنندگان/تعرفه/عرضه و مصرف/اتحادیه). شرکت‌ها، نمایشگاه‌ها، اخبار و رقبا هنوز فقط در خلاصه‌ی قدیمی‌اند
// (موجودیت‌اند یا در مرحله‌های بعد). تا برابری ثابت نشود خلاصه‌ی قدیمی مرجع می‌ماند و این فایل فقط «سایه» است.

const CFG_FILE = () => path.join(process.env.BRAIN_DATA_DIR || path.join(process.cwd(), "..", "data"), "brain", "scoring_config.json");

const LABEL = {
  market_size: "بازار بزرگ", price_room: "ارزش واحد واردات بالا (نشانه‌ی سطح قیمت مقصد، نه فوب)", competition: "رقابت کم",
  proximity: "نزدیک به ایران", growth: "بازار رو به رشد", tariff_and_union: "تعرفه/توافق تجاری مناسب",
};
const FLAG_FA = {
  unit_value_suspect: "ارزش واحد مشکوک", shares_from_text: "سهم از متن پرونده", distance_estimated: "فاصله برآوردی هوایی",
  dual_role: "بازار و رقیب هم‌زمان", from_competitor_doc: "پرونده از سند رقیب (بدون پروفایل کشور)",
};

const trunc = (s, n) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
};
const fmt = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }));
/** معادل «:g» پایتون برای قیمت‌ها */
const g = (v) => String(Number(Number(v).toPrecision(6)));
/** معادل «{v}» پایتون برای اعداد صحیح/اعشاری در JSON */
const py = (v) => (typeof v === "boolean" ? (v ? "True" : "False") : v === null ? "None" : String(v));

function openClaims() {
  const bySubject = new Map();
  for (const c of currentRows("claims").values()) {
    if (c.recorded_to || c.status === "بسته‌شده") continue; // ادعای ردشده در بازبینی انسانی در خلاصه نمی‌آید
    if (!bySubject.has(c.subject)) bySubject.set(c.subject, []);
    bySubject.get(c.subject).push(c);
  }
  return bySubject;
}
const pick = (list, metric) => list.filter((c) => c.metric === metric);
const byOrder = (a, b) => (a.qualifiers?.order ?? 0) - (b.qualifiers?.order ?? 0);

function rankingSection(analyses, cfg) {
  const rows = analyses.map((a) => a.payload).sort((x, y) => x.rank - y.rank);
  const L = ["## ۱. رتبه‌بندی کشورهای هدف (امتیاز ۰ تا ۱۰۰، فرمول شفاف؛ وزن‌ها: " + Object.entries(cfg.weights).map(([k, v]) => `${LABEL[k]} ${v.toFixed(2)}`).join("، ") + ")"];
  for (const r of rows) {
    const extra = r.flags.length ? ` [برچسب: ${r.flags.map((f) => FLAG_FA[f] || f).join("، ")}]` : "";
    L.push(`${r.rank}. ${r.country} — ${r.score} (ردهٔ ${r.tier}): ${r.strengths.join("؛ ") || "—"}${r.weaknesses.length ? " | ضعف: " + r.weaknesses.join("، ") : ""}${extra}`);
  }
  return L;
}

function priceSection(all, sources, cfg, today) {
  const series = new Map();
  for (const list of all.values()) {
    for (const c of pick(list, METRIC.PRICE)) {
      const k = `${c.qualifiers.product}|${c.subject}|${c.qualifiers.price_type}`;
      if (!series.has(k)) series.set(k, []);
      series.get(k).push(c);
    }
  }
  const L = [`قیمت‌ها از حافظه (هر قیمت با «دوره‌ی داده» استاندارد و سنش نسبت به ${today})؛ ترتیب = ترتیب نخستین دیده‌شدن سری.`];
  const limits = cfg.price_staleness_days;
  const ordered = [...series.entries()].sort((a, b) => a[1][0].recorded_from.localeCompare(b[1][0].recorded_from));
  for (const [, list] of ordered) {
    list.sort((a, b) => (periodOf(a.period).end || "").localeCompare(periodOf(b.period).end || ""));
    const cur = list[list.length - 1];
    const prev = list.length > 1 ? list[list.length - 2] : null;
    const st = staleness(cur.period, today, limits);
    const period = st.label ? `دوره‌ی داده ${st.label}، ${st.age} روز پیش از امروز` + (st.stale ? ` — **کهنه** (بیش از ${limits[st.kind]} روز)` : "") : `دوره‌ی نامشخص («${cur.period}»)`;
    let trend = "";
    if (prev && prev.value) {
      const d = ((cur.value - prev.value) / prev.value) * 100;
      trend = `؛ نسبت به دوره‌ی قبل (${prev.period}): ${d >= 0 ? "+" : ""}${d.toFixed(1)}٪`;
    }
    const srcName = sources.get(cur.source_ids[0])?.origin || "نامشخص";
    L.push(`- ${cur.qualifiers.product} | ${cur.subject} | ${cur.qualifiers.price_type}: ${g(cur.value)} ${cur.unit} (${period}؛ منبع ${srcName})${trend}`);
  }
  L.push(`- قیمت مرجع سپهران شیمی (پایه): حدود ${cfg.reference_price_fob_usd_per_ton} دلار بر تن FOB.`);
  return L;
}

function iranSection(all, cfg) {
  const list = all.get("ایران") || [];
  const [lo, hi] = cfg.iran_customs.real_fob_range;
  const L = [
    `آمار گمرک ایران (کد 28363090) **کم‌اظهار** است: ارزش واحد گمرکی با قیمت واقعی صادراتی (${lo} تا ${hi} دلار بر تن فوب) نمی‌خواند و **هرگز به‌عنوان قیمت فوب به کار نمی‌رود**. سال‌ها **شمسی**‌اند (سال ۱۴۰۴ ≈ مارس ۲۰۲۵ تا مارس ۲۰۲۶)؛ با سال میلادی ارقام دیگر مقایسه نکن.`,
  ];
  const years = [...new Set(pick(list, METRIC.IRAN_TONS).concat(pick(list, METRIC.IRAN_VALUE)).map((c) => c.period))].sort();
  for (const y of years.slice(-4)) {
    const tons = pick(list, METRIC.IRAN_TONS).find((c) => c.period === y);
    const val = pick(list, METRIC.IRAN_VALUE).find((c) => c.period === y);
    const q = (tons || val).qualifiers;
    const [start, end] = shamsiSpan(y);
    const uv = tons && val && tons.value && val.value ? val.value / tons.value : null;
    const part = q.months_covered ? `، فقط ${q.months_covered} ماه` : q.is_partial_year ? " (ناقص)" : "";
    L.push(`- سال شمسی ${y} (${start} تا ${end}${part}): ${fmt(tons?.value)} تن، ${fmt(val?.value)} دلار` + (uv ? `؛ ارزش واحد گمرکی ≈ ${Math.round(uv).toLocaleString("en-US")} دلار/تن (کم‌اظهار؛ قیمت واقعی نیست)` : ""));
  }
  return L;
}

function countryLines(a, list) {
  const r = a.payload;
  const L = [`### ${r.country} — رتبه ${r.rank} از ${a.n}، امتیاز ${r.score}، ردهٔ ${r.tier}`];
  L.push("- مؤلفه‌ها: " + Object.entries(r.components).map(([k, v]) => `${LABEL[k]} ${v.toFixed(2)}`).join("؛ "));
  L.push("- شرح: " + Object.values(r.notes).join("؛ "));
  if (r.strengths.length) L.push("- نقاط قوت: " + r.strengths.join("، "));
  if (r.weaknesses.length) L.push("- نقاط ضعف: " + r.weaknesses.join("، "));
  if (r.flags.length) L.push("- برچسب‌ها: " + r.flags.map((f) => FLAG_FA[f] || f).join("، "));
  if (r.flags.includes("dual_role")) L.push("- ⚠ این کشور هم بازار است هم رقیب (تولید داخلی/صادرات)؛ امتیاز فقط واردات را می‌سنجد و تا تصمیم بخش ۱۸-۶ سند با احتیاط خوانده شود.");
  if (r.data_gaps.length) L.push("- خلأ داده: " + r.data_gaps.join("، "));
  const port = pick(list, METRIC.PORT)[0];
  if (port) L.push(`- بندر/ورودی اصلی: ${port.value}`);
  const sup = [...pick(list, METRIC.SUPPLIER_TONS), ...pick(list, METRIC.SUPPLIER_SHARE)].sort(byOrder);
  const partners = pick(list, METRIC.PARTNER_NOTE).sort(byOrder);
  if (sup.length) {
    const year = sup[0].period || "";
    L.push(`- تأمین‌کنندگان ${year}: ` + sup.slice(0, 6).map((s) => (s.metric === METRIC.SUPPLIER_TONS ? `${s.qualifiers.supplier} ${fmt(s.value)} تن` : `${s.qualifiers.supplier} ${s.value}٪`)).join("، "));
  } else if (partners.length) {
    L.push("- شرکای اصلی: " + partners.slice(0, 4).map((p) => `${p.qualifiers.partner} (${trunc(p.value, 80)})`).join("؛ "));
  }
  const tariff = pick(list, METRIC.TARIFF_NOTE)[0];
  if (tariff) L.push(`- تعرفه/مقررات: ${trunc(tariff.value, 400)}`);
  // معادل list(ss.items())[:6] در پایتون: شش کلید نخستِ فایل، و از آن‌ها فقط مقادیر ساده
  const ss = list.filter((c) => c.metric.startsWith("supply_stats.") && c.qualifiers.order < 6).sort(byOrder);
  if (ss.length) L.push("- عرضه و مصرف: " + ss.slice(0, 6).map((c) => `${c.metric.slice("supply_stats.".length)}=${py(c.value)}`).join("؛ "));
  const note = list.find((c) => c.metric === "real_trade_stats.imports_note");
  if (note) L.push(`- نکته‌ی آمار: ${trunc(note.value, 450)}`);
  const dom = list.find((c) => c.metric === "real_trade_stats.domestic_production_tons");
  if (dom && dom.value) L.push(`- تولید داخلی: حدود ${fmt(dom.value)} تن (در امتیاز رقابت دیده نمی‌شود)`);
  const us = pick(list, METRIC.UNION).sort(byOrder);
  if (us.length) L.push("- اتحادیه/توافق: " + us.slice(0, 3).map((u) => `${u.value} (${trunc(u.qualifiers.iran_status_fa, 90)})`).join("؛ "));
  return L;
}

/** today: «YYYY-MM-DD». برمی‌گرداند متن سایه. */
export function buildShadowDigest({ today }) {
  const cfg = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ CFG_FILE(), "utf-8"));
  const all = openClaims();
  const sources = new Map([...currentRows("sources").values()].map((s) => [s.id, s]));
  const analyses = [...currentRows("analyses").values()].filter((a) => !a.recorded_to && a.analyst === "scoring-v1");
  const n = analyses.length;
  analyses.forEach((a) => { a.n = n; });
  const L = [
    "# خلاصه‌ی جامع (نسخه‌ی سایه، ساخته‌شده از حافظه)",
    `ساخته‌شده: ${today} — از ادعاها و تحلیل‌های حافظه؛ خلاصه‌ی قدیمی همچنان مرجع است.`,
    "",
    ...rankingSection(analyses, cfg),
    "",
    "## ۲. قیمت‌های بازار",
    ...priceSection(all, sources, cfg, today),
    "",
    "## ۳. صادرات ایران (گمرک)",
    ...iranSection(all, cfg),
    "",
    "## ۵. کشورهای دارای پرونده (فقط خطوط ساخت‌یافته؛ شرکت‌ها/نمایشگاه/خبر هنوز در خلاصه‌ی قدیمی)",
  ];
  for (const a of analyses.sort((x, y) => x.payload.country.localeCompare(y.payload.country, "fa"))) {
    L.push(...countryLines(a, all.get(a.payload.country) || []), "");
  }
  // تناقض‌های بررسی‌نشده (مرحله‌ی ۵): مدل باید بداند کدام عددها بین منابع اختلاف دارند و نباید یکی را قطعی بگیرد
  const open = [...currentRows("queue").values()].filter((r) => !r.recorded_to && r.status === "open" && r.kind === "contradiction");
  L.push("## ۱۰. تناقض‌های بازِ بررسی‌نشده (منابع مستقل اختلاف دارند؛ هیچ‌کدام قطعی نیست)");
  if (!open.length) L.push("- (مورد بازی نیست)");
  for (const q of open.sort((a, b) => a.subject.localeCompare(b.subject, "fa"))) {
    L.push(`- ${q.subject} (${q.period}): ${q.label} — ${q.members.map((m) => `${m.source}=${m.value}`).join(" در برابر ")}`);
  }
  return L.join("\n") + "\n";
}

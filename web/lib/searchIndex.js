import fs from "fs";
import path from "path";
import {
  getCompanies, getExhibitions, getNewsAnalysis, getCompetitors,
  getReportsManifest, getFlatPriceRecords, getTurkeyWatchLog, getChinaWatchLog,
} from "./data";

const ROOT = path.join(process.cwd(), "..");
const REPORTS_DIR = path.join(ROOT, "reports");

/**
 * نرمال‌سازی متن فارسی برای جست‌وجو.
 * بدون این، جست‌وجوی «كنيا» (با ك و ي عربی) هیچ‌وقت «کنیا» (با ک و ی فارسی) رو
 * پیدا نمی‌کنه، و «جوش‌شیرین» با نیم‌فاصله با «جوش شیرین» مطابقت نمی‌ده.
 */
export function normalizeFa(str) {
  if (!str) return "";
  return String(str)
    .replace(/[يى]/g, "ی") // ي/ى عربی → ی فارسی
    .replace(/ك/g, "ک") // ك عربی → ک فارسی
    .replace(/[‌‏‎]/g, " ") // نیم‌فاصله و کاراکترهای جهت → فاصله
    .replace(/[ً-ْ]/g, "") // اعراب
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)) // ارقام فارسی → لاتین
    .replace(/[،؛؟.,;:!?()[\]«»"'\-–—]/g, " ") // نشانه‌گذاری
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function readJsonSafe(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return fallback;
  }
}

/** متن قابل جست‌وجو را از یک گزارش parse‌شده بیرون می‌کشد. */
function reportToText(parsed) {
  const parts = [];
  if (parsed.report_type === "summary") {
    for (const s of parsed.key_stats || []) parts.push(`${s.label}: ${s.value} ${s.unit}`);
    for (const s of parsed.sections || []) parts.push(`${s.heading || ""}\n${s.body || ""}`);
    for (const c of parsed.charts || []) parts.push(c.title || "");
  } else {
    for (const b of parsed.blocks || []) {
      if (b.type === "table") {
        parts.push((b.headers || []).join(" | "));
        for (const row of b.rows || []) parts.push(row.join(" | "));
      } else if (b.text) {
        parts.push(b.text);
      }
    }
  }
  return parts.join("\n");
}

/**
 * ایندکس یکپارچه‌ی همه‌ی محتوای سایت.
 * هر آیتم: { id, type, typeLabel, title, subtitle, body, url }
 */
export function buildSearchIndex() {
  const items = [];

  // --- گزارش‌ها ---
  for (const entry of getReportsManifest()) {
    if (!entry.parsed_path) continue;
    const parsed = readJsonSafe(path.join(REPORTS_DIR, entry.parsed_path), null);
    if (!parsed) continue;
    items.push({
      id: `report:${entry.id}`,
      type: "report",
      typeLabel: entry.report_type === "summary" ? "گزارش هوشمند" : "گزارش مفصل",
      title: entry.title,
      subtitle: `${entry.country} · ${entry.product}`,
      body: reportToText(parsed),
      url: `/reports/${entry.id}`,
    });
  }

  // --- شرکت‌ها ---
  for (const c of getCompanies()) {
    items.push({
      id: `company:${c.id}`,
      type: "company",
      typeLabel: "شرکت",
      title: c.english_name,
      subtitle: [c.country, c.industry].filter(Boolean).join(" · "),
      body: [c.arabic_name, c.industry, c.target_grade, c.purchasing_potential,
             c.address, c.action_plan, c.email, c.website].filter(Boolean).join(" \n"),
      url: `/companies`,
    });
  }

  // --- نمایشگاه‌ها ---
  for (const e of getExhibitions()) {
    items.push({
      id: `exhibition:${e.id}`,
      type: "exhibition",
      typeLabel: "نمایشگاه",
      title: e.name,
      subtitle: [e.country, e.date].filter(Boolean).join(" · "),
      body: [e.location, e.organizer, e.focus, e.target_grade].filter(Boolean).join(" \n"),
      url: `/exhibitions`,
    });
  }

  // --- اخبار تحلیلی ---
  getNewsAnalysis().forEach((n, i) => {
    items.push({
      id: `news:${n.generated_at || i}`,
      type: "news",
      typeLabel: "خبر تحلیلی",
      title: n.headline_fa || "یادداشت تحلیلی",
      subtitle: `${n.date} · ${(n.sources || []).map((s) => s.name).join("، ")}`,
      body: n.analysis_fa || "",
      url: `/news`,
    });
  });

  // --- رقبا ---
  for (const c of Object.values(getCompetitors())) {
    const parts = [c.summary, c.rank_note];
    for (const p of c.producers || []) {
      parts.push(`${p.name} (${p.name_en}) — ${p.owner} — ${p.tech} — ظرفیت ${p.bicarb_capacity} — ${p.location}. ${p.notes || ""}`);
    }
    for (const cp of c.competitive_position || []) {
      parts.push(`${cp.vs}: ${(cp.points || []).join(" ")}`);
    }
    parts.push(...(c.strategic_takeaways || []));
    if (c.iraq_case) parts.push(`${c.iraq_case.title}: ${c.iraq_case.body}`);
    if (c.cost_structure) {
      parts.push(c.cost_structure.synthetic_estimate || "");
      for (const r of c.cost_structure.rows || []) {
        parts.push(`${r.metric}: ۲۰۲۳=${r.y2023} ۲۰۲۴=${r.y2024} ۲۰۲۵=${r.y2025}`);
      }
    }
    for (const d of c.export_destinations_2024 || []) {
      parts.push(`صادرات به ${d.country}: ${d.value_musd} میلیون دلار، ${d.volume_t} تن. ${d.note}`);
    }
    for (const t of c.fob_price_trend || []) parts.push(`${t.period}: ${t.range} — ${t.note}`);
    for (const f of (c.freight_rates?.rows) || []) {
      parts.push(`کرایه ${f.origin} تا ${f.dest}: ${f.truck_usd} (${f.per_ton_usd} هر تن)`);
    }
    items.push({
      id: `competitor:${c.id}`,
      type: "competitor",
      typeLabel: "تحلیل رقیب",
      title: `تحلیل رقیب: ${c.name}`,
      subtitle: c.rank_note,
      body: parts.filter(Boolean).join("\n"),
      url: `/competitors/${c.id}`,
    });
  }

  // --- رصد روزانه‌ی ترکیه ---
  getTurkeyWatchLog().slice(0, 30).forEach((w) => {
    const parts = [w.market_note];
    for (const u of w.company_updates || []) parts.push(`${u.company}: ${u.headline} — ${u.summary}`);
    for (const u of w.logistics_updates || []) parts.push(`${u.headline} — ${u.summary}`);
    items.push({
      id: `turkeywatch:${w.generated_at}`,
      type: "turkeywatch",
      typeLabel: "رصد ترکیه",
      title: w.headline_fa || "رصد روزانه‌ی ترکیه",
      subtitle: w.date,
      body: parts.filter(Boolean).join("\n"),
      url: `/competitors/turkey`,
    });
  });

  // --- رصد روزانه‌ی چین ---
  getChinaWatchLog().slice(0, 30).forEach((w) => {
    const parts = [w.market_note];
    for (const u of w.company_updates || []) parts.push(`${u.company}: ${u.headline} — ${u.summary}`);
    for (const u of w.logistics_updates || []) parts.push(`${u.headline} — ${u.summary}`);
    items.push({
      id: `chinawatch:${w.generated_at}`,
      type: "chinawatch",
      typeLabel: "رصد چین",
      title: w.headline_fa || "رصد روزانه‌ی چین",
      subtitle: w.date,
      body: parts.filter(Boolean).join("\n"),
      url: `/competitors/china`,
    });
  });

  // --- قیمت‌ها (فقط جدیدترین رکورد هر ترکیب، تا ایندکس از تکرار پر نشه) ---
  const seen = new Set();
  for (const p of [...getFlatPriceRecords()].reverse()) {
    if (p.value == null) continue;
    const key = `${p.product}|${p.country_or_region}|${p.price_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: `price:${key}`,
      type: "price",
      typeLabel: "قیمت",
      title: `${p.product} — ${p.country_or_region} (${p.price_type})`,
      subtitle: `${p.value} ${p.currency}/${p.unit} · ${p.source_reported_date || ""}`,
      body: [p.note, p.source_name].filter(Boolean).join(" \n"),
      url: `/`,
    });
  }

  return items.map((it) => ({
    ...it,
    _norm: normalizeFa(`${it.title} ${it.subtitle} ${it.body}`),
  }));
}

/** امتیازدهی ساده‌ی کلیدواژه‌ای — بدون نیاز به API. */
export function scoreItem(item, normalizedQuery) {
  if (!normalizedQuery) return 0;
  const tokens = normalizedQuery.split(" ").filter((t) => t.length > 1);
  if (tokens.length === 0) return 0;

  let score = 0;
  const titleNorm = normalizeFa(item.title);

  // عبارت کامل، بالاترین وزن
  if (item._norm.includes(normalizedQuery)) score += 30;
  if (titleNorm.includes(normalizedQuery)) score += 40;

  for (const t of tokens) {
    if (titleNorm.includes(t)) score += 8;
    const matches = item._norm.split(t).length - 1;
    score += Math.min(matches, 5) * 2;
  }
  return score;
}

export function searchIndex(items, query, limit = 40) {
  const q = normalizeFa(query);
  if (!q) return [];
  return items
    .map((it) => ({ item: it, score: scoreItem(it, q) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.item);
}

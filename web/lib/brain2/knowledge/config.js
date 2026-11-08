import fs from "fs";
import path from "path";
import { periodOf } from "../periods";

// پیکربندی و ابزارهای مشترک چرخه‌ی روزانه‌ی دانش (مرحله‌ی ۵). ضرایب در data/brain/confidence_config.json هستند، نه در کد.

const FA = "۰۱۲۳۴۵۶۷۸۹";
export const asciiDigits = (s) => String(s ?? "").replace(/[۰-۹]/g, (d) => FA.indexOf(d));

let cache = null;
export function loadKnowledgeConfig() {
  const file = path.join(process.env.BRAIN_DATA_DIR || path.join(process.cwd(), "..", "data"), "brain", "confidence_config.json");
  const st = fs.statSync(/* turbopackIgnore: true */ file);
  if (cache && cache.file === file && cache.mtime === st.mtimeMs) return cache.cfg;
  const cfg = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ file, "utf-8"));
  cache = { file, mtime: st.mtimeMs, cfg };
  return cfg;
}

const dayNumber = (iso) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
export const daysBetween = (a, b) => dayNumber(b) - dayNumber(a);

/** پایان دوره‌ی «جهان» برای یک ادعا (YYYY-MM-DD) یا null. سال شمسی تقریباً به پایان اسفند همان سال تبدیل می‌شود. */
export function periodEnd(claim) {
  const p = asciiDigits(claim.period).trim();
  if (!p) return null;
  if (claim.qualifiers?.calendar === "شمسی" && /^\d{4}$/.test(p)) return `${+p + 622}-03-20`;
  const e = periodOf(p).end;
  if (e) return e;
  if (/^\d{4}$/.test(p)) return `${p}-12-31`;
  const r = p.match(/^\d{4}-(\d{4})$/);
  return r ? `${r[1]}-12-31` : null;
}

export function metricClass(metric, cfg) {
  const m = cfg.metric_class || {};
  return m[metric] || (metric.startsWith("trade_map.") || metric.startsWith("mirror.") ? "annual" : m.default || "annual");
}

/** ضریب تازگی ۰٫۷..۱: هر سنجه نیمه‌عمر خودش را دارد. ادعای بدون دوره (ایستا) تازگی کامل دارد. */
export function freshness(claim, today, cfg) {
  const end = periodEnd(claim);
  if (!end) return 1;
  const age = Math.max(0, daysBetween(end, today));
  const half = cfg.half_life_days[metricClass(claim.metric, cfg)] || cfg.half_life_days.annual;
  const floor = cfg.freshness_floor;
  return floor + (1 - floor) * 0.5 ** (age / half);
}

/** اعتبار پایه‌ی منبع بر اساس پیشوند کلید طبیعی منبع (تا ساخته‌شدن مخزن اعتبار در مرحله‌ی ۸). */
export function sourceBase(sourceKey, cfg) {
  const table = cfg.source_base;
  const hit = Object.keys(table).filter((k) => k !== "default" && String(sourceKey || "").startsWith(k)).sort((a, b) => b.length - a.length)[0];
  return table[hit] ?? table.default;
}

export const round2 = (x) => Math.round(x * 100) / 100;

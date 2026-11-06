// دوره و کهنگی قیمت‌ها و سال شمسی. معادل Node توابع scripts/brain_core.py (period_of, staleness, shamsi_span)؛
// آزمون هم‌ارزی مرحله‌ی ۲ مطمئن می‌شود هر دو یک خروجی می‌دهند. تاریخ‌ها رشته‌ی YYYY-MM-DD و محاسبه‌ها به UTC‌اند.

const MONTHS_EN = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const pad = (n) => String(n).padStart(2, "0");

function eom(y, m) {
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** «June 2026» | «2026-06» | «Q2 2026» | «2026-Q2» | «2026-09-07» ← { kind: month|quarter|day|unknown, label, end } */
export function periodOf(reported) {
  const s = String(reported ?? "").trim().toLowerCase();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { kind: "day", label: s, end: s };
  m = s.match(/^(\d{4})-(\d{2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return { kind: "month", label: `${+m[1]}-${pad(+m[2])}`, end: eom(+m[1], +m[2]) };
  m = s.match(/^q([1-4])\s*(\d{4})$/) || s.match(/^(\d{4})-q([1-4])$/);
  if (m) {
    const [a, b] = [m[1], m[2]];
    const [q, y] = a.length === 1 ? [+a, +b] : [+b, +a];
    return { kind: "quarter", label: `${y}-Q${q}`, end: eom(y, q * 3) };
  }
  m = s.match(/^([a-z]+)\s+(\d{4})$/);
  if (m && MONTHS_EN.includes(m[1])) {
    const mo = MONTHS_EN.indexOf(m[1]) + 1;
    return { kind: "month", label: `${m[2]}-${pad(mo)}`, end: eom(+m[2], mo) };
  }
  return { kind: "unknown", label: null, end: null };
}

const dayNumber = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};

/** { label, age, stale, kind }؛ دوره‌ی ناشناخته → label=null */
export function staleness(reported, today, limits) {
  const p = periodOf(reported);
  if (!p.end) return { label: null, age: null, stale: null, kind: "unknown" };
  const age = dayNumber(today) - dayNumber(p.end);
  const limit = limits[p.kind] ?? limits.month ?? 75;
  return { label: p.label, age, stale: age > limit, kind: p.kind, limit };
}

/** سال شمسی 1404 ← ["2025-03-21", "2026-03-20"] (تقریبی) */
export function shamsiSpan(yearFa) {
  const y = parseInt(yearFa, 10);
  return [`${y + 621}-03-21`, `${y + 622}-03-20`];
}

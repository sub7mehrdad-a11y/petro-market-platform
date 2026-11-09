import fs from "fs";
import path from "path";
import { periodOf } from "../../../periods";
import { readSalesSnapshots } from "../../../../salesStore";

// خواندن «مقدار واقعی» و «خط مبنا» از منبع از پیش تعریف‌شده‌ی هر پرسش (پروتکل ۸-۵). فقط جزء سنجش این ماژول را import می‌کند.
// ⚠ سری «internal_sales» محرمانه است (گزارش فروش تیم بازرگانی): فقط همین‌جا و بدون مدل خوانده می‌شود، و به بیرون فقط
// «مقدار نتیجه» (میانگین وزنی ماهانه)، نه هیچ ردیف قرارداد یا مشتری، می‌رسد.
//
// قاعده‌ی «بدون داوری»: اگر مقدار واقعیِ همان ماه هدف نیامده باشد، یا منبع کهنه باشد (آخرین مشاهده‌ی منبع بیش از
// max_staleness_days روز پیش از لحظه‌ی سنجش)، نتیجه ok=false با دلیل است و پیش‌بینی نمره نمی‌گیرد.

const dataDir = () => process.env.BRAIN_DATA_DIR || path.join(process.cwd(), "..", "data");
const dayNumber = (iso) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
const daysBetween = (a, b) => dayNumber(b) - dayNumber(a);
const monthEnd = (ym) => { const [y, m] = ym.split("-").map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };
const prevMonth = (ym) => { const [y, m] = ym.split("-").map(Number); const t = y * 12 + (m - 1) - 1; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };

function priceDays() {
  try {
    const raw = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ dataDir(), "price_history.json"), "utf-8"));
    return Array.isArray(raw) ? raw : Object.values(raw).find(Array.isArray) || [];
  } catch {
    return [];
  }
}

const matches = (r, s) => r.value != null && r.product === s.product && r.country_or_region === s.country_or_region && r.price_type === s.price_type;

// ---- سری قیمت (price_history)
function truthPriceHistory(q, now) {
  const t = q.target.truth_source;
  const month = q.target.target_month;
  const days = priceDays();
  let latestSeen = null;
  let found = null;
  for (const day of days) {
    for (const r of day.records || []) {
      if (!matches(r, t.series)) continue;
      latestSeen = day.date;
      if (periodOf(r.source_reported_date).label === month) found = { value: r.value, as_of: day.date, source: r.source_name || null }; // آخرین مشاهده‌ی همان دوره
    }
  }
  if (!latestSeen) return { ok: false, reason: "هیچ مقداری برای این سری ثبت نشده" };
  const age = daysBetween(latestSeen, now.toISOString());
  if (age > t.max_staleness_days) return { ok: false, reason: `منبع کهنه است (آخرین مشاهده ${age} روز پیش؛ حد مجاز ${t.max_staleness_days})` };
  if (!found) return { ok: false, reason: `مقدار دوره‌ی ${month} هنوز در منبع منتشر نشده` };
  return { ok: true, value: found.value, as_of: found.as_of, source: found.source || t.source_id };
}

function baselinePriceHistory(q, madeAt) {
  const t = q.target.truth_source;
  const cutoff = madeAt.slice(0, 10);
  let best = null;
  for (const day of priceDays()) {
    if (day.date > cutoff) continue;
    for (const r of day.records || []) {
      if (!matches(r, t.series)) continue;
      const end = periodOf(r.source_reported_date).end;
      if (!end) continue;
      if (!best || end > best.end || (end === best.end && day.date >= best.as_of)) best = { end, value: r.value, as_of: day.date };
    }
  }
  return best ? { value: best.value, as_of: best.as_of } : null;
}

// ---- فروش داخلی: میانگین وزنی قیمت سفارش‌های قطعی خوراکی FOB/FCA/EXW (USD) با تاریخ PI در یک ماه
const INCOTERMS = new Set(["FOB", "FCA", "EXW"]);
function monthlyAverage(snapshot, month) {
  let tons = 0, amount = 0, n = 0;
  for (const r of snapshot.rows || []) {
    if (r.stage !== "firm" || r.grade !== "خوراکی" || !INCOTERMS.has(r.incoterm) || (r.currency || "USD") !== "USD") continue;
    if (!(r.price > 0) || !(r.tons > 0) || !String(r.date || "").startsWith(month)) continue;
    tons += r.tons; amount += r.tons * r.price; n += 1;
  }
  return n ? { value: amount / tons, n } : null;
}

function truthInternalSales(q, now) {
  const t = q.target.truth_source;
  const month = q.target.target_month;
  const snaps = readSalesSnapshots();
  const last = snaps[snaps.length - 1];
  if (!last) return { ok: false, reason: "گزارش فروشی بارگذاری نشده" };
  const age = daysBetween(last.as_of, now.toISOString());
  if (age > t.max_staleness_days) return { ok: false, reason: `گزارش فروش کهنه است (آخرین بارگذاری ${age} روز پیش؛ حد مجاز ${t.max_staleness_days})` };
  if (last.as_of < monthEnd(month)) return { ok: false, reason: `آخرین گزارش فروش (${last.as_of}) پیش از پایان ماه ${month} است` };
  const avg = monthlyAverage(last, month);
  if (!avg) return { ok: false, reason: `سفارش قطعی خوراکی FOB/FCA/EXW با تاریخ PI در ${month} در گزارش نبود` };
  return { ok: true, value: Math.round(avg.value * 100) / 100, as_of: last.as_of, source: t.source_id, n_rows: avg.n };
}

function baselineInternalSales(q, madeAt) {
  const cutoff = madeAt.slice(0, 10);
  const snap = [...readSalesSnapshots()].reverse().find((s) => s.as_of <= cutoff);
  if (!snap) return null;
  let month = cutoff.slice(0, 7);
  for (let i = 0; i < 6; i++) { // ماه فعلی، و اگر داده نداشت تا شش ماه عقب
    const avg = monthlyAverage(snap, month);
    if (avg) return { value: Math.round(avg.value * 100) / 100, as_of: snap.as_of };
    month = prevMonth(month);
  }
  return null;
}

export const truthReaders = {
  price_history: { truth: truthPriceHistory, baseline: baselinePriceHistory },
  internal_sales: { truth: truthInternalSales, baseline: baselineInternalSales },
};

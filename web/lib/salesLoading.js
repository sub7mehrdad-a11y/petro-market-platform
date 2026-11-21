import { shipmentTotals } from "./salesContracts";

// لیست بارگیری و ارسال — تابع خالص. ترتیب صف بر پایه‌ی «زودتر پرداخت‌کننده» است:
//   تاریخ اولویت = تاریخ اولین پرداخت ثبت‌شده‌ی همان قرارداد (قراردادی که طبق گزارش فروش «Done» است و پرداخت ثبت‌شده ندارد، تاریخ PI را می‌گیرد).
//   تساوی: درصد پرداخت بیشتر، سپس تاریخ برنامه‌ی بارگیری.
//   قرارداد بدون هیچ پرداخت در صف نمی‌آید؛ در «منتظر پرداخت» می‌ماند.
// تناژ قابل‌بارگیری با پرداخت فعلی = تناژ قرارداد × (پرداخت‌شده ÷ مبلغ کل)، حداکثر کل تناژ.

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * @param contracts قراردادهای ذخیره‌شده‌ی پلتفرم (دارای shipments)
 * @param accountContracts accounts.contracts از buildAccounts (همه‌ی قراردادها، اکسل و پلتفرم؛ کلید = file_no)
 */
export function buildLoadingList(contracts, accountContracts) {
  const accByKey = new Map((accountContracts || []).map((a) => [a.key, a]));
  const platformByNo = new Map(contracts.map((c) => [c.file_no, c]));
  const queue = [];
  const loaded = [];
  const shipped = [];
  const unplanned = [];
  const waiting = [];

  const priorityOf = (acc, c) => {
    const first = (acc?.payments || []).filter((p) => p.type === "payment").map((p) => p.date).sort()[0] || null;
    if (first) return { date: first, basis: "payment" };
    if (acc?.basis === "sheet" && acc.paid > 0) return { date: acc.date || c?.date || null, basis: "sheet" };
    return { date: null, basis: "none" };
  };

  const info = (c, acc) => {
    const total = acc?.total ?? (c?.price != null && c?.tons ? round2(c.tons * c.price) : null);
    const paid = acc?.paid ?? 0;
    const paidPct = total ? Math.max(0, Math.min(100, round2((paid / total) * 100))) : null;
    const tons = c?.tons ?? acc?.tons ?? 0;
    const covered = total ? round2(Math.min(tons, (tons * Math.max(paid, 0)) / total)) : null;
    const pri = priorityOf(acc, c);
    return { total, paid, paid_pct: paidPct, covered_tons: covered, priority_date: pri.date, priority_basis: pri.basis, currency: acc?.currency || c?.currency || "USD" };
  };

  for (const c of contracts) {
    if (c.status === "cancelled") continue;
    const acc = accByKey.get(c.file_no);
    const base = { contract_id: c.id, file_no: c.file_no, buyer: c.buyer, country: c.country, grade: c.grade || null, contract_tons: c.tons, incoterm: c.incoterm || null, port: c.port || null, ...info(c, acc) };
    const t = shipmentTotals(c);
    for (const s of c.shipments || []) {
      const row = { ...base, shipment: s, remaining_tons: t.remaining };
      if (s.status === "shipped") shipped.push(row);
      else if (s.status === "loaded") loaded.push(row);
      else if (base.priority_date) queue.push(row);
      else waiting.push(row);
    }
    if (t.remaining > 0.001 && !c.steps?.settled?.done) {
      const row = { ...base, planned_tons: t.planned, remaining_tons: t.remaining, platform: true };
      (base.priority_date ? unplanned : waiting).push(base.priority_date ? row : { ...row, unplanned: true });
    }
  }
  // قراردادهای فقط‌اکسل (هنوز در پلتفرم نیستند) که پرداخت دارند: آماده‌ی ثبت بارگیری
  for (const a of accountContracts || []) {
    if (platformByNo.has(a.key)) continue;
    const pri = priorityOf(a, null);
    const row = {
      contract_id: null, file_no: a.key, buyer: a.buyer, country: a.country, grade: null, contract_tons: a.tons, incoterm: a.incoterm || null, port: null,
      total: a.total, paid: a.paid, paid_pct: a.total ? Math.max(0, Math.min(100, round2((a.paid / a.total) * 100))) : null,
      covered_tons: a.total ? round2(Math.min(a.tons, (a.tons * Math.max(a.paid, 0)) / a.total)) : null,
      priority_date: pri.date, priority_basis: pri.basis, currency: a.currency, planned_tons: 0, remaining_tons: a.tons, platform: false,
    };
    if (a.loaded) continue;
    if (pri.date) unplanned.push(row);
  }

  const byPriority = (a, b) =>
    String(a.priority_date).localeCompare(String(b.priority_date)) ||
    (b.paid_pct ?? 0) - (a.paid_pct ?? 0) ||
    String(a.shipment?.planned_date || "9999").localeCompare(String(b.shipment?.planned_date || "9999"));
  queue.sort(byPriority);
  unplanned.sort(byPriority);
  // یک ترتیب واحد: بارگیری‌های برنامه‌ریزی‌شده و تناژ پرداخت‌شده‌ی بدون برنامه، با هم بر اساس زودتر پرداخت‌کننده
  const ordered = [...queue.map((r) => ({ ...r, kind: "shipment" })), ...unplanned.map((r) => ({ ...r, kind: "unplanned" }))].sort(byPriority);
  ordered.forEach((r, i) => { r.rank = i + 1; });
  loaded.sort((a, b) => String(b.shipment.loaded_at || "").localeCompare(String(a.shipment.loaded_at || "")));
  shipped.sort((a, b) => String(b.shipment.shipped_at || "").localeCompare(String(a.shipment.shipped_at || "")));

  const sumTons = (rows, f) => round2(rows.reduce((s, r) => s + (f(r) || 0), 0));
  return {
    ordered, queue, unplanned, waiting, loaded, shipped,
    totals: {
      queued_tons: sumTons(queue, (r) => r.shipment.tons),
      unplanned_tons: sumTons(unplanned, (r) => r.remaining_tons),
      waiting_contracts: waiting.length,
      loaded_tons: sumTons(loaded, (r) => r.shipment.tons),
      shipped_tons: sumTons(shipped, (r) => r.shipment.tons),
    },
  };
}

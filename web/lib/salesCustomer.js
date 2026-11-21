import { daysBetween } from "./salesFormat";
import { customerKeyOf } from "./salesLedger";

// پروفایل تجاری یک مشتری — توابع خالص. ورودی: قراردادهای حساب همان مشتری (buildAccounts.contracts با customer_id) و تاریخ گزارش.

const round = (n, d = 0) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const sum = (rows, f) => rows.reduce((s, r) => s + (f(r) || 0), 0);

function wavg(rows) {
  const priced = rows.filter((r) => r.currency === "USD" && r.price != null && r.tons > 0);
  const t = sum(priced, (r) => r.tons);
  return t > 0 ? round(sum(priced, (r) => r.price * r.tons) / t, 1) : null;
}

/** @param contracts قراردادهای حساب این مشتری؛ asOf تاریخ گزارش؛ companyAvgPrice میانگین وزنی قیمت کل شرکت برای مقایسه */
export function buildCustomerStats(contracts, asOf, { companyAvgPrice = null } = {}) {
  const list = [...contracts].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const dated = list.filter((c) => c.date).map((c) => c.date).sort();
  const usd = list.filter((c) => c.currency === "USD");

  // ماهانه
  const byMonth = new Map();
  for (const c of list.filter((x) => x.date)) {
    const k = c.date.slice(0, 7);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k).push(c);
  }
  const months = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, rs]) => ({ month, tons: round(sum(rs, (r) => r.tons), 1), avg_price: wavg(rs), deals: rs.length }));

  // رفتار پرداخت: روز از تاریخ قرارداد تا هر پرداخت (وزن = مبلغ) و سهم مبلغِ به‌موقع (تا مهلت)
  let lagW = 0, lagA = 0, onTime = 0, payTotal = 0;
  for (const c of list) {
    for (const p of c.payments || []) {
      if (p.type === "refund" || !p.date || !c.date || p.estimated) continue;
      const lag = daysBetween(c.date, p.date);
      lagW += lag * p.amount; lagA += p.amount; payTotal += p.amount;
      if (lag <= (c.due_days ?? 14)) onTime += p.amount;
    }
  }
  const gaps = [];
  for (let i = 1; i < dated.length; i++) gaps.push(daysBetween(dated[i - 1], dated[i]));
  const avgPrice = wavg(list);
  const total = round(sum(usd, (c) => c.total));
  const paid = round(sum(usd, (c) => c.paid));

  return {
    deals: list.length, countries: [...new Set(list.map((c) => c.country))], tons: round(sum(list, (c) => c.tons), 1),
    revenue_usd: total, paid_usd: paid, balance_usd: round(sum(usd, (c) => (c.balance > 0 ? c.balance : 0))), overdue_usd: round(sum(usd, (c) => (c.overdue ? c.balance : 0))),
    paid_pct: total ? round((paid / total) * 100, 1) : null, avg_price: avgPrice,
    price_vs_company_pct: avgPrice != null && companyAvgPrice ? round(((avgPrice - companyAvgPrice) / companyAvgPrice) * 100, 1) : null,
    avg_order_tons: list.length ? round(sum(list, (c) => c.tons) / list.length, 1) : null,
    first_order: dated[0] || null, last_order: dated[dated.length - 1] || null, days_since_last: dated.length ? daysBetween(dated[dated.length - 1], asOf) : null,
    avg_days_between_orders: gaps.length ? round(gaps.reduce((a, b) => a + b, 0) / gaps.length, 0) : null,
    avg_days_to_pay: lagA > 0 ? round(lagW / lagA, 0) : null, on_time_pct: payTotal > 0 ? round((onTime / payTotal) * 100, 0) : null,
    months,
    orders: list.map((c) => ({ key: c.key, file_no: c.file_no, date: c.date, country: c.country, tons: c.tons, price: c.price, currency: c.currency, total: c.total, paid: c.paid, balance: c.balance, status: c.status, incoterm: c.incoterm, overdue: c.overdue, overdue_days: c.overdue_days })),
    payments: list.flatMap((c) => (c.payments || []).map((p) => ({ ...p, contract_key: c.key, currency: c.currency }))).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30),
  };
}

const domainOf = (v) => String(v || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split("@").pop();

/** شرکت‌های بانک (companies.json) و سرنخ‌های واتساپ که با این مشتری یکی‌اند: هم‌نام نرمال‌شده، یا هم‌دامنه‌ی وب‌سایت/ایمیل. */
export function matchBankCompanies(customer, companies, whatsappLeads = []) {
  const key = customerKeyOf(customer.name);
  const doms = new Set([domainOf(customer.website), domainOf(customer.email), ...(customer.contacts || []).map((c) => domainOf(c.email))].filter((d) => d && !/gmail|yahoo|hotmail|outlook|mail\.ru|yandex/.test(d)));
  const hit = (name, site, email) => {
    const k = customerKeyOf(name);
    if (key && k && (k === key || (key.length >= 6 && k.length >= 6 && (k.includes(key) || key.includes(k))))) return true;
    return [domainOf(site), domainOf(email)].some((d) => d && doms.has(d));
  };
  const bank = companies
    .filter((c) => hit(c.english_name, c.website, c.email))
    .slice(0, 5)
    .map((c) => ({ id: c.id, name: c.english_name, country: c.country, email: c.email || null, phone: c.phone || null, website: c.website || null, address: c.address || null, industry: c.industry || null, grade: c.target_grade || null, source: c.source_note || null }));
  const wa = whatsappLeads
    .filter((l) => hit(l.name, l.website, l.email))
    .slice(0, 3)
    .map((l) => ({ name: l.name, number: l.wa_display, e164: l.wa_e164, source_url: l.wa_source_url, website: l.website || null }));
  return { bank, whatsapp: wa };
}

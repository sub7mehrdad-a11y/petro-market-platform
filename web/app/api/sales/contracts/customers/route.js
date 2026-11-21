import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { getCompanies } from "@/lib/data";
import { CONTACT_INFLUENCE, CUSTOMER_CHANNELS, CUSTOMER_STATUS, getCustomerRecord, readEffectiveSnapshots, readStore, upsertCustomer } from "@/lib/salesContractsStore";
import { loadAccounts } from "@/lib/salesLedgerStore";
import { buildCustomerStats, matchBankCompanies } from "@/lib/salesCustomer";
import { getWhatsAppLeads } from "@/lib/outreachWhatsApp";

// پرونده‌ی مشتریان: فهرست (بدون پارامتر) یا پروفایل کامل یک مشتری (?id=)، و ایجاد/ویرایش (POST). فقط نقش «بازرگانی».
export const dynamic = "force-dynamic";

const who = (request) => verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value)?.username || null;
const options = { statuses: CUSTOMER_STATUS, channels: CUSTOMER_CHANNELS, influences: CONTACT_INFLUENCE };

export async function GET(request) {
  const id = new URL(request.url).searchParams.get("id");
  const store = readStore();
  const { accounts } = loadAccounts();
  const accById = new Map((accounts.customers || []).map((c) => [c.id, c]));

  if (id) {
    const rec = getCustomerRecord(id);
    const acc = accById.get(id) || null;
    if (!rec && !acc) return NextResponse.json({ error: "مشتری پیدا نشد." }, { status: 404 });
    const customer = rec || { id, name: acc.name, country: acc.countries?.[0] || null, contacts: [], history: [], sheet_only: true };
    const contracts = (accounts.contracts || []).filter((c) => c.customer_id === id);
    const snaps = readEffectiveSnapshots();
    const firm = (snaps[snaps.length - 1]?.rows || []).filter((r) => r.stage === "firm" && r.currency === "USD" && r.price != null && r.tons > 0);
    const tons = firm.reduce((s, r) => s + r.tons, 0);
    const companyAvg = tons ? Math.round((firm.reduce((s, r) => s + r.price * r.tons, 0) / tons) * 10) / 10 : null;
    const stats = buildCustomerStats(contracts, accounts.as_of || new Date().toISOString().slice(0, 10), { companyAvgPrice: companyAvg });
    const suggestions = matchBankCompanies(customer, getCompanies(), getWhatsAppLeads());
    return NextResponse.json({ customer, account: acc, stats, company_avg_price: companyAvg, suggestions, ...options });
  }

  const known = new Set(store.customers.map((c) => c.id));
  const registry = store.customers.map((c) => ({ ...c, deals: store.contracts.filter((x) => x.buyer === c.name).length, account: accById.get(c.id) || null }));
  // مشتریانی که فقط در گزارش اکسل‌اند و هنوز پرونده‌ی تماس ندارند
  const sheetOnly = (accounts.customers || []).filter((c) => !known.has(c.id)).map((c) => ({ id: c.id, name: c.name, country: c.countries?.[0] || null, person: null, phone: null, email: null, address: null, notes: null, deals: c.deals, account: c, sheet_only: true }));
  return NextResponse.json({ customers: [...registry, ...sheetOnly].sort((a, b) => (b.account?.total || 0) - (a.account?.total || 0)), ...options });
}

export async function POST(request) {
  let b;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 }); }
  try {
    const r = upsertCustomer(b || {}, who(request));
    return r.ok ? NextResponse.json({ ok: true, customer: r.customer }) : NextResponse.json({ error: r.errors.join(" ") }, { status: 422 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

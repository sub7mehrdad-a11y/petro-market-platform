import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { readStore, upsertCustomer } from "@/lib/salesContractsStore";
import { loadAccounts } from "@/lib/salesLedgerStore";

// پرونده‌ی مشتریان (تماس، آدرس، یادداشت) + خلاصه‌ی حساب هر مشتری از دفتر حساب. فقط نقش «بازرگانی».
export const dynamic = "force-dynamic";

const who = (request) => verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value)?.username || null;

export async function GET() {
  const store = readStore();
  const { accounts } = loadAccounts();
  const acc = new Map((accounts.customers || []).map((c) => [c.id, c]));
  const known = new Set(store.customers.map((c) => c.id));
  const registry = store.customers.map((c) => ({ ...c, deals: store.contracts.filter((x) => x.buyer === c.name).length, account: acc.get(c.id) || null }));
  // مشتریانی که فقط در گزارش اکسل‌اند و هنوز پرونده‌ی تماس ندارند
  const sheetOnly = (accounts.customers || []).filter((c) => !known.has(c.id)).map((c) => ({ id: c.id, name: c.name, country: c.countries?.[0] || null, person: null, phone: null, email: null, address: null, notes: null, deals: c.deals, account: c, sheet_only: true }));
  return NextResponse.json({ customers: [...registry, ...sheetOnly].sort((a, b) => (b.account?.total || 0) - (a.account?.total || 0)) });
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

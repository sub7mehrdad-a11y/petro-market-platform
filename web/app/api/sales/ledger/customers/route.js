import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { mergeCustomers, renameCustomer, unmergeCustomer } from "@/lib/salesLedgerStore";

// ادغام نام‌های متفاوت یک مشتری، بازکردن ادغام و تغییر نام نمایشی. فقط نقش «بازرگانی» (proxy.js).
export const dynamic = "force-dynamic";

export async function POST(request) {
  let b;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 }); }
  const by = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value)?.username || null;
  try {
    let r;
    if (b.action === "merge") r = mergeCustomers(b.from, b.into, by);
    else if (b.action === "unmerge") r = unmergeCustomer(b.from, by);
    else if (b.action === "rename") r = renameCustomer(b.id, b.name, by);
    else r = { ok: false, error: "عملیات نامعتبر است." };
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { backfillFromSheet } from "@/lib/salesLedgerStore";

// ثبت خودکار پرداخت کامل (تخمینی) برای قراردادهایی که گزارش فروش «Done» می‌گوید و پرداختی ثبت نشده. فقط نقش «بازرگانی».
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const by = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value)?.username || null;
    return NextResponse.json({ ok: true, ...backfillFromSheet(by) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

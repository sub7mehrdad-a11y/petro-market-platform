import { NextResponse } from "next/server";
import { loadAccounts } from "@/lib/salesLedgerStore";
import { PAYMENT_TYPE_LABEL, STATUS_LABEL } from "@/lib/salesLedger";
import { salesStorageProblem } from "@/lib/salesStore";

// حساب‌ها: قراردادها (سفارش‌های قطعی آخرین گزارش فروش) با پرداخت/مانده، و حساب هر مشتری. فقط نقش «بازرگانی» (proxy.js).
export const dynamic = "force-dynamic";

export async function GET() {
  const { accounts } = loadAccounts();
  return NextResponse.json({ accounts, labels: { status: STATUS_LABEL, payment_type: PAYMENT_TYPE_LABEL }, storage_problem: salesStorageProblem() });
}

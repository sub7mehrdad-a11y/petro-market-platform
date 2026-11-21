import { NextResponse } from "next/server";
import { SHIPMENT_STATUS } from "@/lib/salesContracts";
import { readContracts } from "@/lib/salesContractsStore";
import { buildLoadingList } from "@/lib/salesLoading";
import { loadAccounts } from "@/lib/salesLedgerStore";
import { salesStorageProblem } from "@/lib/salesStore";

// لیست بارگیری و ارسال: صف به ترتیب «زودتر پرداخت‌کننده». فقط نقش «بازرگانی» (proxy.js روی /api/sales).
// ثبت/ویرایش بارگیری از PATCH /api/sales/contracts (shipment_add | shipment_update | shipment_delete).
export const dynamic = "force-dynamic";

export async function GET(request) {
  const { accounts } = loadAccounts();
  const list = buildLoadingList(readContracts(), accounts.contracts || [], { includeOld: new URL(request.url).searchParams.get("old") === "1" });
  return NextResponse.json({ ...list, shipment_status: SHIPMENT_STATUS, storage_problem: salesStorageProblem() });
}

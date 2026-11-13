import { NextResponse } from "next/server";
import { getBrainScores } from "@/lib/brain";
import { summarizeSales } from "@/lib/salesAnalytics";
import { readSalesAnalysis, readSalesSnapshots, salesAiEnabled, salesStorageProblem } from "@/lib/salesStore";
import { readContracts, readEffectiveSnapshots } from "@/lib/salesContractsStore";
import { contractAlerts } from "@/lib/salesContracts";
import { loadAccounts } from "@/lib/salesLedgerStore";
import { todayIso } from "@/lib/salesFormat";

// خلاصه‌ی تحلیلی گزارش فروش (آخرین عکس لحظه‌ای) برای صفحه‌ی /sales. فقط نقش «بازرگانی».
export const dynamic = "force-dynamic";

export async function GET() {
  const snaps = readSalesSnapshots();
  const effective = readEffectiveSnapshots(); // اکسل + قراردادهای ثبت‌شده در پلتفرم
  const scores = getBrainScores();
  const summary = summarizeSales(effective, {
    countryScores: (scores?.countries || []).map((c) => ({ country: c.country, tier: c.tier, rank: c.rank })),
  });
  const analysis = readSalesAnalysis();
  const contracts = readContracts();
  const { accounts } = loadAccounts();
  const alerts = contractAlerts(contracts, accounts, todayIso());
  return NextResponse.json({
    summary,
    contract_alerts: alerts,
    accounts_totals: accounts.empty ? null : accounts.totals,
    platform_contracts: { total: contracts.length, active: contracts.filter((c) => c.status !== "cancelled").length },
    snapshots: snaps
      .map((s) => ({ as_of: s.as_of, rows: s.rows.length, uploaded_at: s.uploaded_at, uploaded_by: s.uploaded_by, filename: s.filename, replaced_count: s.replaced_count, warning_count: s.warning_count }))
      .reverse(),
    storage_problem: salesStorageProblem(),
    ai_enabled: salesAiEnabled(),
    analysis: analysis && summary.as_of === analysis.as_of ? analysis : null,
  });
}

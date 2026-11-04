import { NextResponse } from "next/server";
import { getBrainScores } from "@/lib/brain";
import { summarizeSales } from "@/lib/salesAnalytics";
import { readSalesAnalysis, readSalesSnapshots, salesAiEnabled, salesStorageProblem } from "@/lib/salesStore";

// خلاصه‌ی تحلیلی گزارش فروش (آخرین عکس لحظه‌ای) برای صفحه‌ی /sales. فقط نقش «بازرگانی».
export const dynamic = "force-dynamic";

export async function GET() {
  const snaps = readSalesSnapshots();
  const scores = getBrainScores();
  const summary = summarizeSales(snaps, {
    countryScores: (scores?.countries || []).map((c) => ({ country: c.country, tier: c.tier, rank: c.rank })),
  });
  const analysis = readSalesAnalysis();
  return NextResponse.json({
    summary,
    snapshots: snaps
      .map((s) => ({ as_of: s.as_of, rows: s.rows.length, uploaded_at: s.uploaded_at, uploaded_by: s.uploaded_by, filename: s.filename, replaced_count: s.replaced_count, warning_count: s.warning_count }))
      .reverse(),
    storage_problem: salesStorageProblem(),
    ai_enabled: salesAiEnabled(),
    analysis: analysis && summary.as_of === analysis.as_of ? analysis : null,
  });
}

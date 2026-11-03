import { NextResponse } from "next/server";
import { getBrainScores } from "@/lib/brain";
import { summarizeSales } from "@/lib/salesAnalytics";
import { readSalesAnalysis, readSalesReports, salesAiEnabled, salesStorageProblem } from "@/lib/salesStore";

// خلاصه‌ی تحلیلی همه‌ی گزارش‌های هفتگی فروش (صفحه‌ی /sales). فقط نقش «بازرگانی».
export const dynamic = "force-dynamic";

export async function GET() {
  const reports = readSalesReports();
  const scores = getBrainScores();
  const summary = summarizeSales(reports, {
    countryScores: (scores?.countries || []).map((c) => ({ country: c.country, tier: c.tier, rank: c.rank })),
  });
  const analysis = readSalesAnalysis();
  return NextResponse.json({
    summary,
    reports: reports.map((r) => ({ week_start: r.week_start, rows: r.rows.length, uploaded_at: r.uploaded_at, uploaded_by: r.uploaded_by, filename: r.filename, replaced_count: r.replaced_count })).reverse(),
    storage_problem: salesStorageProblem(),
    ai_enabled: salesAiEnabled(),
    analysis: analysis && summary.generated_for_week === analysis.week ? analysis : null,
  });
}

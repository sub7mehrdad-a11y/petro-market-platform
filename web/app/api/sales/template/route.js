import { NextResponse } from "next/server";
import { buildTemplateXlsx } from "@/lib/salesTemplate";

// دانلود قالب اکسل گزارش هفتگی فروش. فقط نقش «بازرگانی» (proxy.js روی /api/sales).
export const dynamic = "force-dynamic";

export async function GET() {
  const buf = await buildTemplateXlsx();
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="sales-weekly-report-template.xlsx"',
    },
  });
}

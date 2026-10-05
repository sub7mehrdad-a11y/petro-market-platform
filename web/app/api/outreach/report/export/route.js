import { NextResponse } from "next/server";
import { buildReportXlsx, buildReportHtml, reportFileName } from "@/lib/outreachReportExport";

// دانلود گزارش عملکرد ایمیل معرفی به‌صورت اکسل (تیم بازرگانی) یا HTML مستقل با نمودار (هیئت‌مدیره).
// گزارش از خودِ کلاینت (که همین الان با /api/outreach/report ساخته) فرستاده می‌شه تا صندوق ورودی
// دوباره خونده نشه. فقط نقش «بازرگانی» (proxy.js روی /api/outreach).
export const dynamic = "force-dynamic";

function validShape(r) {
  return (
    r && typeof r === "object" && r.totals && typeof r.totals.sent === "number" &&
    r.by_grade && typeof r.by_grade === "object" && Array.isArray(r.replied_companies) &&
    Array.isArray(r.notes) && typeof r.generated_at === "string" && Number.isFinite(Date.parse(r.generated_at))
  );
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }
  const { format, report } = body || {};
  if (!["xlsx", "html"].includes(format) || !validShape(report)) {
    return NextResponse.json({ error: "قالب یا گزارش نامعتبر است." }, { status: 400 });
  }
  report.rows = Array.isArray(report.rows) ? report.rows : [];

  if (format === "xlsx") {
    const buf = await buildReportXlsx(report);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${reportFileName(report, "xlsx")}"`,
      },
    });
  }
  return new NextResponse(buildReportHtml(report), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${reportFileName(report, "html")}"`,
    },
  });
}

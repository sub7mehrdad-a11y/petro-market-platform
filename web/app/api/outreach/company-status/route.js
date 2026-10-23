import { NextResponse } from "next/server";
import { getCompanyEmailStatuses } from "@/lib/outreachCompanyStatus";
import { getHaltReason } from "@/lib/outreachQueue";

// وضعیت ایمیل شرکت‌های یک کشور (برای صفحه‌ی شرکت‌های کشور). فقط نقش «بازرگانی» (proxy.js، پیشوند /api/outreach)
// و فقط وقتی رابط ایمیل روشن است — وگرنه ۴۰۴ تا صفحه‌ی شرکت‌ها بخش ایمیل را کلاً نشان ندهد.
export const dynamic = "force-dynamic";

export async function GET(request) {
  if (process.env.OUTREACH_UI_ENABLED !== "true") {
    return NextResponse.json({ error: "غیرفعال" }, { status: 404 });
  }
  const country = new URL(request.url).searchParams.get("country") || null;
  const data = await getCompanyEmailStatuses({ country });
  return NextResponse.json({
    ...data,
    sending_enabled: process.env.OUTREACH_SENDING_ENABLED === "true",
    halted: !!getHaltReason(),
  });
}

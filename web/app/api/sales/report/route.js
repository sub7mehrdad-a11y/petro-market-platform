import { NextResponse } from "next/server";
import { deleteSalesReport } from "@/lib/salesStore";
import { parseDateCell, weekStartOf } from "@/lib/salesFormat";

// حذف گزارش یک هفته (مثلاً فایل اشتباه آپلود شده). فقط نقش «بازرگانی».
export const dynamic = "force-dynamic";

export async function DELETE(request) {
  const iso = parseDateCell(new URL(request.url).searchParams.get("week") || "");
  if (!iso) return NextResponse.json({ error: "هفته نامعتبر است." }, { status: 400 });
  try {
    const ok = deleteSalesReport(weekStartOf(iso));
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "گزارشی برای این هفته نیست." }, { status: 404 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

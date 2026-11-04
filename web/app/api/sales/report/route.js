import { NextResponse } from "next/server";
import { deleteSalesSnapshot } from "@/lib/salesStore";
import { parseDateCell } from "@/lib/salesFormat";

// حذف یک گزارش (عکس لحظه‌ای)، مثلاً فایل اشتباه آپلود شده. فقط نقش «بازرگانی».
export const dynamic = "force-dynamic";

export async function DELETE(request) {
  const iso = parseDateCell(new URL(request.url).searchParams.get("as_of") || "");
  if (!iso) return NextResponse.json({ error: "تاریخ گزارش نامعتبر است." }, { status: 400 });
  try {
    return deleteSalesSnapshot(iso) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "گزارشی با این تاریخ نیست." }, { status: 404 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

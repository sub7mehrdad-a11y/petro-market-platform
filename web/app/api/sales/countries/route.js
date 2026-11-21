import { NextResponse } from "next/server";
import { countryDetail, countryTable } from "@/lib/salesCountryServer";

// بررسی صادرات به کشورها: جدول خلاصه (بدون پارامتر) یا جزئیات یک کشور (?country=). فقط نقش «بازرگانی» (proxy.js روی /api/sales).
export const dynamic = "force-dynamic";

export async function GET(request) {
  const country = new URL(request.url).searchParams.get("country");
  if (country) {
    const d = countryDetail(country);
    return d ? NextResponse.json(d) : NextResponse.json({ error: "هنوز گزارش فروشی بارگذاری نشده." }, { status: 404 });
  }
  return NextResponse.json(countryTable());
}

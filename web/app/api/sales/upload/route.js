import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { parseSalesXlsx } from "@/lib/salesParse";
import { parseDateCell, weekStartOf } from "@/lib/salesFormat";
import { readSalesReports, salesStorageProblem, saveSalesReport } from "@/lib/salesStore";

// آپلود گزارش هفتگی اکسل — دو مرحله: بدون save=1 فقط پیش‌نمایش/اعتبارسنجی (چیزی ذخیره نمی‌شود)،
// با save=1 ذخیره روی دیسک دائمی. فقط نقش «بازرگانی» (proxy.js روی /api/sales).
export const dynamic = "force-dynamic";
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است (فایل ارسال نشد)." }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "فایل اکسل انتخاب نشده." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "حجم فایل بیش از ۵ مگابایت است." }, { status: 413 });
  if (!/\.xlsx$/i.test(file.name || "")) return NextResponse.json({ error: "فقط فایل .xlsx قبول است (قالب رسمی را دانلود کنید)." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = await parseSalesXlsx(buffer);
  } catch {
    return NextResponse.json({ error: "فایل خوانده نشد؛ مطمئن شوید اکسل سالم (.xlsx) است." }, { status: 400 });
  }
  if (!parsed.rows.length) {
    return NextResponse.json({ error: parsed.errors[0]?.message || "هیچ ردیف معتبری در فایل نبود.", errors: parsed.errors, warnings: parsed.warnings }, { status: 422 });
  }

  // هفته: اگر کاربر داد همان (هر تاریخ داخل هفته → شنبه‌ی آن هفته)، وگرنه هفته‌ی پرتکرار بین تاریخ ردیف‌ها
  const weekInput = String(form.get("week_start") || "").trim();
  let weekStart = null;
  if (weekInput) {
    const iso = parseDateCell(weekInput);
    if (!iso) return NextResponse.json({ error: "تاریخ هفته نامعتبر است (مثلاً ۱۴۰۵/۰۸/۱۰ یا 2026-11-01)." }, { status: 400 });
    weekStart = weekStartOf(iso);
  } else {
    const counts = {};
    for (const r of parsed.rows) counts[weekStartOf(r.date)] = (counts[weekStartOf(r.date)] || 0) + 1;
    weekStart = Object.entries(counts).sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0][0];
  }
  const existing = readSalesReports().find((r) => r.week_start === weekStart);
  const tons = Math.round(parsed.rows.reduce((s, r) => s + r.tons, 0) * 10) / 10;
  const preview = {
    week_start: weekStart,
    rows: parsed.rows.length,
    tons,
    errors: parsed.errors,
    warnings: parsed.warnings,
    will_replace: existing ? { rows: existing.rows.length, uploaded_at: existing.uploaded_at } : null,
    sample: parsed.rows.slice(0, 5),
    other_weeks_in_dates: parsed.weeks.filter((w) => w !== weekStart),
  };

  if (form.get("save") !== "1") return NextResponse.json({ ok: true, saved: false, preview });

  const problem = salesStorageProblem();
  if (problem) return NextResponse.json({ error: problem, preview }, { status: 500 });
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  try {
    const report = saveSalesReport({ weekStart, rows: parsed.rows, filename: file.name, uploadedBy: session?.username, rawBuffer: buffer });
    return NextResponse.json({ ok: true, saved: true, preview, week_start: report.week_start });
  } catch (err) {
    return NextResponse.json({ error: `ذخیره نشد: ${err.message}`, preview }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { parseSalesXlsx } from "@/lib/salesParse";
import { parseDateCell, todayIso } from "@/lib/salesFormat";
import { readSalesSnapshots, salesStorageProblem, saveSalesSnapshot } from "@/lib/salesStore";

// آپلود فایل تجمعی «Sales Report» — دو مرحله: بدون save=1 فقط پیش‌نمایش/اعتبارسنجی (چیزی ذخیره نمی‌شود)،
// با save=1 ذخیره‌ی یک عکس لحظه‌ای روی دیسک دائمی. فقط نقش «بازرگانی» (proxy.js روی /api/sales).
export const dynamic = "force-dynamic";
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است (فایل ارسال نشد)." }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "فایل اکسل انتخاب نشده." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "حجم فایل بیش از ۸ مگابایت است." }, { status: 413 });
  if (!/\.xlsx$/i.test(file.name || "")) return NextResponse.json({ error: "فقط فایل .xlsx قبول است." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = await parseSalesXlsx(buffer);
  } catch {
    return NextResponse.json({ error: "فایل خوانده نشد؛ مطمئن شوید اکسل سالم (.xlsx) است." }, { status: 400 });
  }
  if (!parsed.rows.length) {
    return NextResponse.json({ error: parsed.errors[0]?.message || "هیچ ردیف دارای حجم سفارش در فایل نبود.", errors: parsed.errors, warnings: parsed.warnings }, { status: 422 });
  }

  // تاریخ گزارش (as_of): پیش‌فرض امروز؛ کاربر می‌تواند تاریخ دیگری (شمسی یا میلادی) بدهد
  const asOfInput = String(form.get("as_of") || "").trim();
  let asOf = todayIso();
  if (asOfInput) {
    asOf = parseDateCell(asOfInput);
    if (!asOf) return NextResponse.json({ error: "تاریخ گزارش نامعتبر است (مثلاً ۱۴۰۵/۰۸/۱۳ یا 2026-11-04)." }, { status: 400 });
  }

  const snaps = readSalesSnapshots();
  const existing = snaps.find((s) => s.as_of === asOf);
  const prev = [...snaps].filter((s) => s.as_of < asOf).pop();
  const count = (stage) => parsed.rows.filter((r) => r.stage === stage);
  const tons = (rs) => Math.round(rs.reduce((s, r) => s + r.tons, 0) * 10) / 10;
  const preview = {
    as_of: asOf,
    rows: parsed.rows.length,
    firm: { deals: count("firm").length, tons: tons(count("firm")) },
    quote: { deals: count("quote").length, tons: tons(count("quote")) },
    unknown: { deals: count("unknown").length, tons: tons(count("unknown")) },
    skipped_empty: parsed.skipped_empty,
    errors: parsed.errors,
    warnings: parsed.warnings,
    will_replace: existing ? { rows: existing.rows.length, uploaded_at: existing.uploaded_at } : null,
    previous_snapshot: prev ? { as_of: prev.as_of, rows: prev.rows.length } : null,
    sample: parsed.rows.slice(0, 4).map(({ buyer, contact, doc_no, file_no, ...rest }) => rest), // نام مشتری در پاسخ پیش‌نمایش لازم نیست
  };

  if (form.get("save") !== "1") return NextResponse.json({ ok: true, saved: false, preview });

  const problem = salesStorageProblem();
  if (problem) return NextResponse.json({ error: problem, preview }, { status: 500 });
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  try {
    const snap = saveSalesSnapshot({ asOf, rows: parsed.rows, filename: file.name, uploadedBy: session?.username, rawBuffer: buffer, warningCount: parsed.warnings.length });
    return NextResponse.json({ ok: true, saved: true, preview, as_of: snap.as_of });
  } catch (err) {
    return NextResponse.json({ error: `ذخیره نشد: ${err.message}`, preview }, { status: 500 });
  }
}

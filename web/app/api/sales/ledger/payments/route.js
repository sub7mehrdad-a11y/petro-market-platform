import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { addPayment, deletePayment, relinkPayment } from "@/lib/salesLedgerStore";

// ثبت / حذف / انتقال پرداخت. فقط نقش «بازرگانی» (proxy.js). هر تغییر در لاگ ممیزی (audit) ثبت می‌شود.
export const dynamic = "force-dynamic";

const who = (request) => verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value)?.username || null;
const bad = (error, status = 400, extra = {}) => NextResponse.json({ error, ...extra }, { status });

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return bad("درخواست نامعتبر است."); }
  try {
    const r = addPayment(body || {}, who(request));
    if (r.ok) return NextResponse.json(r);
    if (r.needs_confirm) return NextResponse.json({ ok: false, needs_confirm: true, warnings: r.warnings }, { status: 409 });
    return bad(r.errors.join(" "), 422, { errors: r.errors });
  } catch (err) {
    return bad(err.message, 500);
  }
}

export async function DELETE(request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return bad("شناسه‌ی پرداخت لازم است.");
  try {
    return deletePayment(id, who(request)) ? NextResponse.json({ ok: true }) : bad("پرداخت پیدا نشد.", 404);
  } catch (err) {
    return bad(err.message, 500);
  }
}

export async function PATCH(request) {
  let body;
  try { body = await request.json(); } catch { return bad("درخواست نامعتبر است."); }
  if (!body?.id || !body?.contract_key) return bad("شناسه‌ی پرداخت و قرارداد مقصد لازم است.");
  try {
    const r = relinkPayment(body.id, body.contract_key, who(request));
    return r.ok ? NextResponse.json({ ok: true }) : bad(r.error, 404);
  } catch (err) {
    return bad(err.message, 500);
  }
}

import { NextResponse } from "next/server";
import { commercialSession, isBrainAdmin } from "@/lib/brain2/access";
import { feedbackForAdmin, reviewStats, submitFeedback, todayView } from "@/lib/brain2/review";
import { brainStorageProblem } from "@/lib/brain2/store";

// بازبینی انسانی روزانه (مرحله‌ی ۷). هر کاربر بازرگانی فقط سهم خودش را می‌بیند (ارزیابی کور: هویت تحلیل‌گر/مدل در پاسخ نیست)؛
// آمار و فهرست بازخوردها (با هویت) فقط برای مدیر.
export const dynamic = "force-dynamic";

export async function GET(request) {
  const s = commercialSession(request);
  if (!s) return NextResponse.json({ error: "دسترسی ندارید." }, { status: 403 });
  const problem = brainStorageProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 500 });
  const admin = isBrainAdmin(s.username);
  const out = { me: { username: s.username, is_admin: admin }, today: todayView(s.username) };
  if (admin && new URL(request.url).searchParams.get("admin")) { out.stats = reviewStats(); out.feedback = feedbackForAdmin(); }
  return NextResponse.json(out);
}

export async function POST(request) {
  const s = commercialSession(request);
  if (!s) return NextResponse.json({ error: "دسترسی ندارید." }, { status: 403 });
  let b;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 }); }
  const problem = brainStorageProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 500 });
  if (b.action !== "submit") return NextResponse.json({ error: "عملیات نامعتبر است." }, { status: 400 });
  const r = submitFeedback({ username: s.username, ref: String(b.ref || ""), kind: String(b.kind || ""), fields: b.fields || {} });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 });
  return NextResponse.json({ ok: true, effects: r.effects, today: todayView(s.username) });
}

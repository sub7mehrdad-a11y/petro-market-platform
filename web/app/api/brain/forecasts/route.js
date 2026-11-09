import { NextResponse } from "next/server";
import { commercialSession, isBrainAdmin } from "@/lib/brain2/access";
import { getRound, listRounds, participationOf, roundLockAt, submitForecast, tehranClock, viewRound } from "@/lib/brain2/forecast";
import { getDomain } from "@/lib/brain2/domain/index";
import { brainStorageProblem } from "@/lib/brain2/store";

// دفتر پیش‌بینی: نمای دور (با قانون دید کور سمت سرور) و ثبت پیش‌بینی. فقط نقش «بازرگانی» (proxy.js + اینجا).
export const dynamic = "force-dynamic";

export async function GET(request) {
  const s = commercialSession(request);
  if (!s) return NextResponse.json({ error: "دسترسی ندارید." }, { status: 403 });
  const admin = isBrainAdmin(s.username);
  const rounds = listRounds();
  const wanted = new URL(request.url).searchParams.get("round") || tehranClock().month;
  const roundId = getRound(wanted) ? wanted : rounds[0]?.round_id || null;
  const view = roundId ? viewRound({ username: s.username, isAdmin: admin, roundId }) : null;
  if (view) {
    // آخرین مقدار عمومی هر سری برای زمینه‌ی کاربر (سری محرمانه چیزی نمی‌دهد)
    for (const q of view.questions) q.last_value = getDomain().legacyForecaster.latestSeriesValue(q.target.truth_source);
  }
  return NextResponse.json({
    me: { username: s.username, is_admin: admin },
    rounds: rounds.map((r) => ({ round_id: r.round_id, target_month: r.target_month, lock_at: roundLockAt(r) })),
    round: view,
    participation: admin && roundId ? participationOf(roundId) : undefined,
    storage_problem: brainStorageProblem(),
  });
}

export async function POST(request) {
  const s = commercialSession(request);
  if (!s) return NextResponse.json({ error: "دسترسی ندارید." }, { status: 403 });
  let b;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 }); }
  const problem = brainStorageProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 500 });
  const r = submitForecast({
    username: s.username, roundId: b.round_id, questionId: b.question_id, point: b.point, lo: b.lo, hi: b.hi, rationale: b.rationale,
    revisionReason: b.revision_reason, confirm: b.confirm === true,
  });
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.code === "closed" ? 410 : ["need_reason", "unchanged", "invalid"].includes(r.code) ? 422 : 409 });
  // بعد از ثبت، نمای جدید (با پیش‌بینی مغز) برگردانده می‌شود
  const view = viewRound({ username: s.username, isAdmin: isBrainAdmin(s.username), roundId: b.round_id });
  for (const q of view.questions) q.last_value = getDomain().legacyForecaster.latestSeriesValue(q.target.truth_source);
  return NextResponse.json({ ok: true, round: view });
}

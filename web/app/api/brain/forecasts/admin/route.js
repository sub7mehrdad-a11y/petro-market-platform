import { NextResponse } from "next/server";
import { commercialSession, isBrainAdmin } from "@/lib/brain2/access";
import { ensureRound, tehranClock } from "@/lib/brain2/forecast";
import { getDomain } from "@/lib/brain2/domain/index";
import { runMachineForecasts } from "@/lib/brain2/machineForecaster";
import { brainStorageProblem } from "@/lib/brain2/store";

// کارهای مدیر: باز کردن دور ماه و (دوباره‌)گرفتن پیش‌بینی مغز. فقط مدیر (BRAIN_ADMINS).
export const dynamic = "force-dynamic";

export async function POST(request) {
  const s = commercialSession(request);
  if (!s || !isBrainAdmin(s.username)) return NextResponse.json({ error: "فقط مدیر." }, { status: 403 });
  let b;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 }); }
  const problem = brainStorageProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 500 });
  const roundId = b.round_id || tehranClock().month;
  try {
    if (b.action === "open_round") {
      const r = ensureRound(roundId, { by: s.username });
      return NextResponse.json({ ok: true, created: r.created, round_id: r.round.round_id });
    }
    if (b.action === "brain_forecasts") {
      const rep = await getDomain().legacyForecaster.runBrainForecasts(roundId);
      return NextResponse.json({ ok: rep.ok, error: rep.error, results: rep.results });
    }
    if (b.action === "machine_forecasts") {
      const rep = await runMachineForecasts(roundId, { force: true });
      return NextResponse.json({ ok: rep.ok, error: rep.error, results: rep.results, skipped: rep.skipped });
    }
    if (b.action === "brain_reviews") {
      const rep = await getDomain().legacyForecaster.runBrainReviews(roundId, { force: true });
      return NextResponse.json({ ok: rep.ok, error: rep.error, results: rep.results, skipped: rep.skipped });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err?.message || err).slice(0, 200) }, { status: 500 });
  }
  return NextResponse.json({ error: "عملیات نامعتبر است." }, { status: 400 });
}

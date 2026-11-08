import { NextResponse } from "next/server";
import { commercialSession, isBrainAdmin } from "@/lib/brain2/access";
import { pendingFor, summarize, visibleScores } from "@/lib/brain2/scoring/read";
import { scoringTick } from "@/lib/brain2/scoringAuto";
import { autopsyCoverage, listAutopsies, runAutopsies } from "@/lib/brain2/autopsy";
import { resolveBrainKey } from "@/lib/brain";
import { brainStorageProblem } from "@/lib/brain2/store";

// مهارت پیش‌بین‌ها در برابر خط مبنا (مرحله‌ی ۴). دید طبق پروتکل ۱۱-۴: هر کارشناس فقط نمره‌ی خودش؛ مدیر همه (و مغز).
export const dynamic = "force-dynamic";

export async function GET(request) {
  const s = commercialSession(request);
  if (!s) return NextResponse.json({ error: "دسترسی ندارید." }, { status: 403 });
  const problem = brainStorageProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 500 });
  const admin = isBrainAdmin(s.username);
  const rows = visibleScores({ username: s.username, isAdmin: admin });
  return NextResponse.json({
    me: { username: s.username, is_admin: admin },
    summary: summarize(rows),
    pending: pendingFor({ username: s.username, isAdmin: admin }),
    // ردیف‌های ریز هر نسخه فقط برای مدیر (با دلیل و سابقه)
    autopsies: admin ? { list: listAutopsies(), coverage: autopsyCoverage() } : undefined,
    versions: admin ? rows.filter((r) => r.kind === "version").map((r) => ({ forecaster: r.forecaster, question_id: r.question_id, revision_no: r.revision_no, made_at: r.made_at, forecast: r.forecast, outcome: r.outcome, abs_rel_err: r.abs_rel_err, inside: r.inside, surprise: r.surprise, skill: r.skill_vs_baseline, baseline: r.baseline, weight_share: r.weight_share })) : undefined,
  });
}

export async function POST(request) {
  const s = commercialSession(request);
  if (!s || !isBrainAdmin(s.username)) return NextResponse.json({ error: "فقط مدیر." }, { status: 403 });
  let b;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 }); }
  if (b.action === "autopsy_now") {
    const au = await runAutopsies({ useModel: !!resolveBrainKey() });
    return NextResponse.json({ ok: true, ...au });
  }
  if (b.action !== "score_now") return NextResponse.json({ error: "عملیات نامعتبر است." }, { status: 400 });
  const r = scoringTick();
  if (r.error || r.skipped) return NextResponse.json({ error: r.error || String(r.skipped) }, { status: 500 });
  return NextResponse.json({ ok: true, written: r.written, changed: r.changed, unchanged: r.unchanged, unresolved: r.unresolved });
}

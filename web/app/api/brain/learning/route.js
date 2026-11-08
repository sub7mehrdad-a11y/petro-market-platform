import { NextResponse } from "next/server";
import { commercialSession, isBrainAdmin } from "@/lib/brain2/access";
import { brainStorageProblem, currentRows } from "@/lib/brain2/store";
import { loadLearningConfig } from "@/lib/brain2/learning/config";
import { readLearningState } from "@/lib/brain2/learning/consolidation";
import { runLearningCycle } from "@/lib/brain2/learning/cycle";
import { experimentsOverview, recordExperimentResult } from "@/lib/brain2/learning/experiments";
import { METHOD_ROLES, ensureMethods } from "@/lib/brain2/learning/methods";
import { methodsOverview, proposeRevision } from "@/lib/brain2/learning/revision";

// یادگیری مغز (مرحله‌ی ۱۰): وضعیت نسخه‌های روش، آزمایش‌های فعال و پیشنهادهای تثبیت. فقط مدیر. تصمیم‌ها در صف بازبینی (/brain/memory) گرفته می‌شود.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LEARNING_KINDS = ["method_proposal", "method_promotion", "consolidation", "experiment_proposal"];

export async function GET(request) {
  const s = commercialSession(request);
  if (!s || !isBrainAdmin(s.username)) return NextResponse.json({ error: "فقط مدیر." }, { status: 403 });
  const problem = brainStorageProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 500 });
  ensureMethods();
  const open = [...currentRows("queue").values()].filter((q) => !q.recorded_to && q.status === "open" && LEARNING_KINDS.includes(q.kind));
  return NextResponse.json({
    methods: methodsOverview(),
    experiments: experimentsOverview(),
    open_items: open.map((q) => ({ id: q.id, kind: q.kind, label: q.label, action: q.action || null })),
    state: readLearningState(),
    config: loadLearningConfig(),
  });
}

export async function POST(request) {
  const s = commercialSession(request);
  if (!s || !isBrainAdmin(s.username)) return NextResponse.json({ error: "فقط مدیر." }, { status: 403 });
  let b;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 }); }
  if (b.action === "run_cycle") {
    const r = await runLearningCycle({ now: new Date() });
    return NextResponse.json({ ok: true, ...r });
  }
  if (b.action === "propose_revision") {
    if (!METHOD_ROLES.includes(b.role)) return NextResponse.json({ error: "تحلیل‌گر نامعتبر است." }, { status: 400 });
    const r = await proposeRevision(b.role, { now: new Date() });
    return NextResponse.json({ ok: true, status: r.status, blocked_reason: r.blocked_reason || null, backtest: r.backtest ? { n: r.backtest.n, mean_improvement: r.backtest.mean_improvement, passes: r.backtest.passes, reason: r.backtest.reason } : null });
  }
  if (b.action === "experiment_result") {
    const r = recordExperimentResult({ key: String(b.key || ""), sent: Number(b.sent), replied: Number(b.replied), by: s.username, note: b.note || "" });
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }
  return NextResponse.json({ error: "عملیات نامعتبر است." }, { status: 400 });
}

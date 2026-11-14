import { NextResponse } from "next/server";
import { commercialSession, isBrainAdmin } from "@/lib/brain2/access";
import { brainStorageProblem } from "@/lib/brain2/store";
import { resolveBrainKey } from "@/lib/brain";
import { backtestCountries, backtestTargets, runCountryBacktest, summarizeBacktests } from "@/lib/brain2/learning/countryBacktest";
import { lessonsOverview, runCountryAutopsies } from "@/lib/brain2/learning/countryLessons";
import { countryLearningOverview, startSelfImprovement } from "@/lib/brain2/learning/countrySelfLearning";

// آزمون بازپخش کشورها (مرحله‌ی ۱۰-ب): فقط مدیر. هر درخواست POST یک کشور را اجرا می‌کند (یک تماس با مدل)؛ رابط کشورها را پشت‌سرهم می‌فرستد.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request) {
  const s = commercialSession(request);
  if (!s || !isBrainAdmin(s.username)) return NextResponse.json({ error: "فقط مدیر." }, { status: 403 });
  const problem = brainStorageProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 500 });
  return NextResponse.json({ countries: backtestCountries(), targets: backtestTargets().map((t) => ({ id: t.id, label: t.label, unit: t.unit, kind: t.kind })), summary: summarizeBacktests(), lessons: lessonsOverview(), learning: countryLearningOverview(), has_key: !!resolveBrainKey() });
}

export async function POST(request) {
  const s = commercialSession(request);
  if (!s || !isBrainAdmin(s.username)) return NextResponse.json({ error: "فقط مدیر." }, { status: 403 });
  let b;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 }); }
  if (b?.action === "learn_start") {
    if (!resolveBrainKey()) return NextResponse.json({ error: "کلید مغز (GEMINI_API_KEY_BRAIN) تنظیم نشده." }, { status: 503 });
    const r = startSelfImprovement();
    return NextResponse.json(r.started ? { ok: true, started: true } : { error: r.reason || "شروع نشد" }, { status: r.started ? 200 : 409 });
  }
  if (b?.action === "autopsy") {
    const r = await runCountryAutopsies({ useModel: !!resolveBrainKey() });
    return NextResponse.json({ ok: true, ...r });
  }
  if (b?.action !== "run" || typeof b.country !== "string") return NextResponse.json({ error: "عملیات نامعتبر است." }, { status: 400 });
  if (!resolveBrainKey()) return NextResponse.json({ error: "کلید مغز (GEMINI_API_KEY_BRAIN) تنظیم نشده." }, { status: 503 });
  const r = await runCountryBacktest(b.country, { lessons: !!b.lessons });
  return r.ok ? NextResponse.json({ ok: true, country: r.country, run_id: r.run_id, scored: r.rows.filter((x) => x.result.scored).length, total: r.rows.length, lessons_used: r.lessons_used }) : NextResponse.json({ error: r.error }, { status: 502 });
}

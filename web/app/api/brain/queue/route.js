import { NextResponse } from "next/server";
import { commercialSession, isBrainAdmin } from "@/lib/brain2/access";
import { loadIndex } from "@/lib/brain2/memory";
import { queueView, resolveItem } from "@/lib/brain2/knowledge/queue";
import { brainStorageProblem } from "@/lib/brain2/store";

// صف بازبینی تناقض‌ها و ادعاهای مشکوک (مرحله‌ی ۵) — فقط مدیر. تصمیم انسانی هرگز خودکار نیست؛ هر تصمیم ردیف تازه است (فقط‌افزودنی).
export const dynamic = "force-dynamic";

const guard = (request) => {
  const s = commercialSession(request);
  return s && isBrainAdmin(s.username) ? s : null;
};

export async function GET(request) {
  if (!guard(request)) return NextResponse.json({ error: "فقط مدیر." }, { status: 403 });
  const problem = brainStorageProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 500 });
  return NextResponse.json(queueView());
}

export async function POST(request) {
  const s = guard(request);
  if (!s) return NextResponse.json({ error: "فقط مدیر." }, { status: 403 });
  let b;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 }); }
  if (b.action !== "resolve") return NextResponse.json({ error: "عملیات نامعتبر است." }, { status: 400 });
  const problem = brainStorageProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 500 });
  const r = resolveItem(loadIndex(), { id: b.id, decision: b.decision, claimKey: b.claim_key, by: s.username, note: b.note });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json({ ok: true, claims_changed: r.claims_changed, ...queueView() });
}

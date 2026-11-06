import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { commercialSession, isBrainAdmin } from "@/lib/brain2/access";
import { memoryCounts, queryClaims } from "@/lib/brain2/memory";
import { memoryTick } from "@/lib/brain2/memoryAuto";
import { brainStorageProblem, getBrainDir } from "@/lib/brain2/store";

// پرسش از حافظه (فقط مدیر): «در تاریخ فلان، سیستم درباره‌ی فلان چه چیزی را باور داشت؟»
//   GET ?known_at=2026-09-20&subject=عراق&metric=price  ← باور سیستم در آن لحظه (دو خط زمانی؛ known_at = recorded، valid_at = جهان)
//   GET بدون پارامتر ← شمارش مخزن‌ها
//   GET ?shadow=1 ← خلاصه‌ی سایه (متن)
// POST {action:"migrate"} ← اجرای فوری انتقال/پشتیبان/خلاصه‌ی سایه.
export const dynamic = "force-dynamic";

const slim = (r) => ({
  id: r.id, subject: r.subject, metric: r.metric, value: r.value, unit: r.unit, period: r.period, qualifiers: r.qualifiers,
  confidence: r.confidence, status: r.status, recorded_from: r.recorded_from, recorded_to: r.recorded_to, valid_from: r.valid_from,
  valid_to: r.valid_to, supersedes: r.supersedes, change_reason: r.change_reason,
});

export async function GET(request) {
  const s = commercialSession(request);
  if (!s || !isBrainAdmin(s.username)) return NextResponse.json({ error: "فقط مدیر." }, { status: 403 });
  const problem = brainStorageProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 500 });
  const q = new URL(request.url).searchParams;
  if (q.get("shadow")) {
    let text = "";
    try { text = fs.readFileSync(path.join(getBrainDir(), "digest_shadow.md"), "utf-8"); } catch {}
    return NextResponse.json({ text });
  }
  if (!q.get("subject") && !q.get("metric") && !q.get("known_at") && !q.get("valid_at")) return NextResponse.json({ counts: memoryCounts() });
  const knownAt = q.get("known_at");
  const rows = queryClaims({
    subject: q.get("subject") || undefined, metric: q.get("metric") || undefined, period: q.get("period") || undefined,
    knownAt: knownAt ? (/^\d{4}-\d{2}-\d{2}$/.test(knownAt) ? `${knownAt}T23:59:59.999Z` : knownAt) : undefined,
    validAtTime: q.get("valid_at") || undefined, limit: 300,
  });
  return NextResponse.json({ known_at: knownAt || "now", count: rows.length, rows: rows.map(slim) });
}

export async function POST(request) {
  const s = commercialSession(request);
  if (!s || !isBrainAdmin(s.username)) return NextResponse.json({ error: "فقط مدیر." }, { status: 403 });
  let b;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 }); }
  if (b.action !== "migrate") return NextResponse.json({ error: "عملیات نامعتبر است." }, { status: 400 });
  const out = memoryTick();
  if (out.error || out.skipped) return NextResponse.json({ error: out.error || String(out.skipped) }, { status: 500 });
  return NextResponse.json({ ok: true, stats: out.migration.stats, files: out.migration.files, backup: out.backup, counts: memoryCounts() });
}

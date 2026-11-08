import { NextResponse } from "next/server";
import { commercialSession, isBrainAdmin } from "@/lib/brain2/access";
import { loadReputationConfig, visibleReputation } from "@/lib/brain2/reputation";
import { brainStorageProblem } from "@/lib/brain2/store";

// اعتبار (مرحله‌ی ۸؛ پروتکل ۱۱-۴): مدیر همه‌ی رتبه‌ها را با دلیل و سابقه می‌بیند؛ هر کارشناس فقط رتبه‌ی خودش را؛ دیگران هیچ.
export const dynamic = "force-dynamic";

export async function GET(request) {
  const s = commercialSession(request);
  if (!s) return NextResponse.json({ error: "دسترسی ندارید." }, { status: 403 });
  const problem = brainStorageProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 500 });
  const admin = isBrainAdmin(s.username);
  const cfg = loadReputationConfig();
  const rows = visibleReputation({ username: s.username, isAdmin: admin }).map((r) => ({
    entity: r.entity, entity_type: r.entity_type, topic: r.topic, n_resolved: r.n_resolved, n_eff: r.n_eff, score: r.score, weight: r.weight, group_mean: r.group_mean, last_evidence_at: r.last_evidence_at,
  }));
  return NextResponse.json({ me: { username: s.username, is_admin: admin }, rows, rule: { k: cfg.shrinkage_k, half_life_days: cfg.half_life_days } });
}

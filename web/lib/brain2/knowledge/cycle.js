import { loadIndex, reviseClaim } from "../memory";
import { listRules } from "../rules";
import { brainStorageProblem } from "../store";
import { findContradictions, sanityProblem } from "./checks";
import { computeConfidence, buildConfirmationIndex } from "./confidence";
import { loadKnowledgeConfig } from "./config";
import { syncClaimStatuses, syncQueue } from "./queue";

// چرخه‌ی روزانه‌ی دانش (پروتکل ۶-۱، مرحله‌ی ۵). بدون مدل. استخراج و قاعده‌ها در migrate.js انجام شده‌اند؛ اینجا:
//   ۲) بررسی‌های ساده: دامنه‌ی منطقی عدد/واحد/سال ← «در صف بررسی»
//   ۴) مقایسه با حافظه: تناقض بین منابع مستقل ← صف بازبینی (هیچ‌کدام خودکار رد نمی‌شود)
//   ۵) محاسبه‌ی اعتماد (۶-۳) ← فقط وقتی تغییر از آستانه بزرگ‌تر باشد ردیف تازه
//   ۷) تحلیل‌های وابسته به ادعای تغییرکرده در migrate.flagStaleAnalyses «کهنه» می‌شوند
// خلاصه‌ی روز (گام ۸) را memoryAuto از روی همین حافظه می‌سازد. idempotent.

export function runKnowledgeCycle({ now = new Date() } = {}) {
  const problem = brainStorageProblem();
  if (problem) return { skipped: problem };
  const cfg = loadKnowledgeConfig();
  const idx = loadIndex();
  const at = now.toISOString();
  const today = at.slice(0, 10);
  const sourceKeyOf = (c) => idx.sourceKeyOf.get(c.source_ids?.[0]) || "";
  const originOf = (c) => idx.sources.get(sourceKeyOf(c))?.origin || sourceKeyOf(c);
  const live = () => [...idx.claims.values()].filter((c) => c.status !== "بسته‌شده");

  // ۲) بررسی‌های ساده
  const sanity = [];
  for (const c of live()) {
    const p = sanityProblem(c, cfg);
    if (p) sanity.push({ natural_key: `sanity|${c.natural_key}`, kind: "sanity", group: "sanity", label: p, subject: c.subject, period: c.period, spread: null, members: [{ claim_key: c.natural_key, metric: c.metric, source: sourceKeyOf(c), value: c.value, unit: c.unit, period: c.period }] });
  }
  // ۴) تناقض
  const contradictions = findContradictions(live(), cfg, sourceKeyOf);
  const queue = syncQueue([...sanity, ...contradictions], { at });
  const statusChanges = syncClaimStatuses(idx, { at });

  // ۵) اعتماد
  const ruleStatus = new Map(listRules().map((r) => [r.natural_key, r.status]));
  const claims = live();
  const ix = buildConfirmationIndex(claims, cfg, sourceKeyOf, originOf);
  let rewritten = 0;
  for (const c of claims) {
    const next = computeConfidence(c, { today, cfg, sourceKeyOf, ix, ruleStatus });
    if (Math.abs(next - c.confidence) >= cfg.rewrite_threshold) {
      reviseClaim(idx, c, { confidence: next }, `اعتماد بازمحاسبه شد: ${c.confidence} ← ${next} (اعتبار منبع، تازگی، تأیید مستقل)`, { at });
      rewritten += 1;
    }
  }
  return { claims: claims.length, sanity: sanity.length, contradictions: contradictions.length, queue, status_changes: statusChanges, confidence_rewritten: rewritten };
}

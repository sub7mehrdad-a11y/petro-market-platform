import { resolveBrainKey } from "../../brain";
import { resolveGroqApiKey } from "../../groqFetch";
import { readLearningState, runConsolidation, syncConsolidationDecisions, writeLearningState } from "./consolidation";
import { proposeExperiments, syncExperimentDecisions } from "./experiments";
import { METHOD_ROLES, ensureMethods } from "./methods";
import { evaluatePromotion, proposeRevision, syncMethodDecisions } from "./revision";

// چرخه‌ی یادگیری (مرحله‌ی ۱۰). هر ساعت (ارزان، بدون مدل): اجرای تصمیم‌های مدیر + ارزیابی ارتقای روش‌های آزمایشی.
// ماهی یک‌بار: تثبیت، پیشنهاد آزمایش، و بازبینی روش (آزمون روی سابقه مدل می‌خواهد؛ بدون کلید پرش می‌شود و ماه «انجام‌شده» ثبت نمی‌شود).

export async function runLearningCycle({ now = new Date(), generate = {} } = {}) {
  const at = now.toISOString();
  const out = { month: at.slice(0, 7) };
  ensureMethods({ at });
  out.applied = [...syncMethodDecisions({ now }), ...syncConsolidationDecisions({ now }), ...syncExperimentDecisions({ now }).map((k) => `experiment:${k}`)];
  out.promotion = METHOD_ROLES.flatMap((role) => evaluatePromotion(role, { now }));
  const st = readLearningState();
  if (st.last_monthly === out.month) return { ...out, monthly: "done_this_month" };
  out.consolidation = await runConsolidation({ now, generate: generate.abstract });
  out.experiments = proposeExperiments({ now });
  const hasModel = !!generate.propose || (!!resolveBrainKey() && !!resolveGroqApiKey());
  if (!hasModel) return { ...out, monthly: "no_model_key" };
  out.revisions = {};
  for (const role of METHOD_ROLES) out.revisions[role] = (await proposeRevision(role, { generate: { propose: generate.propose, analyst: generate.analyst?.[role] || generate.analyst }, now })).status;
  writeLearningState({ last_monthly: out.month, last_monthly_at: at });
  return { ...out, monthly: "ran" };
}

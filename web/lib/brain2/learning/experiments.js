import { closeRow, currentRows, putRow } from "../store";
import { makeRow } from "../schema";
import { raiseItem } from "../knowledge/queue";
import { getDomain } from "../domain/index";
import { DAY, loadLearningConfig } from "./config";

// آزمایش فعال (پروتکل ۹-۶): مغز خودش آزمایش‌های کوچک پیشنهاد می‌دهد؛ سهمی کوچک از ظرفیت (نه همه)، با پیش‌بینیِ ثبت‌شده پیش از اجرا
// (نرخ پایه‌ی مرجع با بازه)، و نتیجه با همان سازوکار غافلگیری نمره می‌گیرد (جزء سنجش، تابع scoreExperiments).
// هیچ آزمایشی خودکار شروع نمی‌شود (تأیید مدیر)، و این جزء هیچ ایمیلی نمی‌فرستد؛ قفل هیئت‌مدیره‌ی ارسال دست‌نخورده می‌ماند.

export const experimentRows = () => [...currentRows("experiments").values()].filter((r) => !r.recorded_to && r.natural_key);
const keyOf = (k) => `exp|${k}`;
export const experimentByKey = (k) => experimentRows().find((r) => r.key === k) || null;

/** سهم ظرفیت ماهانه برای آزمایش (گرد به پایین؛ کمینه ۱ اگر ظرفیت مثبت). */
export function experimentQuota(monthlyCapacity = null) {
  const cfg = loadLearningConfig().experiments;
  const cap = Number.isFinite(monthlyCapacity) && monthlyCapacity > 0 ? monthlyCapacity : cfg.fallback_monthly_emails;
  return { capacity: cap, share: cfg.quota_share, quota: Math.max(1, Math.floor(cap * cfg.quota_share)) };
}

/** نامزدهای منبع دامنه را (حداکثر max_open_proposals باز/فعال) به صف می‌آورد. idempotent. */
export function proposeExperiments({ now = new Date(), candidates = null } = {}) {
  const cfg = loadLearningConfig().experiments;
  const at = now.toISOString();
  const list = candidates || getDomain().experimentCandidates();
  const known = new Set(experimentRows().map((r) => r.key));
  const asked = new Set([...currentRows("queue").values()].filter((q) => !q.recorded_to && q.kind === "experiment_proposal").map((q) => q.experiment_key));
  const openCount = [...currentRows("queue").values()].filter((q) => !q.recorded_to && q.kind === "experiment_proposal" && q.status === "open").length + experimentRows().filter((r) => r.status === "فعال").length;
  let room = cfg.max_open_proposals - openCount;
  const out = [];
  for (const c of list) {
    if (room <= 0) break;
    if (!c?.key || !c.title || known.has(c.key) || asked.has(c.key)) continue;
    const q = experimentQuota();
    raiseItem({
      natural_key: `experiment_proposal|${c.key}`, kind: "experiment_proposal", group: "experiments", experiment_key: c.key,
      label: `آزمایش پیشنهادی: ${c.title}. فرضیه: ${c.hypothesis || "—"} سهم ظرفیت: ${Math.round(q.share * 100)}٪ (حدود ${q.quota} ایمیل در ماه)؛ پیش‌بینی پیش از اجرا: نرخ پاسخ ${cfg.prior_reply_rate.point}٪ (بازه ${cfg.prior_reply_rate.lo} تا ${cfg.prior_reply_rate.hi}).`,
      subject: c.key, period: null, spread: null, candidate: { title: c.title, hypothesis: c.hypothesis || null, metric: c.metric || "reply_rate", min_sample: c.min_sample || null },
      members: [{ claim_key: `experiment:${c.key}`, metric: c.metric || "reply_rate", source: "experiments", value: cfg.prior_reply_rate.point }],
    }, { at });
    room -= 1;
    out.push(c.key);
  }
  return out;
}

/** تصمیم مدیر ← ردیف آزمایش «فعال» با پیش‌بینیِ ثابتِ پیش از اجرا. idempotent. */
export function syncExperimentDecisions({ now = new Date() } = {}) {
  const cfg = loadLearningConfig().experiments;
  const at = now.toISOString();
  const applied = [];
  for (const q of currentRows("queue").values()) {
    if (q.recorded_to || q.kind !== "experiment_proposal" || q.status !== "resolved" || q.resolution?.decision !== "accept") continue;
    if (experimentByKey(q.experiment_key)) continue;
    const quota = experimentQuota();
    putRow("experiments", makeRow("experiments", {
      key: q.experiment_key, title: q.candidate.title, hypothesis: q.candidate.hypothesis, metric: q.candidate.metric, unit: "%", natural_key: keyOf(q.experiment_key),
      prior: { point: cfg.prior_reply_rate.point, lo: cfg.prior_reply_rate.lo, hi: cfg.prior_reply_rate.hi }, window_days: cfg.window_days, quota_share: cfg.quota_share, quota_per_month: quota.quota,
      min_sample: q.candidate.min_sample, status: "فعال", started_at: at, ends_at: new Date(now.getTime() + cfg.window_days * DAY).toISOString(), decided_by: q.resolution.by, created_at: at,
    }, at));
    applied.push(q.experiment_key);
  }
  return applied;
}

/** نتیجه‌ی یک آزمایش را (تعداد ارسال و پاسخ) ثبت می‌کند؛ آزمایش «تمام‌شده» می‌شود و در دور بعدی سنجش نمره می‌گیرد. */
export function recordExperimentResult({ key, sent, replied, by, note = "" }, { now = new Date() } = {}) {
  const row = experimentByKey(key);
  if (!row) return { ok: false, error: "آزمایش پیدا نشد." };
  if (row.status !== "فعال") return { ok: false, error: `آزمایش در وضعیت «${row.status}» است.` };
  if (!Number.isInteger(sent) || !Number.isInteger(replied) || sent <= 0 || replied < 0 || replied > sent) return { ok: false, error: "تعداد ارسال و پاسخ نامعتبر است." };
  if (row.min_sample && sent < row.min_sample) return { ok: false, error: `نمونه کم است (دست‌کم ${row.min_sample} ارسال لازم است).` };
  const rate = Math.round((replied / sent) * 1000) / 10;
  const side = rate > row.prior.hi ? "بالاتر از بازه‌ی پیش‌بینی" : rate < row.prior.lo ? "پایین‌تر از بازه‌ی پیش‌بینی" : "داخل بازه‌ی پیش‌بینی";
  const { id, created_at, recorded_from, recorded_to, closed_reason, ...keep } = row;
  const at = now.toISOString();
  const next = putRow("experiments", makeRow("experiments", {
    ...keep, status: "تمام‌شده", observed: { sent, replied, rate, by: by || null, at, note: String(note).slice(0, 300) }, verdict: `نرخ پاسخ ${rate}٪ — ${side} (${row.prior.lo} تا ${row.prior.hi})`,
    supersedes: id, change_reason: "نتیجه ثبت شد", created_at: at,
  }, at));
  closeRow("experiments", id, { reason: "نتیجه ثبت شد", by: by || "admin", at });
  return { ok: true, experiment: next };
}

/** نمای مدیر. */
export function experimentsOverview() {
  return {
    quota: experimentQuota(),
    experiments: experimentRows().map((r) => ({ key: r.key, title: r.title, status: r.status, prior: r.prior, observed: r.observed, verdict: r.verdict, started_at: r.started_at, ends_at: r.ends_at, quota_per_month: r.quota_per_month })).sort((a, b) => String(b.started_at).localeCompare(String(a.started_at))),
  };
}

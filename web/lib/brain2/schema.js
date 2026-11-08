import { ensureRepoFile, stampRow } from "./store";

// قالب هشت مخزن حافظه (پروتکل ۰٫۲ بخش ۴؛ سند «هفت مخزن» می‌گوید ولی هشت تعریف کرده و هر هشت ساخته می‌شود).
// فیلدهای مشترک (دو خط زمانی، supersedes، change_reason، domain) را stampRow می‌گذارد. اینجا فیلدهای خاص هر مخزن،
// مقدار پیش‌فرض (از جمله فیلدهای نسخه‌ی ۰٫۲ که منطقشان در مرحله‌ی بعد می‌آید) و بررسی لازم‌ها هست.
// scores.jsonl (نمره‌ی پیش‌بینی‌ها) جزو این هشت نیست: فقط جزء سنجش مرحله‌ی ۴ آن را می‌نویسد، نه کد مغز.

export const REPOS = {
  sources: {
    required: ["kind", "origin"],
    defaults: { url_or_ref: null, published_at: null, data_as_of: null, agent: null, confidential: false, raw_text_ref: null, natural_key: null },
  },
  claims: {
    required: ["subject", "metric", "value"],
    defaults: {
      unit: null, period: null, qualifiers: {}, source_ids: [], confidence: 0.5, status: "تازه", rule_flags: [], natural_key: null,
      importance: 0.5, last_used_at: null, use_count: 0, // نسخه‌ی ۰٫۲ (بخش ۴-۳)؛ منطقشان در مرحله‌ی ۵
    },
  },
  analyses: {
    required: ["analyst", "statement"],
    defaults: { claim_ids: [], method_version: null, model: null, stale: false, payload: null, natural_key: null },
  },
  rules: {
    required: ["text", "status"],
    defaults: {
      check: null, scope: null, origin: "مغز", evidence: [], track_record: { better: 0, worse: 0 },
      importance: 0.5, votes: [], merged_into: null, natural_key: null, // نسخه‌ی ۰٫۲ (بخش ۴-۵)
    },
  },
  methods: {
    required: ["analyst", "version"],
    defaults: { steps: [], data_pack: [], parent_version: null, backtest_score: null, status: "فعال" },
  },
  // صف بازبینی (مرحله‌ی ۵): فهرست عملیاتی تناقض‌ها و ادعاهای مشکوک؛ جزو هشت مخزن دانش نیست ولی همان قالب افزودنی را دارد.
  queue: {
    required: ["kind", "subject"],
    defaults: { group: null, period: null, members: [], spread: null, status: "open", resolution: null, detected_at: null, natural_key: null },
  },
  // آزمایش فعال (مرحله‌ی ۱۰، ۹-۶): فهرست عملیاتی آزمایش‌های کوچک با پیش‌بینیِ ثبت‌شده پیش از اجرا؛ جزو هشت مخزن دانش نیست.
  experiments: {
    required: ["key", "title"],
    defaults: { hypothesis: null, metric: "reply_rate", unit: "%", prior: null, window_days: 30, quota_share: 0, status: "فعال", started_at: null, ends_at: null, observed: null, verdict: null, decided_by: null, natural_key: null },
  },
  predictions: { required: [], defaults: {} }, // ساخت و اعتبارسنجی در forecast.js (مرحله‌ی ۰؛ فیلدهای ۰٫۲ همان‌جا هست)
  feedback: {
    required: ["giver", "target_id", "kind"],
    defaults: { scores: null, comment: null, blind: false, selection: "هدفمند" },
  },
  reputation: {
    required: ["entity", "topic"],
    defaults: { n_resolved: 0, score: null, weight: null, visible_to: [] },
  },
};

export const REPO_NAMES = Object.keys(REPOS);

/** ردیف تازه‌ی یک مخزن (هنوز نوشته نشده): پیش‌فرض‌ها + فیلدهای مشترک. اگر فیلد لازم نباشد خطا می‌دهد. */
export function makeRow(repo, fields, now = new Date().toISOString()) {
  const spec = REPOS[repo];
  if (!spec) throw new Error(`مخزن ناشناخته: ${repo}`);
  for (const f of spec.required) {
    if (fields[f] === undefined || fields[f] === null || fields[f] === "") throw new Error(`${repo}: فیلد ${f} لازم است`);
  }
  const defaults = JSON.parse(JSON.stringify(spec.defaults)); // نسخه‌ی مستقل برای هر ردیف (آرایه/شیء مشترک نشود)
  return stampRow(repo.replace(/s$/, ""), { ...defaults, ...fields }, now);
}

/** همه‌ی فایل‌های مخزن را (خالی) می‌سازد تا «هشت فایل» از همان آغاز وجود داشته باشند. */
export function ensureRepos() {
  for (const r of REPO_NAMES) ensureRepoFile(r);
}

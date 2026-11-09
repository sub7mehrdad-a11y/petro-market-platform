import { closeRow, currentRows, putRow } from "./store";
import { makeRow } from "./schema";
import { stable, upsertAnalysis } from "./memory";
import { getDomain } from "./domain/index";

// موتور قاعده‌ها (پروتکل ۰٫۲ بخش ۱۵-۳). محتوای قاعده‌ها و بررسی‌ها را بسته‌ی دامنه می‌دهد (getDomain().rules). هر قاعده یک متن (برای مدل)
// و یک بررسی خودکار (برای کد) دارد. قاعده فقط «برچسب» می‌زند و تا «آزمایشی/پذیرفته» نشود در اعتماد/امتیاز اثر نمی‌گذارد.
// برچسب‌ها در فیلد rule_flags ادعا ثبت می‌شوند: افزودن برچسب = ردیف تازه‌ی ادعا با supersedes و بستن قبلی (هیچ ردیفی پاک نمی‌شود).
// قاعده‌های سطح خروجی نتیجه‌ی بررسی‌شان را به‌صورت تحلیل «rule-check» در حافظه می‌گذارند.

export const getRules = () => getDomain().rules;
const claimRules = () => getRules().filter((r) => r.level === "claim" && r.test);

// ------------------------------------------------------------------------------------------------ ثبت قاعده‌ها
/** هفت قاعده را (یک‌بار؛ idempotent) با وضعیت «پیشنهادی» ثبت می‌کند. متن عوض شود: ردیف تازه با supersedes، وضعیت دست‌نخورده. */
export function ensureRules({ at = new Date().toISOString() } = {}) {
  const open = new Map([...currentRows("rules").values()].filter((r) => !r.recorded_to && r.natural_key).map((r) => [r.natural_key, r]));
  let created = 0, changed = 0;
  for (const r of getRules()) {
    const old = open.get(r.key);
    if (old && old.text === r.text && stable(old.scope) === stable(r.scope) && old.check === r.check) continue;
    const row = putRow("rules", makeRow("rules", {
      text: r.text, status: old ? old.status : "پیشنهادی", check: r.check, scope: r.scope, origin: "پروتکل ۱۵-۳", natural_key: r.key,
      label_fa: r.label, level: r.level, supersedes: old ? old.id : null, change_reason: old ? "متن یا بررسی قاعده تغییر کرد" : null,
      created_at: new Date().toISOString(),
    }, at));
    if (old) { closeRow("rules", old.id, { reason: row.change_reason, by: "rules", at }); changed += 1; } else created += 1;
  }
  return { created, changed };
}

export function listRules() {
  return [...currentRows("rules").values()].filter((r) => !r.recorded_to && r.natural_key);
}

// ------------------------------------------------------------------------------------------------ بررسی روی ادعاها
function reflag(idx, claim, flags, reason, at) {
  const { id, created_at, recorded_from, recorded_to, closed_reason, ...keep } = claim;
  const row = putRow("claims", makeRow("claims", { ...keep, rule_flags: flags, supersedes: id, change_reason: reason, created_at: new Date().toISOString() }, at));
  closeRow("claims", id, { reason, by: "rules", at });
  idx.claims.set(claim.natural_key, row);
  return row;
}

/** همه‌ی بررسی‌های سطح ادعا را روی ادعاهای باز اجرا می‌کند. idempotent: برچسبِ تغییرنکرده ردیف تازه نمی‌سازد. */
export function applyClaimRules(idx, { at = new Date().toISOString() } = {}) {
  const sourceKeys = new Map([...idx.sources.values()].map((s) => [s.id, s.natural_key]));
  const ctx = { sourceKey: (c) => sourceKeys.get(c.source_ids?.[0]) };
  const claims = [...idx.claims.values()];
  const paired = getDomain().pairedFlags(claims);
  const pairedBy = new Map();
  for (const x of paired) for (const id of x.claimIds) pairedBy.set(id, x);

  const counts = Object.fromEntries(getRules().map((r) => [r.key, 0]));
  let changed = 0;
  for (const c of claims) {
    const want = new Set();
    for (const r of claimRules()) if (r.test(c, ctx)) want.add(r.key);
    const x = pairedBy.get(c.id);
    if (x) want.add(x.ruleKey);
    for (const k of want) counts[k] += 1;
    const desired = [...want].sort();
    const current = [...(c.rule_flags || [])].sort();
    if (stable(desired) === stable(current)) continue;
    const added = desired.filter((k) => !current.includes(k));
    const reason = x && added.includes(x.ruleKey) ? x.reason : `قاعده‌ی پیشنهادی اعمال شد: ${added.join("، ") || "حذف برچسب"}`;
    reflag(idx, c, desired, reason, at);
    changed += 1;
  }
  return { flagged: counts, changed, contradictions: paired.map((x) => ({ country: x.summary.country, ratio: Math.round(x.summary.ratio * 100) / 100 })) };
}

/** بررسی‌های سطح خروجی بسته‌ی دامنه را اجرا و نتیجه را به‌صورت تحلیل «rule-check» در حافظه ثبت می‌کند. */
export function runOutputChecks(idx, { today, digestText, scoringConfig, at = new Date().toISOString() }) {
  const ctx = { claims: [...idx.claims.values()], analyses: [...idx.analyses.values()], today, digestText, scoringConfig };
  const out = {};
  for (const [key, check] of Object.entries(getDomain().outputChecks)) {
    const r = check(ctx);
    upsertAnalysis(idx, {
      key: `rule-check:${key}`, analyst: "rule-check", method_version: key, model: null,
      statement: r.skipped ? `${key}: بررسی نشد (${r.skipped})` : r.violations.length ? `${key}: ${r.violations.length} مورد نقض` : `${key}: بدون نقض (${r.checked} مورد بررسی شد)`,
      claim_ids: [], payload: { violations: r.violations, checked: r.checked, skipped: r.skipped || null, today },
    }, { at });
    out[key] = { violations: r.violations.length, checked: r.checked };
  }
  return out;
}

// مصرف‌کننده‌ها: قیمت‌های قابل‌استفاده/مقایسه را دامنه تعریف می‌کند.
export const isUsableAsPrice = (claim) => getDomain().isUsableAsPrice(claim);
export const comparePrices = (a, b) => getDomain().comparePrices(a, b);

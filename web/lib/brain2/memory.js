import { closeRow, currentRows, putRow } from "./store";
import { makeRow } from "./schema";

// دسترسی به حافظه: نوشتن idempotent (کلید طبیعی) و پرسش دو‌خط‌زمانی.
//   کلید طبیعی ادعا = (subject, metric, period, qualifiers, source). اجرای دوباره با همان مقدار = بدون تغییر؛
//   مقدار تغییرکرده = ردیف تازه با supersedes + change_reason و بستن ردیف قدیمی (هیچ ردیفی پاک نمی‌شود).
//   «at» زمان باور سیستم است (برای داده‌ی لاگ‌های روزانه همان collected_at، برای بقیه لحظه‌ی انتقال).

export function stable(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
}

export const claimKey = (c, sourceKey) => [c.subject, c.metric, c.period ?? "", stable(c.qualifiers || {}), sourceKey || ""].join("¦");
const isOpen = (r) => !r.recorded_to;

/** نمایه‌ی ردیف‌های باز برای یک دسته‌ی نوشتن (یک‌بار ساخته می‌شود؛ نوشتن‌ها خودشان آن را به‌روز نگه می‌دارند). */
export function loadIndex() {
  const idx = { sources: new Map(), claims: new Map(), analyses: new Map(), sourceKeyOf: new Map(), staleIds: new Set(), stats: { sources: 0, claims_new: 0, claims_changed: 0, claims_unchanged: 0, analyses_new: 0, analyses_changed: 0, analyses_unchanged: 0, analyses_stale: 0 } };
  for (const [repo, map] of [["sources", idx.sources], ["claims", idx.claims], ["analyses", idx.analyses]]) {
    const rows = [...currentRows(repo).values()].filter((r) => r.natural_key && isOpen(r));
    rows.sort((a, b) => a.recorded_from.localeCompare(b.recorded_from)); // اگر وسط تغییر کسی قطع شد، تازه‌ترین برنده است
    for (const r of rows) map.set(r.natural_key, r);
  }
  for (const [k, s] of idx.sources) idx.sourceKeyOf.set(s.id, k);
  return idx;
}

/** منبع (با کلید طبیعی). spec: {key, kind, origin, url_or_ref, published_at, data_as_of, agent, confidential}. برمی‌گرداند id. */
export function upsertSource(idx, spec, { at = new Date().toISOString(), createdAt } = {}) {
  const hit = idx.sources.get(spec.key);
  if (hit) return hit.id;
  const { key, ...rest } = spec;
  const row = putRow("sources", makeRow("sources", { ...rest, natural_key: key, created_at: createdAt || new Date().toISOString(), valid_from: spec.data_as_of && /^\d{4}-\d{2}-\d{2}/.test(spec.data_as_of) ? spec.data_as_of : at }, at));
  idx.sources.set(key, row);
  idx.sourceKeyOf.set(row.id, key);
  idx.stats.sources += 1;
  return row.id;
}

const EQ = (a, b) => stable(a) === stable(b);

/**
 * ادعا. spec: {subject, metric, value, unit, period, qualifiers, source_key, confidence, valid_from, status, rule_flags}.
 * برمی‌گرداند {row, outcome: "new"|"changed"|"unchanged"}.
 */
export function upsertClaim(idx, spec, { at = new Date().toISOString(), reason } = {}) {
  const sourceKey = spec.source_key || "";
  const src = idx.sources.get(sourceKey);
  const key = claimKey(spec, sourceKey);
  const old = idx.claims.get(key);
  if (old && EQ(old.value, spec.value) && (old.unit ?? null) === (spec.unit ?? null)) {
    idx.stats.claims_unchanged += 1;
    return { row: old, outcome: "unchanged" };
  }
  const { source_key, ...rest } = spec;
  const row = putRow("claims", makeRow("claims", {
    ...rest, qualifiers: spec.qualifiers || {}, source_ids: src ? [src.id] : [], natural_key: key,
    created_at: new Date().toISOString(),
    valid_from: spec.valid_from || at,
    supersedes: old ? old.id : null,
    change_reason: old ? reason || `مقدار تغییر کرد: ${stable(old.value)} → ${stable(spec.value)}` : null,
  }, at));
  idx.claims.set(key, row);
  if (old) {
    closeRow("claims", old.id, { reason: row.change_reason, by: "migrate", at });
    idx.staleIds.add(old.id);
    idx.stats.claims_changed += 1;
    return { row, outcome: "changed" };
  }
  idx.stats.claims_new += 1;
  return { row, outcome: "new" };
}

/**
 * تحلیل. spec: {key, analyst, statement, claim_ids, method_version, model, payload}.
 * اگر متن/محتوا یا ادعاهای پایه عوض شده باشد: ردیف تازه (stale=false) و بستن قبلی.
 */
export function upsertAnalysis(idx, spec, { at = new Date().toISOString() } = {}) {
  const old = idx.analyses.get(spec.key);
  const { key, ...rest } = spec;
  if (old && !old.stale && old.statement === spec.statement && EQ(old.payload, spec.payload) && EQ(old.claim_ids, spec.claim_ids)) {
    idx.stats.analyses_unchanged += 1;
    return { row: old, outcome: "unchanged" };
  }
  const row = putRow("analyses", makeRow("analyses", {
    ...rest, natural_key: key, created_at: new Date().toISOString(), supersedes: old ? old.id : null,
    change_reason: old ? "محتوا یا ادعاهای پایه تغییر کرد" : null,
  }, at));
  idx.analyses.set(key, row);
  if (old) {
    closeRow("analyses", old.id, { reason: row.change_reason, by: "migrate", at });
    idx.stats.analyses_changed += 1;
    return { row, outcome: "changed" };
  }
  idx.stats.analyses_new += 1;
  return { row, outcome: "new" };
}

/** تحلیلی که به یکی از ادعاهای بسته‌شده تکیه داشت، «کهنه» علامت می‌خورد (بخش ۴-۴): ردیف تازه با stale=true. */
export function flagStaleAnalyses(idx, { at = new Date().toISOString() } = {}) {
  if (!idx.staleIds.size) return 0;
  let n = 0;
  for (const [key, a] of idx.analyses) {
    if (a.stale || !a.claim_ids.some((id) => idx.staleIds.has(id))) continue;
    const { id, created_at, recorded_from, recorded_to, closed_reason, ...keep } = a; // فیلدهای مُهر را makeRow تازه می‌گذارد
    const row = putRow("analyses", makeRow("analyses", { ...keep, stale: true, supersedes: id, change_reason: "یکی از ادعاهای پایه تغییر کرد", created_at: new Date().toISOString() }, at));
    closeRow("analyses", a.id, { reason: row.change_reason, by: "migrate", at });
    idx.analyses.set(key, row);
    idx.stats.analyses_stale += 1;
    n += 1;
  }
  idx.staleIds.clear();
  return n;
}

/** نسخه‌ی تازه‌ی یک ادعا با تغییر فیلدهای «قضاوتی» (اعتماد، وضعیت): ردیف تازه با supersedes + بستن قبلی؛ مقدار و کلید طبیعی ثابت می‌ماند. */
export function reviseClaim(idx, claim, patch, reason, { at = new Date().toISOString(), by = "knowledge-cycle" } = {}) {
  const { id, created_at, recorded_from, recorded_to, closed_reason, ...keep } = claim;
  const row = putRow("claims", makeRow("claims", { ...keep, ...patch, supersedes: id, change_reason: reason, created_at: new Date().toISOString() }, at));
  closeRow("claims", id, { reason, by, at });
  idx.claims.set(claim.natural_key, row);
  return row;
}

// -------------------------------------------------------------------------------- پرسش (بخش ۴-۱: «در تاریخ فلان سیستم چه باور داشت؟»)
const toMs = (x) => (x ? new Date(x).getTime() : null);

/** باور سیستم در لحظه‌ی knownAt: ردیف‌هایی که تا آن لحظه ثبت شده و هنوز بسته نشده بودند. knownAt خالی = همین حالا (ردیف‌های باز). */
export function believedAt(row, knownAt) {
  if (!knownAt) return !row.recorded_to;
  const t = toMs(knownAt);
  return toMs(row.recorded_from) <= t && (!row.recorded_to || toMs(row.recorded_to) > t);
}

/** درستیِ جهان در لحظه‌ی validAt (اختیاری): valid_from ≤ T < valid_to. */
export function validAt(row, validAtTime) {
  if (!validAtTime) return true;
  const t = toMs(validAtTime);
  return toMs(row.valid_from) <= t && (!row.valid_to || toMs(row.valid_to) > t);
}

export function queryClaims({ subject, metric, period, knownAt, validAtTime, limit = 500 } = {}) {
  const out = [];
  for (const r of currentRows("claims").values()) {
    if (subject && r.subject !== subject) continue;
    if (metric && r.metric !== metric && !r.metric.startsWith(`${metric}.`)) continue;
    if (period && r.period !== period) continue;
    if (!believedAt(r, knownAt) || !validAt(r, validAtTime)) continue;
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

export function memoryCounts() {
  const out = {};
  for (const repo of ["sources", "claims", "analyses", "rules", "methods", "predictions", "feedback", "reputation", "queue"]) {
    const rows = [...currentRows(repo).values()];
    out[repo] = { total: rows.length, open: rows.filter(isOpen).length };
  }
  return out;
}

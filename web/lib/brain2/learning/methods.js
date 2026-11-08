import { closeRow, currentRows, putRow } from "../store";
import { makeRow } from "../schema";
import { SYSTEM, ANALYSTS } from "../analysts";

// مخزن «روش‌ها» (پروتکل ۴-۶): دستورالعمل استدلال هر تحلیل‌گر، نسخه‌دار. نسخه‌ی کنارگذاشته پاک نمی‌شود («بایگانی»).
// وضعیت‌ها: فعال | پیشنهادی (نسخه‌ی تازه پیش از آزمون) | آزمایشی (موازی با فعال) | بایگانی.
// نسخه‌ی v1 هر تحلیل‌گر همان دستور سیستمیِ ثبت‌شده در analysts.js است (system = null یعنی همان پیش‌فرض).

export const METHOD_ROLES = ["stat", "event"];
const key = (role, version) => `method|${role}|${version}`;

export const methodRows = () => [...currentRows("methods").values()].filter((r) => !r.recorded_to && r.natural_key);
export const methodsOf = (role) => methodRows().filter((r) => r.analyst === role);
export const activeMethod = (role) => methodsOf(role).find((r) => r.status === "فعال") || null;
export const experimentalMethods = (role) => methodsOf(role).filter((r) => r.status === "آزمایشی");
export const pendingMethods = (role) => methodsOf(role).filter((r) => r.status === "پیشنهادی");

/** v1 هر تحلیل‌گر را (یک‌بار، idempotent) با وضعیت «فعال» ثبت می‌کند. */
export function ensureMethods({ at = new Date().toISOString() } = {}) {
  let created = 0;
  for (const role of METHOD_ROLES) {
    if (methodsOf(role).length) continue;
    putRow("methods", makeRow("methods", {
      analyst: role, version: "v1", natural_key: key(role, "v1"), method_version: ANALYSTS[role].method, status: "فعال", system: null,
      steps: SYSTEM[role].split("\n").filter(Boolean).slice(0, 3), data_pack: [ANALYSTS[role].pack], parent_version: null, backtest_score: null, created_at: at,
    }, at));
    created += 1;
  }
  return { created };
}

export const nextVersion = (role) => `v${1 + Math.max(0, ...[...currentRows("methods").values()].filter((r) => r.analyst === role).map((r) => Number(String(r.version).slice(1)) || 0))}`;

/** ردیف روش ← شیء قابل‌پاس‌دادن به runAnalyst. نسخه‌ی آزمایشی forecaster جدا دارد (…@vN) و وارد داور نمی‌شود. */
export function methodObject(row) {
  if (!row) return null;
  return { system: row.system || null, method_version: row.method_version, suffix: row.status === "آزمایشی" ? `@${row.version}` : "" };
}

/** تغییر وضعیت یک روش: ردیف تازه با supersedes و بستن قبلی (هیچ نسخه‌ای پاک نمی‌شود). */
export function setMethodStatus(row, status, reason, { at = new Date().toISOString(), extra = {} } = {}) {
  const { id, created_at, recorded_from, recorded_to, closed_reason, ...keep } = row;
  const next = putRow("methods", makeRow("methods", { ...keep, ...extra, status, status_since: at, supersedes: id, change_reason: reason, created_at: new Date().toISOString() }, at));
  closeRow("methods", id, { reason, by: "learning", at });
  return next;
}

export function addMethodVersion(role, { system, rationale, parent, at = new Date().toISOString(), extra = {} }) {
  const version = nextVersion(role);
  return putRow("methods", makeRow("methods", {
    analyst: role, version, natural_key: key(role, version), method_version: `${role}-${version}`, status: "پیشنهادی", status_since: at, system,
    steps: [String(rationale || "").slice(0, 400)], data_pack: [ANALYSTS[role].pack], parent_version: parent || null, backtest_score: null, proposed_at: at, created_at: at, ...extra,
  }, at));
}

/** تعداد نسخه‌ی تازه‌ای که در این بازه ساخته شده (برای سقف تغییر روش در ماه، ۹-۳). */
export const versionsCreatedInLast = (role, days, now) => new Set([...currentRows("methods").values()].filter((r) => r.analyst === role && r.parent_version && r.proposed_at && new Date(r.proposed_at).getTime() > now.getTime() - days * 86400000).map((r) => r.version)).size;

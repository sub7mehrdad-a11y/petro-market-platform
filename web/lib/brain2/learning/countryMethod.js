import { closeRow, currentRows, putRow } from "../store";
import { makeRow } from "../schema";

// نسخه‌های «روش پیش‌بین کشور» (آزمون بازپخش، ۱۰-ب): فهرست قاعده‌های استدلال + شیوه‌ی انتخاب کشورهای مقایسه‌ای. در همان مخزن «روش‌ها»
// (analyst = "country") نگه داشته می‌شود؛ هر تغییر ردیف تازه است و نسخه‌ی کنارگذاشته «بایگانی» می‌شود، هیچ‌چیز پاک نمی‌شود.
// وضعیت‌ها: فعال | آزمایشی (در حال آزمون) | بایگانی. v1 = دستور پایه، بدون قاعده‌ی اضافه.

const ROLE = "country";
export const DEFAULT_COMPARABLES = { mode: "all", k: 6 };
const key = (v) => `method|${ROLE}|${v}`;

export const countryMethodRows = () => [...currentRows("methods").values()].filter((r) => !r.recorded_to && r.analyst === ROLE && r.natural_key);
export const activeCountryMethod = () => countryMethodRows().find((r) => r.status === "فعال") || null;

export function ensureCountryMethod({ at = new Date().toISOString() } = {}) {
  if (countryMethodRows().length) return activeCountryMethod();
  return putRow("methods", makeRow("methods", {
    analyst: ROLE, version: "v1", natural_key: key("v1"), method_version: "country-v1", status: "فعال", status_since: at, system: null,
    rules: [], comparables: { ...DEFAULT_COMPARABLES }, steps: ["دستور پایه بدون قاعده‌ی اضافه"], data_pack: ["country-table"], parent_version: null, backtest_score: null, created_at: at,
  }, at));
}

const nextVersion = () => `v${1 + Math.max(0, ...[...currentRows("methods").values()].filter((r) => r.analyst === ROLE).map((r) => Number(String(r.version).slice(1)) || 0))}`;

/** نسخه‌ی تازه (وضعیت «آزمایشی»)، فرزند نسخه‌ی parent. */
export function addCountryMethod({ parent, rules, comparables, rationale, derivedFrom = [], at = new Date().toISOString() }) {
  const version = nextVersion();
  return putRow("methods", makeRow("methods", {
    analyst: ROLE, version, natural_key: key(version), method_version: `country-${version}`, status: "آزمایشی", status_since: at, system: null, rules: [...rules],
    comparables: { ...DEFAULT_COMPARABLES, ...(comparables || {}) }, steps: [String(rationale || "").slice(0, 400)], data_pack: ["country-table"],
    parent_version: parent?.version || null, derived_from: derivedFrom, backtest_score: null, proposed_at: at, created_at: at,
  }, at));
}

/** تغییر وضعیت یک نسخه: ردیف تازه با supersedes + بستن قبلی. extra: مثلاً {backtest_score}. */
export function setCountryMethodStatus(row, status, reason, { at = new Date().toISOString(), extra = {} } = {}) {
  const { id, created_at, recorded_from, recorded_to, closed_reason, ...keep } = row;
  const next = putRow("methods", makeRow("methods", { ...keep, ...extra, status, status_since: at, supersedes: id, change_reason: reason, created_at: new Date().toISOString() }, at));
  closeRow("methods", id, { reason, by: "country-learning", at });
  return next;
}

/** نسخه‌ی تازه را فعال و نسخه‌ی فعلی را بایگانی می‌کند. */
export function promoteCountryMethod(candidate, reason, { at = new Date().toISOString(), score = null } = {}) {
  const old = activeCountryMethod();
  if (old) setCountryMethodStatus(old, "بایگانی", `جایگزین‌شده با ${candidate.version}: ${reason}`, { at });
  return setCountryMethodStatus(candidate, "فعال", reason, { at, extra: { backtest_score: score } });
}

/** متنی که به دستور پیش‌بین اضافه می‌شود. */
export function methodPromptText(method) {
  const rules = method?.rules || [];
  return rules.length ? `\n\n===== قاعده‌های استدلال (نسخه‌ی ${method.version}؛ آموخته‌شده از اشتباه‌های قبلی) =====\n${rules.map((r, i) => `${i + 1}) ${r}`).join("\n")}` : "";
}

const INCOME_RANK = { "Low income": 1, "Lower middle income": 2, "Upper middle income": 3, "High income": 4 };

/** انتخاب کشورهای مقایسه‌ایِ نشان‌داده‌شده به مدل. mode "nearest": k کشورِ نزدیک‌ترین از نظر درآمد سرانه (لگاریتمی)، وگرنه رده‌ی درآمد و جمعیت. */
export function selectComparables(row, others, comparables = DEFAULT_COMPARABLES) {
  if (!comparables || comparables.mode !== "nearest") return others;
  const k = Math.max(3, Math.min(Number(comparables.k) || 6, others.length));
  const g = (x) => x?.indicators?.gdp_per_capita_usd;
  const dist = (o) => {
    if (g(row) > 0 && g(o) > 0) return Math.abs(Math.log(g(row)) - Math.log(g(o)));
    const a = INCOME_RANK[row.indicators?.income_level], b = INCOME_RANK[o.indicators?.income_level];
    const pop = row.indicators?.population > 0 && o.indicators?.population > 0 ? Math.abs(Math.log(row.indicators.population) - Math.log(o.indicators.population)) / 4 : 1;
    return (a && b ? Math.abs(a - b) : 2) + pop;
  };
  return [...others].sort((x, y) => dist(x) - dist(y)).slice(0, k);
}

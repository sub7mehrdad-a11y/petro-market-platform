import { closeRow, currentRows, putRow } from "../store";
import { makeRow } from "../schema";
import { reviseClaim } from "../memory";
import { itemSignature } from "./checks";
import { daysBetween, loadKnowledgeConfig } from "./config";

// صف بازبینی (پروتکل ۶-۱ گام ۶: «متناقض ← هر دو مقدار به صف می‌رود؛ هیچ‌کدام خودکار رد نمی‌شود»). فقط‌افزودنی: هر تغییر وضعیت ردیف تازه
// با supersedes است. اعضای آیتم با «کلید طبیعی ادعا» ثبت می‌شوند (ثابت، حتی وقتی ردیف ادعا با تغییر وضعیت/اعتماد نسخه‌ی تازه می‌گیرد).

export function openQueue() {
  const m = new Map();
  for (const r of currentRows("queue").values()) if (!r.recorded_to && r.natural_key) m.set(r.natural_key, r);
  return m;
}

function supersede(old, patch, reason, at) {
  const { id, created_at, recorded_from, recorded_to, closed_reason, ...keep } = old;
  const row = putRow("queue", makeRow("queue", { ...keep, ...patch, supersedes: id, change_reason: reason, created_at: new Date().toISOString() }, at));
  closeRow("queue", id, { reason, by: patch.resolution?.by || "knowledge-cycle", at });
  return row;
}

/** آیتم‌های تازه‌یافت را با صف همگام می‌کند: تازه، تغییرکرده (بازگشایی)، یا خودبه‌خود همگرا. تصمیم انسانی با همان مقدارها حفظ می‌شود. */
export function syncQueue(detected, { at }) {
  const open = openQueue();
  const stats = { new: 0, reopened: 0, unchanged: 0, converged: 0 };
  const seen = new Set();
  for (const item of detected) {
    seen.add(item.natural_key);
    const old = open.get(item.natural_key);
    if (!old) {
      putRow("queue", makeRow("queue", { ...item, status: "open", detected_at: at }, at));
      stats.new += 1;
    } else if (itemSignature(old) !== itemSignature(item)) {
      supersede(old, { members: item.members, spread: item.spread, status: "open", resolution: null }, "مقدارها تغییر کرد؛ دوباره به صف آمد", at);
      stats.reopened += 1;
    } else stats.unchanged += 1;
  }
  for (const [key, old] of open) {
    if (seen.has(key) || old.status !== "open" || !["contradiction", "sanity"].includes(old.kind)) continue; // اختلاف تحلیل‌گرها را چرخه‌ی دانش همگرا نمی‌کند
    supersede(old, { status: "resolved", resolution: { decision: "auto_converged", by: "system", at, note: "مقدارها دیگر متناقض نیستند" } }, "تناقض خودبه‌خود برطرف شد", at);
    stats.converged += 1;
  }
  return stats;
}

/** یک آیتم را (بدون همگرایی خودکار سایر آیتم‌ها) به صف می‌آورد: تازه، بازگشوده با مقدار تغییرکرده، یا بدون تغییر. برای اختلاف تحلیل‌گرها (۷-۴). */
export function raiseItem(item, { at }) {
  const old = openQueue().get(item.natural_key);
  if (!old) { putRow("queue", makeRow("queue", { ...item, status: "open", detected_at: at }, at)); return "new"; }
  if (itemSignature(old) === itemSignature(item)) return "unchanged";
  supersede(old, { members: item.members, spread: item.spread, label: item.label, status: "open", resolution: null }, "مقدارها تغییر کرد؛ دوباره به صف آمد", at);
  return "reopened";
}

/** وضعیت ادعاها را با صف هماهنگ می‌کند: باز ← «متناقض/در صف بررسی»؛ تصمیم انسان ← «تأییدشده/بسته‌شده»؛ همگرایی/نادیده ← «تازه». */
export function syncClaimStatuses(idx, { at }) {
  const set = (claimKey, status, reason) => {
    const c = idx.claims.get(claimKey);
    if (c && c.status !== status) { reviseClaim(idx, c, { status }, reason, { at }); return 1; }
    return 0;
  };
  let changed = 0;
  for (const q of openQueue().values()) {
    if (!["contradiction", "sanity", "human_flag"].includes(q.kind)) continue; // سایر آیتم‌ها (اختلاف تحلیل‌گرها، کالبدشکافی، ...) وضعیت ادعا را عوض نمی‌کنند
    const keys = q.members.map((m) => m.claim_key);
    if (q.status === "open") {
      for (const k of keys) changed += set(k, ["sanity", "human_flag"].includes(q.kind) ? "در صف بررسی" : "متناقض", `صف بازبینی: ${q.label || q.kind}`);
      continue;
    }
    const d = q.resolution?.decision;
    if (d === "accept") for (const k of keys) changed += set(k, k === q.resolution.claim_key ? "تأییدشده" : "بسته‌شده", `بازبینی انسانی: ${q.resolution.by}`);
    else if (d === "reject") for (const k of keys) changed += set(k, "بسته‌شده", `بازبینی انسانی: ${q.resolution.by}`);
    else if (d === "both_valid") for (const k of keys) changed += set(k, "تأییدشده", `بازبینی انسانی: ${q.resolution.by} (هر دو درست)`);
    else if (d === "dismiss" || d === "auto_converged") for (const k of keys) changed += set(k, "تازه", `صف بازبینی بسته شد (${d})`);
  }
  return changed;
}

/** تصمیم انسان. decision: accept (با claim_key؛ در تناقض مقدارهای دیگر «بسته‌شده» می‌شوند) | reject (فقط ادعای مشکوک) | both_valid | dismiss. */
export function resolveItem(idx, { id, decision, claimKey, by, note, at = new Date().toISOString() }) {
  const q = [...openQueue().values()].find((r) => r.id === id);
  if (!q) return { ok: false, error: "آیتم صف پیدا نشد یا قبلاً نسخه‌ی تازه گرفته است." };
  if (q.status !== "open") return { ok: false, error: "این آیتم قبلاً بسته شده است." };
  if (!["accept", "reject", "both_valid", "dismiss"].includes(decision)) return { ok: false, error: "تصمیم نامعتبر است." };
  if (decision === "accept" && !q.members.some((m) => m.claim_key === claimKey)) return { ok: false, error: "برای پذیرش باید یکی از مقدارهای آیتم انتخاب شود." };
  if (decision === "reject" && !["sanity", "human_flag"].includes(q.kind)) return { ok: false, error: "رد فقط برای ادعای مشکوک است؛ در تناقض یک مقدار را بپذیرید." };
  if (decision === "both_valid" && q.kind !== "contradiction") return { ok: false, error: "«هر دو درست» فقط برای تناقض است." };
  if (["disagreement", "rule_critique", "analysis_flag"].includes(q.kind) && decision !== "dismiss") return { ok: false, error: "اختلاف تحلیل‌گرها فقط «بررسی شد» (نادیده) می‌شود؛ تصمیم دربارهٔ عدد در پیش‌بینی خودتان ثبت می‌شود." };
  const row = supersede(q, { status: "resolved", resolution: { decision, claim_key: claimKey || null, by, note: String(note || "").slice(0, 300), at } }, `تصمیم انسانی: ${decision}`, at);
  const changed = syncClaimStatuses(idx, { at });
  return { ok: true, item: row, claims_changed: changed };
}

/** نمای مدیر: آیتم‌های باز با سن (روز) و علامت «سررسیدگذشته»، و چند تصمیم اخیر. */
export function queueView({ now = new Date() } = {}) {
  const cfg = loadKnowledgeConfig();
  const today = now.toISOString().slice(0, 10);
  const all = [...currentRows("queue").values()].filter((r) => !r.recorded_to);
  const withAge = (r) => ({ ...r, age_days: daysBetween((r.detected_at || r.created_at).slice(0, 10), today) });
  const open = all.filter((r) => r.status === "open").map(withAge).map((r) => ({ ...r, overdue: r.age_days > cfg.contradiction.overdue_days }));
  const resolved = all.filter((r) => r.status === "resolved").sort((a, b) => String(b.resolution?.at).localeCompare(String(a.resolution?.at))).slice(0, 10);
  return { open, resolved, counts: { open: open.length, overdue: open.filter((r) => r.overdue).length, contradictions: open.filter((r) => r.kind === "contradiction").length, sanity: open.filter((r) => r.kind === "sanity").length } };
}

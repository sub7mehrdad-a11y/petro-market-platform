// وضعیت پایدار پیگیری ایمیل (یادآوری‌ها + پیشرفت خواندن پاسخ‌ها) — کنار لاگ ارسال، پس روی لیارا روی
// دیسک دائم (OUTREACH_STATE_DIR) می‌نشیند. نوشتن اتمیک (tmp + rename)؛ همه‌ی تغییرها هم‌زمان (بدون await بینشان).
import fs from "fs";
import path from "path";
import { getOutreachSentStatePath } from "@/lib/data";

export function followupStatePath() {
  return path.join(path.dirname(getOutreachSentStatePath()), "outreach_followup_state.json");
}

const empty = () => ({ reminders: {}, reply_forward: {}, last_reminder_run: null });

export function readFollowupState() {
  try {
    const p = JSON.parse(fs.readFileSync(followupStatePath(), "utf-8"));
    return { ...empty(), ...p, reminders: p.reminders || {}, reply_forward: p.reply_forward || {} };
  } catch {
    return empty();
  }
}

export function mutateFollowupState(fn) {
  const state = readFollowupState();
  const result = fn(state);
  const file = followupStatePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf-8");
  fs.renameSync(tmp, file);
  return result;
}

// نتیجه‌ی ارسال یک ایمیل یادآوری (از کارگر صف صدا زده می‌شود)
export function recordReminderResult(email, patch) {
  const key = String(email).trim().toLowerCase();
  mutateFollowupState((s) => {
    s.reminders[key] = { ...(s.reminders[key] || {}), ...patch };
  });
}

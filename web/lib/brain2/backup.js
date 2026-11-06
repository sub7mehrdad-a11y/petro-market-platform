import fs from "fs";
import path from "path";
import { brainStorageProblem, getBrainDir } from "./store";

// پشتیبان‌گیری حافظه (قید برنامه‌ی R1): کپی روزانه‌ی همه‌ی فایل‌های *.jsonl به backups/YYYY-MM-DD/ روی همان دیسک دائمی و
// نگهداری آخرین keep نسخه. چون فایل‌ها فقط‌افزودنی‌اند، کپی هر لحظه‌ای یک حالت درست (حداکثر با یک خط ناقص آخر) است.
// ⚠ همین دیسک است: در برابر خرابی خودِ دیسک محافظ نیست؛ بازیابی و کپی بیرونی را باید روی لیارا خودتان بیازمایید.

export function backupBrain({ now = new Date(), keep = 7 } = {}) {
  const problem = brainStorageProblem();
  if (problem) return { ok: false, error: problem };
  const dir = getBrainDir();
  const day = now.toISOString().slice(0, 10);
  const root = path.join(dir, "backups");
  const target = path.join(root, day);
  if (fs.existsSync(target)) return { ok: true, skipped: "already", day };
  fs.mkdirSync(target, { recursive: true });
  let files = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".jsonl")) continue;
    fs.copyFileSync(path.join(dir, f), path.join(target, f));
    files += 1;
  }
  const days = fs.readdirSync(root).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const removed = [];
  for (const d of days.slice(0, Math.max(0, days.length - keep))) {
    fs.rmSync(path.join(root, d), { recursive: true, force: true }); // فقط نسخه‌ی پشتیبان قدیمی؛ هرگز فایل‌های زنده
    removed.push(d);
  }
  return { ok: true, day, files, removed };
}

import fs from "fs";
import path from "path";
import { backupBrain } from "./backup";
import { buildShadowDigest } from "./digest";
import { runMigration } from "./migrate";
import { brainStorageProblem, getBrainDir } from "./store";

// زمان‌بند حافظه (مرحله‌ی ۲): بعد از بالا آمدن سرور (داده‌ی data/*.json داخل ایمیج هر دیپلوی تازه می‌شود) و سپس هر ۶ ساعت،
// انتقال idempotent، ساخت خلاصه‌ی سایه و پشتیبان روزانه. خاموش: BRAIN_MEMORY_AUTO=false. هیچ فراخوانی مدل ندارد.

let timer = null;
let busy = false;

export function refreshShadowDigest(now = new Date()) {
  const text = buildShadowDigest({ today: now.toISOString().slice(0, 10) });
  fs.writeFileSync(path.join(getBrainDir(), "digest_shadow.md"), text, "utf-8");
  return text.length;
}

export function memoryTick({ now = new Date() } = {}) {
  if (busy) return { skipped: "busy" };
  busy = true;
  try {
    const problem = brainStorageProblem();
    if (problem) return { skipped: problem };
    const backup = backupBrain({ now }); // پیش از نوشتن تازه
    const mig = runMigration({ now });
    const shadow = refreshShadowDigest(now);
    const s = mig.stats;
    console.log(`[brain-memory] انتقال: ${s.claims_new} ادعای تازه، ${s.claims_changed} تغییریافته، ${s.claims_unchanged} بدون تغییر؛ خلاصه‌ی سایه ${shadow} نویسه؛ پشتیبان ${backup.skipped || backup.files + " فایل"}.`);
    return { backup, migration: mig, shadow_chars: shadow };
  } catch (err) {
    console.warn(`[brain-memory] خطا: ${String(err?.message || err).slice(0, 200)}`);
    return { error: String(err?.message || err) };
  } finally {
    busy = false;
  }
}

export function startMemoryAuto() {
  if (timer || process.env.BRAIN_MEMORY_AUTO === "false") return;
  setTimeout(() => memoryTick(), 90 * 1000);
  timer = setInterval(() => memoryTick(), 6 * 60 * 60 * 1000);
  timer.unref?.();
  console.log("[brain-memory] زمان‌بند انتقال حافظه و پشتیبان شروع شد (خاموش: BRAIN_MEMORY_AUTO=false).");
}

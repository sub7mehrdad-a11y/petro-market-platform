import fs from "fs";
import path from "path";
import { backupBrain } from "./backup";
import { runKnowledgeCycle } from "./knowledge/cycle";
import { getDomain } from "./domain/index";
import { brainStorageProblem, getBrainDir } from "./store";

// زمان‌بند حافظه (مرحله‌ی ۲): بعد از بالا آمدن سرور (داده‌ی data/*.json داخل ایمیج هر دیپلوی تازه می‌شود) و سپس هر ۶ ساعت،
// انتقال idempotent، ساخت خلاصه‌ی سایه و پشتیبان روزانه. خاموش: BRAIN_MEMORY_AUTO=false. هیچ فراخوانی مدل ندارد.

let timer = null;
let busy = false;

export function refreshShadowDigest(now = new Date()) {
  const text = getDomain().digest({ today: now.toISOString().slice(0, 10) });
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
    const mig = getDomain().migrate({ now });
    const kc = runKnowledgeCycle({ now }); // چرخه‌ی دانش: بررسی ساده، تناقض، اعتماد (مرحله‌ی ۵)
    const shadow = refreshShadowDigest(now);
    const s = mig.stats;
    const q = kc.queue ? `${kc.queue.new} تازه، ${kc.queue.reopened} بازگشوده` : "—";
    console.log(`[brain-memory] انتقال: ${s.claims_new} ادعای تازه، ${s.claims_changed} تغییریافته، ${s.claims_unchanged} بدون تغییر؛ صف بازبینی: ${q}، اعتماد بازمحاسبه ${kc.confidence_rewritten ?? 0}؛ خلاصه‌ی سایه ${shadow} نویسه؛ پشتیبان ${backup.skipped || backup.files + " فایل"}.`);
    return { backup, migration: mig, knowledge: kc, shadow_chars: shadow };
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

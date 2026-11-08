import { runScoring } from "./scoring/writer";
import { brainStorageProblem } from "./store";

// زمان‌بند جزء سنجش (مرحله‌ی ۴): هر ۶ ساعت (و ۲ دقیقه پس از بالا آمدن سرور) پرسش‌های سررسیدشده را می‌سنجد. بدون فراخوانی مدل.
// پیش‌بینی بدون مقدار واقعی/با منبع کهنه «بدون داوری» می‌ماند و در اجرای بعدی دوباره امتحان می‌شود. خاموش: BRAIN_SCORING_AUTO=false.

let timer = null;
let busy = false;

export function scoringTick({ now = new Date() } = {}) {
  if (busy) return { skipped: "busy" };
  busy = true;
  try {
    const problem = brainStorageProblem();
    if (problem) return { skipped: problem };
    const r = runScoring({ now });
    if (r.written || r.changed) console.log(`[brain-scoring] ${r.written} نمره‌ی تازه، ${r.changed} تغییریافته، ${r.unresolved.length} پرسش بدون داوری.`);
    return r;
  } catch (err) {
    console.warn(`[brain-scoring] خطا: ${String(err?.message || err).slice(0, 200)}`);
    return { error: String(err?.message || err) };
  } finally {
    busy = false;
  }
}

export function startScoringAuto() {
  if (timer || process.env.BRAIN_SCORING_AUTO === "false") return;
  setTimeout(() => scoringTick(), 120 * 1000);
  timer = setInterval(() => scoringTick(), 6 * 60 * 60 * 1000);
  timer.unref?.();
  console.log("[brain-scoring] زمان‌بند سنجش پیش‌بینی‌ها شروع شد (خاموش: BRAIN_SCORING_AUTO=false).");
}

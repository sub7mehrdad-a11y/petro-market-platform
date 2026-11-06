import { ensureRound, getRound, loadConfig, predictionsOf, tehranClock } from "./forecast";
import { runBrainForecasts } from "./brainForecaster";
import { brainStorageProblem } from "./store";
import { resolveBrainKey } from "../brain";

// زمان‌بند ماهانه: اول هر ماه (ساعت auto_hour به وقت تهران) دور ماه را باز می‌کند و پیش‌بینی مغز را ثبت می‌کند.
// اگر سرور وسط ماه بالا آمد و دور آن ماه نبود، همان لحظه دور را باز می‌کند. خاموش‌کردن: BRAIN_FORECAST_AUTO=false.
// هر ساعت یک بار بررسی می‌کند؛ پیش‌بینی مغز اگر نشد (کلید/سهمیه/شبکه) در ساعت‌های بعد دوباره امتحان می‌شود.

let timer = null;
let busy = false;

export async function brainForecastTick({ now = new Date() } = {}) {
  if (busy) return { skipped: "busy" };
  busy = true;
  try {
    const problem = brainStorageProblem();
    if (problem) return { skipped: problem };
    const cfg = loadConfig();
    const clock = tehranClock(now);
    const day1 = clock.date.endsWith("-01");
    let round = getRound(clock.month);
    if (!round) {
      if (day1 && clock.hour < cfg.cycle.auto_hour_tehran) return { skipped: "تا ساعت تعیین‌شده صبر می‌کنیم" };
      round = ensureRound(clock.month, { by: "system", now }).round;
      console.log(`[brain-forecast] دور ${clock.month} باز شد (ماه هدف ${round.target_month}؛ مهلت تا ${round.closes_at}).`);
    }
    const missing = round.questions.filter((q) => !predictionsOf(clock.month).some((p) => p.question_id === q.id && p.forecaster.startsWith("brain:")));
    if (!missing.length) return { round: round.round_id, brain: "complete" };
    if (!resolveBrainKey()) return { round: round.round_id, brain: "no_key" };
    const rep = await runBrainForecasts(clock.month, { now });
    const ok = rep.results.filter((r) => r.status === "recorded").length;
    console.log(`[brain-forecast] پیش‌بینی مغز برای دور ${clock.month}: ${ok} ثبت، ${rep.results.filter((r) => r.status === "failed").length} ناموفق.`);
    return { round: round.round_id, brain: rep.results };
  } catch (err) {
    console.warn(`[brain-forecast] خطا: ${String(err?.message || err).slice(0, 200)}`);
    return { error: String(err?.message || err) };
  } finally {
    busy = false;
  }
}

export function startBrainForecastAuto() {
  if (timer || process.env.BRAIN_FORECAST_AUTO === "false") return;
  setTimeout(() => brainForecastTick(), 45 * 1000); // کمی بعد از بالا آمدن سرور
  timer = setInterval(() => brainForecastTick(), 60 * 60 * 1000);
  timer.unref?.();
  console.log("[brain-forecast] زمان‌بند پیش‌بینی ماهانه‌ی مغز شروع شد (خاموش: BRAIN_FORECAST_AUTO=false).");
}

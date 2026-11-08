import { ensureRound, getRound, isBrain, isRoundOpen, listRounds, loadConfig, predictionsOf, tehranClock } from "./forecast";
import { runBrainForecasts, runBrainReviews } from "./brainForecaster";
import { runMachineForecasts } from "./machineForecaster";
import { runAutopsies } from "./autopsy";
import { resolveGroqApiKey } from "../groqFetch";
import { brainStorageProblem } from "./store";
import { resolveBrainKey } from "../brain";

// زمان‌بند مغز: (۱) اول هر ماه (ساعت auto_hour به وقت تهران) دور ماه را باز می‌کند و پیش‌بینی مغز را ثبت می‌کند؛ اگر سرور وسط ماه بالا آمد
// و دور آن ماه نبود، همان لحظه باز می‌کند. (۲) هر دورِ باز را هر brain_review_every_days روز بازبینی می‌کند و فقط با دلیلِ مستند و تغییر
// معنادار نسخه‌ی تازه می‌سازد (سند ۸-۶). خاموش‌کردن: BRAIN_FORECAST_AUTO=false. هر ساعت یک بار بررسی می‌شود؛ شکست (کلید/سهمیه/شبکه)
// در ساعت‌های بعد دوباره امتحان می‌شود.

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
      console.log(`[brain-forecast] دور ${clock.month} باز شد (ماه هدف ${round.target_month}؛ مهلت قفل ${round.lock_at}).`);
    }
    if (!resolveBrainKey()) return { round: round.round_id, brain: "no_key" };
    const out = { round: round.round_id };
    const missing = round.questions.filter((q) => !predictionsOf(clock.month).some((p) => p.question_id === q.id && isBrain(p)));
    if (missing.length) {
      const rep = await runBrainForecasts(clock.month, { now });
      const ok = rep.results.filter((r) => r.status === "recorded").length;
      console.log(`[brain-forecast] پیش‌بینی مغز برای دور ${clock.month}: ${ok} ثبت، ${rep.results.filter((r) => r.status === "failed").length} ناموفق.`);
      out.brain = rep.results;
    }
    out.reviews = [];
    for (const r of listRounds()) {
      if (!isRoundOpen(r, now)) continue;
      const rv = await runBrainReviews(r.round_id, { now });
      const changed = (rv.results || []).filter((x) => x.status === "revised").length;
      if ((rv.results || []).some((x) => x.status !== "not_due" && x.status !== "no_forecast")) {
        console.log(`[brain-forecast] بازبینی دور ${r.round_id}: ${changed} نسخه‌ی تازه، ${(rv.results || []).filter((x) => x.status === "failed").length} ناموفق.`);
      }
      out.reviews.push({ round: r.round_id, results: rv.results });
    }
    // تحلیل‌گرها و داور (مرحله‌ی ۶): فقط وقتی هر دو کلید (Groq برای آماری، Gemini برای رویدادمحور) هست
    out.machines = [];
    if (resolveGroqApiKey()) {
      for (const r of listRounds()) {
        if (!isRoundOpen(r, now)) continue;
        const mf = await runMachineForecasts(r.round_id, { now });
        const done = (mf.results || []).filter((x) => /recorded|revised/.test(`${x.stat}${x.event}${x.judge}`)).length;
        if (done || (mf.results || []).some((x) => String(x.stat).startsWith("failed") || String(x.event).startsWith("failed"))) console.log(`[brain-forecast] تحلیل‌گرها و داور، دور ${r.round_id}: ${JSON.stringify((mf.results || []).map((x) => [x.stat, x.event, x.judge]))}`);
        out.machines.push({ round: r.round_id, results: mf.results });
      }
    } else out.machines = "no_groq_key";
    // کالبدشکافی خطاهای سنجیده‌شده (حلقه‌ی ۲): با کلید مغز روایت مدل، بدون آن قالبی
    const au = await runAutopsies({ now, useModel: !!resolveBrainKey() });
    if (au.new) console.log(`[brain-autopsy] ${au.new} کالبدشکافی تازه (${JSON.stringify(au.by_category)})، ${au.queued} مورد به صف بازبینی.`);
    out.autopsy = au;
    return out;
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
  console.log("[brain-forecast] زمان‌بند پیش‌بینی ماهانه و بازبینی هفتگی‌ی مغز شروع شد (خاموش: BRAIN_FORECAST_AUTO=false).");
}

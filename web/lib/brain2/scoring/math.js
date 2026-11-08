// ریاضی خالص سنجش (پروتکل ۸-۳ تا ۸-۶ و ۹-۵). بدون هیچ ورودی/خروجی؛ آزمون دستی دارد.

/** خطای نسبی مطلق |پیش‌بینی − واقعی| ÷ واقعی */
export const relErr = (p, a) => Math.abs(p - a) / Math.abs(a);

export const inInterval = (a, lo, hi) => a >= lo && a <= hi;

/** مهارت = ۱ − (خطای پیش‌بین ÷ خطای خط مبنا). اگر خطای خط مبنا صفر است تعریف نمی‌شود (null). */
export function skill(err, errBase) {
  if (!(errBase > 0)) return null;
  return 1 - err / errBase;
}

/** غافلگیریِ پیش‌بینی عددی با بازه: فاصله‌ی مقدار واقعی از نزدیک‌ترین لبه‌ی بازه ÷ پهنای بازه (داخل بازه = ۰). */
export function surpriseInterval(a, lo, hi) {
  if (inInterval(a, lo, hi)) return 0;
  const edge = a < lo ? lo : hi;
  return Math.abs(a - edge) / (hi - lo);
}

/** غافلگیریِ پیش‌بینی احتمالی: |نتیجه − احتمال| × |احتمال − ۰٫۵| × ۲ (نتیجه ۰ یا ۱). */
export const surpriseProbability = (p, outcome) => Math.abs(outcome - p) * Math.abs(p - 0.5) * 2;

/** امتیاز بریر برای پیش‌بینی جهت/رخداد (نتیجه ۰ یا ۱). کمتر بهتر است. */
export const brier = (p, outcome) => (p - outcome) ** 2;

/** همبستگی رتبه‌ای اسپیرمن بین دو ترتیب (آرایه‌ی رتبه‌ها یا مقدارها)؛ برای پیش‌بینی نوع «رتبه». */
export function spearman(x, y) {
  const rank = (v) => {
    const idx = v.map((val, i) => [val, i]).sort((a, b) => a[0] - b[0]);
    const r = Array(v.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j += 1;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  if (x.length !== y.length || x.length < 2) return null;
  const rx = rank(x), ry = rank(y);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(rx), my = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < rx.length; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

/**
 * پنجره‌ی اعتبار هر نسخه (۸-۶): نسخه از لحظه‌ی ثبتش تا ثبت نسخه‌ی بعدی (و برای آخرین نسخه تا مهلت قفل) معتبر بوده؛ وزنش همین مدت است.
 * versions باید به ترتیب زمان (made_at) باشد. وزن هر نسخه دست‌کم ۱ میلی‌ثانیه است تا تقسیم بر صفر پیش نیاید.
 */
export function windows(versions, endMs) {
  return versions.map((v, i) => {
    const from = new Date(v.made_at).getTime();
    const to = i + 1 < versions.length ? new Date(versions[i + 1].made_at).getTime() : Math.max(endMs, from);
    return { version: v, from, to, weight: Math.max(1, to - from) };
  });
}

/** میانگین وزن‌دار؛ مقدارهای null کنار گذاشته می‌شوند. اگر هیچ مقداری نبود null. */
export function weightedMean(items, valueOf, weightOf = (x) => x.weight) {
  let sw = 0, s = 0;
  for (const it of items) {
    const v = valueOf(it);
    if (v === null || v === undefined || Number.isNaN(v)) continue;
    const w = weightOf(it);
    sw += w; s += w * v;
  }
  return sw > 0 ? s / sw : null;
}

/** گام‌های به‌روزرسانی (۸-۶ «گزارش»): تغییر نسبی نقطه‌ی هر نسخه نسبت به قبلی. */
export function steps(versions) {
  const out = [];
  for (let i = 1; i < versions.length; i++) out.push(Math.abs(versions[i].forecast.point - versions[i - 1].forecast.point) / versions[i - 1].forecast.point);
  return { n: out.length, mean: out.length ? out.reduce((a, b) => a + b, 0) / out.length : 0, max: out.length ? Math.max(...out) : 0 };
}

export const round4 = (x) => (x === null || x === undefined ? null : Math.round(x * 10000) / 10000);

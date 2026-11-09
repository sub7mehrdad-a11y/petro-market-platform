import { getDomain } from "../domain/index";

// خواندن «مقدار واقعی» و «خط مبنا» از منبع از پیش تعریف‌شده‌ی هر پرسش (پروتکل ۸-۵). فقط جزء سنجش این ماژول را import می‌کند.
// خواننده‌ی هر نوع منبع (kind) را بسته‌ی دامنه می‌دهد (getDomain().truthReaders)؛ سری محرمانه‌ی فروش هم فقط از همان خواننده‌ها خوانده می‌شود.
//
// قاعده‌ی «بدون داوری»: اگر مقدار واقعیِ همان ماه هدف نیامده باشد، یا منبع کهنه باشد، نتیجه ok=false با دلیل است و پیش‌بینی نمره نمی‌گیرد.

/** {ok:true, value, as_of, source} یا {ok:false, reason}. now قابل‌تزریق برای آزمون. */
export function readTruth(question, now = new Date()) {
  const kind = question.target?.truth_source?.kind;
  const reader = getDomain().truthReaders[kind];
  if (reader) return reader.truth(question, now);
  return { ok: false, reason: `نوع منبع واقعیت (${kind}) هنوز پشتیبانی نمی‌شود` };
}

/** خط مبنا (۸-۴): «ماه بعد برابر آخرین مقدارِ شناخته‌شده در لحظه‌ی ثبت پیش‌بینی است». null اگر در آن لحظه مقداری نبود. */
export function readBaseline(question, madeAt) {
  const kind = question.target?.truth_source?.kind;
  const reader = getDomain().truthReaders[kind];
  return reader ? reader.baseline(question, madeAt) : null;
}

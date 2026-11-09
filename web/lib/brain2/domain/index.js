import { bakingSoda } from "./baking-soda/index";

// ثبت‌نام دامنه (مرحله‌ی ۱۱): هسته‌ی مغز هرچه به دامنه وابسته است از اینجا می‌گیرد، نه با import مستقیم از پوشه‌ی دامنه.
// دامنه‌ی تازه = یک پوشه‌ی هم‌شکل و یک ثبت در DOMAINS. هیچ‌چیز هنگام بارگذاری ماژول از getDomain نمی‌خواند
// (بسته‌ی دامنه خودش هسته را import می‌کند؛ حلقه‌ی import فقط در زمان فراخوانی بسته می‌شود).
const DOMAINS = { "baking-soda": bakingSoda };

export function getDomain(id = process.env.BRAIN_DOMAIN || "baking-soda") {
  const d = DOMAINS[id];
  if (!d) throw new Error(`دامنه‌ی ناشناخته: ${id}`);
  return d;
}

/** برای آزمون: ثبت دامنه‌ی ساختگی. */
export function registerDomain(id, impl) {
  DOMAINS[id] = { id, ...impl };
}

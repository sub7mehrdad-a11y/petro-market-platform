import { experimentCandidates } from "./baking-soda/experiments";

// ثبت‌نام دامنه (مرحله‌ی ۱۱): هسته‌ی مغز هرچه به دامنه وابسته است از اینجا می‌گیرد، نه با import مستقیم از پوشه‌ی دامنه.
// دامنه‌ی فعلی: جوش‌شیرین. دامنه‌ی تازه = یک پوشه‌ی هم‌شکل و یک ثبت در DOMAINS.
const DOMAINS = {
  "baking-soda": { id: "baking-soda", experimentCandidates },
};

export function getDomain(id = process.env.BRAIN_DOMAIN || "baking-soda") {
  const d = DOMAINS[id];
  if (!d) throw new Error(`دامنه‌ی ناشناخته: ${id}`);
  return d;
}

/** برای آزمون: ثبت دامنه‌ی ساختگی. */
export function registerDomain(id, impl) {
  DOMAINS[id] = { id, ...impl };
}

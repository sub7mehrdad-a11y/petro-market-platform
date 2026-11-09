import { experimentCandidates } from "./experiments";
import { runMigration } from "./migrate";
import { buildShadowDigest } from "./digest";
import { latestSeriesValue, runBrainForecasts, runBrainReviews } from "./brainForecaster";
import { OUTPUT_CHECKS, RULES, comparePrices, isUsableAsPrice, pairedFlags } from "./rules";
import { SYSTEM_PROMPTS } from "./prompts";
import { truthReaders } from "./scoring/readers";

// بسته‌ی دامنه‌ی جوش‌شیرین: همه‌ی دانش خاص دامنه (قاعده‌ها، دستور تحلیل‌گرها، منبع‌های واقعیت، انتقال داده، خلاصه، پیش‌بین قدیمی، نامزد آزمایش).
// هسته فقط از راه getDomain() به این‌ها می‌رسد. دامنه‌ی تازه = پوشه‌ای هم‌شکل با همین فهرست کلیدها.
export const bakingSoda = {
  id: "baking-soda",
  rules: RULES,
  pairedFlags,
  outputChecks: OUTPUT_CHECKS,
  isUsableAsPrice,
  comparePrices,
  analystPrompts: SYSTEM_PROMPTS,
  truthReaders,
  migrate: runMigration,
  digest: buildShadowDigest,
  legacyForecaster: { runBrainForecasts, runBrainReviews, latestSeriesValue },
  experimentCandidates,
};

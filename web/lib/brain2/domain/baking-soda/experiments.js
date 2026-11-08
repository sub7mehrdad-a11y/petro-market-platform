import fs from "fs";
import path from "path";

// منبع نامزدهای آزمایش فعال برای دامنه‌ی جوش‌شیرین: فایل داده‌ی data/brain/experiment_candidates.json (محتوای دامنه در داده است، نه در هسته).
export function experimentCandidates() {
  const file = path.join(process.env.BRAIN_DATA_DIR || path.join(process.cwd(), "..", "data"), "brain", "experiment_candidates.json");
  try {
    return JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ file, "utf-8")).candidates || [];
  } catch {
    return [];
  }
}

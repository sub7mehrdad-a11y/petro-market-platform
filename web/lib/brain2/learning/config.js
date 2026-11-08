import fs from "fs";
import path from "path";

// تنظیمات حلقه‌ی ۳، تثبیت و آزمایش فعال: data/brain/learning_config.json (عمومی؛ تغییرش بدون تغییر کد).
let cache = null;
export function loadLearningConfig() {
  const file = path.join(process.env.BRAIN_DATA_DIR || path.join(process.cwd(), "..", "data"), "brain", "learning_config.json");
  const st = fs.statSync(/* turbopackIgnore: true */ file);
  const key = `${st.mtimeMs}:${st.size}`;
  if (cache && cache.file === file && cache.key === key) return cache.cfg;
  const cfg = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ file, "utf-8"));
  cache = { file, key, cfg };
  return cfg;
}

export const DAY = 86400000;

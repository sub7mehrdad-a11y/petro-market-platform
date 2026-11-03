import fs from "fs";
import path from "path";

// ذخیره‌ی گزارش‌های هفتگی فروش تیم بازرگانی.
//
// ⚠ این داده محرمانه است (مشتری، قیمت، تناژ) و مخزن گیت عمومی است: هیچ‌وقت داخل data/ یا هر پوشه‌ی داخل مخزن
// ذخیره نمی‌شود. روی سرور باید روی دیسک دائمی باشد (SALES_STATE_DIR، یا زیرپوشه‌ی sales داخل OUTREACH_STATE_DIR که
// همان /app/persist لیارا است). روی لپ‌تاپ (توسعه) در .local-state/ می‌رود که در .gitignore است.

const REPO_ROOT = path.join(process.cwd(), "..");

export function getSalesDir() {
  if (process.env.SALES_STATE_DIR) return process.env.SALES_STATE_DIR;
  if (process.env.OUTREACH_STATE_DIR) return path.join(process.env.OUTREACH_STATE_DIR, "sales");
  return path.join(REPO_ROOT, ".local-state", "sales");
}

/** روی سرور بدون دیسک دائمی، ذخیره ممنوع است (با دیپلوی بعدی پاک می‌شود). null = آماده. */
export function salesStorageProblem() {
  if (process.env.NODE_ENV === "production" && !process.env.SALES_STATE_DIR && !process.env.OUTREACH_STATE_DIR) {
    return "ذخیره‌ی گزارش فروش روی سرور نیاز به دیسک دائمی دارد: SALES_STATE_DIR (یا OUTREACH_STATE_DIR) تنظیم نشده و گزارش‌ها با دیپلوی بعدی پاک می‌شدند.";
  }
  try {
    const dir = getSalesDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return null;
  } catch (err) {
    return `پوشه‌ی ذخیره‌ی گزارش فروش قابل‌نوشتن نیست: ${err.message}`;
  }
}

/**
 * آیا اجازه داریم خلاصه‌ی «بدون نام مشتری» فروش را برای تحلیل به سرویس هوش مصنوعی (Gemini) بفرستیم؟
 * پیش‌فرض خاموش: داده‌ی قراردادها محرمانه است و سطح رایگان Gemini ممکن است از ورودی‌ها برای آموزش استفاده کند.
 * فقط با تصمیم صریح مدیریت (SALES_AI_ENABLED=true، ترجیحاً با کلید پولی/Workspace) روشن می‌شود.
 */
export const salesAiEnabled = () => process.env.SALES_AI_ENABLED === "true";

const dataFile = () => path.join(getSalesDir(), "sales_reports.json");

export function readSalesReports() {
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile(), "utf-8"));
    return Array.isArray(parsed.reports) ? parsed.reports : [];
  } catch {
    return [];
  }
}

function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, "utf-8");
  fs.renameSync(tmp, file);
}

/** گزارش یک هفته را ذخیره می‌کند؛ اگر همان هفته قبلاً بود جایگزین می‌شود (نسخه‌ی قبل در replaced_count می‌شمارد). */
export function saveSalesReport({ weekStart, rows, filename, uploadedBy, rawBuffer }) {
  const problem = salesStorageProblem();
  if (problem) throw new Error(problem);
  const reports = readSalesReports();
  const prev = reports.find((r) => r.week_start === weekStart);
  const report = {
    id: `${weekStart}`,
    week_start: weekStart,
    uploaded_at: new Date().toISOString(),
    uploaded_by: uploadedBy || null,
    filename: filename || null,
    replaced_count: (prev?.replaced_count || 0) + (prev ? 1 : 0),
    rows,
  };
  const next = [...reports.filter((r) => r.week_start !== weekStart), report].sort((a, b) => a.week_start.localeCompare(b.week_start));
  writeAtomic(dataFile(), JSON.stringify({ reports: next }, null, 1));
  if (rawBuffer) {
    // نسخه‌ی اصلی فایل برای ممیزی (اگر بعداً سؤالی پیش آمد، همان فایلی که تیم فرستاده در دسترس است)
    const dir = path.join(getSalesDir(), "uploads");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${weekStart}_${Date.now()}.xlsx`), rawBuffer);
  }
  return report;
}

export function deleteSalesReport(weekStart) {
  const problem = salesStorageProblem();
  if (problem) throw new Error(problem);
  const reports = readSalesReports();
  const next = reports.filter((r) => r.week_start !== weekStart);
  if (next.length === reports.length) return false;
  writeAtomic(dataFile(), JSON.stringify({ reports: next }, null, 1));
  return true;
}

// تحلیل هوشمند هر هفته (متن مدل) برای اینکه با هر بازدید دوباره هزینه نشود
const analysisFile = () => path.join(getSalesDir(), "sales_analysis.json");

export function readSalesAnalysis() {
  try {
    return JSON.parse(fs.readFileSync(analysisFile(), "utf-8"));
  } catch {
    return null;
  }
}

export function writeSalesAnalysis(obj) {
  const problem = salesStorageProblem();
  if (problem) throw new Error(problem);
  writeAtomic(analysisFile(), JSON.stringify(obj, null, 1));
}
